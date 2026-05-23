<?php
/**
 * Edit Data API - 提供编辑表单所需的货币与角色列表
 * 路径: api/editdata/editdata_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';

/**
 * 标准 JSON 响应：success, message, data
 */
function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * 按公司 ID 获取货币列表
 */
function getCurrenciesByCompany(PDO $pdo, int $company_id) {
    $stmt = $pdo->prepare("SELECT id, code FROM currency WHERE company_id = ? ORDER BY code ASC");
    $stmt->execute([$company_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 获取所有角色代码
 */
function getRoles(PDO $pdo) {
    $stmt = $pdo->query("SELECT code FROM role ORDER BY id ASC");
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

try {
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('用户未登录或缺少公司信息');
    }
    $company_id = (int)$_SESSION['company_id'];

    $currencies = getCurrenciesByCompany($pdo, $company_id);
    $roles = getRoles($pdo);

    jsonResponse(true, 'OK', [
        'currencies' => $currencies,
        'roles' => $roles
    ]);
} catch (PDOException $e) {
    jsonResponse(false, 'Database error: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 401);
}