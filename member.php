<?php
// 使用统一的session检查
require_once __DIR__ . '/session_check.php';

// 强制浏览器使用最新页面与资源，避免旧缓存
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 检查用户类型是否为member
if (strtolower($_SESSION['user_type'] ?? '') !== 'member') {
    header('Location: index.php');
    exit();
}

$accountDbId = (int)$_SESSION['user_id'];
$accountCode = $_SESSION['login_id'] ?? '';
$accountName = $_SESSION['name'] ?? '';
$currentCompanyId = isset($_SESSION['company_id']) ? (int)$_SESSION['company_id'] : 0;

// MEMBER 有连接其他账号时：不管怎样刷新都只在自己的账号（每次加载/刷新强制恢复为登录账号）
if (isset($_SESSION['member_login_account_id'])) {
    $memberLoginAccountId = (int)$_SESSION['member_login_account_id'];
    $st = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id = ?");
    $st->execute([$memberLoginAccountId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $accountDbId = (int)$row['id'];
        $accountCode = $row['account_id'] ?? '';
        $accountName = $row['name'] ?? '';
        $_SESSION['user_id'] = $accountDbId;
        $_SESSION['login_id'] = $accountCode;
        $_SESSION['name'] = $accountName;
        $_SESSION['account_id'] = $accountCode;
    }
}

require_once __DIR__ . '/api/get_companies_helper.php';

// 获取当前 member 用户有权限的公司列表（用于前端公司按钮切换）
$memberCompanies = [];
$debugInfo = []; // 用于调试
try {
    $currentUserId   = $accountDbId;
    $currentUserRole = strtolower($_SESSION['role'] ?? '');
    $currentUserType = strtolower($_SESSION['user_type'] ?? '');
    
    $debugInfo['user_id'] = $currentUserId;
    $debugInfo['user_type'] = $currentUserType;
    $debugInfo['user_role'] = $currentUserRole;

    if ($currentUserType === 'member') {
        // member：user_id 就是 account.id，通过 account_company 关联公司
        // 首先检查 account_company 表中是否有数据
        $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM account_company WHERE account_id = ?");
        $checkStmt->execute([$currentUserId]);
        $accountCompanyCount = $checkStmt->fetchColumn();
        $debugInfo['account_company_count'] = $accountCompanyCount;
        
        if ($accountCompanyCount > 0) {
            // 先检查 account_company 表中存储的 company_id 值
            $checkCompanyIdsStmt = $pdo->prepare("SELECT company_id FROM account_company WHERE account_id = ?");
            $checkCompanyIdsStmt->execute([$currentUserId]);
            $storedCompanyIds = $checkCompanyIdsStmt->fetchAll(PDO::FETCH_COLUMN);
            $debugInfo['stored_company_ids'] = $storedCompanyIds;
            
            // 检查这些 company_id 是否在 company 表中存在
            if (!empty($storedCompanyIds)) {
                $placeholders = str_repeat('?,', count($storedCompanyIds) - 1) . '?';
                $checkExistsStmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                $checkExistsStmt->execute($storedCompanyIds);
                $existingCompanyIds = $checkExistsStmt->fetchAll(PDO::FETCH_COLUMN);
                $debugInfo['existing_company_ids'] = $existingCompanyIds;
                $debugInfo['missing_company_ids'] = array_diff($storedCompanyIds, $existingCompanyIds);
            }
            
            // 查询公司列表 - company 表只有 company_id 字段，没有 name 字段
            // 使用 company_id 作为显示名称
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.company_id AS company_name
                FROM company c
                INNER JOIN account_company ac ON c.id = ac.company_id
                WHERE ac.account_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$currentUserId]);
            $memberCompanies = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // 如果查询结果为空，尝试直接查询
            if (empty($memberCompanies) && !empty($storedCompanyIds)) {
                $placeholders = str_repeat('?,', count($storedCompanyIds) - 1) . '?';
                $directStmt = $pdo->prepare("
                    SELECT id, company_id, company_id AS company_name
                    FROM company
                    WHERE id IN ($placeholders) AND company_id != ''
                    ORDER BY company_id ASC
                ");
                $directStmt->execute($storedCompanyIds);
                $memberCompanies = $directStmt->fetchAll(PDO::FETCH_ASSOC);
                $debugInfo['used_direct_query'] = true;
            }
            
            $debugInfo['companies_found'] = count($memberCompanies);
            
            // 如果查询结果为空，记录详细信息
            if (empty($memberCompanies) && !empty($storedCompanyIds)) {
                error_log("Member {$currentUserId} has records in account_company, but JOIN query returned empty. Stored company_id: " . implode(', ', $storedCompanyIds));
            }
        } else {
            error_log("Member {$currentUserId} has no associated companies in account_company table");
            $debugInfo['error'] = 'No data in account_company table';
        }
    } elseif ($currentUserRole === 'owner') {
        // owner：查询自己名下所有公司
        $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? $currentUserId;
        $allOwnerComps = getCompaniesByOwner($pdo, $ownerId, false);
        $memberCompanies = array_map(function($c) {
            $c['company_name'] = $c['company_id'];
            return $c;
        }, $allOwnerComps);
        $debugInfo['companies_found'] = count($memberCompanies);
    } else {
        // 普通后台用户：通过 user_company_map 关联公司
        $allUserComps = getCompaniesByUser($pdo, $_SESSION['user_id'] ?? $currentUserId);
        $memberCompanies = array_map(function($c) {
            $c['company_name'] = $c['company_id'];
            return $c;
        }, $allUserComps);
        $debugInfo['companies_found'] = count($memberCompanies);
    }
} catch (PDOException $e) {
    error_log('Failed to load member company list: ' . $e->getMessage());
    error_log('Debug info: ' . json_encode($debugInfo, JSON_UNESCAPED_UNICODE));
    $memberCompanies = [];
    $debugInfo['exception'] = $e->getMessage();
}

