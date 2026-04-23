<?php
// 使用统一的session检查
require_once 'session_check.php';

// 仅当公司具有 Bank category 权限时才可访问此页（与侧边栏 Maintenance > Process 可见性一致）
$session_company_id = $_SESSION['company_id'] ?? null;
if ($session_company_id) {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $permsJson = $stmt->fetchColumn();
        $companyPerms = ($permsJson ? json_decode($permsJson, true) : null);
        if (!is_array($companyPerms) || !in_array('Bank', $companyPerms)) {
            header('Location: processlist.php?error=no_bank_permission');
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
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true, true);
        }
    }
} catch (Exception $e) { }

$company_id = $session_company_id;

// Get URL parameters for notifications
$success = isset($_GET['success']) ? true : false;
$error = isset($_GET['error']) ? true : false;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <title>Process Maintenance</title>
    <link rel="stylesheet" href="css/bankprocess_maintenance.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="css/date-range-picker.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="css/sidebar.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="container">
        <div class="maintenance-header">
            <h1 id="maintenance-page-title">Maintenance - Process</h1>
            <!-- Category 权限（与 processlist.php 同步） -->
            <div id="bankprocess-permission-filter" class="maintenance-permission-filter-header" style="display: none;">
                <span class="maintenance-company-label">Category:</span>
                <div id="bankprocess-permission-buttons" class="maintenance-company-buttons">
                    <!-- Permission buttons will be loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Search Section -->
        <div class="maintenance-search-section">
            <div class="maintenance-filters">
                <div class="maintenance-form-group maintenance-date-inline">
                    <label class="maintenance-label">Date Range</label>
                    <div class="date-range-picker" id="date-range-picker">
                        <i class="fas fa-calendar-alt"></i>
                        <span id="date-range-display">Select date range</span>
                    </div>
                    <input type="hidden" id="date_from" value="<?php echo date('d/m/Y'); ?>">
                    <input type="hidden" id="date_to" value="<?php echo date('d/m/Y'); ?>">
                </div>
                <div class="maintenance-form-group maintenance-search-inline" id="from-search-row">
                    <label class="maintenance-label" for="filter_from_search">Search</label>
                    <div class="search-container maintenance-search-container">
                        <svg class="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                        <input type="text" id="filter_from_search" placeholder="e.g. TEST M16(CIMB) / CIMB" class="search-input maintenance-search-input" autocomplete="off">
                    </div>
                </div>
                <div class="maintenance-form-group quick-select-wrap">
                    <label class="form-label"><i class="fas fa-clock"></i> Quick Select</label>
                    <div class="quick-select-dropdown quick-select-dropdown-toggle">
                        <button type="button" class="dropdown-toggle" onclick="event.stopPropagation(); window.toggleQuickSelectDropdown();">
                            <i class="fas fa-calendar-alt"></i>
                            <span id="quick-select-text">Period</span>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="quick-select-dropdown">
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('today')">Today</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('yesterday')">Yesterday</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisWeek')">This Week</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastWeek')">Last Week</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisMonth')">This Month</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastMonth')">Last Month</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisYear')">This Year</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastYear')">Last Year</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="maintenance-filter-row">
                <div class="maintenance-filter-left">
                    <!-- Shared Group & Company Filter (SSR) -->
                    <?php
                    $filter_prefix = 'maintenance'; 
                    include 'includes/company_filter.php'; 
                    ?>
                    <script>
                        window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                            if (typeof switchCompany === 'function') {
                                switchCompany(companyId, companyCode);
                            }
                        };
                    </script>

                    <div id="currency-buttons-wrapper" class="maintenance-company-filter" style="display: none;">
                        <span class="maintenance-company-label">Currency:</span>
                        <div class="maintenance-company-buttons" id="currency-buttons-container">
                            <!-- Currency buttons injected here -->
                        </div>
                    </div>
                </div>

                <div class="maintenance-actions">
                    <button type="button" class="maintenance-delete-btn" id="deleteBtn" onclick="deleteData()" disabled>Delete</button>
                    <label class="maintenance-confirm-delete-label">
                        <input type="checkbox" id="confirmDelete" class="maintenance-checkbox" onchange="toggleDeleteButton()">
                        <span>Confirm Delete</span>
                    </label>
                </div>
            </div>
        </div>
        
        <!-- Data List Container -->
        <div class="maintenance-list-container" id="tableContainer" style="display: none;">
            <table class="maintenance-table">
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Dts Created</th>
                        <th>Account</th>
                        <th>From</th>
                        <th class="maintenance-header-amount">Amount</th>
                        <th>Description</th>
                        <th>Remark</th>
                        <th>Submitted By</th>
                        <th class="maintenance-select-all-header">
                            <input type="checkbox" id="select_all_bankprocess" class="maintenance-checkbox" title="Select All" onchange="toggleSelectAllRows(this)">
                        </th>
                    </tr>
                </thead>
                <tbody id="dataTableBody">
                    <!-- Rows will be populated dynamically -->
                </tbody>
            </table>
        </div>
        
        <!-- Empty State -->
        <div class="empty-state-container" id="emptyState" style="display: none;">
            <div class="empty-state">
                <p>No bank process transactions found. Please adjust your search criteria and try again.</p>
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
    <!-- Calendar popup (same as dashboard) -->
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

    <script>window.currentCompanyId = <?php echo json_encode($session_company_id); ?>;</script>
    <script src="js/date-range-picker.js?v=<?php echo time(); ?>"></script>
    <script src="js/bankprocess_maintenance.js?v=<?php echo time(); ?>"></script>
</body>
</html>