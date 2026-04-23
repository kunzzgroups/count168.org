<?php
/**
 * Site entry: 已登录 / remember-me → dashboard.php；未登录 → 输出根目录 React 壳 index.html（与 PHP 同域）。
 * 登录 API：login.php / login_process.php（不变）。深层 React 路由由根 .htaccess 回退到 index.html。
 */
session_start();
require_once 'config.php';

// 如果已经登录，直接跳转到 dashboard（后续可改为 /home 等纯 React 路由）
if (isset($_SESSION['user_id'])) {
    header('Location: dashboard.php');
    exit();
}

// 检查 remember me cookie 自动登录
if (isset($_COOKIE['remember_token'])) {
    $remember_token = $_COOKIE['remember_token'];

    $stmt = $pdo->prepare("SELECT * FROM user WHERE remember_token = ? AND remember_token_expires > NOW() AND status = 'active'");
    $stmt->execute([$remember_token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];

        $company_id = null;
        try {
            $stmt2 = $pdo->prepare("
                SELECT c.id 
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
                LIMIT 1
            ");
            $stmt2->execute([$user['id']]);
            $company_id = $stmt2->fetchColumn();
        } catch (PDOException $e) {
            error_log("获取用户 company 失败: " . $e->getMessage());
        }

        if (!$company_id && isset($user['company_id'])) {
            $company_id = $user['company_id'];
        }

        $_SESSION['company_id'] = $company_id ? (int) $company_id : null;
        $_SESSION['last_activity'] = time();

        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);

        header('Location: dashboard.php');
        exit();
    }

    setcookie('remember_token', '', time() - 3600, "/", "", false, true);
}

// 未登录：直接输出 Vite 构建的 SPA（npm run build:site）
$spa = __DIR__ . DIRECTORY_SEPARATOR . 'index.html';
if (!is_readable($spa)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'SPA not deployed: run `npm run build:site` in frontend/frontend, then upload index.html and assets/ to site root.';
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
readfile($spa);
