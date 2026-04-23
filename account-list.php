<?php
// 使用统一的session检查
require_once 'session_check.php';

// 不缓存 HTML，部署后刷新即可拿到带最新 ?v= 的页面
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 获取 company_id（session_check.php已确保用户已登录）
$current_user_role = $_SESSION['role'] ?? '';
$current_user_id = $_SESSION['user_id'] ?? null;

require_once __DIR__ . '/api/get_companies_helper.php';

// 获取当前用户关联的所有 company（用于显示 company 按钮）
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
} catch(PDOException $e) {
    error_log("Failed to get user company list: " . $e->getMessage());
}

// 如果 URL 中有 company_id 参数，使用它（用于切换 company）
$company_id = isset($_GET['company_id']) ? (int)$_GET['company_id'] : ($_SESSION['company_id'] ?? null);

// 验证 company_id 是否属于当前用户
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
        // 如果 company_id 无效或不存在，使用第一个 company
        $company_id = $user_companies[0]['id'];
        // 更新 session（确保登录后默认使用第一个 company）
        $_SESSION['company_id'] = $company_id;
        
        // 如果 URL 带有无效的 company_id，重定向以清除参数或修正为合法的 company_id
        if (isset($_GET['company_id'])) {
            header("Location: ?company_id=" . $company_id . (isset($_GET['search']) ? "&search=" . urlencode($_GET['search']) : ""));
            exit();
        }
    } elseif (isset($_GET['company_id']) && $company_id == (int)$_GET['company_id']) {
        // 如果 URL 中有 company_id 参数且验证通过，更新 session（实现跨页面同步）
        $_SESSION['company_id'] = $company_id;
    } elseif (!isset($_GET['company_id']) && $company_id == $_SESSION['company_id']) {
        // 如果使用 session 中的 company_id 且有效，确保 session 已设置（登录时设置的）
        $_SESSION['company_id'] = $company_id;
    }
} else {
    // 如果没有关联的 company，使用 session 中的 company_id
    $company_id = $_SESSION['company_id'] ?? null;
}

