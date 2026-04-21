<?php
// Use unified session check
require_once 'session_check.php';

// 强制浏览器不要使用旧缓存（页面与静态资源一起刷新）
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 仅当公司具有 Games category 权限时才可访问此页（与侧边栏 Data Capture 可见性一致）
$session_company_id = $_SESSION['company_id'] ?? null;
if ($session_company_id) {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $permsJson = $stmt->fetchColumn();
        $companyPerms = ($permsJson ? json_decode($permsJson, true) : null);
        if (!is_array($companyPerms) || empty($companyPerms)) {
            // IF no permissions, block. If any permissions (Games, Bank etc.), allow page load, API will filter later
            header('Location: processlist.php?error=no_permission');
            exit;
        }
    } catch (PDOException $e) {
        header('Location: processlist.php?error=permission_check_failed');
        exit;
    }
} else {
    header('Location: processlist.php');
    exit;
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        // Process form data here
        // This will be implemented later with the PHP backend logic
        
        // For now, just redirect back to show success
        header('Location: datacapture.php?success=1');
        exit;
    } catch (Exception $e) {
        error_log("Data capture error: " . $e->getMessage());
        header('Location: datacapture.php?error=1');
        exit;
    }
}

// Get URL parameters for notifications
$success = isset($_GET['success']) ? true : false;
$error = isset($_GET['error']) ? true : false;

// Get current user information
$current_user_id = $_SESSION['user_id'] ?? null;
$current_user_role = $_SESSION['role'] ?? '';

require_once __DIR__ . '/api/get_companies_helper.php';

// Get all companies associated with the current user (for displaying company buttons)
$user_companies = [];
try {
    if ($current_user_id) {
        if ($current_user_role === 'owner') {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true);
        }
    }
} catch(PDOException $e) {
    error_log("Failed to get user company list: " . $e->getMessage());
}

$user_companies_all = $user_companies;


// If company_id parameter exists in URL, use it (for switching company)
$company_id = isset($_GET['company_id']) ? (int)$_GET['company_id'] : ($_SESSION['company_id'] ?? null);

