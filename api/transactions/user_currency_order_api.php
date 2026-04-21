<?php
/**
 * User 货币显示顺序 API（按账号/用户永久化）
 * GET: 返回当前用户保存的货币顺序
 * POST: 保存当前用户的货币顺序
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../api_response.php';

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('未登录', 401);
        exit;
    }
    
    $userType = strtolower($_SESSION['user_type'] ?? '');
    $baseId = (int) $_SESSION['user_id'];
    
    // 巧妙利用正负号：Member 使用正数 ID，非 Member（Admin/Owner 等）使用负数 ID，
    // 这样不用修改 SQL 表结构也能完美区分两类用户，避免查表时发生覆盖。
    $accountId = ($userType === 'member') ? $baseId : -$baseId;

    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT currency_order FROM account_currency_display_order WHERE account_id = ?");
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $order = null;
        if ($row && !empty($row['currency_order'])) {
            $decoded = json_decode($row['currency_order'], true);
            if (is_array($decoded)) {
                $order = array_values($decoded);
            }
        }
        api_success(['order' => $order]);
        exit;
    }

    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true);
        $order = isset($body['order']) && is_array($body['order']) ? $body['order'] : [];
        $order = array_values(array_filter(array_map('trim', $order), function ($c) {
            return $c !== '';
        }));
        $json = json_encode($order, JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare("
            INSERT INTO account_currency_display_order (account_id, currency_order)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE currency_order = VALUES(currency_order), updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$accountId, $json]);
        api_success(['order' => $order], '已保存');
        exit;
    }

    api_error('方法不允许', 405);
} catch (Exception $e) {
    error_log('user_currency_order_api: ' . $e->getMessage());
    api_error($e->getMessage(), 500);
}