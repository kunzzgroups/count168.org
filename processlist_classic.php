<?php
/**
 * ?c168_embed=1&as_bank=1 / &as_games=1 供 React 壳内 iframe 与 SPA 路由对齐（不依赖 $_SERVER 脚本名）
 */
if (isset($_GET['c168_embed'], $_GET['as_bank']) && $_GET['as_bank'] === '1' && !defined('PROCESSLIST_PAGE_FILE')) {
    define('PROCESSLIST_PAGE_FILE', 'bank_process_list.php');
}
if (isset($_GET['c168_embed'], $_GET['as_games']) && $_GET['as_games'] === '1') {
    if (!defined('PROCESSLIST_PAGE_FILE')) {
        define('PROCESSLIST_PAGE_FILE', 'games_process_list.php');
    }
    if (!defined('PROCESSLIST_FORCED_PERMISSION')) {
        define('PROCESSLIST_FORCED_PERMISSION', 'Games');
    }
    if (!defined('PROCESSLIST_HIDE_PERMISSION_FILTER')) {
        define('PROCESSLIST_HIDE_PERMISSION_FILTER', true);
    }
}
if (!defined('PROCESSLIST_PAGE_FILE')) {
    define('PROCESSLIST_PAGE_FILE', basename($_SERVER['PHP_SELF'] ?? 'processlist.php'));
}

if (!defined('PROCESSLIST_PAGE_TITLE')) {
    define('PROCESSLIST_PAGE_TITLE', 'Process List');
}

if (!defined('PROCESSLIST_FORCED_PERMISSION')) {
    define('PROCESSLIST_FORCED_PERMISSION', '');
}

if (!defined('PROCESSLIST_HIDE_PERMISSION_FILTER')) {
    define('PROCESSLIST_HIDE_PERMISSION_FILTER', false);
}

$processListPageFile = PROCESSLIST_PAGE_FILE;
$processListPageTitle = PROCESSLIST_PAGE_TITLE;
$processListForcedPermission = PROCESSLIST_FORCED_PERMISSION;
$processListHidePermissionFilter = PROCESSLIST_HIDE_PERMISSION_FILTER;

// Σ╜┐τö¿τ╗ƒΣ╕ÇτÜäsessionµúÇµƒÑ
require_once 'session_check.php';
require_once __DIR__ . '/bank_process_list.php';

require_once __DIR__ . '/includes/processlist_delete_post.inc.php';

// ΦÄ╖σÅûσê¥σºïσÅéµò░∩╝êτö¿Σ║ÄΦ«╛τ╜«Θí╡Θ¥óτè╢µÇü∩╝ë
$searchTerm = isset($_GET['search']) ? htmlspecialchars($_GET['search']) : '';
$showInactive = isset($_GET['showInactive']) ? true : false;
$showAll = isset($_GET['showAll']) ? true : false;

// ΦÄ╖σÅûσ╜ôσëìτö¿µê╖Σ┐íµü»
$current_user_id = $_SESSION['user_id'] ?? null;
$current_user_role = $_SESSION['role'] ?? '';

require_once __DIR__ . '/api/get_companies_helper.php';

// ΦÄ╖σÅûσ╜ôσëìτö¿µê╖σà│ΦüöτÜäµëÇµ£ë company∩╝êτö¿Σ║Äµÿ╛τñ║ company µîëΘÆ«∩╝ë
$user_companies = [];
try {
    if ($current_user_id) {
        if ($current_user_role === 'owner') {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true, true);
        }
    }
} catch (PDOException $e) {
    error_log("Failed to get user company list: " . $e->getMessage());
}

// σªéµ₧£ URL Σ╕¡µ£ë company_id σÅéµò░∩╝îΣ╜┐τö¿σ«â∩╝êτö¿Σ║Äσêçµìó company∩╝ë
$company_id = isset($_GET['company_id']) ? (int) $_GET['company_id'] : ($_SESSION['company_id'] ?? null);

