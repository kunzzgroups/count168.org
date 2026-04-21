<?php
session_start();
require_once 'config.php'; // 使用统一的数据库配置

$ui_lang = $_SESSION['ui_lang'] ?? 'en';
if ($ui_lang !== 'zh' && $ui_lang !== 'en') {
    $ui_lang = 'en';
}

// 不缓存 HTML，commit 后刷新即可拿到带最新 ?v= 的页面
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 超时时间（秒）
define('SESSION_TIMEOUT', 3600); // 1小时

// 检查remember me cookie自动登录
if (!isset($_SESSION['user_id']) && isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    // 验证remember token
    $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND company_id = 'c168' AND status = 'active'");
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        // 重新建立session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['last_activity'] = time();

        // 更新最后登录时间
        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);
    }
}

// 检查用户是否已登录
if (isset($_SESSION['user_id'])) {
    // 检查session超时（如果没有remember me的话）
    if (
        isset($_SESSION['last_activity']) &&
        (time() - $_SESSION['last_activity'] > SESSION_TIMEOUT) &&
        !isset($_COOKIE['remember_token'])
    ) {
        // 清除 session
        session_unset();
        session_destroy();

        // 重定向到登录页
        header("Location: index.php?lang=" . urlencode($ui_lang));
        exit();
    }

    // 检查owner是否已通过二级密码验证
    if (isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
        if (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true) {
            // Owner未通过二级密码验证，重定向到二级密码验证页面
            header("Location: owner_secondary_password.php?lang=" . urlencode($ui_lang));
            exit();
        }
    }

    // 先处理 logout（member 也会通过 sidebar 跳转到 dashboard.php?logout=1，必须在此处理后再重定向）
    if (isset($_GET['logout'])) {
        if (isset($_SESSION['user_id'])) {
            try {
                $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
                $stmt->execute([$_SESSION['user_id']]);
            } catch (PDOException $e) { /* user 表可能无此字段，member 从 account 登录 */
            }
        }
        session_unset();
        session_destroy();
        if (isset($_COOKIE['remember_token'])) {
            setcookie('remember_token', '', time() - 3600, "/", "", false, true);
        }
        header("Location: index.php?lang=" . urlencode($ui_lang));
        exit();
    }

    // member 不显示 Home 页，只显示 Win/Loss：访问 dashboard 时重定向到 member.php
    if (isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member') {
        header("Location: member.php?lang=" . urlencode($ui_lang));
        exit();
    }

    // 更新活动时间戳
    $_SESSION['last_activity'] = time();

} else {
    // 未登录，重定向到登录页
    header("Location: index.php?lang=" . urlencode($ui_lang));
    exit();
}

// 获取用户信息
$user_id = $_SESSION['user_id'];
$login_id = $_SESSION['login_id'];
$name = $_SESSION['name'];
$role = $_SESSION['role'];

// 获取用户权限
$stmt = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
$stmt->execute([$user_id]);
$userPermissions = $stmt->fetchColumn();
$permissions = $userPermissions ? json_decode($userPermissions, true) : [];

$company_id = 'c168'; // 固定值
$avatarLetter = strtoupper($name[0]);
// 为JavaScript准备用户数据
$userData = [
    'name' => $name,
    'login_id' => $login_id,
    'role' => $role,
    'avatar_letter' => $avatarLetter,
    'permissions' => $permissions
];

// 权限检查
$canViewAnalytics = ($role === 'admin'); // 只有admin可以查看分析
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transaction Dashboard - EazyCount</title>
    <link rel="icon" type="image/png" href="images/count_logo.png">
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <?php
    $assetVer = function ($file) {
        $path = __DIR__ . '/' . $file;
        return file_exists($path) ? filemtime($path) : time();
    };
    ?>
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/dashboard.css?v=<?php echo $assetVer('css/dashboard.css'); ?>">
    <script>
        // 用户数据供JavaScript使用（外部 js/dashboard.js 依赖此变量）
        window.userData = <?php echo json_encode($userData); ?>;
        window.companyId = <?php echo isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : 'null'; ?>;
    </script>
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <script src="js/dashboard.js?v=<?php echo $assetVer('js/dashboard.js'); ?>"></script>
    <link rel="stylesheet"
        href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>

