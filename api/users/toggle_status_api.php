<?php
/**
 * Toggle User Status API
 * 路径: api/users/toggle_status_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../includes/partnership_audit_readonly.php';
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
    $currentUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    $currentUserRole = strtolower(trim((string)($_SESSION['role'] ?? '')));
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) {
        api_error('无效的用户ID', 400);
        exit;
    }

    if (is_partnership_audit_read_only_active($pdo)) {
        api_error('只读账号无法执行此操作', 403);
        exit;
    }

    $current = getUserStatus($pdo, $id, $companyId);
    $isOwnerShadow = false;
    $targetRole = '';
    if (!$current) {
        $current = getOwnerStatus($pdo, $id, $companyId);
        if (!$current) {
            api_error('无权限操作此用户', 403);
            exit;
        }
        $isOwnerShadow = true;
        $targetRole = 'owner';
    } else {
        $stmt = $pdo->prepare("
            SELECT u.role
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE u.id = ? AND ucm.company_id = ? LIMIT 1
        ");
        $stmt->execute([$id, $companyId]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        $targetRole = strtolower(trim((string)($target['role'] ?? '')));
    }

    if ($currentUserId > 0 && $currentUserId === $id) {
        api_error('You cannot toggle your own status', 403);
        exit;
    }

    if ($isOwnerShadow && $currentUserRole !== 'owner') {
        api_error('Only owner can toggle owner records', 403);
        exit;
    }

    $lowPrivilegeRoles = ['manager', 'supervisor', 'accountant', 'audit', 'customer service', 'partnership'];
    if (in_array($currentUserRole, $lowPrivilegeRoles, true) && in_array($targetRole, ['admin', 'owner'], true)) {
        api_error('You do not have permission to toggle status of admin or owner accounts', 403);
        exit;
    }

    if ($currentUserRole === 'admin' && $targetRole === 'admin') {
        api_error('Admin accounts cannot toggle status of other admin accounts', 403);
        exit;
    }

    if ($isOwnerShadow) {
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