<?php
session_start();
header('Content-Type: application/json');
require_once 'config.php';

try {
    // 检查用户是否登录并获取 company_id
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('用户未登录或缺少公司信息');
    }
    $company_id = $_SESSION['company_id'];
    
    // 获取账户ID参数
    $account_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    
    if (!$account_id) {
        throw new Exception('Account ID is required');
    }
    
    // 查询完整的账户记录 - 只使用 account_company 表
    // alert_day 存储 alert_type (weekly/monthly/1-31)
    // alert_specific_date 存储 alert_start_date (日期)
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
        // 添加更详细的错误信息用于调试
        $debug_info = [];
        // 检查账户是否存在
        $check_stmt = $pdo->prepare("SELECT id FROM account WHERE id = ?");
        $check_stmt->execute([$account_id]);
        $account_exists = $check_stmt->fetchColumn();
        
        if ($account_exists) {
            // 检查 account_company 关联
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
    
    // 获取账户的所有关联货币（从 account_currency 表）
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
    
    // 添加关联货币信息到账户数据
    $account['account_currencies'] = $account_currencies;
    
    // 返回JSON响应
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
