<?php
/**
 * Toggle User Status API
 * 路径: api/users/toggle_status_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../api_response.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_error('Invalid request method', 405);
    exit;
}

function getUserStatus(PDO $pdo, int $userId, int $companyId): ?array {
    $stmt = $pdo->prepare("
        SELECT u.status FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        WHERE u.id = ? AND ucm.company_id = ? LIMIT 1
    ");
    $stmt->execute([$userId, $companyId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function getOwnerStatus(PDO $pdo, int $ownerId, int $companyId): ?array {
    $stmt = $pdo->prepare("
        SELECT o.status FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE o.id = ? AND c.id = ?
    ");
    $stmt->execute([$ownerId, $companyId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function updateUserStatus(PDO $pdo, string $newStatus, int $userId): void {
    $stmt = $pdo->prepare("UPDATE user SET status = ? WHERE id = ?");
    $stmt->execute([$newStatus, $userId]);
    if ($stmt->rowCount() == 0) throw new Exception('状态更新失败');
}

function updateOwnerStatus(PDO $pdo, string $newStatus, int $ownerId): void {
    $stmt = $pdo->prepare("UPDATE owner SET status = ? WHERE id = ?");
    $stmt->execute([$newStatus, $ownerId]);
    if ($stmt->rowCount() == 0) throw new Exception('状态更新失败');
}

try {
    if (!isset($_SESSION['company_id'])) {
        api_error('用户未登录或缺少公司信息', 401);
        exit;
    }
    $companyId = (int)$_SESSION['company_id'];
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) {
        api_error('无效的用户ID', 400);
        exit;
    }

    $current = getUserStatus($pdo, $id, $companyId);
    if (!$current) {
        $current = getOwnerStatus($pdo, $id, $companyId);
        if (!$current) {
            api_error('无权限操作此用户', 403);
            exit;
        }
        $newStatus = $current['status'] === 'active' ? 'inactive' : 'active';
        updateOwnerStatus($pdo, $newStatus, $id);
    } else {
        $newStatus = $current['status'] === 'active' ? 'inactive' : 'active';
        updateUserStatus($pdo, $newStatus, $id);
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => true, 'message' => '状态更新成功', 'data' => ['newStatus' => $newStatus], 'newStatus' => $newStatus], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}