<body class="dashboard-page">
    <?php include 'sidebar.php'; ?>

    <div class="dashboard-container">
        <h1 class="dashboard-title">Transaction Dashboard</h1>

        <div id="app" class="dashboard-content">
            <!-- 顶部区域：筛选器 + Earnings 并排 -->
            <div class="dashboard-top-row">
                <!-- Date Controls (左侧筛选器) -->
                <div class="dashboard-card dashboard-card--filters">
                    <div class="dashboard-card-body">
                        <div class="dashboard-date-controls">
                            <!-- 日期范围选择器 -->
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <label class="form-label" style="margin: 0;">Date Range</label>
                                <div class="date-range-picker" id="date-range-picker" onclick="toggleCalendar()">
                                    <i class="fas fa-calendar-alt"></i>
                                    <span id="date-range-display">Select date range</span>
                                </div>
                            </div>

                            <div class="divider"></div>

                            <!-- 月份选择器 -->
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <label class="form-label"
                                    style="margin: 0; display: flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-calendar" style="color: #3b82f6;"></i>
                                    Select Year & Month
                                </label>
                                <div class="enhanced-date-picker month-only" id="month-date-picker">
                                    <div class="date-part" data-type="year" onclick="showDateDropdown('month', 'year')">
                                        <span id="month-year-display">--</span>
                                    </div>
                                    <span class="date-separator">Year</span>
                                    <div class="date-part" data-type="month"
                                        onclick="showDateDropdown('month', 'month')">
                                        <span id="month-month-display">--</span>
                                    </div>
                                    <span class="date-separator">Month</span>

                                    <div class="date-dropdown" id="month-dropdown"></div>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: clamp(0px, 0.21vw, 4px);">
                                <label class="form-label"
                                    style="margin: 0; display: flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-clock" style="color: #3b82f6;"></i>
                                    Quick Select
                                </label>
                                <div class="dropdown">
                                    <button class="btn btn-secondary dropdown-toggle"
                                        onclick="toggleQuickSelectDropdown()">
                                        <i class="fas fa-calendar-alt"></i>
                                        <span id="quick-select-text">Period</span>
                                        <i class="fas fa-chevron-down"></i>
                                    </button>
                                    <div class="dropdown-menu" id="quick-select-dropdown">
                                        <button class="dropdown-item" onclick="selectQuickRange('today')">Today</button>
                                        <button class="dropdown-item"
                                            onclick="selectQuickRange('yesterday')">Yesterday</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('thisWeek')">This
                                            Week</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('lastWeek')">Last
                                            Week</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('thisMonth')">This
                                            Month</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('lastMonth')">Last
                                            Month</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('thisYear')">This
                                            Year</button>
                                        <button class="dropdown-item" onclick="selectQuickRange('lastYear')">Last
                                            Year</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Group Buttons (above Company) -->
                        <div id="group-buttons-wrapper" class="transaction-company-filter" style="display: none;">
                            <span class="transaction-company-label">GroupID:</span>
                            <div id="group-buttons-container" class="transaction-company-buttons">
                                <!-- Group buttons will be dynamically added here -->
                            </div>
                        </div>
                        <!-- Company Buttons -->
                        <div id="company-buttons-wrapper" class="transaction-company-filter" style="display: none;">
                            <span class="transaction-company-label">Company:</span>
                            <div id="company-buttons-container" class="transaction-company-buttons">
                                <!-- Company buttons will be dynamically added here -->
                            </div>
                        </div>
                        <!-- Currency Buttons (below Company) -->
                        <div id="currency-buttons-wrapper" class="transaction-company-filter" style="display: none;">
                            <span class="transaction-company-label">Currency:</span>
                            <div id="currency-buttons-container" class="transaction-company-buttons">
                                <!-- Currency buttons will be dynamically added here -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Earnings 卡片 (右上角独立显示) -->
                <div class="dashboard-kpi-card dashboard-kpi-card--blue" id="earnings-card-wrapper"
                    style="display: none;">
                    <div class="kpi-icon">
                        <i class="fas fa-hand-holding-usd"></i>
                    </div>
                    <div class="kpi-text">
                        <div class="kpi-label">Earnings</div>
                        <div class="kpi-value" id="earnings-value">0</div>
                    </div>
                </div>
            </div>

            <!-- KPI卡片区域 (3列: Profit, Expenses, NET PROFIT) -->
            <div class="dashboard-kpi-grid">
                <!-- Profit -->
                <div class="dashboard-kpi-card dashboard-kpi-card--blue">
                    <div class="kpi-icon">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="kpi-text">
                        <div class="kpi-label">Profit</div>
                        <div class="kpi-value" id="capital-value">0</div>
                    </div>
                </div>

                <!-- Expenses -->
                <div class="dashboard-kpi-card dashboard-kpi-card--red">
                    <div class="kpi-icon">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="kpi-text">
                        <div class="kpi-label">Expenses</div>
                        <div class="kpi-value" id="expenses-value">0</div>
                    </div>
                </div>

                <!-- NET PROFIT -->
                <div class="dashboard-kpi-card dashboard-kpi-card--green">
                    <div class="kpi-icon">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="kpi-text">
                        <div class="kpi-label">NET PROFIT</div>
                        <div class="kpi-value" id="profit-value">0</div>
                    </div>
                </div>
            </div>

            <!-- 图表区域 -->
            <div class="dashboard-chart-section">
                <div class="dashboard-chart-header"
                    style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div class="dashboard-chart-title">Trend Chart</div>
                        <div class="dashboard-date-info" id="chart-date-range"
                            style="margin-top: 4px; margin-bottom: 0; border: none; padding: 0; background: transparent;">
                            Loading data...</div>
                    </div>
                    <!-- 新增图表控制按钮 (图例开关) -->
                    <div class="dashboard-chart-buttons" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="chart-toggle-btn active" data-dataset="0"
                            style="--btn-color: #3b82f6;">Profit</button>
                        <button class="chart-toggle-btn active" data-dataset="1"
                            style="--btn-color: #ef4444;">Expenses</button>
                        <button class="chart-toggle-btn active" data-dataset="2" style="--btn-color: #10b981;">Net
                            Profit</button>
                        <button class="chart-toggle-btn active" data-dataset="3"
                            style="--btn-color: #f59e0b;">Earnings</button>
                    </div>
                </div>
                <div class="dashboard-chart-container">
                    <canvas id="trend-chart"></canvas>
                </div>
            </div>
        </div>
    </div>
    </div>

    <!-- 日历弹窗 -->
    <div class="calendar-popup" id="calendar-popup" style="display: none;">
        <div class="calendar-header">
            <button class="calendar-nav-btn" onclick="event.stopPropagation(); changeMonth(-1)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="calendar-month-year" onclick="event.stopPropagation();">
                <select id="calendar-month-select" onchange="renderCalendar()">
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
                <select id="calendar-year-select" onchange="renderCalendar()">
                    <!-- 动态生成年份 -->
                </select>
            </div>
            <button class="calendar-nav-btn" onclick="event.stopPropagation(); changeMonth(1)">
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
        <div class="calendar-days" id="calendar-days">
            <!-- 动态生成日期 -->
        </div>
    </div>

    <!-- Dashboard 自定义提醒弹窗（公司到期/不可访问） -->
    <div id="dashboardAlertModalOverlay" class="dashboard-alert-modal-overlay" aria-hidden="true">
        <div class="dashboard-alert-modal-box" role="dialog" aria-labelledby="dashboardAlertModalTitle"
            aria-describedby="dashboardAlertModalMessage">
            <div class="dashboard-alert-modal-icon-wrap">
                <i class="fas fa-exclamation-triangle dashboard-alert-modal-icon" aria-hidden="true"></i>
            </div>
            <h3 id="dashboardAlertModalTitle" class="dashboard-alert-modal-title">Notice</h3>
            <p id="dashboardAlertModalMessage" class="dashboard-alert-modal-message"></p>
            <div class="dashboard-alert-modal-actions">
                <button type="button" id="dashboardAlertModalConfirmBtn"
                    class="dashboard-alert-modal-btn dashboard-alert-modal-btn-primary">Confirm</button>
            </div>
        </div>
    </div>

</body>

</html>