// Θ¬îΦ»ü company_id µÿ»σÉªσ▒₧Σ║Äσ╜ôσëìτö¿µê╖
if ($current_user_id && count($user_companies) > 0) {
    $valid_company = false;
    if ($company_id) {
        foreach ($user_companies as $comp) {
            if ($comp['id'] == $company_id) {
                $valid_company = true;
                break;
            }
        }
    }
    if (!$valid_company) {
        // σªéµ₧£ company_id µùáµòêµêûΣ╕ìσ¡ÿσ£¿∩╝îΣ╜┐τö¿τ¼¼Σ╕ÇΣ╕¬ company
        $company_id = $user_companies[0]['id'];
        // µ¢┤µû░ session∩╝êτí«Σ┐¥τÖ╗σ╜òσÉÄΘ╗ÿΦ«ñΣ╜┐τö¿τ¼¼Σ╕ÇΣ╕¬ company∩╝ë
        $_SESSION['company_id'] = $company_id;

        // 如果 URL 带有无效的 company_id，重定向以清除参数或修正为合法的 company_id
        if (isset($_GET['company_id'])) {
            header("Location: ?company_id=" . $company_id . (isset($_GET['search']) ? "&search=" . urlencode($_GET['search']) : ""));
            exit();
        }
    } elseif (isset($_GET['company_id']) && $company_id == (int) $_GET['company_id']) {
        // σªéµ₧£ URL Σ╕¡µ£ë company_id σÅéµò░Σ╕öΘ¬îΦ»üΘÇÜΦ┐ç∩╝îµ¢┤µû░ session∩╝êσ«₧τÄ░Φ╖¿Θí╡Θ¥óσÉîµ¡Ñ∩╝ë
        $_SESSION['company_id'] = $company_id;
    } elseif (!isset($_GET['company_id']) && $company_id == $_SESSION['company_id']) {
        // σªéµ₧£Σ╜┐τö¿ session Σ╕¡τÜä company_id Σ╕öµ£ëµòê∩╝îτí«Σ┐¥ session σ╖▓Φ«╛τ╜«∩╝êτÖ╗σ╜òµù╢Φ«╛τ╜«τÜä∩╝ë
        $_SESSION['company_id'] = $company_id;
    }
} else {
    // σªéµ₧£µ▓íµ£ëσà│ΦüöτÜä company∩╝îΣ╜┐τö¿ session Σ╕¡τÜä company_id
    $company_id = $_SESSION['company_id'] ?? null;
}

/** React 壳内 iframe 嵌入：不加载侧栏/重复 sidebar 脚本 */
$processListClassicEmbed = isset($_GET['c168_embed']) && $_GET['c168_embed'] === '1';
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <title><?php echo htmlspecialchars($processListPageTitle); ?></title>
    <link rel="stylesheet" href="css/processCSS.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <?php if (!$processListClassicEmbed) { ?>
    <link rel="stylesheet" href="css/sidebar.css">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <?php } ?>
    <link rel="stylesheet" href="css/processlist.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="css/date-range-picker.css?v=<?php echo time(); ?>">
    <link rel="stylesheet"
        href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>

