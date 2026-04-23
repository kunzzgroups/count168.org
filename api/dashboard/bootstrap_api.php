<?php
/**
 * Transaction Dashboard 进入 React 页前的会话与 userData
 * 逻辑与原 dashboard.php 一致，返回 JSON
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
ob_start();
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../../config.php';
ob_end_clean();

if (!isset($_SESSION['user_id'])) {
    if (isset($_COOKIE['remember_token'])) {
        $remember_token = $_COOKIE['remember_token'];
        $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND company_id = 'c168' AND status = 'active'");
        $stmt->execute([$remember_token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['login_id'] = $user['login_id'];
            $_SESSION['name'] = $user['name'];
            $_SESSION['role'] = $user['role'];
            $_SESSION['last_activity'] = time();
            $stmt2 = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
            $stmt2->execute([$user['id']]);
        }
    }
}

$sessionTimeout = 3600;
if (isset($_SESSION['user_id'])) {
    if (
        isset($_SESSION['last_activity']) &&
        (time() - (int) $_SESSION['last_activity'] > $sessionTimeout) &&
        !isset($_COOKIE['remember_token'])
    ) {
        session_unset();
        session_destroy();
        api_error('Session expired', 401, ['redirect' => 'index.php']);
        exit;
    }
    if (isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
        if (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true) {
            api_error('Secondary password required', 403, ['redirect' => 'owner_secondary_password.php']);
            exit;
        }
    }
    if (isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'member') {
        api_success(['redirect' => 'member.php'], 'ok');
        exit;
    }
    $_SESSION['last_activity'] = time();
} else {
    api_error('Unauthorized', 401, ['redirect' => 'index.php']);
    exit;
}

$user_id = $_SESSION['user_id'];
$login_id = $_SESSION['login_id'] ?? '';
$name = $_SESSION['name'] ?? '';
$role = $_SESSION['role'] ?? '';

$stmt = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
$stmt->execute([$user_id]);
$userPermissions = $stmt->fetchColumn();
$permissions = $userPermissions ? json_decode($userPermissions, true) : [];

$first = (string) $name;
$avatarLetter = $first !== '' ? strtoupper($first[0]) : 'U';
$userData = [
    'name' => $name,
    'login_id' => $login_id,
    'role' => $role,
    'avatar_letter' => $avatarLetter,
    'permissions' => is_array($permissions) ? $permissions : [],
];
$canViewAnalytics = $role === 'admin';
$companyIdSession = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : null;

api_success([
    'userData' => $userData,
    'companyId' => $companyIdSession,
    'canViewAnalytics' => $canViewAnalytics,
], 'ok');