// 处理删除请求
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ids'])) {
    try {
        $ids = $_POST['ids'];
        if (!empty($ids)) {
            // 检查 account_company 表是否存在
            $has_account_company_table = false;
            try {
                $check_table_stmt = $pdo->query("SHOW TABLES LIKE 'account_company'");
                $has_account_company_table = $check_table_stmt->rowCount() > 0;
            } catch (PDOException $e) {
                $has_account_company_table = false;
            }
            
            // 首先检查要删除的账户状态，只允许删除inactive账户，并确保属于当前公司
            $placeholders = str_repeat('?,', count($ids) - 1) . '?';
            
            // 构建查询：只使用 account_company 表
            $checkParams = array_merge([$company_id], $ids);
            $checkStmt = $pdo->prepare("
                SELECT a.id, a.account_id, a.status 
                FROM account a
                INNER JOIN account_company ac ON a.id = ac.account_id
                WHERE ac.company_id = ?
                AND a.id IN ($placeholders)
            ");
            $checkStmt->execute($checkParams);
            $accountsToDelete = $checkStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // 检查是否有active账户
            $activeAccounts = array_filter($accountsToDelete, function($account) {
                return $account['status'] === 'active';
            });
            
            if (!empty($activeAccounts)) {
                $activeAccountIds = array_column($activeAccounts, 'account_id');
                error_log("Attempted to delete active account: " . implode(', ', $activeAccountIds));
                // 可以选择重定向到错误页面或显示错误消息
                header('Location: account-list.php?error=cannot_delete_active');
                exit;
            }
            
            // 检查是否有账户在 datacapture 中被用来设置 formula
            $accountsUsedInDatacapture = [];
            try {
                // 检查 data_capture_templates 表是否存在
                $check_dct_table = $pdo->query("SHOW TABLES LIKE 'data_capture_templates'");
                if ($check_dct_table->rowCount() > 0) {
                    // 检查这些账户是否在 data_capture_templates 中被使用
                    $checkDctParams = array_merge([$company_id], $ids);
                    $checkDctStmt = $pdo->prepare("
                        SELECT DISTINCT dct.account_id, a.account_id as account_display
                        FROM data_capture_templates dct
                        INNER JOIN account a ON dct.account_id = a.id
                        WHERE dct.company_id = ?
                        AND dct.account_id IN ($placeholders)
                    ");
                    $checkDctStmt->execute($checkDctParams);
                    $usedAccounts = $checkDctStmt->fetchAll(PDO::FETCH_ASSOC);
                    
                    if (!empty($usedAccounts)) {
                        foreach ($usedAccounts as $usedAccount) {
                            $accountsUsedInDatacapture[] = $usedAccount['account_display'] ?: 'ID: ' . $usedAccount['account_id'];
                        }
                    }
                }
            } catch (PDOException $e) {
                error_log("Error checking data_capture_templates: " . $e->getMessage());
                // 如果检查出错，为了安全起见，阻止删除
                header('Location: account-list.php?error=delete_failed');
                exit;
            }
            
            if (!empty($accountsUsedInDatacapture)) {
                $usedAccountIds = implode(', ', $accountsUsedInDatacapture);
                error_log("Attempted to delete account used in datacapture formula: " . $usedAccountIds);
                header('Location: account-list.php?error=cannot_delete_used_in_datacapture&accounts=' . urlencode($usedAccountIds));
                exit;
            }
            
            // 只删除inactive账户，并确保属于当前公司
            // 先删除 account_company 关联（只删除当前公司的关联）
            $delete_ac_params = array_merge([$company_id], $ids);
            $delete_ac_stmt = $pdo->prepare("
                DELETE FROM account_company 
                WHERE company_id = ? AND account_id IN ($placeholders)
            ");
            $delete_ac_stmt->execute($delete_ac_params);
            $deleted_ac_count = $delete_ac_stmt->rowCount();
            
            // 检查哪些账户还有其他公司关联
            $remaining_accounts = [];
            foreach ($ids as $account_id) {
                $check_stmt = $pdo->prepare("SELECT COUNT(*) FROM account_company WHERE account_id = ?");
                $check_stmt->execute([$account_id]);
                if ($check_stmt->fetchColumn() > 0) {
                    // 账户还有其他公司关联，不删除账户本身
                    continue;
                }
                // 账户没有其他公司关联了，可以删除账户本身
                $remaining_accounts[] = $account_id;
            }
            
            // 删除没有其他公司关联的账户
            $deleted_account_count = 0;
            if (!empty($remaining_accounts)) {
                $remaining_placeholders = str_repeat('?,', count($remaining_accounts) - 1) . '?';
                $delete_stmt = $pdo->prepare("
                    DELETE FROM account 
                    WHERE id IN ($remaining_placeholders) 
                    AND status = 'inactive'
                ");
                $delete_stmt->execute($remaining_accounts);
                $deleted_account_count = $delete_stmt->rowCount();
            }
            
            // 总删除数 = 删除的 account_company 关联数
            $deletedCount = $deleted_ac_count;
            
            // 重定向并带上成功消息
            header('Location: account-list.php?deleted=' . $deletedCount);
            exit;
        }
    } catch (PDOException $e) {
        // 删除错误处理
        error_log("Delete account error: " . $e->getMessage());
        header('Location: account-list.php?error=delete_failed');
        exit;
    }
    header('Location: account-list.php');
    exit;
}

// 获取初始参数（用于设置页面状态）
$searchTerm = isset($_GET['search']) ? htmlspecialchars($_GET['search']) : '';
$showInactive = isset($_GET['showInactive']) ? true : false;
$showAll = isset($_GET['showAll']) ? true : false;
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
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <title>Account List</title>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo $assetVer('css/accountCSS.css'); ?>">
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/account-list.css?v=<?php echo $assetVer('css/account-list.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body class="account-page">
    <div class="container">
        <div class="content">
            <h1 class="account-page-title">Account List</h1>

            <div class="account-separator-line"></div>
            
            <div class="account-action-buttons-container" style="margin-bottom: 20px;">
                <div class="account-action-buttons" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <button class="account-btn account-btn-add" onclick="addAccount()">Add Account</button>
                        <div class="account-search-container">
                            <svg class="account-search-icon" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                            </svg>
                            <input type="text" id="searchInput" placeholder="Search by Account or Name" class="account-search-input" value="<?php echo $searchTerm; ?>">
                        </div>
                        <div class="account-checkbox-section">
                            <input type="checkbox" id="showInactive" name="showInactive" <?php echo $showInactive ? 'checked' : ''; ?>>
                            <label for="showInactive">Show Inactive</label>
                        </div>
                        <div class="account-checkbox-section">
                            <input type="checkbox" id="showAll" name="showAll" <?php echo $showAll ? 'checked' : ''; ?>>
                            <label for="showAll">Show All</label>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <button class="account-btn account-btn-setting" onclick="openCurrencySettingModal()">Currency Setting</button>
                        <button class="account-btn account-btn-delete" id="accountDeleteSelectedBtn" onclick="deleteSelected()" title="Only inactive accounts can be deleted">Delete</button>
                    </div>
                </div>
                <!-- Shared Group & Company Filter (SSR) -->
                <?php include 'includes/company_filter.php'; ?>
                <script>
                    window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                        if (typeof switchAccountListCompany === 'function') {
                            switchAccountListCompany(companyId, companyCode);
                        }
                    };
                </script>
            </div>
            
            <div class="account-table-wrapper" id="accountTableWrapper">
                <!-- Table Header -->
                <div class="account-table-header">
                    <div class="account-header-item">No</div>
                    <div class="account-header-item account-header-sortable" onclick="sortByAccount()">
                        Account
                        <span class="account-sort-indicator" id="sortAccountIndicator">▲</span>
                    </div>
                    <div class="account-header-item">Name</div>
                    <div class="account-header-item account-header-sortable" onclick="sortByRole()">
                        Role
                        <span class="account-sort-indicator" id="sortRoleIndicator"></span>
                    </div>
                    <div class="account-header-item">Alert</div>
                    <div class="account-header-item">Status</div>
                    <div class="account-header-item">Last Login</div>
                    <div class="account-header-item">Remark</div>
                    <div class="account-header-item">Action
                        <input type="checkbox" id="selectAllAccounts" title="Select all" style="margin-left: 10px; cursor: pointer;" onchange="toggleSelectAllAccounts()">
                    </div>
                </div>
                
                <!-- Account Cards List -->
                <div class="account-cards" id="accountTableBody">
                    <div class="account-card">
                        <div class="account-card-item">Loading...</div>
                    </div>
                </div>
            </div>
            <!-- 分页控件 - 浮动在右下角 -->
            <div class="account-pagination-container" id="paginationContainer">
                <button class="account-pagination-btn" id="prevBtn" onclick="changePage(currentPage - 1)">◀</button>
                <span class="account-pagination-info" id="paginationInfo">1 of 1</span>
                <button class="account-pagination-btn" id="nextBtn" onclick="changePage(currentPage + 1)">▶</button>
            </div>
        </div>
    </div>

    <!-- Edit Account Popup Modal -->
    <div id="editModal" class="account-modal" style="display: none;">
        <div class="account-modal-content">
            <div class="account-modal-header">
                <h2>Edit Account</h2>
                <span class="account-close" onclick="closeEditModal()">&times;</span>
            </div>
            <div class="account-modal-body">
                <form id="editAccountForm" class="account-form">
                    <input type="hidden" id="edit_account_id" name="id">
                    
                    <!-- 两列布局：Personal Information 和 Payment -->
                    <div class="account-form-columns">
                        <!-- 左列：Personal Information -->
                        <div class="account-form-column">
                            <h3 class="account-section-header">Personal Information</h3>
                            <div class="account-form-group">
                                <label for="edit_account_id_field">Account ID *</label>
                                <input type="text" id="edit_account_id_field" name="account_id" readonly>
                            </div>
                            <div class="account-form-group">
                                <label for="edit_name">Name *</label>
                                <input type="text" id="edit_name" name="name" required>
                            </div>
                            <div class="account-form-group">
                                <label for="edit_role">Role *</label>
                                <select id="edit_role" name="role" required>
                                    <option value="">Select Role</option>
                                </select>
                            </div>
                            <div class="account-form-group">
                                <label for="edit_password">Password *</label>
                                <input type="password" id="edit_password" name="password" required>
                            </div>
                        </div>
                        
                        <!-- 右列：Payment -->
                        <div class="account-form-column">
                            <h3 class="account-section-header">Payment</h3>
                            <div class="account-form-group"></div>
                            <div class="account-form-group">
                                <label>Payment Alert</label>
                                <div class="account-radio-group">
                                    <label class="account-radio-label">
                                        <input type="radio" name="payment_alert" value="1">
                                        Yes
                                    </label>
                                    <label class="account-radio-label">
                                        <input type="radio" name="payment_alert" value="0">
                                        No
                                    </label>
                                </div>
                            </div>
                            <div class="account-form-row" id="edit_alert_fields" style="display: none;">
                                <div class="account-form-group">
                                    <label for="edit_alert_type">Alert Type</label>
                                    <select id="edit_alert_type" name="alert_type">
                                        <option value="">Select Type</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <?php for ($i = 1; $i <= 31; $i++): ?>
                                            <option value="<?php echo $i; ?>"><?php echo $i; ?> Days</option>
                                        <?php endfor; ?>
                                    </select>
                                </div>
                                <div class="account-form-group">
                                    <label for="edit_alert_start_date">Start Date</label>
                                    <input type="date" id="edit_alert_start_date" name="alert_start_date">
                                </div>
                            </div>
                            <div class="account-form-group" id="edit_alert_amount_row" style="display: none;">
                                <label for="edit_alert_amount">Alert (Amount)</label>
                                <input type="number" id="edit_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)">
                            </div>
                            <div class="account-form-group">
                                <label for="edit_remark">Remark</label>
                                <textarea id="edit_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Advanced Account Section -->
                    <div class="account-form-section">
                        <div class="account-advance-section">
                            <h3>Advanced Account</h3>
                            
                            <div class="account-other-currency">
                                <label>Other Currency:</label>
                                
                                <!-- Add New Currency Section -->
                                <div style="display: flex; gap: 8px;">
                                    <input type="text" id="editCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)">
                                    <button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInput('edit'); return false;">Create Currency</button>
                                </div>
                                
                                <!-- Currency Selection Section -->
                                <div class="account-currency-list" id="editCurrencyList">
                                    <!-- Currency buttons will be loaded here -->
                                </div>
                            </div>
                            
                            <div class="account-other-currency" style="margin-top: 20px;">
                                <label>Company:</label>
                                
                                <!-- Company Selection Section -->
                                <div class="account-currency-list" id="editCompanyList">
                                    <!-- Company buttons will be loaded here -->
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="account-form-actions">
                        <button type="submit" class="account-btn account-btn-save">Update Account</button>
                        <button type="button" class="account-btn account-btn-cancel" onclick="closeEditModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Notification Container -->
    <div id="accountNotificationContainer" class="account-notification-container"></div>

    <!-- Add Account Popup Modal -->
    <div id="addModal" class="account-modal" style="display: none;">
        <div class="account-modal-content">
            <div class="account-modal-header">
                <h2>Add Account</h2>
                <span class="account-close" onclick="closeAddModal()">&times;</span>
            </div>
            <div class="account-modal-body">
                <form id="addAccountForm" class="account-form">
                    <!-- 两列布局：Personal Information 和 Payment -->
                    <div class="account-form-columns">
                        <!-- 左列：Personal Information -->
                        <div class="account-form-column">
                            <h3 class="account-section-header">Personal Information</h3>
                            <div class="account-form-group">
                                <label for="add_account_id">Account ID *</label>
                                <input type="text" id="add_account_id" name="account_id" required>
                            </div>
                            <div class="account-form-group">
                                <label for="add_name">Name *</label>
                                <input type="text" id="add_name" name="name" required>
                            </div>
                            <div class="account-form-group">
                                <label for="add_role">Role *</label>
                                <select id="add_role" name="role" required>
                                    <option value="">Select Role</option>
                                </select>
                            </div>
                            <div class="account-form-group">
                                <label for="add_password">Password *</label>
                                <input type="password" id="add_password" name="password" required>
                            </div>
                        </div>
                        
                        <!-- 右列：Payment -->
                        <div class="account-form-column">
                            <h3 class="account-section-header">Payment</h3>
                            <div class="account-form-group">
                                <!-- <label for="add_currency_id">Currency *</label>
                                <select id="add_currency_id" name="currency_id" required>
                                    <option value="">Select Currency</option>
                                </select> -->
                            </div>
                            <div class="account-form-group">
                                <label>Payment Alert</label>
                                <div class="account-radio-group">
                                    <label class="account-radio-label">
                                        <input type="radio" name="add_payment_alert" value="1">
                                        Yes
                                    </label>
                                    <label class="account-radio-label">
                                        <input type="radio" name="add_payment_alert" value="0" checked>
                                        No
                                    </label>
                                </div>
                            </div>
                            <div class="account-form-row" id="add_alert_fields" style="display: none;">
                                <div class="account-form-group">
                                    <label for="add_alert_type">Alert Type</label>
                                    <select id="add_alert_type" name="alert_type">
                                        <option value="">Select Type</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <?php for ($i = 1; $i <= 31; $i++): ?>
                                            <option value="<?php echo $i; ?>"><?php echo $i; ?> Days</option>
                                        <?php endfor; ?>
                                    </select>
                                </div>
                                <div class="account-form-group">
                                    <label for="add_alert_start_date">Start Date</label>
                                    <input type="date" id="add_alert_start_date" name="alert_start_date">
                                </div>
                            </div>
                            <div class="account-form-group" id="add_alert_amount_row" style="display: none;">
                                <label for="add_alert_amount">Alert (Amount)</label>
                                <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)">
                            </div>
                            <div class="account-form-group">
                                <label for="add_remark">Remark</label>
                                <textarea id="add_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Advanced Account Section -->
                    <div class="account-form-section">
                        <div class="account-advance-section">
                            <h3>Advanced Account</h3>
                            
                            <div class="account-other-currency">
                                <label>Other Currency:</label>
                                
                                <!-- Add New Currency Section -->
                                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                    <input type="text" id="addCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)">
                                    <button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInput('add'); return false;">Create Currency</button>
                                </div>
                                
                                <!-- Currency Selection Section -->
                                <div class="account-currency-list" id="addCurrencyList">
                                    <!-- Currency buttons will be loaded here -->
                                </div>
                            </div>
                            
                            <div class="account-other-currency" style="margin-top: 20px;">
                                <label>Company:</label>
                                
                                <!-- Company Selection Section -->
                                <div class="account-currency-list" id="addCompanyList">
                                    <!-- Company buttons will be loaded here -->
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="account-form-actions">
                        <button type="submit" class="account-btn account-btn-save">Add Account</button>
                        <button type="button" class="account-btn account-btn-cancel" onclick="closeAddModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Link Account Modal -->
    <div id="linkAccountModal" class="account-modal" style="display: none;">
        <div class="account-modal-content">
            <div class="account-modal-header">
                <h2>Link Account</h2>
                <span class="account-close" onclick="closeLinkAccountModal()">&times;</span>
            </div>
            <!-- 红框区域：固定不随列表滚动；搜索栏在蓝框位置，与下方列表右对齐 -->
            <div class="link-account-fixed-area">
                <div class="link-type-section">
                    <div class="link-type-pills">
                        <label class="link-type-pill" id="linkTypeLabelBidirectional">
                            <input type="radio" name="linkType" value="bidirectional" id="linkTypeBidirectional" checked class="link-type-radio">
                            <span class="link-type-pill-check">&#10003;</span>
                            <span class="link-type-pill-text">Bidirectional</span>
                        </label>
                        <label class="link-type-pill" id="linkTypeLabelUnidirectional">
                            <input type="radio" name="linkType" value="unidirectional" id="linkTypeUnidirectional" class="link-type-radio">
                            <span class="link-type-pill-check">&#10003;</span>
                            <span class="link-type-pill-text">Unidirectional</span>
                        </label>
                    </div>
                    <p class="link-type-desc" id="linkTypeDescription">Bidirectional: Data syncs both ways.</p>
                </div>
                <div class="link-account-search-wrap">
                    <div class="link-account-search-inner">
                        <svg class="link-account-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input type="text" id="linkAccountSearchInput" class="link-account-search-input" placeholder="Search account..." autocomplete="off" aria-label="Search account">
                    </div>
                </div>
            </div>
            <div class="account-modal-body link-account-modal-body">
                <div style="margin-bottom: 16px;">
                    <div style="margin-bottom: 12px;">
                        <div id="linkAccountList" class="link-account-list">
                            <!-- Linked account items will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>
            <div class="account-form-actions link-account-form-actions">
                <button type="button" class="account-btn account-btn-save" onclick="saveAccountLinks()">Save</button>
                <button type="button" class="account-btn account-btn-cancel" onclick="closeLinkAccountModal()">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Currency Setting Fullscreen Modal -->
    <div id="currencySettingModal" class="currency-fullscreen-modal" style="display: none;">
        <div class="currency-fullscreen-modal-content">
            <!-- Top Header Bar -->
            <div class="currency-fullscreen-modal-header-bar">
                <h2>Currency Setting</h2>
                <button type="button" class="currency-btn-back" onclick="closeCurrencySettingModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    Back
                </button>
            </div>
            
            <!-- Body -->
            <div class="currency-fullscreen-modal-body">
                <!-- Left Panel: Currency Management -->
                <div class="currency-left-panel">
                    <div class="currency-setting-add-row-stacked" style="margin-top: 10px;">
                        <label for="currencySettingAddInput">Add Currency :</label>
                        <div style="display: flex; gap: 10px; width: 100%;">
                            <input type="text" id="currencySettingAddInput" class="currency-setting-input" placeholder="Please enter new currency" style="flex: 1;">
                            <button type="button" class="account-btn account-btn-add currency-setting-add-btn" onclick="addCurrencyFromSettingModal()">Add</button>
                        </div>
                    </div>
                    
                    <div class="currency-setting-divider"></div>
                    
                    <div class="currency-setting-list-row-stacked">
                        <label>Currency :</label>
                        <div class="currency-setting-pill-list" id="currencySettingPillList">
                            <!-- Currency pills will be loaded here -->
                        </div>
                    </div>
                </div>
                
                <!-- Right Panel: Accounts -->
                <div class="currency-right-panel" style="padding-top: 24px;">
                    <div class="currency-setting-filter-row">
                        <div class="currency-setting-search-wrap">
                            <svg class="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input type="text" id="currencySettingSearchInput" class="currency-setting-search-input" placeholder="Search Bar" autocomplete="off">
                        </div>
                        <div class="currency-setting-role-filter">
                            <select id="currencySettingRoleSelect" class="currency-setting-select">
                                <option value="">Filter Row</option>
                            </select>
                        </div>
                    </div>
                    <div class="currency-setting-selectall-row">
                        <button type="button" id="currencySettingSelectAllBtn" class="account-btn currency-setting-selectall-btn" onclick="toggleSelectAllCurrencyAccounts()">Select All</button>
                        <span id="currencySettingSelectedCount" class="currency-setting-selected-count">0 selected</span>
                    </div>
                    
                    <div class="currency-setting-account-list" id="currencySettingAccountList">
                        <!-- Account items like in Image 2 will be loaded here -->
                    </div>
                </div>
            </div>
            
            <!-- Fixed Bottom Bar -->
            <div class="currency-fullscreen-bottom-bar">
                <button type="button" class="account-btn account-btn-save currency-setting-submit-btn" onclick="saveCurrencySetting()">Save</button>
                <button type="button" class="account-btn account-btn-cancel currency-setting-cancel-btn" onclick="closeCurrencySettingModal()">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Confirm Delete Modal - 使用 userlist 样式 -->
    <div id="confirmDeleteModal" class="account-modal" style="display: none;">
        <div class="account-confirm-modal-content">
            <div class="account-confirm-icon-container">
                <svg class="account-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <h2 class="account-confirm-title">Confirm Delete</h2>
            <p id="confirmDeleteMessage" class="account-confirm-message">This action cannot be undone.</p>
            <div class="account-confirm-actions">
                <button type="button" class="account-btn account-btn-cancel confirm-cancel" onclick="closeConfirmDeleteModal()">Cancel</button>
                <button type="button" class="account-btn account-btn-delete confirm-delete" onclick="confirmDelete()">Delete</button>
            </div>
        </div>
    </div>


    <script>
        window.ACCOUNT_LIST_SHOW_INACTIVE = <?php echo isset($_GET['showInactive']) ? 'true' : 'false'; ?>;
        window.ACCOUNT_LIST_SHOW_ALL = <?php echo isset($_GET['showAll']) ? 'true' : 'false'; ?>;
        window.ACCOUNT_LIST_COMPANY_ID = <?php echo json_encode($company_id); ?>;
        window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD = <?php echo json_encode($company_id ? [$company_id] : []); ?>;
    </script>
    <script src="js/account-list.js?v=<?php echo $assetVer('js/account-list.js'); ?>"></script>


</body>
</html>