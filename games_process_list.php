<?php
/**
 * Games-only Process List：GET 302 至 `/process/games`；POST 删除与经典版一致。
 * 全页经典：在 `processlist_classic.php` 内通过 define 强制 Games，或保留旧版链接。
 */
if (!defined('PROCESSLIST_PAGE_FILE')) {
    define('PROCESSLIST_PAGE_FILE', 'games_process_list.php');
}
if (!defined('PROCESSLIST_PAGE_TITLE')) {
    define('PROCESSLIST_PAGE_TITLE', 'Process List');
}
if (!defined('PROCESSLIST_FORCED_PERMISSION')) {
    define('PROCESSLIST_FORCED_PERMISSION', 'Games');
}
if (!defined('PROCESSLIST_HIDE_PERMISSION_FILTER')) {
    define('PROCESSLIST_HIDE_PERMISSION_FILTER', true);
}

$processListPageFile = PROCESSLIST_PAGE_FILE;
require_once 'session_check.php';
require_once __DIR__ . '/bank_process_list.php';
require_once __DIR__ . '/includes/processlist_delete_post.inc.php';

$prefix = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
$path = $prefix === '' || $prefix === '.' || $prefix === '/'
    ? '/process/games'
    : $prefix . '/process/games';
$qs = (!empty($_SERVER['QUERY_STRING'])) ? ('?' . $_SERVER['QUERY_STRING']) : '';
header('Location: ' . $path . $qs, true, 302);
exit;
