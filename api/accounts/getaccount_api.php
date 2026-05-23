<?php
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
require_once __DIR__ . '/../../includes/config.php';

function validateCompanyAccess(PDO $pdo, int $company_id): void {
    $current_user_id = $_SESSION['user_id'] ?? null;
    if (!$current_user_id) {
        throw new Exception('用户未登录');
    }
    $current_user_role = $_SESSION['role'] ?? '';
    if ($current_user_role === 'owner') {
        $owner_id = $_SESSION['owner_id'] ?? $current_user_id;
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$company_id, $owner_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    } else {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?");
        $stmt->execute([$current_user_id, $company_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    }
}

function formatAccountIdForDisplay(string $rawAccountId): string {
    $rawAccountId = trim($rawAccountId);
    if ($rawAccountId === '') {
        return $rawAccountId;
    }

    if (preg_match('/^[^_]+_([0-9]+)(?:_[0-9]+)?$/', $rawAccountId, $matches)) {
        return $matches[1];
    }

    return $rawAccountId;
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录或缺少公司信息');
    }

    $company_id = isset($_GET['company_id']) && $_GET['company_id'] !== ''
        ? (int)$_GET['company_id']
        : (int)($_SESSION['company_id'] ?? 0);
    if (!$company_id) {
        throw new Exception('用户未登录或缺少公司信息');
    }
    validateCompanyAccess($pdo, $company_id);

    $account_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    
    if (!$account_id) {
        throw new Exception('Account ID is required');
    }
    
    $sql = "SELECT 
                a.id,
                a.account_id,
                a.name,
                a.password,
                a.role,
                a.payment_alert,
                a.alert_day,
                a.alert_day AS alert_type,
                a.alert_specific_date,
                a.alert_specific_date AS alert_start_date,
                a.alert_amount,
                a.remark,
                a.status,
                a.last_login
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE a.id = ? AND ac.company_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$account_id, $company_id]);
    
    $account = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$account) {
        $debug_info = [];
        $check_stmt = $pdo->prepare("SELECT id FROM account WHERE id = ?");
        $check_stmt->execute([$account_id]);
        $account_exists = $check_stmt->fetchColumn();
        
        if ($account_exists) {
            $ac_stmt = $pdo->prepare("SELECT company_id FROM account_company WHERE account_id = ?");
            $ac_stmt->execute([$account_id]);
            $linked_companies = $ac_stmt->fetchAll(PDO::FETCH_COLUMN);
            if ($linked_companies) {
                $debug_info[] = "关联的公司ID: " . implode(', ', $linked_companies);
            } else {
                $debug_info[] = "没有 account_company 关联";
            }
        } else {
            $debug_info[] = "账户不存在";
        }
        $debug_info[] = "当前公司ID: " . $company_id;
        
        $error_msg = 'Account not found';
        if (!empty($debug_info)) {
            $error_msg .= ' (' . implode('; ', $debug_info) . ')';
        }
        throw new Exception($error_msg);
    }
    
    $sql_currencies = "SELECT 
                        ac.currency_id,
                        c.code AS currency_code
                    FROM account_currency ac
                    INNER JOIN currency c ON ac.currency_id = c.id
                    WHERE ac.account_id = ?
                    ORDER BY ac.created_at ASC";
    
    $stmt_currencies = $pdo->prepare($sql_currencies);
    $stmt_currencies->execute([$account_id]);
    $account_currencies = $stmt_currencies->fetchAll(PDO::FETCH_ASSOC);
    
    $account['account_currencies'] = $account_currencies;
    $account['account_id'] = formatAccountIdForDisplay((string)($account['account_id'] ?? ''));
    
    echo json_encode([
        'success' => true,
        'data' => $account
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => '数据库错误: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => '系统错误: ' . $e->getMessage()
    ]);
}
?>