// Validate if company_id belongs to current user
if ($current_user_id && count($user_companies_all) > 0) {
    $valid_company = false;
    if ($company_id) {
        foreach ($user_companies_all as $comp) {
            if ($comp['id'] == $company_id) {
                $valid_company = true;
                break;
            }
        }
    }
    if (!$valid_company) {
        // If company_id is invalid or does not exist, use the first company
        $company_id = $user_companies_all[0]['id'];
        // Update session (ensure first company is used by default after login)
        $_SESSION['company_id'] = $company_id;
    } elseif (isset($_GET['company_id']) && $company_id == (int)$_GET['company_id']) {
        // If company_id parameter exists in URL and validation passes, update session (achieve cross-page synchronization)
        $_SESSION['company_id'] = $company_id;
    } elseif (!isset($_GET['company_id']) && $company_id == $_SESSION['company_id']) {
        // If session's company_id is used and valid, ensure session is set (set at login)
        $_SESSION['company_id'] = $company_id;
    }
} else {
    // If no associated company, use session's company_id
    $company_id = $_SESSION['company_id'] ?? null;
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php
    $assetVer = function ($file) {
        $path = __DIR__ . '/' . $file;
        return file_exists($path) ? filemtime($path) : time();
    };
    ?>
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <title>Data Capture</title>
    <link rel="stylesheet" href="css/datacapture.css?v=<?php echo $assetVer('css/datacapture.css'); ?>">
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; margin-top: 20px;">
            <h1 style="margin: 0;">Data Capture</h1>
            
            <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                <!-- Permission Filter -->
                <div id="data-capture-permission-filter" class="data-capture-company-filter data-capture-permission-filter-header" style="display: none;">
                    <span class="data-capture-company-label">Category:</span>
                    <div id="data-capture-permission-buttons" class="data-capture-company-buttons">
                        <!-- Permission buttons will be loaded dynamically -->
                    </div>
                </div>
            </div>
        </div>
            
            <!-- Top Section - Form and Submitted Processes -->
            <div class="top-section">
                <!-- Left Column - Data Capture Form -->
                <div class="form-column">
                    <div class="form-container">

                        <form id="dataCaptureForm" class="process-form" method="POST">
                            <!-- Shared Group & Company Filter (SSR) -->
                            <?php
                            $filter_prefix = 'data-capture';
                            include 'includes/company_filter.php';
                            ?>
                            <script>
                                window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                                    if (typeof switchDataCaptureCompany === 'function') {
                                        switchDataCaptureCompany(companyId);
                                    } else if (typeof window.switchDataCaptureCompany === 'function') {
                                        window.switchDataCaptureCompany(companyId);
                                    }
                                };
                            </script>

                            <div class="form-group">
                                <label for="capture_date">Date</label>
                                <select style id="capture_date" name="capture_date" required>
                                    <option value="">Select Date</option>
                                    <!-- Date options will be loaded here via JavaScript -->
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="capture_process">Process</label>
                                <div class="custom-select-wrapper">
                                    <button type="button" class="custom-select-button" id="capture_process" data-placeholder="Select Process" name="process">Select Process</button>
                                    <div class="custom-select-dropdown" id="capture_process_dropdown">
                                        <div class="custom-select-search">
                                            <input type="text" placeholder="Search process..." autocomplete="off">
                                        </div>
                                        <div class="custom-select-options"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="capture_description">Description</label>
                                <div class="input-with-icon">
                                    <input type="text" id="capture_description" name="description" required readonly placeholder="Click + to select descriptions">
                                    <button type="button" class="add-icon" onclick="expandDescription()">+</button>
                                </div>
                            </div>
                            
                            
                            <div class="form-group">
                                <label for="capture_currency">Currency</label>
                                <select id="capture_currency" name="currency">
                                    <option value="">Select Currency</option>
                                    <!-- Currency options will be loaded here via JavaScript -->
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="capture_remove_word">Remove Word</label>
                                <input type="text" id="capture_remove_word" name="remove_word" placeholder="Enter words to remove">
                                <small class="field-help" style="display: block; margin-top: 0px; font-style: italic; color: #666;">(Use semicolon to separate multiple words, e.g. abc;cde;efg)</small>
                            </div>
                            
                            <div class="form-group replace-word-group">
                                <label for="capture_replace_word_from">Replace Word</label>
                                <div class="replace-word-fields">
                                    <input type="text" id="capture_replace_word_from" name="replace_word_from" placeholder="Old word">
                                    <span class="replace-arrow">→</span>
                                    <input type="text" id="capture_replace_word_to" name="replace_word_to" placeholder="New word">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="capture_remark">Remark</label>
                                <input type="text" id="capture_remark" name="remark" placeholder="Enter remark">
                            </div>

                        </form>
                    </div>
                </div>
                
                <!-- Right Column - Submitted Processes -->
                <div class="submitted-column">
                    <div class="submitted-container">
                        <h2 class="submitted-title">Submitted Processes</h2>
                        <div class="submitted-list" id="submittedProcessesList">
                            <div class="no-data">
                                No processes submitted yet
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Section - Excel Table -->
            <div class="bottom-section">
                <div class="excel-table-container">
                    <div class="excel-table-header">
                        <span>Data Capture Table</span>
                        <!-- Data Capture Type Selector -->
                        <select id="dataCaptureTypeSelector" class="data-capture-type-selector">
                            <option value="1.Text">1.TEXT</option>
                            <option value="2.Format">2.FORMAT</option>
                            <!-- <option value="3.API">API</option> -->
                            <option value="CITIBET_MAJOR">3.CITIBET</option>
                            <option value="4.RETURN">4.RETURN</option>
                            <!-- <option value="GENERAL">GENERAL</option> -->
                            <!-- <option value="VPOWER">VPOWER</option> -->
                            <!-- <option value="API_RETURN">API-RETURN</option> -->
                            <!-- <option value="WBET">WBET</option> -->
                            <!-- <option value="ALIPAY">ALIPAY</option> -->
                            <!-- <option value="PEGASUS">PEGASUS</option> -->
                            <!-- <option value="C8PLAY">C8PLAY</option> -->
                            <!-- <option value="MAXBET">MAXBET</option> -->
                            <!-- <option value="WBET_API">WBET_API</option> -->
                            <!-- <option value="INVOICE">INVOICE</option> -->
                        </select>
                        <button type="button" class="btn btn-cancel" onclick="resetForm()">Reset</button>
                    </div>
                    <table class="excel-table" id="dataTable">
                        <thead id="tableHeader">
                            <tr>
                                <th></th>
                                <!-- Column headers will be generated dynamically -->
                            </tr>
                        </thead>
                        <tbody id="tableBody">
                            <!-- Table rows will be generated by JavaScript -->
                        </tbody>
                    </table>
                    <!-- 2.Format模式：预览容器（像截图里的Table Format那样显示粘贴结果） -->
                    <div id="tablePreviewFormat" class="table-preview-format" style="display: none;">
                        <iframe id="tablePreviewFrameFormat" class="table-preview-frame-format" title="Format Table Preview"></iframe>
                    </div>
                    <!-- 2.Format模式：空白粘贴区域（支持直接粘贴整张表格HTML/样式） -->
                    <div id="pasteAreaFormat" class="paste-area-format" style="display: none;" contenteditable="true" data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."></div>
                </div>
                
                <!-- Form Actions Below Table -->
                <div class="form-actions">
                    <button id="dataCaptureSubmitBtn" type="submit" class="btn btn-save" onclick="submitDataCaptureForm()">Submit</button>
                </div>
            </div>
    </div>

    <!-- Description Selection Modal -->
    <div id="descriptionSelectionModal" class="modal" style="display: none;">
        <div class="modal-content description-selection-modal">
            <div class="modal-header">
                <h2>Select or Add Description</h2>
                <span class="close" onclick="closeDescriptionSelectionModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="description-selection-container">
                    <!-- Left side - Selected descriptions -->
                    <div class="selected-descriptions-section">
                        <h3>Selected Descriptions</h3>
                        <div class="selected-descriptions-list" id="selectedDescriptionsInModal">
                            <!-- Selected descriptions will be displayed here -->
                        </div>
                    </div>
                    
                    <!-- Right side - Add new and available descriptions -->
                    <div class="available-descriptions-section">
                        <!-- Add new description section -->
                        <div class="add-description-bar">
                            <h3>Add New Description</h3>
                            <form id="addDescriptionForm" class="add-description-form">
                                <div class="add-description-input-group">
                                    <input type="text" id="new_description_name" name="description_name" placeholder="Enter new description name..." required>
                                    <button type="submit" class="btn btn-save">Add</button>
                                </div>
                            </form>
                        </div>
                        
                        <h3>Available Descriptions</h3>
                        <div class="description-search">
                            <input type="text" id="descriptionSearch" placeholder="Search descriptions..." onkeyup="filterDescriptions()">
                        </div>
                        <div class="description-list" id="existingDescriptions">
                            <!-- Available descriptions will be loaded here -->
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                <button type="button" class="btn btn-save" id="confirmDescriptionsBtn" onclick="confirmDescriptions()">Confirm</button>
                    <button type="button" class="btn btn-cancel" onclick="closeDescriptionSelectionModal()">Cancel</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Notification Container -->
    <div id="processNotificationContainer" class="process-notification-container"></div>

    <!-- Context Menu -->
    <div id="contextMenu" class="context-menu" style="display: none;">
        <div class="context-menu-item" onclick="copySelectedCells(); event.stopPropagation();">
            <span>📋 Copy</span>
        </div>
        <div class="context-menu-item" onclick="pasteToSelectedCells(); event.stopPropagation();">
            <span>📄 Paste</span>
        </div>
        <div class="context-menu-item" onclick="clearSelectedCells(); event.stopPropagation();">
            <span>🗑️ Clear</span>
        </div>
        <div class="context-menu-item" onclick="showDeleteDialog(event); event.stopPropagation();">
            <span>🗑️ Delete</span>
        </div>
        <div class="context-menu-item" onclick="selectAllCells(event)">
            <span>☑️ Select All</span>
        </div>
    </div>

    <!-- Column Header Context Menu -->
    <div id="columnContextMenu" class="context-menu" style="display: none;">
        <div class="context-menu-item" onclick="insertColumnLeft()">
            <span>➕ Insert 1 column left</span>
        </div>
        <div class="context-menu-item" onclick="insertColumnRight()">
            <span>➕ Insert 1 column right</span>
        </div>
        <div class="context-menu-item" onclick="deleteColumn()">
            <span>🗑️ Delete column</span>
        </div>
        <div class="context-menu-item" onclick="clearColumn()">
            <span>❌ Clear column</span>
        </div>
    </div>

    <!-- Row Header Context Menu -->
    <div id="rowContextMenu" class="context-menu" style="display: none;">
        <div class="context-menu-item" onclick="insertRowAbove()">
            <span>➕ Insert 1 row above</span>
        </div>
        <div class="context-menu-item" onclick="insertRowBelow()">
            <span>➕ Insert 1 row below</span>
        </div>
        <div class="context-menu-item" onclick="deleteRow()">
            <span>🗑️ Delete row</span>
        </div>
        <div class="context-menu-item" onclick="clearRow()">
            <span>❌ Clear row</span>
        </div>
    </div>

    <!-- Delete Dialog -->
    <div id="deleteDialog" class="delete-dialog" style="display: none;">
        <div class="delete-dialog-content">
            <div class="delete-dialog-header">
                <span>Delete</span>
                <span class="delete-dialog-close" onclick="closeDeleteDialog()">&times;</span>
            </div>
            <div class="delete-dialog-body">
                <div class="delete-dialog-title">Delete</div>
                <div class="delete-options">
                    <label class="delete-option">
                        <input type="radio" name="deleteOption" value="shiftLeft" checked>
                        <span>Shift cells left</span>
                    </label>
                    <label class="delete-option">
                        <input type="radio" name="deleteOption" value="shiftUp">
                        <span>Shift cells up</span>
                    </label>
                    <label class="delete-option">
                        <input type="radio" name="deleteOption" value="entireRow">
                        <span>Entire row</span>
                    </label>
                    <label class="delete-option">
                        <input type="radio" name="deleteOption" value="entireColumn">
                        <span>Entire column</span>
                    </label>
                </div>
            </div>
            <div class="delete-dialog-footer">
            <button type="button" class="btn btn-save" onclick="confirmDelete(); event.stopPropagation();">OK</button>
                <button type="button" class="btn btn-cancel" onclick="closeDeleteDialog(); event.stopPropagation();">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        window.DATACAPTURE_COMPANY_ID = <?php echo json_encode($company_id); ?>;
        window.DATACAPTURE_COMPANY_CODE = <?php
            $dcCode = '';
            if (!empty($user_companies_all) && $company_id) {
                foreach ($user_companies_all as $c) {
                    if ((int) $c['id'] === (int) $company_id) {
                        $dcCode = (string) ($c['company_id'] ?? '');
                        break;
                    }
                }
            }
            echo json_encode($dcCode);
        ?>;
    </script>
    <script src="js/datacapture.js?v=<?php echo $assetVer('js/datacapture.js'); ?>"></script>

</body>
</html>
