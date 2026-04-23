<?php
/**
 * Owner 二级密码页：是否需显示表单（已登录、未验证时）
 * GET
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

api_success(['needPassword' => true], 'ok');
