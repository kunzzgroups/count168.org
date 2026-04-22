<?php
declare(strict_types=1);

/**
 * 登录页已迁移到 React（/app/login）。若带 ?lang=en|zh 则透传到 SPA。
 */
$lang = isset($_GET['lang']) && is_string($_GET['lang']) ? strtolower(trim($_GET['lang'])) : '';
$qs = ($lang === 'en' || $lang === 'zh') ? ('?lang=' . rawurlencode($lang)) : '';
header('Location: /app/login' . $qs, true, 301);
exit;
