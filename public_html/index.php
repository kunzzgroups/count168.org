<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/spa_redirect.php';

$lang = isset($_GET['lang']) && is_string($_GET['lang']) ? strtolower(trim($_GET['lang'])) : '';
$q = ($lang === 'en' || $lang === 'zh') ? ['lang' => $lang] : [];
count168_spa_redirect('login', $q);
