<?php
/**
 * Process List 入口：GET 302 至 React SPA `/process`；POST 批量删除逻辑与经典版一致。
 * 全页经典版见 `processlist_classic.php`（侧栏「经典版」）。
 */
if (!defined('PROCESSLIST_PAGE_FILE')) {
    define('PROCESSLIST_PAGE_FILE', 'processlist.php');
}
if (!defined('PROCESSLIST_PAGE_TITLE')) {
    define('PROCESSLIST_PAGE_TITLE', 'Process List');
}
if (!defined('PROCESSLIST_FORCED_PERMISSION')) {
    define('PROCESSLIST_FORCED_PERMISSION', '');
}
if (!defined('PROCESSLIST_HIDE_PERMISSION_FILTER')) {
    define('PROCESSLIST_HIDE_PERMISSION_FILTER', false);
}

$processListPageFile = PROCESSLIST_PAGE_FILE;
require_once 'session_check.php';
require_once __DIR__ . '/bank_process_list.php';
require_once __DIR__ . '/includes/processlist_delete_post.inc.php';

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/process'
    : $prefix . '/process';
$qs = (!empty($_SERVER['QUERY_STRING'])) ? ('?' . $_SERVER['QUERY_STRING']) : '';
header('Location: ' . $path . $qs, true, 302);
exit;
