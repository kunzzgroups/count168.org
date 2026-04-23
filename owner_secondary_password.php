<?php
/**
 * Owner 二级密码：已迁至 React 路由 /owner-secondary-password
 * 保留此 URL 供 dashboard 等重定向，仅作 302（session 未通过时）
 */
session_start();
require_once 'config.php';

if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'owner') {
    header('Location: index.php');
    exit();
}

if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header('Location: dashboard.php');
    exit();
}

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/owner-secondary-password'
    : $prefix . '/owner-secondary-password';
header('Location: ' . $path, true, 302);
exit();
