<?php
/**
 * Data Capture Summary 入口：会话语义与原全页 `datacapturesummary_classic.php` 一致，仅 302 到 React `/datacapturesummary`。
 * 全页版保留为 `datacapturesummary_classic.php`（由 SPA 顶栏「经典版」打开）。
 */
session_start();
require_once 'config.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

define('SESSION_TIMEOUT', 3600);

if (!isset($_SESSION['user_id']) && isset($_COOKIE['remember_token'])) {
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
        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);
    }
}

if (isset($_SESSION['user_id'])) {
    if (
        isset($_SESSION['last_activity']) &&
        (time() - $_SESSION['last_activity'] > SESSION_TIMEOUT) &&
        !isset($_COOKIE['remember_token'])
    ) {
        session_unset();
        session_destroy();
        header('Location: index.php');
        exit();
    }
    if (isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner') {
        if (!isset($_SESSION['secondary_password_verified']) || $_SESSION['secondary_password_verified'] !== true) {
            header('Location: owner_secondary_password.php');
            exit();
        }
    }
    if (isset($_GET['logout'])) {
        if (isset($_SESSION['user_id'])) {
            try {
                $stmt = $pdo->prepare("UPDATE user SET remember_token = NULL, remember_token_expires = NULL WHERE id = ?");
                $stmt->execute([$_SESSION['user_id']]);
            } catch (PDOException $e) {
            }
        }
        session_unset();
        session_destroy();
        if (isset($_COOKIE['remember_token'])) {
            setcookie('remember_token', '', time() - 3600, '/', '', false, true);
        }
        header('Location: index.php');
        exit();
    }
    if (isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member') {
        header('Location: member.php');
        exit();
    }
    $_SESSION['last_activity'] = time();
} else {
    header('Location: index.php');
    exit();
}

// 与旧版占位 POST 一致：转为 GET 进入 SPA（无服务端处理体）
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
    $path = $prefix === '' || $prefix === '.' || $prefix === '/'
        ? '/datacapturesummary'
        : $prefix . '/datacapturesummary';
    header('Location: ' . $path . '?success=1', true, 303);
    exit();
}

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/datacapturesummary'
    : $prefix . '/datacapturesummary';
$qs = (!empty($_SERVER['QUERY_STRING'])) ? ('?' . $_SERVER['QUERY_STRING']) : '';
header('Location: ' . $path . $qs, true, 302);
exit();
