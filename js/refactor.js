const fs = require('fs');
const path = require('path');

const phpFiles = [
    'capture_maintenance.php',
    'formula_maintenance.php',
    'payment_maintenance.php',
    'transaction_maintenance.php'
];

const jsFiles = [
    'js/capture_maintenance.js',
    'js/formula_maintenance.js',
    'js/payment_maintenance.js',
    'js/transaction_maintenance.js'
];

const phpDir = 'c:/Users/kunzz/OneDrive/Desktop/count168/';

for (const file of phpFiles) {
    const fullPath = path.join(phpDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');

    // 1. Add get_companies_helper.php include
    if (!content.includes('get_companies_helper.php')) {
        const replaceMatch = content.match(/} else {\s*header\('Location:[^)]+'\);\s*exit;\s*}/);
        if (replaceMatch) {
            content = content.replace(replaceMatch[0], replaceMatch[0] + \

require_once __DIR__ . '/api/get_companies_helper.php';
\ = [];
try {
    \ = \['user_id'] ?? null;
    \ = \['role'] ?? '';
    if (\) {
        if (\ === 'owner') {
            \ = \['real_owner_id'] ?? \['owner_id'] ?? \;
            \ = getCompaniesByOwner(\, \, true);
        } else {
            \ = getCompaniesByUser(\, \, true);
        }
    }
} catch (Exception \) { }

\ = \;\);
        }
    }

    // 2. Replace company-buttons-wrapper with company_filter component
    const divRegex = /<div [^>]*(?:id="company-buttons-wrapper"|id="companyButtonsWrapper")[^>]*>[\s\S]*?(?:<\/div>\s*<\/div>|<\/div>\s*<\/div>\s*<\/div>|(?=<(?:div id="currency-buttons-wrapper"|div class="maintenance-actions")))/;
    
    // We need to carefully strip it. Let's just find the exact block and replace it since structure differs slightly.
    const divMatches = content.match(/<div [^>]*(?:id="company-buttons-wrapper"|id="companyButtonsWrapper")[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
    if (divMatches) {
        content = content.replace(divMatches[0], \<!-- Shared Group & Company Filter (SSR) -->
                    <?php
                    \ = 'maintenance'; 
                    include 'includes/company_filter.php'; 
                    ?>
                    <script>
                        window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                            if (typeof switchCompany === 'function') {
                                switchCompany(companyId, companyCode);
                            }
                        };
                    </script>\);
    }
    
    fs.writeFileSync(fullPath, content);
}

for (const file of jsFiles) {
    const fullPath = path.join(phpDir, file);
    if (!fs.existsSync(fullPath)) continue;
    let content = fs.readFileSync(fullPath, 'utf8');

    // Remove loadOwnerCompanies definition
    content = content.replace(/function loadOwnerCompanies\(\) \{[\s\S]*?(?=\n\s*(?:async )?function |\n\s*\/\/)/g, '');
    
    // Remove activateCompanyButton definition
    content = content.replace(/function activateCompanyButton\(companyId\) \{[\s\S]*?(?=\n\s*(?:async )?function |\n\s*\/\/)/g, '');
    
    // In DOMContentLoaded, remove loadOwnerCompanies() chain and replace with Promise.resolve()
    content = content.replace(/loadOwnerCompanies\(\)\s*\.catch\(\(\) => \{\}\)\s*\.then\(\(\) => \{/g, 'Promise.resolve()\\n                .then(() => {');
    
    // Some might have different DOMContentLoaded chain. Let's find loadOwnerCompanies().then(
    content = content.replace(/loadOwnerCompanies\(\)\s*\.then\(\(\) => \{/g, 'Promise.resolve().then(() => {');
    
    // Remove activateCompanyButton calls
    content = content.replace(/activateCompanyButton\([^)]+\);/g, '');
    
    // Fix switchCompany signature and logic
    content = content.replace(/async function switchCompany\(companyId\) \{/g, 'async function switchCompany(companyId, companyCode) {');
    content = content.replace(/const newCompany = ownerCompanies\.find[^;]+;/g, '');
    content = content.replace(/currentCompanyCode = newCompany[^;]+;/g, 'currentCompanyCode = companyCode || \\'\\';');

    fs.writeFileSync(fullPath, content);
}
console.log("Done");
