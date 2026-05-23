<?php
/**
 * Transaction Get Accounts API
 * 用于获取账户列表，填充 To Account 和 From Account 下拉框
 * 路径: api/transactions/get_accounts_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/permissions.php';

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }

    $has_account_company_table = false;
    try {
        $check_stmt = $pdo->query("SHOW TABLES LIKE 'account_company'");
        $has_account_company_table = $check_stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $has_account_company_table = false;
    }

    if (!$has_account_company_table) {
        throw new Exception('account_company 表不存在，请先执行 create_account_company_table.sql');
    }

    $company_id = null;
    $requested_company_id = isset($_GET['company_id']) ? trim($_GET['company_id']) : '';

    if ($requested_company_id !== '') {
        $requested_company_id = (int)$requested_company_id;
        $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
        if ($userRole === 'owner') {
            $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$requested_company_id, $owner_id]);
            if ($stmt->fetchColumn()) {
                $company_id = $requested_company_id;
            } else {
                throw new Exception('无权访问该公司');
            }
        } else {
            if (!isset($_SESSION['company_id']) || $requested_company_id !== (int)$_SESSION['company_id']) {
                throw new Exception('无权访问该公司');
            }
            $company_id = (int)$_SESSION['company_id'];
        }
    } else {
        if (!isset($_SESSION['company_id'])) {
            throw new Exception('用户未登录或缺少公司信息');
        }
        $company_id = (int)$_SESSION['company_id'];
    }

    $role = $_GET['role'] ?? null;
    $status = $_GET['status'] ?? 'active';
    $currency = $_GET['currency'] ?? null;

    $currency_id = null;
    if ($currency) {
        $currency_stmt = $pdo->prepare("SELECT id FROM currency WHERE code = ? AND company_id = ?");
        $currency_stmt->execute([$currency, $company_id]);
        $currency_id = $currency_stmt->fetchColumn();
    }

    $where_conditions = [];
    $params = [];
    $where_conditions[] = "ac.company_id = ?";
    $params[] = $company_id;
    if ($role) {
        $where_conditions[] = "a.role = ?";
        $params[] = $role;
    }
    if ($status) {
        $where_conditions[] = "a.status = ?";
        $params[] = $status;
    }
    if ($currency && $currency_id) {
        $where_conditions[] = "EXISTS (
            SELECT 1 
            FROM data_capture_details dcd
            WHERE CAST(dcd.account_id AS CHAR) = CAST(a.id AS CHAR)
              AND dcd.currency_id = ?
        )";
        $params[] = $currency_id;
    } else if ($currency && !$currency_id) {
        $where_conditions[] = "1=0";
    }

    $where_sql = !empty($where_conditions) ? 'WHERE ' . implode(' AND ', $where_conditions) : '';
    $baseSql = "SELECT DISTINCT a.id, a.account_id, a.name, a.role, a.status
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            $where_sql";
    list($baseSql, $params) = filterAccountsByPermissions($pdo, $baseSql, $params, $company_id);
    $baseSql = preg_replace('/\bAND id IN\b/i', 'AND a.id IN', $baseSql);
    $baseSql = preg_replace('/\bWHERE id IN\b/i', 'WHERE a.id IN', $baseSql);
    $baseSql = preg_replace('/\bAND 1=0\b/i', 'AND 1=0', $baseSql);
    $baseSql = preg_replace('/\bWHERE 1=0\b/i', 'WHERE 1=0', $baseSql);
    $baseSql .= " ORDER BY a.account_id ASC";

    $stmt = $pdo->prepare($baseSql);
    $stmt->execute($params);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $has_account_currency_table = false;
    try {
        $check_stmt = $pdo->query("SHOW TABLES LIKE 'account_currency'");
        $has_account_currency_table = $check_stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $has_account_currency_table = false;
    }

    $formatted_accounts = [];
    foreach ($accounts as $account) {
        $account_id = $account['id'];
        $currencies = [];
        if ($has_account_currency_table) {
            $ac_stmt = $pdo->prepare("
                SELECT c.code
                FROM account_currency ac
                INNER JOIN currency c ON ac.currency_id = c.id
                WHERE ac.account_id = ?
                ORDER BY ac.created_at ASC
            ");
            $ac_stmt->execute([$account_id]);
            $currencies = $ac_stmt->fetchAll(PDO::FETCH_COLUMN);
        }
        if (empty($currencies)) {
            try {
                $check_currency_id_stmt = $pdo->query("SHOW COLUMNS FROM account LIKE 'currency_id'");
                $has_currency_id_field = $check_currency_id_stmt->rowCount() > 0;
                if ($has_currency_id_field) {
                    $ac_currency_stmt = $pdo->prepare("
                        SELECT c.code
                        FROM account a
                        INNER JOIN currency c ON a.currency_id = c.id
                        WHERE a.id = ?
                    ");
                    $ac_currency_stmt->execute([$account_id]);
                    $currency = $ac_currency_stmt->fetchColumn();
                    if ($currency) $currencies = [$currency];
                }
            } catch (PDOException $e) {}
        }
        $first_currency = !empty($currencies) ? $currencies[0] : null;
        $formatted_accounts[] = [
            'id' => $account['id'],
            'account_id' => $account['account_id'],
            'name' => $account['name'],
            'display_text' => $account['account_id'] . ' (' . $account['name'] . ')',
            'role' => $account['role'],
            'currency' => $first_currency,
            'status' => $account['status']
        ];
    }

    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'message' => '',
        'data' => $formatted_accounts
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '数据库错误: ' . $e->getMessage(),
        'data' => null,
        'error' => '数据库错误: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}