// 临时调试输出（生产环境可以注释掉）
// 如果需要查看调试信息，可以取消下面的注释
// if (empty($memberCompanies)) {
//     error_log('Member 公司列表为空。调试信息: ' . json_encode($debugInfo, JSON_UNESCAPED_UNICODE));
// }

$today = date('d/m/Y');
// Capture Date 默认与 Dashboard 一致：本周一至今天
$today_dt = new DateTime('today');
$day_of_week = (int)$today_dt->format('w');
$days_to_monday = $day_of_week === 0 ? 6 : $day_of_week - 1;
$monday_dt = (clone $today_dt)->modify("-{$days_to_monday} days");
$default_date_from = $monday_dt->format('d/m/Y');
$default_date_to = $today_dt->format('d/m/Y');
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Member Win/Loss</title>
    <link rel="icon" type="image/png" href="/images/count_logo.png">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/member.css?v=<?php echo file_exists('css/member.css') ? filemtime('css/member.css') : time(); ?>">
    <link rel="stylesheet" href="css/sidebar.css">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body class="transaction-page member-winloss-page">
    <?php include 'sidebar.php'; ?>
    <!-- member-page-v2: Currency + Report section always rendered -->
    <div class="transaction-container">
        <h1 class="transaction-title">Win/Loss</h1>
        <div class="transaction-separator-line"></div>

        <div class="transaction-main-content">
            <div class="transaction-search-section" style="flex:1;">
                <div class="transaction-form-group transaction-capture-date-group">
                    <label class="transaction-label transaction-date-range-label">Capture Date</label>
                    <div class="transaction-capture-date-row">
                        <div class="transaction-date-range-wrap" id="capture_date_range_wrap">
                            <i class="fas fa-calendar-alt" aria-hidden="true"></i>
                            <input type="text" id="capture_date_range" class="transaction-input transaction-date-range-input" value="<?php echo $default_date_from . ' - ' . $default_date_to; ?>" placeholder="Select date range" readonly style="cursor: pointer;">
                        </div>
                        <div class="transaction-quick-select-wrap">
                            <div class="dropdown transaction-quick-select-dropdown">
                                <button type="button" class="btn btn-secondary dropdown-toggle transaction-quick-select-btn" onclick="toggleQuickSelectDropdown()">
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
                    <input type="hidden" id="date_from" value="<?php echo $default_date_from; ?>">
                    <input type="hidden" id="date_to" value="<?php echo $default_date_to; ?>">
                </div>
                <?php
                try {
                    // 仅在有 2 个及以上公司时显示 Company 选项；0/1 个时隐藏
                    if (!empty($memberCompanies) && is_array($memberCompanies) && count($memberCompanies) > 1):
                        $currentCompanyIdSafe = (int)($currentCompanyId ?? 0);
                ?>
                <div class="member-company-filter" id="member_company_filter" style="display:flex;visibility:visible;">
                    <span class="transaction-company-label">Company:</span>
                    <div id="member_company_buttons" class="transaction-company-buttons member-currency-buttons">
                        <?php foreach ($memberCompanies as $company):
                            $company = is_array($company) ? $company : [];
                            $compId   = (int)($company['id'] ?? 0);
                            $compCode = strtoupper((string)($company['company_id'] ?? ''));
                            $compName = (string)($company['company_name'] ?? $compCode);
                            $isActive = ($compId > 0 && $compId === $currentCompanyIdSafe);
                            if ($compId <= 0) continue;
                        ?>
                            <button
                                type="button"
                                class="transaction-company-btn<?php echo $isActive ? ' active' : ''; ?>"
                                data-company-id="<?php echo $compId; ?>"
                                data-company-label="<?php echo htmlspecialchars($compCode ?: $compName, ENT_QUOTES); ?>"
                            >
                                <?php echo htmlspecialchars($compCode ?: $compName, ENT_QUOTES); ?>
                            </button>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php else: ?>
                <?php
                    // 0 个公司时显示 debug；或有数据完整性警告（missing_company_ids/error/exception）时也显示，不因“仅 1 个公司”而隐藏
                    $hasIntegrityWarnings = !empty($debugInfo['missing_company_ids']) || !empty($debugInfo['error']) || !empty($debugInfo['exception']);
                    $showDebug = isset($debugInfo) && is_array($debugInfo) && ((empty($memberCompanies) && !empty($debugInfo)) || $hasIntegrityWarnings);
                ?>
                <?php if ($showDebug): ?>
                <div class="member-alert member-alert-error" style="display: block; margin-top: 12px;">
                    <strong>Debug Info:</strong> <?php echo empty($memberCompanies) ? 'No associated companies found.' : 'Company data integrity warning.'; ?>
                    <br>User ID: <?php echo htmlspecialchars($debugInfo['user_id'] ?? 'N/A'); ?>,
                    User Type: <?php echo htmlspecialchars($debugInfo['user_type'] ?? 'N/A'); ?>,
                    Account Company Records: <?php echo htmlspecialchars($debugInfo['account_company_count'] ?? '0'); ?>
                    <?php if (!empty($debugInfo['stored_company_ids'])): ?>
                        <br>Stored Company IDs: <?php echo htmlspecialchars(implode(', ', (array)$debugInfo['stored_company_ids'])); ?>
                    <?php endif; ?>
                    <?php if (!empty($debugInfo['existing_company_ids'])): ?>
                        <br>Existing Company IDs: <?php echo htmlspecialchars(implode(', ', (array)$debugInfo['existing_company_ids'])); ?>
                    <?php endif; ?>
                    <?php if (!empty($debugInfo['missing_company_ids'])): ?>
                        <br><strong style="color: red;">Missing Company IDs: <?php echo htmlspecialchars(implode(', ', (array)$debugInfo['missing_company_ids'])); ?></strong>
                    <?php endif; ?>
                    <?php if (isset($debugInfo['companies_found'])): ?>
                        <br>Companies Found: <?php echo htmlspecialchars($debugInfo['companies_found']); ?>
                    <?php endif; ?>
                    <?php if (!empty($debugInfo['used_direct_query'])): ?>
                        <br><strong style="color: orange;">Used direct query (skipped JOIN)</strong>
                    <?php endif; ?>
                    <?php if (!empty($debugInfo['error'])): ?>
                        <br><strong>Error:</strong> <?php echo htmlspecialchars($debugInfo['error']); ?>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
                <?php endif; ?>
                <?php
                } catch (Throwable $e) {
                    error_log('Member page company block: ' . $e->getMessage());
                    echo '<div class="member-alert member-alert-error" style="display:block;margin-top:12px;">Company list unavailable.</div>';
                }
                ?>
                <div class="member-account-filter transaction-company-filter" id="member_account_filter" style="display:none;">
                    <span class="transaction-company-label">Account:</span>
                    <div id="member_account_buttons" class="transaction-company-buttons member-currency-buttons">
                        <span class="member-account-loading" id="member_account_loading">Loading...</span>
                    </div>
                </div>
                <div class="transaction-company-filter member-currency-filter" id="member_currency_filter" style="display:flex;visibility:visible;">
                    <span class="transaction-company-label">Currency:</span>
                    <div id="member_currency_buttons" class="transaction-company-buttons member-currency-buttons"></div>
                </div>
            </div>
        </div>

        <div class="member-currency-section" id="member_currency_tables_section" style="display:flex;visibility:visible;">
            <div id="member_currency_tables" class="member-currency-tables">
                <p class="member-currency-empty" style="margin:0;">Loading...</p>
            </div>
        </div>

        <div id="notificationContainer" class="transaction-notification-container"></div>
    </div>

    <script>
        window.MEMBER_ACCOUNT_ID = <?php echo $accountDbId; ?>;
        window.MEMBER_ACCOUNT_CODE = <?php echo json_encode($accountCode ?? ''); ?>;
        window.MEMBER_ACCOUNT_NAME = <?php echo json_encode($accountName ?? ''); ?>;
        window.MEMBER_COMPANY_ID = <?php echo (int)$currentCompanyId; ?>;
    </script>
    <script src="js/decimal.min.js?v=<?php echo file_exists('js/decimal.min.js') ? filemtime('js/decimal.min.js') : time(); ?>"></script>
    <script src="js/money-decimal.js?v=<?php echo file_exists('js/money-decimal.js') ? filemtime('js/money-decimal.js') : time(); ?>"></script>
    <script src="js/member.js?v=<?php echo file_exists('js/member.js') ? filemtime('js/member.js') : time(); ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
</body>
</html>