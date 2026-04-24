<?php
/**
 * Account List 入口：会话语义与原全页 `account-list_classic.php` 一致，仅 302 到 React `/accounts`。
 * 全页版保留为 `account-list_classic.php`。
 */
require_once 'session_check.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$q = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? ('?' . $_SERVER['QUERY_STRING']) : '';
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/accounts'
    : $prefix . '/accounts';
header('Location: ' . $path . $q, true, 302);
exit;
