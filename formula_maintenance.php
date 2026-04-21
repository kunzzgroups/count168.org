<?php
// 使用统一的session检查
require_once 'session_check.php';

// 仅当公司具有 Games category 权限时才可访问此页（与侧边栏 Maintenance > Formula 可见性一致）
$session_company_id = $_SESSION['company_id'] ?? null;
if ($session_company_id) {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $permsJson = $stmt->fetchColumn();
        $companyPerms = ($permsJson ? json_decode($permsJson, true) : null);
        $hasGamesPermission = is_array($companyPerms) && (in_array('Games', $companyPerms) || in_array('Gambling', $companyPerms));
        $isBankOnlyCategory = is_array($companyPerms) && in_array('Bank', $companyPerms) && !$hasGamesPermission;
        if ($isBankOnlyCategory) {
            header('Location: dashboard.php');
            exit;
        }
        if (!$hasGamesPermission) {
            header('Location: processlist.php?error=no_gambling_permission');
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

require_once __DIR__ . '/api/get_companies_helper.php';
$user_companies = [];
try {
    $current_user_id = $_SESSION['user_id'] ?? null;
    $current_user_role = $_SESSION['role'] ?? '';
    if ($current_user_id) {
        if ($current_user_role === 'owner') {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true);
        }
    }
} catch (Exception $e) { }

$company_id = $session_company_id;

// Get URL parameters for notifications
$success = isset($_GET['success']) ? true : false;
$error = isset($_GET['error']) ? true : false;

// 当前 session 公司的 company_code（用于 Category 权限按钮）
$session_company_code = '';
if (!empty($session_company_id)) {
    try {
        $stmt = $pdo->prepare("SELECT company_id FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $row = $stmt->fetchColumn();
        $session_company_code = $row ? (string) $row : '';
    } catch (PDOException $e) {
        $session_company_code = '';
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/transaction.css?v=<?php echo time(); ?>" />
    <title>Formula Maintenance</title>
    <link rel="stylesheet" href="css/sidebar.css">
    <link rel="stylesheet" href="css/formula_maintenance.css?v=<?php echo time(); ?>">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="container">
        <div class="maintenance-header">
            <h1 id="maintenance-page-title">Maintenance - Formula</h1>
            <!-- Category 选项（与 bankprocess_maintenance 一致） -->
            <div id="maintenance-permission-filter" class="maintenance-permission-filter-header" style="display: none;">
                <span class="maintenance-company-label">Category:</span>
                <div id="maintenance-permission-buttons" class="maintenance-company-buttons">
                    <!-- Permission buttons will be loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Search Section -->
        <div class="maintenance-search-section formula-maintenance-filters-wrap">
            <div class="maintenance-filters">
                <div class="maintenance-form-group">
                    <label class="maintenance-label">Process</label>
                    <div class="custom-select-wrapper" style="display: flex; gap: 8px; align-items: center;">
                        <div style="position: relative; flex: 1;">
                            <button type="button" class="custom-select-button" id="filter_process" data-placeholder="--Select All--">--Select All--</button>
                            <div class="custom-select-dropdown" id="filter_process_dropdown">
                                <div class="custom-select-search">
                                    <input type="text" placeholder="Search process..." autocomplete="off">
                                </div>
                                <div class="custom-select-options"></div>
                            </div>
                        </div>
                        <button type="button" id="clear_filters_btn" title="Clear Filters" onclick="clearFormulaFilters()" style="display: flex; align-items: center; justify-content: center; background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; border-radius: 50%; opacity: 0; pointer-events: none; transition: opacity 0.2s ease;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="maintenance-form-group">
                    <label class="maintenance-label">Search</label>
                    <input type="text" id="search_filter" class="maintenance-input" placeholder="Search formula...">
                </div>
            </div>
            
            <div class="maintenance-filter-row">
                <!-- Shared Group & Company Filter (SSR) -->
                <div class="maintenance-filter-left">
                    <?php
                    $filter_prefix = 'maintenance'; 
                    include 'includes/company_filter.php'; 
                    ?>
                </div>
                <script>
                    window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                        if (typeof switchCompany === 'function') {
                            switchCompany(companyId, companyCode);
                        }
                    };
                </script>
                
                <div class="maintenance-actions">
                    <button type="button" class="maintenance-delete-btn" id="deleteBtn" onclick="deleteData()" disabled>Delete</button>
                    <label class="maintenance-confirm-delete-label">
                        <input type="checkbox" id="confirmDelete" class="maintenance-checkbox" onchange="toggleDeleteButton()">
                        <span>Confirm Delete</span>
                    </label>
                </div>
            </div>
        </div>
        
        <!-- Empty State -->
        <div class="empty-state-container" id="emptyState" style="display: none;">
            <div class="empty-state">
                <p>No data found. Please adjust your search criteria and try again.</p>
            </div>
        </div>
        
        <!-- Data Capture List -->
        <div class="maintenance-list-container" id="dataCaptureTableContainer" style="display: none; padding-bottom: 20px;">
            <div style="overflow-x: auto;">
                <table class="maintenance-table" style="width: 100%; border-collapse: collapse; min-width: 1000px;">
                    <thead style="position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="width: 5%;">No</th>
                            <th style="width: 10%;">Process</th>
                            <th style="width: 10%;">Account</th>
                            <th style="width: 5%;">Currency</th>
                            <th style="width: 10%;">Source</th>
                            <th style="width: 10%;">Product</th>
                            <th style="width: 15%;">Input Method</th>
                            <th style="width: 15%;">Formula</th>
                            <th style="width: 12%;">Description</th>
                            <th style="width: 8%; text-align: center;">
                                <input type="checkbox" id="select_all_data_capture" class="maintenance-checkbox" title="Select All" onchange="toggleSelectAllRows(this)">
                            </th>
                        </tr>
                    </thead>
                    <tbody id="dataCaptureTableBody">
                        <!-- Table rows will be populated dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Notification Container -->
    <div id="notificationContainer" class="maintenance-notification-container"></div>

    <!-- Confirm Delete Modal -->
    <div id="confirmDeleteModal" class="maintenance-modal" style="display: none;">
        <div class="maintenance-confirm-modal-content">
            <div class="maintenance-confirm-icon-container">
                <svg class="maintenance-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <h2 class="maintenance-confirm-title">Confirm Delete</h2>
            <p id="confirmDeleteMessage" class="maintenance-confirm-message">This action cannot be undone.</p>
            <div class="maintenance-confirm-actions">
                <button type="button" class="maintenance-btn maintenance-btn-cancel confirm-cancel" onclick="closeConfirmDeleteModal()">Cancel</button>
                <button type="button" class="maintenance-btn maintenance-btn-delete confirm-delete" onclick="confirmDelete()">Delete</button>
            </div>
        </div>
    </div>

    <script>
        window.FORMULA_MAINTENANCE_COMPANY_ID = <?php echo json_encode($session_company_id); ?>;
        window.currentCompanyCode = <?php echo json_encode($session_company_code); ?>;
    </script>
    <script src="js/formula_maintenance_v2.js?v=<?php echo time(); ?>"></script>
</body>
</html>
