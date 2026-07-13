<?php
/**
 * Deleted Log 列表展示：从快照解析 Acc ID、可读摘要（不写库）
 */

/**
 * @param mixed $payload deleted_logs.deleted_data（JSON 字符串或已解码数组）
 */
function deleted_log_display_decode_payload($payload): ?array
{
    if (is_array($payload)) {
        return $payload;
    }
    if ($payload === null || $payload === '') {
        return null;
    }
    $d = json_decode((string) $payload, true);
    return is_array($d) ? $d : null;
}

/**
 * 将 API/脚本路径映射为简短页面名（给最终用户看：从哪里来点的删除）
 */
function deleted_log_display_page_label(string $page): string
{
    $page = trim($page);
    $map = [
        'account-list.php' => 'Account · 账号',
        '/api/accounts/delete_accounts_api.php' => 'Account · 账号',
        '/api/accounts/delete_currency_api.php' => 'Account · 账号',
        '/api/accounts/account_currency_api.php' => 'Account · 账号',
        '/api/accounts/bulk_account_currency_api.php' => 'Account · 账号',
        '/api/accounts/account_company_api.php' => 'Account · 账号',
        '/api/accounts/account_link_api.php' => 'Account · 账号',
        '/api/transactions/maintenance_delete_api.php' => 'Maintenance › Transaction · 交易',
        '/api/payment_maintenance/delete_api.php' => 'Maintenance › Payment · 支付',
        '/api/bankprocess_maintenance/delete_api.php' => 'Maintenance › Bank · 银行',
        '/api/capture_maintenance/delete_api.php' => 'Maintenance › Data Capture · 数据采集',
        '/api/formula_maintenance/delete_api.php' => 'Maintenance › Formula · 公式',
        '/api/processes/delete_processes_api.php' => 'Process · 流程',
        '/api/ownership/remove_owner_api.php' => 'Ownership · 股权',
        '/api/subscription/auto_renew_api.php' => 'Auto Renew · 自动续费',
        '/api/maintenance/delete_api.php' => 'Announcement · 公告',
        'processlist.php' => 'Process · 流程',
        'remove_owner_api.php' => 'Ownership · 股权',
    ];
    if (isset($map[$page])) {
        return $map[$page];
    }
    $base = basename($page);
    return $base !== '' && $base !== '.' ? $base : $page;
}

/**
 * 根据表与快照生成一行摘要：入口页面 + 删了什么（无 Acc 也会说明行为）
 */
function deleted_log_display_summary(string $table, string $page, ?array $data, string $accDisplay): string
{
    $where = deleted_log_display_page_label($page);
    $acc = trim($accDisplay);
    $accZh = ($acc !== '' && $acc !== '—') ? ('，账号 ' . $acc) : '';

    switch ($table) {
        case 'account':
            return $where . '：删除账号资料（含 Acc ID）' . ($accZh !== '' ? $accZh : '');

        case 'account_company':
            return $where . '：解除该账号与当前公司的关联' . $accZh;

        case 'account_currency':
            return $where . '：删除账号币种设置' . $accZh;

        case 'account_link':
            return $where . '：删除账号关联（Link）' . $accZh;

        case 'currency':
            return $where . '：删除币种配置';

        case 'transactions':
            return $where . '：删除流水 / 交易记录' . $accZh;

        case 'transaction_entry':
            return $where . '：删除分录明细行' . $accZh;

        case 'company_ownership':
            return $where . '：删除一条股权 / 合伙关系记录';

        case 'group_ownership':
            return $where . '：删除集团股权记录';

        case 'data_captures':
            return $where . '：删除抓数主表记录';

        case 'data_capture_details':
            return $where . '：删除抓数明细';

        case 'submitted_processes':
            return $where . '：删除已提交流程对应记录';

        case 'data_capture_templates':
            return $where . '：删除公式 / 模板';

        case 'bank_process':
            return $where . '：删除银行类流程';

        case 'process':
            return $where . '：删除流程主档';

        case 'maintenance_marquee':
            return $where . '：删除维护区跑马灯内容';

        default:
            return $where . '：删除数据（表 ' . $table . '）' . $accZh;
    }
}

/**
 * 展示用公司列：优先 JOIN 的 company_code；否则从快照取 group_id / company 标识
 *
 * @param array<string,mixed>|null $data
 */
function deleted_log_display_company(string $joinedCode, string $logCompanyId, string $table, ?array $data): string
{
    $joined = trim($joinedCode);
    if ($joined !== '') {
        return $joined;
    }
    $cid = trim($logCompanyId);
    if ($cid !== '' && !ctype_digit($cid)) {
        return $cid;
    }
    if ($data !== null) {
        foreach (['company_code', 'group_id', 'group_code', 'code'] as $k) {
            if (!isset($data[$k])) {
                continue;
            }
            $v = trim((string) $data[$k]);
            if ($v !== '') {
                if ($k === 'group_id' || $k === 'group_code') {
                    return 'Group ' . $v;
                }
                return $v;
            }
        }
        if (isset($data['company_id']) && trim((string) $data['company_id']) !== '') {
            return 'CID ' . trim((string) $data['company_id']);
        }
    }
    if ($cid !== '') {
        return 'CID ' . $cid;
    }
    if (in_array($table, ['group_ownership', 'company_ownership', 'maintenance_marquee'], true)) {
        return '—';
    }
    return '—';
}

/**
 * 批量解析当前页需要的 account.id → account.account_id（展示用）
 *
 * @param array<int,array<string,mixed>> $rows
 * @return array<int,string> id => display account_id
 */
function deleted_log_display_resolve_account_ids(PDO $pdo, array $rows): array
{
    $needIds = [];
    foreach ($rows as $r) {
        $tbl = (string) ($r['table_name'] ?? '');
        $data = deleted_log_display_decode_payload($r['deleted_data'] ?? null);
        if ($data === null) {
            continue;
        }
        if (!in_array($tbl, ['account_company', 'transactions', 'transaction_entry', 'account_currency', 'account_link'], true)) {
            continue;
        }
        if (isset($data['account_id']) && (string) $data['account_id'] !== '') {
            $aid = (int) $data['account_id'];
            if ($aid > 0) {
                $needIds[$aid] = true;
            }
        }
    }
    $ids = array_keys($needIds);
    if ($ids === []) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    try {
        $stmt = $pdo->prepare("SELECT id, account_id FROM account WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $out = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $out[(int) $row['id']] = (string) ($row['account_id'] ?? '');
        }
        return $out;
    } catch (Throwable $e) {
        return [];
    }
}

/**
 * 展示用 Acc ID：业务上的 account 编号（如 ACC01）；无法解析时返回 —
 *
 * @param array<string,mixed>|null $data
 * @param array<int,string>        $idToAcc resolved account.id -> account_id
 */
function deleted_log_display_acc_id(string $table, ?array $data, array $idToAcc): string
{
    if ($data === null) {
        return '—';
    }

    if ($table === 'account') {
        $s = isset($data['account_id']) ? trim((string) $data['account_id']) : '';
        return $s !== '' ? $s : '—';
    }

    if (in_array($table, ['account_company', 'transactions', 'transaction_entry', 'account_currency', 'account_link'], true)) {
        if (!isset($data['account_id'])) {
            return '—';
        }
        $pid = (int) $data['account_id'];
        if ($pid > 0 && isset($idToAcc[$pid]) && $idToAcc[$pid] !== '') {
            return $idToAcc[$pid];
        }
        return '#' . $pid;
    }

    return '—';
}
