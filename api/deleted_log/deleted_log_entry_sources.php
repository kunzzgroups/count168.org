<?php
/**
 * Deleted Log：按「侧栏 SPA 页面」分组（label 对齐 AuthenticatedLayout + dashboardTranslate）。
 *
 * 侧栏对照：
 * - Account / Ownership / Process / Auto Renew / Announcement
 * - Maintenance › Data Capture | Transaction | Payment | Formula | Bank
 *
 * Soft-delete（如 Games Process → waiting）不进本页。
 */
function deleted_log_entry_source_definitions(): array
{
    return [
        '' => [
            'label' => 'All · 全部',
            'hint' => '所有已记录的物理删除',
            'pages' => [],
        ],
        'account' => [
            'label' => 'Account · 账号',
            'hint' => '侧栏 Account：删账号、币种、多公司关联、Link',
            'pages' => [
                'account-list.php',
                '/api/accounts/delete_accounts_api.php',
                '/api/accounts/delete_currency_api.php',
                '/api/accounts/account_currency_api.php',
                '/api/accounts/bulk_account_currency_api.php',
                '/api/accounts/account_company_api.php',
                '/api/accounts/account_link_api.php',
            ],
        ],
        'ownership' => [
            'label' => 'Ownership · 股权',
            'hint' => '侧栏 Ownership：移除股权 / 合伙行',
            'pages' => [
                '/api/ownership/remove_owner_api.php',
                'remove_owner_api.php',
            ],
        ],
        'process' => [
            'label' => 'Process · 流程',
            'hint' => '侧栏 Process：物理删除 Bank Process 主档',
            'pages' => [
                '/api/processes/delete_processes_api.php',
                'processlist.php',
            ],
        ],
        'capture' => [
            'label' => 'Data Capture · 数据采集',
            'hint' => '侧栏 Maintenance › Data Capture（Capture Maintenance）',
            'pages' => [
                '/api/capture_maintenance/delete_api.php',
            ],
        ],
        'txn_maint' => [
            'label' => 'Transaction · 交易',
            'hint' => '侧栏 Maintenance › Transaction（Transaction Maintenance）',
            'pages' => [
                '/api/transactions/maintenance_delete_api.php',
            ],
        ],
        'payment' => [
            'label' => 'Payment · 支付',
            'hint' => '侧栏 Maintenance › Payment（Payment Maintenance）',
            'pages' => [
                '/api/payment_maintenance/delete_api.php',
            ],
        ],
        'formula' => [
            'label' => 'Formula · 公式',
            'hint' => '侧栏 Maintenance › Formula（Formula Maintenance）',
            'pages' => [
                '/api/formula_maintenance/delete_api.php',
            ],
        ],
        'bank_maint' => [
            'label' => 'Bank · 银行',
            'hint' => '侧栏 Maintenance › Bank（Bank Process Maintenance）',
            'pages' => [
                '/api/bankprocess_maintenance/delete_api.php',
            ],
        ],
        'auto_renew' => [
            'label' => 'Auto Renew · 自动续费',
            'hint' => '侧栏 Auto Renew',
            'pages' => [
                '/api/subscription/auto_renew_api.php',
            ],
        ],
        'marquee' => [
            'label' => 'Announcement · 公告',
            'hint' => '侧栏 Announcement：维护区跑马灯删除',
            'pages' => [
                '/api/maintenance/delete_api.php',
            ],
        ],
    ];
}

/**
 * @return array{label:string,hint:string,pages:array<int,string>}|null
 */
function deleted_log_entry_source_for_key(string $key): ?array
{
    $all = deleted_log_entry_source_definitions();
    return array_key_exists($key, $all) ? $all[$key] : null;
}
