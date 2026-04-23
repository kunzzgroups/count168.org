<?php
/**
 * Owner 提交 6 位二级密码（与 owner_secondary_password.php 原 POST 逻辑一致）
 * POST: secondary_password
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
ob_start();
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../../config.php';
ob_end_clean();

if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'owner') {
    api_error('Unauthorized', 401, ['redirect' => 'index.php']);
    exit;
}

if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    api_success(['redirect' => 'dashboard.php'], 'ok');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_error('Method not allowed', 405);
    exit;
}

$secondary_password = trim($_POST['secondary_password'] ?? '');

if ($secondary_password === '') {
    api_error('Please enter secondary password', 400);
    exit;
}
if (!preg_match('/^\d{6}$/', $secondary_password)) {
    api_error('Secondary password must be exactly 6 digits', 400);
    exit;
}

try {
    $owner_id = (int) $_SESSION['user_id'];
    $stmt = $pdo->prepare('SELECT secondary_password FROM owner WHERE id = ?');
    $stmt->execute([$owner_id]);
    $owner = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($owner && !empty($owner['secondary_password'])) {
        if (password_verify($secondary_password, $owner['secondary_password'])) {
            $_SESSION['secondary_password_verified'] = true;
            api_success(['redirect' => 'dashboard.php'], 'ok');
            exit;
        }
        api_error('Secondary password is incorrect', 400);
        exit;
    }
    $_SESSION['secondary_password_verified'] = true;
    api_success(['redirect' => 'dashboard.php'], 'ok');
} catch (PDOException $e) {
    error_log('Owner secondary password API: ' . $e->getMessage());
    api_error('An error occurred. Please try again.', 500);
}
