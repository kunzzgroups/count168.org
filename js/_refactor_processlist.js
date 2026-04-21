const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'processlist.php');
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// 1. Extract CSS
const styleStart = content.indexOf('    <style>');
const styleEnd = content.indexOf('    </style>');
if (styleStart === -1 || styleEnd === -1) {
  console.error('Style block not found');
  process.exit(1);
}
const cssContent = content.slice(styleStart + '    <style>'.length, styleEnd).replace(/^\s{8}/gm, '');
fs.writeFileSync(path.join(__dirname, 'css', 'processlist.css'), cssContent.trim() + '\n');
console.log('Written css/processlist.css');

// 2. Extract JS
const scriptStartMark = '    <script>\n        // 全局变量';
let scriptStart = content.indexOf(scriptStartMark);
if (scriptStart === -1) scriptStart = content.indexOf('    <script>', content.indexOf('// 全局变量') - 50);
const bodyIdx = content.indexOf('</body>');
let scriptEnd = bodyIdx === -1 ? -1 : content.lastIndexOf('\n    </script>', bodyIdx);
if (scriptStart === -1 || scriptEnd === -1 || scriptEnd <= scriptStart) {
  console.error('Script block not found', { scriptStart, scriptEnd, bodyIdx });
  process.exit(1);
}
const scriptCloseTag = '\n    </script>';
const fullScriptBlock = content.slice(scriptStart, scriptEnd + scriptCloseTag.length);
let jsContent = content.slice(scriptStart + '    <script>\n'.length, scriptEnd);

// Replace PHP variable lines with window.*
jsContent = jsContent.replace(
  /let showInactive = <\?php echo isset\(\$_GET\['showInactive'\]\) \? 'true' : 'false'; \?>;/,
  "let showInactive = (typeof window.PROCESSLIST_SHOW_INACTIVE !== 'undefined' ? window.PROCESSLIST_SHOW_INACTIVE : false);"
);
jsContent = jsContent.replace(
  /let showAll = <\?php echo isset\(\$_GET\['showAll'\]\) \? 'true' : 'false'; \?>;/,
  "let showAll = (typeof window.PROCESSLIST_SHOW_ALL !== 'undefined' ? window.PROCESSLIST_SHOW_ALL : false);"
);
jsContent = jsContent.replace(
  /const currentCompanyId = <\?php echo json_encode\(\$company_id \?\? null\); \?>;/g,
  "const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);"
);
jsContent = jsContent.replace(
  /const currentCompanyId = <\?php echo json_encode\(\$company_id\); \?>;/g,
  "const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);"
);
jsContent = jsContent.replace(
  /let selectedCompanyIdsForAdd = \[<\?php echo json_encode\(\$company_id\); \?>\];/,
  "let selectedCompanyIdsForAdd = (typeof window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD !== 'undefined' ? window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD : []);"
);
// Multi-line currentCompanyCode (PHP block can span multiple lines)
jsContent = jsContent.replace(
  /const currentCompanyCode = <\?php[\s\S]*?\?>;/g,
  "const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');"
);

fs.writeFileSync(path.join(__dirname, 'js', 'processlist.js'), jsContent);
console.log('Written js/processlist.js');

// 3. Replace style block in PHP with link
const styleBlock = content.slice(styleStart, styleEnd + '    </style>'.length);
const linkTag = '    <link rel="stylesheet" href="css/processlist.css">';
content = content.replace(styleBlock, linkTag);
console.log('Replaced style block');

// 4. Minimal inline script + external script
const minimalBlock = `    <script>
        window.PROCESSLIST_SHOW_INACTIVE = <?php echo isset($_GET['showInactive']) ? 'true' : 'false'; ?>;
        window.PROCESSLIST_SHOW_ALL = <?php echo isset($_GET['showAll']) ? 'true' : 'false'; ?>;
        window.PROCESSLIST_COMPANY_ID = <?php echo json_encode($company_id ?? null); ?>;
        window.PROCESSLIST_COMPANY_CODE = <?php echo json_encode(isset($user_companies) && count($user_companies) > 0 ? array_values(array_filter($user_companies, function ($c) use ($company_id) { return $c['id'] == $company_id; }))[0]['company_id'] ?? '' : ''); ?>;
        window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD = [<?php echo json_encode($company_id); ?>];
    </script>
    <script src="js/processlist.js"></script>`;

content = content.replace(fullScriptBlock, minimalBlock);
content = content.replace(/<\/html>\s*<\/html>\s*$/, '</html>\n');
fs.writeFileSync(file, content);
console.log('Done.');
