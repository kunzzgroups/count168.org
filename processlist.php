<?php
/**
 * Process List 入口：会话与原全页 `processlist_classic.php` 一致，仅 302 到 React `/processlist`。
 * Games/Bank 专用入口仍为 `games_process_list.php`、`bank_process_list.php`（内含经典版）。
 */
require_once 'session_check.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$q = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? ('?' . $_SERVER['QUERY_STRING']) : '';
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/processlist'
    : $prefix . '/processlist';
header('Location: ' . $path . $q, true, 302);
exit;
