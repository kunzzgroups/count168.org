<?php
declare(strict_types=1);

/**
 * 与 Vite 前端（Hash 或 History）对齐的 301 跳转目标。
 * C168_SPA_USE_HASH = true：共享主机无需配置深链，推荐（URL 如 /app/index.html#/login）
 * 设为 false 且前端 build 使用 VITE_SPA_USE_BROWSER=1 时，改为路径式 /app/…/…（需 .htaccess 将深链回退到 index.html）
 */
if (!defined('C168_SPA_USE_HASH')) {
    define('C168_SPA_USE_HASH', true);
}

/**
 * @param string $route 与 React Router 一致，如 login、modules/transaction
 * @param array<string, string|int> $query 会出现在 ? 上（?lang=zh 在 # 前）
 */
function count168_spa_url(string $route, array $query = []): string
{
    $r = ltrim($route, '/');
    $qs = $query !== [] ? '?' . http_build_query($query) : '';

    if (C168_SPA_USE_HASH) {
        $h = $r !== '' ? ('#/' . $r) : '';
        return '/app/index.html' . $qs . $h;
    }

    if ($r === '') {
        return $qs !== '' ? ('/app/index.html' . $qs) : '/app/index.html';
    }

    return '/app/' . $r . $qs;
}

/**
 * @param array<string, string|int> $query
 */
function count168_spa_redirect(string $route, array $query = []): void
{
    $target = count168_spa_url($route, $query);
    header('Location: ' . $target, true, 301);
    exit;
}