<body class="process-page<?php echo $processListPageFile === 'bank_process_list.php' ? ' process-page--bank' : ''; ?><?php echo $processListClassicEmbed ? ' processlist-classic-embed' : ''; ?>">
    <div class="container">
        <div class="content">
            <div
                style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0px; margin-top: 20px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <h1 class="page-title" style="margin: 0;"><?php echo htmlspecialchars($processListPageTitle); ?>
                    </h1>
                    <?php renderBankProcessToolbarAction(); ?>
                </div>
                <!-- Permission Filter -->
                <div id="process-list-permission-filter" class="process-company-filter process-permission-filter-header"
                    style="display: none;">
                    <span class="process-company-label">Category:</span>
                    <div id="process-list-permission-buttons" class="process-company-buttons">
                        <!-- Permission buttons will be loaded dynamically -->
                    </div>
                </div>
            </div>

            <div class="separator-line"></div>

            <div class="action-buttons-container">
                <div class="action-buttons">
                    <div class="action-controls-row" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <button class="btn btn-add" onclick="addProcess()">Add Process</button>
                        <div class="process-list-date-filter" id="processListDateFilter" style="display: none;">
                            <div class="date-range-picker" id="date-range-picker">
                                <i class="fas fa-calendar-alt"></i>
                                <span id="date-range-display">Select date range</span>
                                <button type="button" class="process-list-date-clear" id="processListDateClearBtn"
                                    title="Clear date range" aria-label="Clear date range"
                                    style="display: none;">&times;</button>
                            </div>
                            <input type="hidden" id="date_from" value="">
                            <input type="hidden" id="date_to" value="">
                        </div>
                        <div class="search-container">
                            <svg class="search-icon" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                            </svg>
                            <input type="text" id="searchInput" placeholder="Search" class="search-input"
                                value="<?php echo $searchTerm; ?>">
                        </div>
                        <?php
                        $showAllChecked = isset($_GET['showAll']);
                        $showInactiveChecked = !$showAllChecked && isset($_GET['showInactive']);
                        $showOfficialChecked = !$showAllChecked && isset($_GET['showOfficial']);
                        $showEInvoiceChecked = !$showAllChecked && isset($_GET['showEInvoice']);
                        $showBlockChecked = !$showAllChecked && isset($_GET['showBlock']);
                        ?>
                        <div class="checkbox-section">
                            <input type="checkbox" id="showAll" name="showAll" <?php echo $showAllChecked ? 'checked' : ''; ?>>
                            <label for="showAll">Show All</label>
                        </div>
                        <div class="checkbox-section">
                            <input type="checkbox" id="showInactive" name="showInactive" <?php echo $showInactiveChecked ? 'checked' : ''; ?>>
                            <label for="showInactive">Show Inactive</label>
                        </div>
                        <?php renderBankProcessFilterControls($showOfficialChecked, $showEInvoiceChecked, $showBlockChecked); ?>
                    </div>
                    <button class="btn btn-delete" id="processDeleteSelectedBtn" onclick="deleteSelected()"
                        title="Only inactive processes can be deleted" disabled>Delete</button>
                </div>

                <!-- Shared Group & Company Filter (SSR) -->
                <?php
                $filter_prefix = 'process'; 
                include 'includes/company_filter.php'; 
                ?>
                <script>
                    window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                        if (typeof switchProcessListCompany === 'function') {
                            switchProcessListCompany(companyId);
                        }
                    };
                </script>
            </div>

            <!-- σîàΦúàσÖ¿Σ┐¥Φ»ü th Σ╕Äµò░µì«σî║σÉîσ«╜∩╝îσêùσ»╣Θ╜É -->
            <div class="process-table-wrapper" id="processTableWrapper">
                <!-- Table Header -->
                <div class="table-header" id="tableHeader">
                    <!-- Games table headers (default) -->
                    <div class="header-item gambling-header">No</div>
                    <div class="header-item gambling-header">Process ID</div>
                    <div class="header-item gambling-header">Description</div>
                    <div class="header-item gambling-header">Status</div>
                    <div class="header-item gambling-header">Currency</div>
                    <div class="header-item gambling-header">Day Use</div>
                    <div class="header-item gambling-header">Action
                        <input type="checkbox" id="selectAllProcesses" title="Select all"
                            style="margin-left: 10px; cursor: pointer;" onchange="toggleSelectAllProcesses()">
                    </div>
                    <?php renderBankProcessTableHeaders(); ?>
                </div>

                <!-- Process Cards List -->
                <div class="process-cards" id="processTableBody">
                    <div class="process-card">
                        <div class="card-item">Load the Data...</div>
                    </div>
                </div>
            </div>

            <?php renderBankProcessTableWrapper(); ?>

            <!-- σêåΘí╡µÄºΣ╗╢ - µ╡«σè¿σ£¿σÅ│Σ╕ïΦºÆ -->
            <div class="pagination-container" id="paginationContainer">
                <button class="pagination-btn" id="prevBtn" onclick="prevPage()">◀</button>
                <span class="pagination-info" id="paginationInfo">1 of 1</span>
                <button class="pagination-btn" id="nextBtn" onclick="nextPage()">▶</button>
            </div>
        </div>
    </div>

    <!-- Edit Process Popup Modal -->
    <div id="editModal" class="modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Process</h2>
                <span class="close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="editProcessForm" class="process-form add-grid">
                    <input type="hidden" id="edit_process_id" name="id">
                    <input type="hidden" id="edit_description_id" name="description_id">
                    <input type="hidden" id="edit_status" name="status" value="active">

                    <!-- Left column -->
                    <div class="add-col">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_process_name">Process Name *</label>
                                <input type="text" id="edit_process_name" name="process_name" required readonly
                                    style="background-color: #f5f5f5; cursor: not-allowed;">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_description">Description</label>
                                <div class="input-with-icon">
                                    <input type="text" id="edit_description" name="description" readonly
                                        placeholder="Click + to select descriptions">
                                    <button type="button" class="add-icon" onclick="expandEditDescription()">+</button>
                                </div>
                            </div>
                        </div>

                        <!-- Selected Descriptions Display for Edit (hidden by default) -->
                        <div class="form-row" id="edit_selected_descriptions_display" style="display: none;">
                            <div class="form-group">
                                <label>Selected Descriptions</label>
                                <div class="selected-descriptions" id="edit_selected_descriptions_list"></div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_currency">Currency</label>
                                <select id="edit_currency" name="currency_id">
                                    <option value="">Select Currency</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_dts_modified" style="font-weight: 600; color: #666;">DTS
                                    Modified:</label>
                                <div id="edit_dts_modified" readonly
                                    style="background-color: #f5f5f5; cursor: not-allowed; margin-top: 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; width: 100%; min-width: 200px; min-height: 38px; box-sizing: border-box;">
                                    <span id="edit_dts_modified_date" style="min-height: 1em;"></span>
                                    <span id="edit_dts_modified_user" style="font-weight: 600; min-height: 1em;"></span>
                                </div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_dts_created" style="font-weight: 600; color: #666;">DTS
                                    Created:</label>
                                <div id="edit_dts_created" readonly
                                    style="background-color: #f5f5f5; cursor: not-allowed; margin-top: 5px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; width: 100%; min-width: 200px; min-height: 38px; box-sizing: border-box;">
                                    <span id="edit_dts_created_date" style="min-height: 1em;"></span>
                                    <span id="edit_dts_created_user" style="font-weight: 600; min-height: 1em;"></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right column -->
                    <div class="add-col">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_remove_words">Remove Words</label>
                                <input type="text" id="edit_remove_words" name="remove_word"
                                    placeholder="Enter words to remove">
                                <small class="field-help">(Use semicolon to separate multiple words, e.g.
                                    abc;cde;efg)</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <div class="day-use-header">
                                    <label>Day Use</label>
                                    <div class="all-day-checkbox">
                                        <input type="checkbox" id="edit_all_day" name="all_day">
                                        <label for="edit_all_day">All Day</label>
                                    </div>
                                </div>
                                <div class="day-checkboxes" id="edit_day_checkboxes"></div>
                            </div>
                        </div>

                        <div class="form-row row-two-cols">
                            <div class="form-group">
                                <label for="edit_replace_word_from">Replace From</label>
                                <input type="text" id="edit_replace_word_from" name="replace_word_from"
                                    placeholder="Old word">
                                <small class="field-help">(Word to be replaced)</small>
                            </div>

                            <div class="form-group">
                                <label for="edit_replace_word_to">Replace To</label>
                                <input type="text" id="edit_replace_word_to" name="replace_word_to"
                                    placeholder="New word">
                                <small class="field-help">(Replacement word)</small>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit_remarks">Remarks</label>
                                <textarea id="edit_remarks" name="remark" rows="5"
                                    placeholder="Enter remarks..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions add-actions">
                        <button type="submit" class="btn btn-save">Update Process</button>
                        <button type="button" class="btn btn-cancel" onclick="closeEditModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Add Process Popup Modal -->
    <div id="addModal" class="modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Process</h2>
                <span class="close" onclick="closeAddModal()">&times;</span>
            </div>
            <div class="modal-body">
                <form id="addProcessForm" class="process-form add-grid">
                    <!-- Left column -->
                    <div class="add-col">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_copy_from_btn">Copy From</label>
                                <div class="custom-select-wrapper">
                                    <button type="button" class="custom-select-button" id="add_copy_from_btn"
                                        data-placeholder="Select Process to Copy From">Select Process to Copy
                                        From</button>
                                    <div class="custom-select-dropdown" id="add_copy_from_dropdown">
                                        <div class="custom-select-search">
                                            <input type="text" placeholder="Search process..." autocomplete="off">
                                        </div>
                                        <div class="custom-select-options"></div>
                                    </div>
                                </div>
                                <input type="hidden" id="add_copy_from" name="copy_from" value="">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_process_id">Process ID *</label>
                                <div class="input-with-checkbox">
                                    <input type="text" id="add_process_id" name="process_id"
                                        placeholder="Enter Process ID" required>
                                    <div class="checkbox-container">
                                        <input type="checkbox" id="add_multi_use" name="multi_use_purpose">
                                        <label for="add_multi_use">Multi-Process</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Multi-use Process Selection (hidden by default) -->
                        <div class="form-row" id="multi_use_processes" style="display: none;">
                            <div class="form-group">
                                <label>Select Multi-use Processes</label>
                                <div class="process-checkboxes" id="process_checkboxes"></div>
                                <div class="multi-use-actions">
                                    <button type="button" class="btn btn-save btn-small"
                                        onclick="confirmMultiUseProcessSelection()">Confirm</button>
                                </div>
                            </div>
                        </div>

                        <!-- Selected Processes Display (hidden by default) -->
                        <div class="form-row" id="selected_processes_display" style="display: none;">
                            <div class="form-group">
                                <label>Selected Multi-use Processes</label>
                                <div class="selected-processes" id="selected_processes_list"></div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_description">Description *</label>
                                <div class="input-with-icon">
                                    <input type="text" id="add_description" name="description" required readonly
                                        placeholder="Click + to select descriptions">
                                    <button type="button" class="add-icon" onclick="expandDescription()">+</button>
                                </div>
                            </div>
                        </div>

                        <!-- Selected Descriptions Display (hidden by default) -->
                        <div class="form-row" id="selected_descriptions_display" style="display: none;">
                            <div class="form-group">
                                <label>Selected Descriptions</label>
                                <div class="selected-descriptions" id="selected_descriptions_list"></div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_currency">Currency</label>
                                <select id="add_currency" name="currency_id">
                                    <option value="">Select Currency</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Right column -->
                    <div class="add-col">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_remove_words">Remove Words</label>
                                <input type="text" id="add_remove_words" name="remove_word"
                                    placeholder="Enter words to remove">
                                <small class="field-help">(Use semicolon to separate multiple words, e.g.
                                    abc;cde;efg)</small>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <div class="day-use-header">
                                    <label>Day Use</label>
                                    <div class="all-day-checkbox">
                                        <input type="checkbox" id="add_all_day" name="all_day">
                                        <label for="add_all_day">All Day</label>
                                    </div>
                                </div>
                                <div class="day-checkboxes" id="day_checkboxes"></div>
                            </div>
                        </div>
                        <div class="form-row row-two-cols">
                            <div class="form-group">
                                <label for="add_replace_word_from">Replace From</label>
                                <input type="text" id="add_replace_word_from" name="replace_word_from"
                                    placeholder="Old word">
                                <small class="field-help">(Word to be replaced)</small>
                            </div>
                            <div class="form-group">
                                <label for="add_replace_word_to">Replace To</label>
                                <input type="text" id="add_replace_word_to" name="replace_word_to"
                                    placeholder="New word">
                                <small class="field-help">(Replacement word)</small>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="add_remarks">Remarks</label>
                                <textarea id="add_remarks" name="remark" rows="5"
                                    placeholder="Enter remarks..."></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Actions: span full width -->
                    <div class="form-actions add-actions">
                        <button type="submit" class="btn btn-save">Add Process</button>
                        <button type="button" class="btn btn-cancel" onclick="closeAddModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <?php renderBankProcessModals(); ?>

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
                                    <input type="text" id="new_description_name" name="description_name"
                                        placeholder="Enter new description name..." required>
                                    <button type="submit" class="btn btn-save">Add</button>
                                </div>
                            </form>
                        </div>

                        <h3>Available Descriptions</h3>
                        <div class="description-search">
                            <input type="text" id="descriptionSearch" placeholder="Search descriptions..."
                                onkeyup="filterDescriptions()">
                        </div>
                        <div class="description-list" id="existingDescriptions">
                            <!-- Available descriptions will be loaded here -->
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-cancel"
                        onclick="closeDescriptionSelectionModal()">Cancel</button>
                    <button type="button" class="btn btn-save" id="confirmDescriptionsBtn"
                        onclick="confirmDescriptions()">Confirm Selection</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Notification Container -->
    <div id="processNotificationContainer" class="process-notification-container"></div>

    <!-- Confirm Delete Modal -->
    <div id="confirmDeleteModal" class="process-modal" style="display: none;">
        <div class="process-confirm-modal-content">
            <div class="process-confirm-icon-container">
                <svg class="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h2 class="process-confirm-title">Confirm Delete</h2>
            <p id="confirmDeleteMessage" class="process-confirm-message">This action cannot be undone.</p>
            <div class="process-confirm-actions">
                <button type="button" class="process-btn process-btn-cancel confirm-cancel"
                    onclick="closeConfirmDeleteModal()">Cancel</button>
                <button type="button" class="process-btn process-btn-delete confirm-delete"
                    onclick="confirmDelete()">Delete</button>
            </div>
        </div>
    </div>

    <script>
        window.PROCESSLIST_SHOW_INACTIVE = <?php echo $showInactiveChecked ? 'true' : 'false'; ?>;
        window.PROCESSLIST_SHOW_OFFICIAL = <?php echo $showOfficialChecked ? 'true' : 'false'; ?>;
        window.PROCESSLIST_SHOW_E_INVOICE = <?php echo $showEInvoiceChecked ? 'true' : 'false'; ?>;
        window.PROCESSLIST_SHOW_BLOCK = <?php echo $showBlockChecked ? 'true' : 'false'; ?>;
        window.PROCESSLIST_SHOW_ALL = <?php echo $showAllChecked ? 'true' : 'false'; ?>;
        window.PROCESSLIST_COMPANY_ID = <?php echo json_encode($company_id ?? null); ?>;
        window.PROCESSLIST_COMPANY_CODE = <?php echo json_encode(isset($user_companies) && count($user_companies) > 0 ? array_values(array_filter($user_companies, function ($c) use ($company_id) {
            return $c['id'] == $company_id;
        }))[0]['company_id'] ?? '' : ''); ?>;
        window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD = [<?php echo json_encode($company_id); ?>];
        window.PROCESSLIST_PAGE_FILE = <?php echo json_encode($processListPageFile); ?>;
        window.PROCESSLIST_FORCED_PERMISSION = <?php echo json_encode($processListForcedPermission); ?>;
        window.PROCESSLIST_HIDE_PERMISSION_FILTER = <?php echo $processListHidePermissionFilter ? 'true' : 'false'; ?>;
        <?php
        $plSpaBase = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
        $plEazySpaBase = ($plSpaBase === '' || $plSpaBase === '.' || $plSpaBase === '/') ? '' : $plSpaBase;
        ?>
        <?php if (!empty($processListClassicEmbed)) { ?>
        window.__C168_PROCESSLIST_IFRAME_EMBED__ = true;
        window.__C168_API_BASE__ = '';
        window.__C168_SPA_LINK_BASE__ = <?php echo json_encode($plEazySpaBase); ?>;
        <?php } ?>
    </script>
    <div class="calendar-popup" id="calendar-popup" style="display: none;">
        <div class="calendar-header">
            <button type="button" class="calendar-nav-btn" onclick="event.stopPropagation(); window.changeMonth(-1)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="calendar-month-year" onclick="event.stopPropagation();">
                <select id="calendar-month-select">
                    <option value="0">Jan</option>
                    <option value="1">Feb</option>
                    <option value="2">Mar</option>
                    <option value="3">Apr</option>
                    <option value="4">May</option>
                    <option value="5">Jun</option>
                    <option value="6">Jul</option>
                    <option value="7">Aug</option>
                    <option value="8">Sep</option>
                    <option value="9">Oct</option>
                    <option value="10">Nov</option>
                    <option value="11">Dec</option>
                </select>
                <select id="calendar-year-select"></select>
            </div>
            <button type="button" class="calendar-nav-btn" onclick="event.stopPropagation(); window.changeMonth(1)">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="calendar-weekdays">
            <div class="calendar-weekday">Sun</div>
            <div class="calendar-weekday">Mon</div>
            <div class="calendar-weekday">Tue</div>
            <div class="calendar-weekday">Wed</div>
            <div class="calendar-weekday">Thu</div>
            <div class="calendar-weekday">Fri</div>
            <div class="calendar-weekday">Sat</div>
        </div>
        <div class="calendar-days" id="calendar-days"></div>
    </div>
    <script src="js/date-range-picker.js?v=<?php echo time(); ?>"></script>
    <script src="js/processlist.js?v=<?php echo time(); ?>"></script>
    <script src="js/bank_process_list.js?v=<?php echo time(); ?>"></script>
</body>

</html>