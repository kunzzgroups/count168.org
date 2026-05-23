<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../includes/config.php';

if (isset($_SESSION['user_id'])) {
    try {
        $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
    } catch (Throwable $e) {
        error_log('logout_api token cleanup failed: ' . $e->getMessage());
    }
}

session_unset();
session_destroy();

if (isset($_COOKIE['remember_token'])) {
    setcookie('remember_token', '', time() - 3600, "/", "", false, true);
}

echo json_encode([
    'success' => true,
    'message' => 'Logged out',
], JSON_UNESCAPED_UNICODE);
