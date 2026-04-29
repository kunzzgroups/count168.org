<?php
// 使用统一的 session 检查
require_once 'session_check.php';
require_once 'permissions.php';

// 获取 company_id（session_check.php 已确保用户已登录）
$company_id = $_SESSION['company_id'];

// Bank-only company 进入报表时自动跳转 dashboard
$companyPerms = null;
try {
    $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
    $stmt->execute([$company_id]);
    $permsJson = $stmt->fetchColumn();
    $companyPerms = ($permsJson ? json_decode($permsJson, true) : null);
} catch (PDOException $e) {
    $companyPerms = null;
}
$hasGamesPermission = is_array($companyPerms) && (in_array('Games', $companyPerms) || in_array('Gambling', $companyPerms));
$isBankOnlyCategory = is_array($companyPerms) && in_array('Bank', $companyPerms) && !$hasGamesPermission;
if ($isBankOnlyCategory) {
    header('Location: dashboard.php');
    exit;
}

if (!checkCompanyCategoryPermission($pdo, $company_id, 'Games')) {
    header('Location: index.php?error=unauthorized_category');
    exit;
}

$userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
$isOwner = ($userRole === 'owner');

require_once __DIR__ . '/api/get_companies_helper.php';
$user_companies = [];
try {
    $current_user_id = $_SESSION['user_id'] ?? null;
    if ($current_user_id) {
        if ($isOwner) {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true, true);
        }
    }
} catch (Exception $e) { }
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <title>Domain Report</title>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/transaction.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo time(); ?>">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/date-range-picker.css?v=<?php echo time(); ?>">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/domain_report.css?v=<?php echo time(); ?>">

    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body class="report-page">
    <div class="container">
        <div class="content">
            <div class="report-header">
                <h1 class="account-page-title">Domain Report</h1>
            </div>
            <div class="account-separator-line"></div>

            <div class="domain-report-filter-container">
                <div class="domain-report-filters">
                    <div class="domain-report-filter-group">
                        <label for="processSelect">Process</label>
                        <div class="custom-select-wrapper">
                            <button type="button" class="custom-select-button" id="processSelect" data-placeholder="All Process">All Process</button>
                            <div class="custom-select-dropdown" id="processSelect_dropdown">
                                <div class="custom-select-search">
                                    <input type="text" placeholder="Search process..." autocomplete="off">
                                </div>
                                <div class="custom-select-options"></div>
                            </div>
                        </div>
                    </div>
                    <div class="domain-report-filter-group report-date-range-group">
                        <label for="date-range-picker">Date Range</label>
                        <div class="date-range-picker" id="date-range-picker">
                            <i class="fas fa-calendar-alt"></i>
                            <span id="date-range-display">Select date range</span>
                        </div>
                        <input type="hidden" id="date_from" value="<?php echo date('d/m/Y'); ?>">
                        <input type="hidden" id="date_to" value="<?php echo date('d/m/Y'); ?>">
                    </div>
                    <div class="domain-report-filter-group quick-select-wrap">
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

                <!-- Shared Group & Company Filter (SSR) -->
                <?php
                $filter_prefix = 'transaction'; 
                include 'includes/company_filter.php'; 
                ?>
                <script>
                    window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                        if (typeof switchCompany === 'function') {
                            switchCompany(companyId, companyCode);
                        }
                    };
                </script>
            </div>

            <div class="domain-report-list-container">
                <div class="domain-report-table-header">
                    <div>Process</div>
                    <div>Turnover</div>
                    <div>Win</div>
                    <div>Lose</div>
                    <div>Win/Lose</div>
                </div>

                <div class="domain-report-cards" id="domainReportBody">
                    <div class="domain-report-card">
                        <div class="domain-report-card-item" style="grid-column: 1 / -1; text-align: center; justify-content: center; padding: 20px;">
                            Loading...
                        </div>
                    </div>
                </div>

                <div class="domain-report-total" id="domainReportTotal" style="display: none;">
                    <div class="domain-report-total-label">Total</div>
                    <div class="domain-report-amount" id="totalTurnover">0.00</div>
                    <div class="domain-report-amount" id="totalWin">0.00</div>
                    <div class="domain-report-amount" id="totalLose">0.00</div>
                    <div class="domain-report-amount" id="totalWinLose">0.00</div>
                </div>
            </div>
        </div>
    </div>

    <div id="domainReportNotificationContainer" class="account-notification-container"></div>

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

    <script>
        window.DOMAIN_REPORT_COMPANY_ID = <?php echo $company_id; ?>;
    </script>
    <script src="js/date-range-picker.js?v=<?php echo time(); ?>"></script>
    <script src="js/decimal.min.js?v=<?php echo file_exists('js/decimal.min.js') ? filemtime('js/decimal.min.js') : time(); ?>"></script>
    <script src="js/money-decimal.js?v=<?php echo file_exists('js/money-decimal.js') ? filemtime('js/money-decimal.js') : time(); ?>"></script>
    <script src="js/domain_report.js?v=<?php echo time(); ?>"></script>
</body>
</html>
