<?php
/**
 * 设为非空以启用：根 index.php 在未登录时 302 到 Vite 登录（须与 Vite base 一致）。
 * 例: return '/app/';
 * 不启用: return '' ;
 * 勿用 '/'：会与 index 循环。根目录若直接由 Nginx/Apache 指到 dist 则不必用本文件。
 */
return '';
