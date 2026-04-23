<?php
/**
 * 可选 302：仅当「整站仍先走 index.php」又要把人引到子目录里的 React（如 /app/）时再用。
 * 当根目录已按「COUNT168-线上根目录部署.txt」部署 index.html 且 .htaccess 里
 * DirectoryIndex 优先 index.html 时，勿改此处，保持 return '' 即可。
 * 子路径示例: return '/app/';
 * 禁止: return '/'（会与入口循环）
 */
return '';
