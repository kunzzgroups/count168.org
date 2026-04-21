<?php
/**
 * 批量删除账户 API（仅允许删除 inactive，且需通过 session 校验）
 * 路径: api/accounts/delete_accounts_api.php
 */
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../api_response.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_error('Method not allowed', 405);
    exit;
}

try {
    if (!isset($_SESSION['user_id']) || !isset($_SESSION['company_id'])) {
        api_error('User not logged in or company not selected', 401);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $ids = isset($input['ids']) ? (array) $input['ids'] : (isset($_POST['ids']) ? (array) $_POST['ids'] : []);
    $ids = array_map('intval', array_filter($ids));

    if (empty($ids)) {
        api_error('No account IDs provided', 400);
        exit;
    }

    $company_id = (int) $_SESSION['company_id'];

    $has_account_company_table = false;
    try {
        $check_table_stmt = $pdo->query("SHOW TABLES LIKE 'account_company'");
        $has_account_company_table = $check_table_stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $has_account_company_table = false;
    }

    $placeholders = str_repeat('?,', count($ids) - 1) . '?';
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

    $activeAccounts = array_filter($accountsToDelete, function ($account) {
        return $account['status'] === 'active';
    });
    if (!empty($activeAccounts)) {
        $activeAccountIds = array_column($activeAccounts, 'account_id');
        api_error('Cannot delete active accounts: ' . implode(', ', $activeAccountIds), 400, ['accounts' => $activeAccountIds]);
        exit;
    }

    $accountsUsedInDatacapture = [];
    try {
        $check_dct_table = $pdo->query("SHOW TABLES LIKE 'data_capture_templates'");
        if ($check_dct_table->rowCount() > 0) {
            $checkDctStmt = $pdo->prepare("
                SELECT DISTINCT dct.account_id, a.account_id as account_display
                FROM data_capture_templates dct
                INNER JOIN account a ON dct.account_id = a.id
                WHERE dct.company_id = ?
                AND dct.account_id IN ($placeholders)
            ");
            $checkDctStmt->execute($checkParams);
            $usedAccounts = $checkDctStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($usedAccounts as $usedAccount) {
                $accountsUsedInDatacapture[] = $usedAccount['account_display'] ?: 'ID: ' . $usedAccount['account_id'];
            }
        }
    } catch (PDOException $e) {
        error_log("Error checking data_capture_templates: " . $e->getMessage());
        api_error('Delete check failed', 500);
        exit;
    }

    if (!empty($accountsUsedInDatacapture)) {
        api_error('Cannot delete: used in datacapture formula: ' . implode(', ', $accountsUsedInDatacapture), 400, ['accounts' => $accountsUsedInDatacapture]);
        exit;
    }

    $delete_ac_params = array_merge([$company_id], $ids);
    $delete_ac_stmt = $pdo->prepare("
        DELETE FROM account_company 
        WHERE company_id = ? AND account_id IN ($placeholders)
    ");
    $delete_ac_stmt->execute($delete_ac_params);
    $deleted_ac_count = $delete_ac_stmt->rowCount();

    $remaining_accounts = [];
    foreach ($ids as $account_id) {
        $check_stmt = $pdo->prepare("SELECT COUNT(*) FROM account_company WHERE account_id = ?");
        $check_stmt->execute([$account_id]);
        if ($check_stmt->fetchColumn() > 0) {
            continue;
        }
        $remaining_accounts[] = $account_id;
    }

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

    $deletedCount = $deleted_ac_count;
    api_success(['deleted' => $deletedCount], $deletedCount === 1 ? '1 account deleted' : $deletedCount . ' accounts deleted');
} catch (PDOException $e) {
    error_log("Delete account API error: " . $e->getMessage());
    api_error('Delete failed', 500);
}