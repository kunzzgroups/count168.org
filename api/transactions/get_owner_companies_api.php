<?php
/**
 * Transaction Get Owner Companies API
 * 获取当前 owner 拥有的所有 company 列表
 * 路径: api/transactions/get_owner_companies_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';

header('Content-Type: application/json');

require_once __DIR__ . '/../get_companies_helper.php';



try {
    if (!isset($_SESSION['user_id'])) {
        api_error('用户未登录', 401);
        exit;
    }

    $fetchAll = isset($_GET['all']) && $_GET['all'] == '1';

    $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
    if ($userRole !== 'owner') {
        // Dashboard view — include reverse-direction group-link visibility so that
        // clicking group AP also exposes IG's companies when IG has been pooled into AP.
        $companies = getCompaniesByUser($pdo, (int)$_SESSION['user_id'], $fetchAll, true);
        
        $active_companies = [];
        foreach ($companies as $c) {
            if (!empty($c['expiration_date']) && strtotime($c['expiration_date']) < strtotime(date('Y-m-d'))) {
                continue; // Skip expired
            }
            $active_companies[] = $c; // Keep active or no-expiration
        }
        
        // Users normally don't have large complex group mapping in dashboard
        api_success($active_companies);
        exit;
    }

    // Always use real_owner_id (the permanent, un-swapped ID) for company listing
    $ownerId = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
    $companies = getCompaniesByOwner($pdo, $ownerId, $fetchAll, true);
    
    $active_companies = [];
    foreach ($companies as $c) {
        if (!empty($c['expiration_date']) && strtotime($c['expiration_date']) < strtotime(date('Y-m-d'))) {
            continue; // Skip expired
        }
        $active_companies[] = $c; // Keep active or no-expiration
    }
    
    api_success($active_companies);
} catch (PDOException $e) {
    api_error('数据库错误: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}