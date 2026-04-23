<?php
/**
 * Transaction Search API
 * 用于搜索和显示账户交易数据
 * 
 * 功能：
 * 1. 根据日期范围和角色筛选账户
 * 2. 计算每个账户的 B/F, Win/Loss, Cr/Dr, Balance
 * 3. 返回左右两个表格的数据
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../permissions.php';
require_once __DIR__ . '/../../includes/c168_domain_access.php';

/**
 * Contra 审批：过滤未批准的 CONTRA（向后兼容：若无字段则不过滤）
 */
function hasContraApprovalColumns(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null) {
        return $has;
    }
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'approval_status'");
    $has = $stmt->rowCount() > 0;
    return $has;
}

function contraApprovedWhere(PDO $pdo, string $alias = 't'): string
{
    if (!hasContraApprovalColumns($pdo)) {
        return '';
    }
    $a = $alias !== '' ? $alias . '.' : '';
    // 只对 CONTRA 生效：PENDING 的 CONTRA 不计入 BF / CrDr / Balance
    return " AND ({$a}transaction_type <> 'CONTRA' OR {$a}approval_status = 'APPROVED')";
}

function searchApiAccountHasCreatedSourceColumn(PDO $pdo): bool
{
    static $v = null;
    if ($v === null) {
        try {
            $st = $pdo->query("SHOW COLUMNS FROM account LIKE 'created_source'");
            $v = $st && $st->rowCount() > 0;
        } catch (Throwable $e) {
            $v = false;
        }
    }
    return $v;
}

/** transactions.currency_id 是否存在（请求内只查一次，避免每个账户/组合重复 SHOW COLUMNS） */
function searchApiTxnHasCurrencyId(PDO $pdo): bool
{
    static $v = null;
    if ($v === null) {
        $st = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'");
        $v = $st && $st->rowCount() > 0;
    }
    return $v;
}

/** transactions.source_bank_process_id 是否存在（请求内只查一次） */
function searchApiHasSourceBankProcessId(PDO $pdo): bool
{
    static $v = null;
    if ($v === null) {
        try {
            $st = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_id'");
            $v = $st && $st->rowCount() > 0;
        } catch (Throwable $e) {
            $v = false;
        }
    }
    return $v;
}

/** transactions.source_bank_process_period_type 是否存在（请求内只查一次） */
function searchApiHasSourceBankProcessPeriodType(PDO $pdo): bool
{
    static $v = null;
    if ($v === null) {
        try {
            $st = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_period_type'");
            $v = $st && $st->rowCount() > 0;
        } catch (Throwable $e) {
            $v = false;
        }
    }
    return $v;
}

/** account_currency 表是否存在（请求内只查一次） */
function searchApiHasAccountCurrencyTable(PDO $pdo): bool
{
    static $v = null;
    if ($v === null) {
        try {
            $st = $pdo->query("SHOW TABLES LIKE 'account_currency'");
            $v = $st && $st->rowCount() > 0;
        } catch (Throwable $e) {
            $v = false;
        }
    }
    return $v;
}

/**
 * 截断到2位小数（不四舍五入）
 */
function trunc2($value): float
{
    $n = (float) $value;
    if ($n >= 0) {
        return floor($n * 100) / 100;
    }
    return ceil($n * 100) / 100;
}

/**
 * 将 currency 加入列表（根据 currency_id 去重）
 */
function addAccountCurrencyCombo(array &$list, array &$seenIds, $currencyId, $currencyCode): void
{
    $currencyId = (int) $currencyId;
    $currencyCode = strtoupper((string) $currencyCode);

    if ($currencyId <= 0 || $currencyCode === '') {
        return;
    }

    if (isset($seenIds[$currencyId])) {
        return;
    }

    $seenIds[$currencyId] = true;
    $list[] = [
        'currency_id' => $currencyId,
        'currency_code' => $currencyCode
    ];
}

/** @return string|null 客户公司代码，如 LGA */
function searchApiParseDomainListFeeCompanyCode(string $sms): ?string
{
    if (preg_match('/^\[DOMAIN_LIST_FEE\|([^|\]]+)/i', trim($sms), $m)) {
        return strtoupper(trim($m[1]));
    }
    return null;
}

function searchApiParseDomainListFeeCompanyCodeFromDescription(string $description): ?string
{
    $d = trim($description);
    if ($d === '')
        return null;
    if (preg_match('/^Domain\s+list\s+fee\s+FROM\s+.*\(([A-Za-z0-9_-]+)\)\s*$/i', $d, $m)) {
        return strtoupper(trim($m[1]));
    }
    if (preg_match('/^Domain\s+list\s+fee\s+FROM\s+([A-Za-z0-9_-]+)\s*$/i', $d, $m)) {
        return strtoupper(trim($m[1]));
    }
    return null;
}

function searchApiAppendDomainNetProfitVirtualRows(
    PDO $pdo,
    array &$results,
    int $company_id,
    string $date_from_db,
    string $date_to_db,
    array $filter_currency_codes,
    array $currency_id_map
): void {
    $seen = [];
    $seenIndex = [];
    foreach ($results as $r) {
        $key = $r['account_db_id'] . '_' . strtoupper((string) ($r['currency'] ?? ''));
        $seen[$key] = true;
    }
    foreach ($results as $idx => $r) {
        $key = $r['account_db_id'] . '_' . strtoupper((string) ($r['currency'] ?? ''));
        $seenIndex[$key] = $idx;
    }
    $ownerCode = searchApiResolveCompanyOwnerCodeByPk($pdo, $company_id);
    if ($ownerCode === '') {
        $ownerCode = 'C168';
    }
    $seenIndex = [];
    foreach ($results as $idx => $r) {
        $key = $r['account_db_id'] . '_' . strtoupper((string) ($r['currency'] ?? ''));
        $seen[$key] = true;
        $seenIndex[$key] = $idx;
    }
    $profitRowCode = 'PROFIT';
    $profitRowName = 'PROFIT';
    $profitAccountDbId = 0;
    try {
        $stProfit = $pdo->prepare("
            SELECT a.id, TRIM(COALESCE(a.account_id, '')) AS account_code, TRIM(COALESCE(a.name, '')) AS account_name
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND (
                    LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
                    OR UPPER(TRIM(COALESCE(a.account_id, ''))) = 'PROFIT'
              )
            ORDER BY CASE WHEN UPPER(TRIM(COALESCE(a.account_id, ''))) = 'PROFIT' THEN 0 ELSE 1 END, a.id ASC
            LIMIT 1
        ");
        $stProfit->execute([$company_id]);
        $acc = $stProfit->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($acc) {
            $profitAccountDbId = (int) ($acc['id'] ?? 0);
            $profitRowCode = strtoupper(trim((string) ($acc['account_code'] ?? '')));
            if ($profitRowCode === '') {
                $profitRowCode = 'PROFIT';
            }
            $profitRowName = strtoupper(trim((string) ($acc['account_name'] ?? '')));
            if ($profitRowName === '') {
                $profitRowName = $profitRowCode;
            }
        }
    } catch (PDOException $e) {
    }

    $currencyFilterIds = [];
    if (!empty($filter_currency_codes)) {
        $want = array_unique(array_map('strtoupper', $filter_currency_codes));
        foreach ($currency_id_map as $cid => $code) {
            if (in_array(strtoupper((string) $code), $want, true)) {
                $currencyFilterIds[] = (int) $cid;
            }
        }
        $currencyFilterIds = array_values(array_unique(array_filter($currencyFilterIds)));
    }

    $sql = "SELECT t.id, t.amount, t.currency_id
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.transaction_date BETWEEN ? AND ?
              AND (
                    t.sms LIKE '[DOMAIN_NET_PROFIT|%'
                    OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'PROFIT BY %'
              )";
    $par = [$company_id, $date_from_db, $date_to_db];
    if (!empty($currencyFilterIds)) {
        $sql .= ' AND t.currency_id IN (' . implode(',', array_fill(0, count($currencyFilterIds), '?')) . ')';
        $par = array_merge($par, $currencyFilterIds);
    }
    $st = $pdo->prepare($sql);
    $st->execute($par);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    // 若尚未落库 DOMAIN_NET_PROFIT，动态按「Fee - Commission」计算一条利润行，确保交易页可见
    if (empty($rows)) {
        $aggSql = "SELECT
                     t.currency_id,
                     SUM(CASE
                           WHEN t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %'
                          THEN TRUNCATE(t.amount, 2)
                           ELSE 0
                         END) AS fee_total,
                     SUM(CASE
                           WHEN t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'COMMISION FOR %'
                          THEN TRUNCATE(t.amount, 2)
                           ELSE 0
                         END) AS comm_total
                   FROM transactions t
                   WHERE t.company_id = ?
                     AND t.transaction_type = 'PAYMENT'
                     AND t.transaction_date BETWEEN ? AND ?
                   GROUP BY t.currency_id";
        $aggSt = $pdo->prepare($aggSql);
        $aggSt->execute([$company_id, $date_from_db, $date_to_db]);
        while ($ar = $aggSt->fetch(PDO::FETCH_ASSOC)) {
            $cid = (int) ($ar['currency_id'] ?? 0);
            if ($cid <= 0)
                continue;
            $fee = trunc2((float) ($ar['fee_total'] ?? 0));
            $comm = trunc2((float) ($ar['comm_total'] ?? 0));
            $net = trunc2($fee - $comm);
            if ($net <= 0)
                continue;
            if (!empty($currencyFilterIds) && !in_array($cid, $currencyFilterIds, true)) {
                continue;
            }
            $rows[] = [
                'id' => 0,
                'amount' => $net,
                'currency_id' => $cid,
            ];
        }
    }

    while ($row = (is_array($rows) ? array_shift($rows) : null)) {
        $amt = trunc2((float) ($row['amount'] ?? 0));
        if (abs($amt) < 0.00001)
            continue;
        $cid = (int) ($row['currency_id'] ?? 0);
        $cur = strtoupper((string) ($currency_id_map[$cid] ?? ''));
        if ($cur === '')
            continue;
        $vid = -2000000 - (int) ($row['id'] ?? 0);
        $k = $vid . '_' . $cur;
        if (isset($seen[$k])) {
            $idx = $seenIndex[$k] ?? null;
            if ($idx !== null && isset($results[$idx])) {
                // 若同账户同币种已存在（常见为0值占位行），直接升级为净利润展示行
                $results[$idx]['account_id'] = $profitRowCode;
                $results[$idx]['account_name'] = $profitRowName;
                $results[$idx]['role'] = 'PROFIT';
                $results[$idx]['cr_dr'] = $amt;
                $results[$idx]['balance'] = $amt;
                $results[$idx]['has_crdr_transactions'] = 1;
            }
            continue;
        }
        $seen[$k] = true;
        $results[] = [
            'account_id' => $profitRowCode,
            'account_name' => $profitRowName,
            'account_db_id' => $vid,
            'role' => 'PROFIT',
            'currency' => $cur,
            'currency_id_debug' => $cid,
            'bf' => 0.0,
            'win_loss' => 0.0,
            'cr_dr' => $amt,
            'balance' => $amt,
            'has_crdr_transactions' => 1,
            'is_alert' => 0,
            'is_rate_middleman' => 0
        ];
    }
}

/**
 * 追加 Domain List Fee 的公司虚拟行（例如 LGA），用于展示“客户支付给 C168”的第一笔账单。
 * 注意：该行仅用于展示，不影响既有 Commission 计算。
 */
function searchApiAppendDomainListFeeVirtualRows(
    PDO $pdo,
    array &$results,
    int $company_id,
    string $date_from_db,
    string $date_to_db,
    array $filter_currency_codes,
    array $currency_id_map
): void {
    $seen = [];
    $seenIndex = [];
    foreach ($results as $r) {
        $k = $r['account_db_id'] . '_' . strtoupper((string) ($r['currency'] ?? ''));
        $seen[$k] = true;
    }
    foreach ($results as $idx => $r) {
        $k = $r['account_db_id'] . '_' . strtoupper((string) ($r['currency'] ?? ''));
        $seenIndex[$k] = $idx;
    }

    $currencyFilterIds = [];
    if (!empty($filter_currency_codes)) {
        $want = array_unique(array_map('strtoupper', $filter_currency_codes));
        foreach ($currency_id_map as $cid => $code) {
            if (in_array(strtoupper((string) $code), $want, true)) {
                $currencyFilterIds[] = (int) $cid;
            }
        }
        $currencyFilterIds = array_values(array_unique(array_filter($currencyFilterIds)));
    }

    $sql = "SELECT t.id, t.amount, t.currency_id, t.sms, t.description, t.from_account_id
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.transaction_date BETWEEN ? AND ?
              AND (
                    t.sms LIKE '[DOMAIN_LIST_FEE|%'
                    OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %'
              )";
    $par = [$company_id, $date_from_db, $date_to_db];
    if (!empty($currencyFilterIds)) {
        $sql .= ' AND t.currency_id IN (' . implode(',', array_fill(0, count($currencyFilterIds), '?')) . ')';
        $par = array_merge($par, $currencyFilterIds);
    }
    $sql .= ' ORDER BY t.id ASC';

    $fallbackCur = '';
    if (!empty($filter_currency_codes)) {
        $fallbackCur = strtoupper((string) $filter_currency_codes[0]);
    } else {
        foreach ($currency_id_map as $cc) {
            if (strtoupper((string) $cc) === 'MYR') {
                $fallbackCur = 'MYR';
                break;
            }
        }
    }

    $st = $pdo->prepare($sql);
    $st->execute($par);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $src = searchApiParseDomainListFeeCompanyCode((string) ($row['sms'] ?? ''));
        if ($src === null || $src === '') {
            $src = searchApiParseDomainListFeeCompanyCodeFromDescription((string) ($row['description'] ?? ''));
        }
        if ($src === null || $src === '') {
            continue;
        }

        $cidRaw = $row['currency_id'] ?? null;
        $cid = $cidRaw !== null ? (int) $cidRaw : 0;
        $cur = $cid > 0 ? strtoupper((string) ($currency_id_map[$cid] ?? '')) : '';
        if ($cur === '')
            $cur = $fallbackCur;
        if ($cur === '')
            continue;

        $amt = trunc2((float) ($row['amount'] ?? 0));
        if (abs($amt) < 0.00001)
            continue;

        $realAccountId = 0;
        $resolvedByExactCompanyCode = false;
        try {
            $sta = $pdo->prepare("
                SELECT a.id
                FROM account a
                INNER JOIN account_company ac ON ac.account_id = a.id
                WHERE ac.company_id = ?
                  AND UPPER(TRIM(a.account_id)) = ?
                LIMIT 1
            ");
            $sta->execute([$company_id, strtoupper($src)]);
            $realAccountId = (int) ($sta->fetchColumn() ?: 0);
            if ($realAccountId > 0) {
                $resolvedByExactCompanyCode = true;
            }
            // Domain 自动建账：新库 account_id=公司短码（QA）；旧库为 OWNERCODE_COMPANY（如 QAA_QA），sms 仍为公司短码（QA）
            if ($realAccountId <= 0) {
                try {
                    $stOwn = $pdo->prepare("
                        SELECT UPPER(TRIM(COALESCE(o.owner_code, ''))) AS oc
                        FROM company co
                        INNER JOIN owner o ON o.id = co.owner_id
                        WHERE UPPER(TRIM(co.company_id)) = ?
                        ORDER BY co.id ASC
                        LIMIT 1
                    ");
                    $stOwn->execute([strtoupper(trim($src))]);
                    $owRaw = trim((string) ($stOwn->fetchColumn() ?: ''));
                    $owClean = strtoupper(preg_replace('/[^A-Z0-9]/', '', $owRaw));
                    if ($owClean === '') {
                        $owClean = 'DOM';
                    }
                    $provisionCode = $owClean . '_' . strtoupper(trim($src));
                    $sta->execute([$company_id, $provisionCode]);
                    $realAccountId = (int) ($sta->fetchColumn() ?: 0);
                } catch (Exception $e) {
                }
            }
        } catch (PDOException $e) {
        }

        if ($realAccountId > 0) {
            $realKey = $realAccountId . '_' . $cur;
            if (isset($seen[$realKey])) {
                $idx = $seenIndex[$realKey] ?? null;
                if ($idx !== null && isset($results[$idx])) {
                    // 命中真实账号且主结果已存在时，不再二次调整金额，避免 List Fee 重复扣减（如 -2400 变 -4800）。
                    // 仅做展示归一：旧 OWNER_ 前缀账号统一显示公司短码，并同步公司名称。
                    if (!$resolvedByExactCompanyCode) {
                        $results[$idx]['account_id'] = $src;
                        try {
                            $sto = $pdo->prepare("
                                SELECT TRIM(COALESCE(o.name, '')) AS n
                                FROM company c
                                INNER JOIN owner o ON o.id = c.owner_id
                                WHERE UPPER(TRIM(c.company_id)) = ? OR UPPER(TRIM(IFNULL(c.group_id, ''))) = ?
                                ORDER BY c.id ASC
                                LIMIT 1
                            ");
                            $sto->execute([$src, $src]);
                            $n = trim((string) ($sto->fetchColumn() ?: ''));
                            if ($n !== '') {
                                $results[$idx]['account_name'] = $n;
                            }
                        } catch (PDOException $e) {
                        }
                    }
                    $results[$idx]['has_crdr_transactions'] = 1;
                }
                continue;
            }
        }

        $rowAccountId = -4000000 - (int) ($row['id'] ?? 0);
        if ($rowAccountId === 0) {
            continue;
        }
        $k = $rowAccountId . '_' . $cur;
        if (isset($seen[$k])) {
            continue;
        }
        $seen[$k] = true;

        $name = $src;
        try {
            $sto = $pdo->prepare("
                SELECT TRIM(COALESCE(o.name, '')) AS n
                FROM company c
                INNER JOIN owner o ON o.id = c.owner_id
                WHERE UPPER(TRIM(c.company_id)) = ? OR UPPER(TRIM(IFNULL(c.group_id, ''))) = ?
                ORDER BY c.id ASC
                LIMIT 1
            ");
            $sto->execute([$src, $src]);
            $n = trim((string) ($sto->fetchColumn() ?: ''));
            if ($n !== '')
                $name = $n;
        } catch (PDOException $e) {
        }

        $results[] = [
            'account_id' => $src,
            'account_name' => $name,
            'account_db_id' => $rowAccountId,
            'role' => 'DOMAIN',
            'currency' => $cur,
            'currency_id_debug' => $cid,
            'bf' => 0.0,
            'win_loss' => 0.0,
            'cr_dr' => -$amt,
            'balance' => -$amt,
            'has_crdr_transactions' => 1,
            'is_alert' => 0,
            'is_rate_middleman' => 0
        ];
    }

}

/** 当前查询公司在库中的 owner_code（用于标注「入账 C168」等） */
function searchApiResolveCompanyOwnerCodeByPk(PDO $pdo, int $companyPk): string
{
    if ($companyPk <= 0) {
        return '';
    }
    try {
        $st = $pdo->prepare("
            SELECT TRIM(COALESCE(o.owner_code, '')) AS oc
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            WHERE c.id = ?
            LIMIT 1
        ");
        $st->execute([$companyPk]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? trim((string) $v) : '';
    } catch (PDOException $e) {
        return '';
    }
}

/**
 * Domain Share Commission：bulk Cr/Dr 对 from_account（池子）侧记为 0，池子会只剩 List Fee 全额。
 * 在此按每笔佣金从池子账户的 Cr/Dr、Balance 扣回，与 Payment History 净额口径一致。
 * 客户侧 List Fee 仍由 searchApiAppendDomainListFeeVirtualRows 负责，此处不追加虚拟来源行。
 */
function searchApiApplyDomainSourceCompanyRows(
    PDO $pdo,
    array &$results,
    int $company_id,
    string $date_from_db,
    string $date_to_db,
    array $filter_currency_codes,
    array $currency_id_map
): void {
    $currencyFilterIds = [];
    if (!empty($filter_currency_codes)) {
        $want = array_unique(array_map('strtoupper', $filter_currency_codes));
        foreach ($currency_id_map as $cid => $code) {
            if (in_array(strtoupper((string) $code), $want, true)) {
                $currencyFilterIds[] = (int) $cid;
            }
        }
        $currencyFilterIds = array_values(array_unique(array_filter($currencyFilterIds)));
        if (empty($currencyFilterIds)) {
            return;
        }
    }

    $sql = "SELECT t.from_account_id, t.amount, t.currency_id
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.transaction_date BETWEEN ? AND ?
              AND t.currency_id IS NOT NULL
              AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%'
              AND t.from_account_id IS NOT NULL";
    $par = [$company_id, $date_from_db, $date_to_db];
    if (!empty($currencyFilterIds)) {
        $sql .= ' AND t.currency_id IN (' . implode(',', array_fill(0, count($currencyFilterIds), '?')) . ')';
        $par = array_merge($par, $currencyFilterIds);
    }

    $poolAdjust = []; // [ACC_ID][CUR] => delta

    $st = $pdo->prepare($sql);
    $st->execute($par);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $cid = (int) $row['currency_id'];
        $curCode = strtoupper((string) ($currency_id_map[$cid] ?? ''));
        if ($curCode === '') {
            continue;
        }
        $amt = trunc2((float) ($row['amount'] ?? 0));
        if (abs($amt) < 0.00001) {
            continue;
        }
        $poolId = (int) ($row['from_account_id'] ?? 0);
        if ($poolId > 0) {
            $poolAdjust[$poolId][$curCode] = ($poolAdjust[$poolId][$curCode] ?? 0.0) - $amt;
        }
    }

    if (empty($poolAdjust)) {
        return;
    }

    foreach ($results as &$row) {
        $aid = (int) ($row['account_db_id'] ?? 0);
        $cur = strtoupper((string) ($row['currency'] ?? ''));
        if ($aid > 0 && $cur !== '' && isset($poolAdjust[$aid][$cur])) {
            $delta = (float) $poolAdjust[$aid][$cur];
            $row['cr_dr'] = trunc2((float) $row['cr_dr'] + $delta);
            $row['balance'] = trunc2((float) $row['balance'] + $delta);
            $row['has_crdr_transactions'] = (abs((float) $row['cr_dr']) > 0.00001) ? 1 : (int) $row['has_crdr_transactions'];
        }
    }
    unset($row);

    $results = array_values(array_filter($results, function ($r) {
        $aid = (int) ($r['account_db_id'] ?? 0);
        if ($aid <= 0) {
            return true;
        }
        $has = (int) ($r['has_crdr_transactions'] ?? 0) === 1;
        $nonZero = abs((float) ($r['bf'] ?? 0)) > 0.00001
            || abs((float) ($r['win_loss'] ?? 0)) > 0.00001
            || abs((float) ($r['cr_dr'] ?? 0)) > 0.00001
            || abs((float) ($r['balance'] ?? 0)) > 0.00001;
        return $has || $nonZero;
    }));
}

try {
    // 检查用户是否登录
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }

    // 获取搜索参数
    $date_from = $_GET['date_from'] ?? null;
    $date_to = $_GET['date_to'] ?? null;
    $category = $_GET['category'] ?? null; // account.role，支持多个分类用逗号分隔
    $category_filters = [];
    if ($category && $category !== '') {
        $rawCategories = explode(',', $category);
        $categorySet = [];
        foreach ($rawCategories as $cat) {
            $cat = strtoupper(trim($cat));
            if ($cat !== '') {
                // 兼容显示映射：前端展示 SUPPLIER，但数据库可能仍存 UPLINE
                if ($cat === 'SUPPLIER') {
                    $categorySet['UPLINE'] = true;
                } else {
                    $categorySet[$cat] = true;
                }
            }
        }
        $category_filters = array_keys($categorySet);
    }
    $show_inactive = isset($_GET['show_inactive']) && $_GET['show_inactive'] === '1';
    $show_capture_only = isset($_GET['show_capture_only']) && $_GET['show_capture_only'] === '1';
    $hide_zero_balance = isset($_GET['hide_zero_balance']) && $_GET['hide_zero_balance'] === '1';

    // 解析目标账户：优先使用请求中的 target_account_id（保证 member 切换账户后显示所选账户数据），否则 member 用 session
    $target_account_ids = [];
    $isMemberUser = isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member';
    if (isset($_GET['target_account_id']) && $_GET['target_account_id'] !== '') {
        $rawIds = explode(',', $_GET['target_account_id']);
        foreach ($rawIds as $rawId) {
            $accountId = (int) trim($rawId);
            if ($accountId > 0 && !in_array($accountId, $target_account_ids, true)) {
                $target_account_ids[] = $accountId;
            }
        }
    }
    if (empty($target_account_ids) && $isMemberUser) {
        $memberAccountId = (int) ($_SESSION['user_id'] ?? 0);
        if ($memberAccountId > 0) {
            $target_account_ids = [$memberAccountId];
        }
    }
    $currency_filters = [];
    if (isset($_GET['currency']) && $_GET['currency'] !== '') {
        $rawCurrencies = explode(',', $_GET['currency']);
        foreach ($rawCurrencies as $currencyCode) {
            $code = strtoupper(trim($currencyCode));
            if ($code !== '') {
                $currency_filters[$code] = true;
            }
        }
        $currency_filters = array_keys($currency_filters);
    }

    // 获取 company_id：优先使用参数，否则使用 session
    $company_id = null;
    if (isset($_GET['company_id']) && !empty($_GET['company_id'])) {
        // 验证用户是否有权限访问该 company
        $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
        $userType = isset($_SESSION['user_type']) ? strtolower($_SESSION['user_type']) : '';
        if ($userRole === 'owner') {
            // Owner 可以访问自己拥有的 company
            $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$_GET['company_id'], $owner_id]);
            if ($stmt->fetchColumn()) {
                $company_id = (int) $_GET['company_id'];
            } else {
                throw new Exception('无权访问该 company');
            }
        } elseif ($userType === 'member') {
            // member 用户可以访问通过 account_company 关联的公司
            $memberAccountId = (int) $_SESSION['user_id'];
            $stmt = $pdo->prepare("
                SELECT 1 
                FROM account_company ac
                WHERE ac.account_id = ? AND ac.company_id = ?
            ");
            $stmt->execute([$memberAccountId, (int) $_GET['company_id']]);
            if ($stmt->fetchColumn()) {
                $company_id = (int) $_GET['company_id'];
            } else {
                throw new Exception('无权访问该 company');
            }
        } else {
            // 非 owner 用户只能访问自己的 company
            if (isset($_SESSION['company_id']) && (int) $_GET['company_id'] === (int) $_SESSION['company_id']) {
                $company_id = (int) $_GET['company_id'];
            } else {
                throw new Exception('无权访问该 company');
            }
        }
    } else {
        // 使用 session 中的 company_id
        if (!isset($_SESSION['company_id'])) {
            throw new Exception('缺少公司信息');
        }
        $company_id = $_SESSION['company_id'];
    }

    // 验证必填参数
    if (!$date_from || !$date_to) {
        throw new Exception('日期范围是必填项');
    }

    // 转换日期格式 (dd/mm/yyyy 转为 yyyy-mm-dd HH:ii:ss)
    // 结束日必须取到 23:59:59，避免 transaction_date 为 DATETIME 时单日查询漏掉当天记录。
    $from_ts = strtotime(str_replace('/', '-', $date_from));
    $to_ts = strtotime(str_replace('/', '-', $date_to));
    if ($from_ts === false || $to_ts === false) {
        throw new Exception('日期格式无效');
    }
    $date_from_db = date('Y-m-d 00:00:00', $from_ts);
    $date_to_db = date('Y-m-d 23:59:59', $to_ts);

    // 超短时微缓存（按用户 + 查询条件），用于吸收短时间内重复请求，减轻数据库压力。
    // 仅缓存极短时间，兼顾实时性与加载速度。
    $cache_file = null;
    $cache_ttl_seconds = 3;
    $cache_dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'count168_tx_search_cache';
    if (!is_dir($cache_dir)) {
        @mkdir($cache_dir, 0777, true);
    }
    if (is_dir($cache_dir)) {
        $cache_key_payload = [
            'user_id' => (int) ($_SESSION['user_id'] ?? 0),
            'user_type' => strtolower((string) ($_SESSION['user_type'] ?? '')),
            'role' => strtolower((string) ($_SESSION['role'] ?? '')),
            'company_id' => (int) $company_id,
            'date_from' => $date_from_db,
            'date_to' => $date_to_db,
            'show_inactive' => (int) $show_inactive,
            'show_capture_only' => (int) $show_capture_only,
            'hide_zero_balance' => (int) $hide_zero_balance,
            'categories' => array_values($category_filters),
            'currencies' => array_values($currency_filters),
            'target_account_ids' => array_values($target_account_ids),
        ];
        sort($cache_key_payload['categories']);
        sort($cache_key_payload['currencies']);
        sort($cache_key_payload['target_account_ids']);
        $cache_hash = sha1(json_encode($cache_key_payload, JSON_UNESCAPED_UNICODE));
        $cache_file = $cache_dir . DIRECTORY_SEPARATOR . $cache_hash . '.json';

        if (is_file($cache_file)) {
            $age = time() - (int) @filemtime($cache_file);
            if ($age >= 0 && $age <= $cache_ttl_seconds) {
                $cached = @file_get_contents($cache_file);
                if ($cached !== false && $cached !== '') {
                    echo $cached;
                    exit;
                }
            }
        }
    }

    // 构建账户查询条件
    $where_conditions = [];
    $params = [];

    // 添加 company_id 过滤（只使用 account_company 表）
    $where_conditions[] = "ac.company_id = ?";
    $params[] = $company_id;

    if (!empty($target_account_ids)) {
        $placeholders = implode(',', array_fill(0, count($target_account_ids), '?'));
        $where_conditions[] = "a.id IN ($placeholders)";
        $params = array_merge($params, $target_account_ids);
    }

    if (!empty($category_filters)) {
        if (count($category_filters) === 1) {
            $where_conditions[] = "a.role = ?";
            $params[] = $category_filters[0];
        } else {
            // 多个分类使用 IN 子句
            $placeholders = str_repeat('?,', count($category_filters) - 1) . '?';
            $where_conditions[] = "a.role IN ($placeholders)";
            $params = array_merge($params, $category_filters);
        }
    }

    // 账目准确性要求：transaction 列表必须包含 active 和 inactive 账户，
    // 因为 inactive 账户可能仍有历史交易数据，排除它们会造成账目对不上。
    // account-list.php 有独立的 inactive 过滤逻辑，不受此影响。
    // （show_inactive 参数对应前端 "Show Payment Only" 复选框，与账户状态过滤无关）

    // 添加条件：Show Win/Loss Only 和/或 Show Payment Only
    // 过滤逻辑分两层：
    //   Layer 1（SQL WHERE）：账户级别 EXISTS 过滤，减少账户集合
    //   Layer 2（foreach 循环内）：(账户 + 货币) 组合级别过滤，精确到每行
    // 两层设计对称，Win/Loss Only 与 Payment Only 处理方式完全一致。
    if ($show_capture_only && $show_inactive) {
        // 两者都勾选：账户在日期范围内有 Win/Loss（Data Capture / WIN/LOSE / RATE_MIDDLEMAN）或有 Payment（Cr/Dr）即显示
        // Bug修复：
        // 1. dcd.account_id 可能存储 account_code（字符串），必须用 CAST + account_code 双重匹配
        // 2. 补全 company_id 防止跨公司数据泄漏
        // 3. 新增 RATE_MIDDLEMAN 分支：手续费收益也属于 Win/Loss，不能被此处 EXISTS 过滤掉
        $where_conditions[] = "(
            EXISTS (
                SELECT 1 FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                WHERE dcd.company_id = ?
                  AND dc.company_id = ?
                  AND (
                      CAST(dcd.account_id AS CHAR) = CAST(a.id AS CHAR)
                      OR TRIM(COALESCE(dcd.account_id, '')) = TRIM(a.account_id)
                  )
                  AND dc.capture_date BETWEEN ? AND ?
            )
            OR EXISTS (
                SELECT 1 FROM transactions t_wl
                WHERE t_wl.company_id = ?
                  AND (t_wl.account_id = a.id OR t_wl.from_account_id = a.id)
                  AND t_wl.transaction_date BETWEEN ? AND ?
                  AND t_wl.transaction_type IN ('WIN', 'LOSE')
            )
            OR EXISTS (
                SELECT 1 FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND e.account_id = a.id
                  AND e.entry_type = 'RATE_MIDDLEMAN'
                  AND h.transaction_date BETWEEN ? AND ?
            )
            OR EXISTS (
                SELECT 1 FROM transactions t
                WHERE t.company_id = ?
                  AND (t.account_id = a.id OR t.from_account_id = a.id)
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  " . contraApprovedWhere($pdo, 't') . "
            )
        )";
        $params[] = $company_id;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
    } elseif ($show_capture_only) {
        // 仅勾选 Show Win/Loss Only：账户在当前日期范围内，只要存在 Data Capture / WIN/LOSE / RATE_MIDDLEMAN 即显示
        // Bug修复：
        // 1. dcd.account_id 可能存储 account_code（字符串），必须用 CAST + account_code 双重匹配
        // 2. 补全 company_id 防止跨公司数据泄漏
        // 3. 新增 RATE_MIDDLEMAN 分支：手续费收益也属于 Win/Loss，不能被此处 EXISTS 过滤掉
        $where_conditions[] = "(
            EXISTS (
                SELECT 1
                FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                WHERE dcd.company_id = ?
                  AND dc.company_id = ?
                  AND (
                      CAST(dcd.account_id AS CHAR) = CAST(a.id AS CHAR)
                      OR TRIM(COALESCE(dcd.account_id, '')) = TRIM(a.account_id)
                  )
                  AND dc.capture_date BETWEEN ? AND ?
            )
            OR EXISTS (
                SELECT 1 FROM transactions t_wl
                WHERE t_wl.company_id = ?
                  AND (t_wl.account_id = a.id OR t_wl.from_account_id = a.id)
                  AND t_wl.transaction_date BETWEEN ? AND ?
                  AND t_wl.transaction_type IN ('WIN', 'LOSE')
            )
            OR EXISTS (
                SELECT 1 FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND e.account_id = a.id
                  AND e.entry_type = 'RATE_MIDDLEMAN'
                  AND h.transaction_date BETWEEN ? AND ?
            )
        )";
        $params[] = $company_id;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
    } elseif ($show_inactive) {
        // 仅勾选 Show Payment Only：账户在日期范围内必须有 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 交易才显示
        // Bug修复：原来此处不做后端过滤，依赖前端 has_crdr_transactions 判断；
        // 但 has_crdr_transactions 会被 RATE 分录（非 RATE_MIDDLEMAN）污染（count > 0），
        // 导致纯 Win/Loss 账户（仅有 RATE 交易）也通过了前端过滤，错误出现在 Payment Only 视图中。
        // 现在改为后端 SQL 层面强制过滤，与 Show Win/Loss Only 的处理方式对称。
        $where_conditions[] = "(
            EXISTS (
                SELECT 1 FROM transactions t
                WHERE t.company_id = ?
                  AND (t.account_id = a.id OR t.from_account_id = a.id)
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  " . contraApprovedWhere($pdo, 't') . "
            )
            OR EXISTS (
                SELECT 1 FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                WHERE h.company_id = ?
                  AND e.company_id = ?
                  AND e.account_id = a.id
                  AND e.entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO', 'RATE_TRANSFER_FROM', 'RATE_TRANSFER_TO')
                  AND h.transaction_date BETWEEN ? AND ?
            )
        )";
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
        $params[] = $company_id;
        $params[] = $company_id;
        $params[] = $date_from_db;
        $params[] = $date_to_db;
    }
    // 默认（不勾选任何过滤）：不限制账户列表，返回全部账户

    $where_sql = !empty($where_conditions) ? 'WHERE ' . implode(' AND ', $where_conditions) : '';

    // 构建基础 SQL 查询（只显示已提交过的账户，通过 account_company 表过滤）
    // 同时查询 alert 相关字段
    $createdSourceSelect = searchApiAccountHasCreatedSourceColumn($pdo)
        ? ", COALESCE(a.created_source, '') AS created_source"
        : '';
    $baseSql = "SELECT DISTINCT
                a.id,
                a.account_id,
                a.name,
                a.role,
                a.status,
                COALESCE(a.payment_alert, 0) AS payment_alert,
                a.alert_day,
                a.alert_specific_date,
                a.alert_amount
                $createdSourceSelect
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            $where_sql";

    // 应用账户权限过滤：按当前查询的 company_id 读权限（避免 session 公司 A、筛选公司 B 时错用白名单）
    list($baseSql, $params) = filterAccountsByPermissions($pdo, $baseSql, $params, $company_id);

    // 由于 filterAccountsByPermissions 添加的是 "AND id IN (...)"，需要替换为 "a.id" 以匹配表别名
    $baseSql = preg_replace('/\bAND id IN\b/i', 'AND a.id IN', $baseSql);
    $baseSql = preg_replace('/\bWHERE id IN\b/i', 'WHERE a.id IN', $baseSql);
    $baseSql = preg_replace('/\bAND 1=0\b/i', 'AND 1=0', $baseSql);
    $baseSql = preg_replace('/\bWHERE 1=0\b/i', 'WHERE 1=0', $baseSql);

    // 添加排序
    $baseSql .= " ORDER BY a.account_id";

    $stmt = $pdo->prepare($baseSql);
    $stmt->execute($params);
    $accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($accounts)) {
        echo json_encode([
            'success' => true,
            'data' => [
                'left_table' => [],
                'right_table' => [],
                'totals' => [
                    'left' => ['bf' => 0, 'win_loss' => 0, 'cr_dr' => 0, 'balance' => 0],
                    'right' => ['bf' => 0, 'win_loss' => 0, 'cr_dr' => 0, 'balance' => 0],
                    'summary' => ['bf' => 0, 'win_loss' => 0, 'cr_dr' => 0, 'balance' => 0]
                ],
                'active_currency_codes' => []
            ]
        ]);
        exit;
    }

    // 获取所有 account + currency 组合（从 Data Capture Summary Edit Formula 的 currency 即 data_capture_details.currency_id 获取，不读取 Data Capture 的 currency）
    $account_currency_combos = [];

    // 如果指定了 currency 筛选，先获取 currency_id 列表
    $filter_currency_codes = []; // 用于筛选的 currency code 列表
    if (!empty($currency_filters)) {
        $filter_currency_codes = array_map('strtoupper', $currency_filters);
    }

    // 获取所有 currency 的映射（code => id）
    $currency_map = []; // currency_code => currency_id
    $currency_id_map = []; // currency_id => currency_code
    $currency_stmt = $pdo->prepare(
        "SELECT id, UPPER(code) AS code 
         FROM currency 
         WHERE company_id = ?"
    );
    $currency_stmt->execute([$company_id]);
    $currency_rows = $currency_stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($currency_rows as $row) {
        $code = strtoupper($row['code']);
        $currencyId = (int) $row['id'];
        $currency_map[$code] = $currencyId;
        $currency_id_map[$currencyId] = $code;
    }

    // 付方（from_account）若未加入本公司的 account_company，原列表不会包含该账户，导致 CONTRA/PAYMENT 等只在「对方公司」建档的付方不出现在左侧。
    // 合并：在本公司 transactions 中作为 from_account 出现、且落在查询日期与币别范围内的账户（member 限定单账户时不合并，避免泄露他人）。
    if (empty($target_account_ids)) {
        $existingAccountIds = [];
        foreach ($accounts as $accRow) {
            $existingAccountIds[(int) $accRow['id']] = true;
        }
        $cpContra = contraApprovedWhere($pdo, 't');
        $cpSql = "SELECT DISTINCT t.from_account_id AS id
                  FROM transactions t
                  WHERE t.company_id = ?
                    AND t.from_account_id IS NOT NULL
                    AND t.transaction_date <= ?
                    AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                    AND t.currency_id IS NOT NULL
                    $cpContra";
        $cpParams = [$company_id, $date_to_db];

        $cpSql2 = "SELECT DISTINCT e.account_id AS id
                   FROM transaction_entry e
                   JOIN transactions h ON e.header_id = h.id
                   WHERE h.company_id = ?
                     AND e.company_id = ?
                     AND h.transaction_date <= ?
                     AND e.entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO', 'RATE_TRANSFER_FROM', 'RATE_TRANSFER_TO')
                     AND e.currency_id IS NOT NULL";
        $cpParams2 = [$company_id, $company_id, $date_to_db];

        $cpCurrencyOk = true;
        if (!empty($filter_currency_codes)) {
            $cpCids = [];
            foreach ($filter_currency_codes as $fcc) {
                $uc = strtoupper((string) $fcc);
                if (isset($currency_map[$uc])) {
                    $cpCids[] = (int) $currency_map[$uc];
                }
            }
            if (empty($cpCids)) {
                $cpCurrencyOk = false;
            } else {
                $cpSql .= ' AND t.currency_id IN (' . implode(',', array_fill(0, count($cpCids), '?')) . ')';
                $cpParams = array_merge($cpParams, $cpCids);

                $cpSql2 .= ' AND e.currency_id IN (' . implode(',', array_fill(0, count($cpCids), '?')) . ')';
                $cpParams2 = array_merge($cpParams2, $cpCids);
            }
        }
        if ($cpCurrencyOk) {
            $cpStmt = $pdo->prepare($cpSql);
            $cpStmt->execute($cpParams);
            $cpNewIds = [];
            while ($cpRow = $cpStmt->fetch(PDO::FETCH_ASSOC)) {
                $fid = (int) $cpRow['id'];
                if ($fid > 0 && empty($existingAccountIds[$fid])) {
                    $cpNewIds[$fid] = true;
                }
            }

            $cpStmt2 = $pdo->prepare($cpSql2);
            $cpStmt2->execute($cpParams2);
            while ($cpRow = $cpStmt2->fetch(PDO::FETCH_ASSOC)) {
                $fid = (int) $cpRow['id'];
                if ($fid > 0 && empty($existingAccountIds[$fid])) {
                    $cpNewIds[$fid] = true;
                }
            }
            $cpNewIds = array_keys($cpNewIds);
            if (!empty($cpNewIds)) {
                $cpPh = implode(',', array_fill(0, count($cpNewIds), '?'));
                $extraBits = [];
                $extraParams = $cpNewIds;
                // 不按账户状态过滤：inactive 账户的历史交易数据仍需计入，保证账目准确
                if (!empty($category_filters)) {
                    if (count($category_filters) === 1) {
                        $extraBits[] = 'a.role = ?';
                        $extraParams[] = $category_filters[0];
                    } else {
                        $extraBits[] = 'a.role IN (' . str_repeat('?,', count($category_filters) - 1) . '?)';
                        $extraParams = array_merge($extraParams, $category_filters);
                    }
                }
                $extraCreated = searchApiAccountHasCreatedSourceColumn($pdo)
                    ? ", COALESCE(a.created_source, '') AS created_source"
                    : '';
                $extraSql = "SELECT DISTINCT
                        a.id,
                        a.account_id,
                        a.name,
                        a.role,
                        a.status,
                        COALESCE(a.payment_alert, 0) AS payment_alert,
                        a.alert_day,
                        a.alert_specific_date,
                        a.alert_amount
                        $extraCreated
                    FROM account a
                    WHERE a.id IN ($cpPh)";
                if (!empty($extraBits)) {
                    $extraSql .= ' AND ' . implode(' AND ', $extraBits);
                }
                // 付方账户在外部公司，不可能出现在「当前公司」的 account_permissions 白名单里，不得再套 filterAccountsByPermissions，否则会整批被 AND id IN 掉。
                $exSt = $pdo->prepare($extraSql);
                $exSt->execute($extraParams);
                $extraAcc = $exSt->fetchAll(PDO::FETCH_ASSOC);

                // Fallback for completely deleted from_account_ids
                // 当使用分类筛选时，已删除的账户没有 role 信息，不应出现在筛选结果中
                $foundIds = [];
                foreach ($extraAcc as $ea) {
                    $foundIds[(int) $ea['id']] = true;
                }
                if (empty($category_filters)) {
                    foreach ($cpNewIds as $reqId) {
                        if (!isset($foundIds[(int) $reqId])) {
                            $extraAcc[] = [
                                'id' => (int) $reqId,
                                'account_id' => 'Deleted_Acc_' . $reqId,
                                'name' => 'Deleted Account',
                                'role' => 'none',
                                'status' => 0,
                                'payment_alert' => 0,
                                'alert_day' => 0,
                                'alert_specific_date' => null,
                                'alert_amount' => 0,
                                'account_id_debug' => 'FROM_MERGE_DELETED'
                            ];
                        }
                    }
                }

                if (!empty($extraAcc)) {
                    $accounts = array_merge($accounts, $extraAcc);
                    usort($accounts, function ($x, $y) {
                        return strcmp((string) ($x['account_id'] ?? ''), (string) ($y['account_id'] ?? ''));
                    });
                }
            }
        }
    }

    // 收集「Edit Account 里勾选的 active 货币」：来自 account_currency 表，供前端 Show 0 balance 时只显示这些货币
    $active_currency_codes = [];
    $has_account_currency_table = false;
    try {
        $has_account_currency_table = searchApiHasAccountCurrencyTable($pdo); // static 缓存，不重复 SHOW
        if ($has_account_currency_table) {
            $placeholders = implode(',', array_fill(0, count($accounts), '?'));
            $ids = array_column($accounts, 'id');
            $stmt = $pdo->prepare("
                SELECT DISTINCT UPPER(c.code) AS code
                FROM account_currency ac
                INNER JOIN currency c ON ac.currency_id = c.id AND c.company_id = ?
                WHERE ac.account_id IN ($placeholders)
            ");
            $stmt->execute(array_merge([$company_id], $ids));
            $active_currency_codes = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'code');
            $active_currency_codes = array_values(array_unique($active_currency_codes));
        }
    } catch (PDOException $e) {
        $has_account_currency_table = false;
    }

    // ====== BULK PRE-LOAD 账户货币组合（避免每个账户在循环内单独查询，消除 N+1） ======
    $bulk_ac = []; // [account_id][currency_id] => currency_code  (来自 account_currency 表)
    $bulk_txn_cur_prd = []; // [account_id][currency_id] => currency_code  (本期 transactions)
    $bulk_dcd_cur = []; // [acc_str][currency_id] => currency_code      (DCD 历史，截至 date_to)
    $bulk_txn_cur_all = []; // [account_id][currency_id] => currency_code  (全历史 transactions，legacy 兜底)

    if (!empty($accounts)) {
        $all_ids = array_column($accounts, 'id');
        $all_ph = implode(',', array_fill(0, count($all_ids), '?'));

        // 1. account_currency 批量
        if ($has_account_currency_table) {
            $st = $pdo->prepare("
                SELECT ac.account_id, ac.currency_id, UPPER(c.code) AS currency_code
                FROM account_currency ac
                INNER JOIN currency c ON ac.currency_id = c.id AND c.company_id = ?
                WHERE ac.account_id IN ($all_ph)
                ORDER BY ac.account_id, ac.currency_id ASC
            ");
            $st->execute(array_merge([$company_id], $all_ids));
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $bulk_ac[(int) $r['account_id']][(int) $r['currency_id']] = strtoupper($r['currency_code']);
            }
        }

        if (searchApiTxnHasCurrencyId($pdo)) {
            // 2a. 本期交易币别（现代环境）：含作为 To 与作为 From 的本期交易，否则仅 from 方有流水的账户无币别组合
            $st = $pdo->prepare("
                SELECT DISTINCT t.account_id AS acc_id, t.currency_id, UPPER(c.code) AS currency_code
                FROM transactions t
                INNER JOIN currency c ON t.currency_id = c.id AND c.company_id = ?
                WHERE t.account_id IN ($all_ph)
                  AND t.currency_id IS NOT NULL
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLAIM','WIN','LOSE','RATE')
                UNION
                SELECT DISTINCT t.from_account_id AS acc_id, t.currency_id, UPPER(c.code) AS currency_code
                FROM transactions t
                INNER JOIN currency c ON t.currency_id = c.id AND c.company_id = ?
                WHERE t.from_account_id IN ($all_ph)
                  AND t.from_account_id IS NOT NULL
                  AND t.currency_id IS NOT NULL
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLAIM','WIN','LOSE','RATE')
            ");
            $st->execute(array_merge([$company_id], $all_ids, [$date_from_db, $date_to_db], [$company_id], $all_ids, [$date_from_db, $date_to_db]));
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $bulk_txn_cur_prd[(int) $r['acc_id']][(int) $r['currency_id']] = strtoupper($r['currency_code']);
            }

            // 2b. 全历史交易币别（legacy 路径 DCD 为空时兜底）
            try {
                $st = $pdo->prepare("
                    SELECT DISTINCT t.account_id, t.currency_id, UPPER(c.code) AS currency_code
                    FROM transactions t INNER JOIN currency c ON t.currency_id = c.id
                    WHERE t.account_id IN ($all_ph) AND t.currency_id IS NOT NULL
                      AND t.company_id = ? AND c.company_id = ?
                    UNION
                    SELECT DISTINCT t.from_account_id, t.currency_id, UPPER(c.code) AS currency_code
                    FROM transactions t INNER JOIN currency c ON t.currency_id = c.id
                    WHERE t.from_account_id IN ($all_ph) AND t.currency_id IS NOT NULL
                      AND t.company_id = ? AND c.company_id = ?
                ");
                $st->execute(array_merge($all_ids, [$company_id, $company_id], $all_ids, [$company_id, $company_id]));
                while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                    if ($r['account_id'] !== null) {
                        $bulk_txn_cur_all[(int) $r['account_id']][(int) $r['currency_id']] = strtoupper($r['currency_code']);
                    }
                }
            } catch (PDOException $e) {
            }
        }

        // 3. DCD 历史币别（截至 date_to，用于 legacy 路径）
        try {
            $st = $pdo->prepare("
                SELECT DISTINCT TRIM(COALESCE(CAST(dcd.account_id AS CHAR), '')) AS acc_str,
                       dcd.currency_id, UPPER(c.code) AS currency_code
                FROM data_capture_details dcd
                INNER JOIN data_captures dc ON dcd.capture_id = dc.id
                INNER JOIN currency c ON dcd.currency_id = c.id
                WHERE dcd.company_id = ? AND dc.company_id = ? AND c.company_id = ?
                  AND dc.capture_date <= ?
                  AND dcd.currency_id IS NOT NULL
            ");
            $st->execute([$company_id, $company_id, $company_id, $date_to_db]);
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $bulk_dcd_cur[$r['acc_str']][(int) $r['currency_id']] = strtoupper($r['currency_code']);
            }
        } catch (PDOException $e) {
        }
    }
    // ====== END BULK PRE-LOAD ======

    foreach ($accounts as $account) {
        $account_id = $account['id'];
        $account_currencies = [];
        $account_currency_ids = [];
        $acc_str = trim((string) $account_id);

        if (!$hide_zero_balance && $has_account_currency_table) {
            // === 现代路径：从 bulk_ac 批量数据读取，无需逐账户查询 ===
            foreach ($bulk_ac[$account_id] ?? [] as $cid => $code) {
                addAccountCurrencyCombo($account_currencies, $account_currency_ids, $cid, $code);
            }
            // 若指定了 currency 筛选，只保留筛选内的
            if (!empty($filter_currency_codes)) {
                $account_currencies = array_values(array_filter($account_currencies, function ($ac) use ($filter_currency_codes) {
                    return in_array(strtoupper($ac['currency_code'] ?? ''), $filter_currency_codes);
                }));
                $account_currency_ids = [];
                foreach ($account_currencies as $ac) {
                    $account_currency_ids[(int) $ac['currency_id']] = true;
                }
            }
            // 补充：本期有交易的货币（确保有 PROFIT 的账户能显示）以及全历史交易货币（确保不活跃账号的历史 B/F 能显示）
            if (searchApiTxnHasCurrencyId($pdo)) {
                foreach ($bulk_txn_cur_all[$account_id] ?? [] as $cid => $code) {
                    addAccountCurrencyCombo($account_currencies, $account_currency_ids, $cid, $code);
                }
            } elseif (!empty($filter_currency_codes)) {
                // 旧环境：从 DCD 本期数据补充
                foreach ($bulk_dcd_cur[$acc_str] ?? [] as $cid => $code) {
                    if (in_array($code, $filter_currency_codes)) {
                        addAccountCurrencyCombo($account_currencies, $account_currency_ids, $cid, $code);
                    }
                }
            }
            // 再次过滤
            if (!empty($filter_currency_codes)) {
                $account_currencies = array_values(array_filter($account_currencies, function ($ac) use ($filter_currency_codes) {
                    return in_array(strtoupper($ac['currency_code'] ?? ''), $filter_currency_codes);
                }));
                $account_currency_ids = [];
                foreach ($account_currencies as $ac) {
                    $account_currency_ids[(int) $ac['currency_id']] = true;
                }
            }
            // 兜底：仍无币别但有 currency 筛选时，直接挂上筛选的币别
            if (empty($account_currencies) && !empty($filter_currency_codes)) {
                foreach ($filter_currency_codes as $fcc) {
                    $code = strtoupper($fcc);
                    if (!isset($currency_map[$code]))
                        continue;
                    addAccountCurrencyCombo($account_currencies, $account_currency_ids, $currency_map[$code], $code);
                }
            }
        } else {
            // === Legacy 路径：从 bulk_dcd_cur 批量数据读取 ===
            foreach ($bulk_dcd_cur[$acc_str] ?? [] as $cid => $code) {
                addAccountCurrencyCombo($account_currencies, $account_currency_ids, $cid, $code);
            }
            // 若 DCD 无数据，从全历史交易兜底
            if (empty($account_currencies)) {
                foreach ($bulk_txn_cur_all[$account_id] ?? [] as $cid => $code) {
                    addAccountCurrencyCombo($account_currencies, $account_currency_ids, $cid, $code);
                }
            }
            // 添加 filter 或全公司币别
            if (!empty($filter_currency_codes)) {
                foreach ($filter_currency_codes as $fcc) {
                    if (!isset($currency_map[$fcc]))
                        continue;
                    $cid = $currency_map[$fcc];
                    if (!isset($account_currency_ids[$cid])) {
                        $account_currencies[] = ['currency_id' => $cid, 'currency_code' => $fcc];
                        $account_currency_ids[$cid] = true;
                    }
                }
            } else {
                foreach ($currency_map as $code => $cid) {
                    if (!isset($account_currency_ids[$cid])) {
                        $account_currencies[] = ['currency_id' => $cid, 'currency_code' => $code];
                        $account_currency_ids[$cid] = true;
                    }
                }
            }
        }

        if (empty($account_currencies)) {
            continue;
        }

        // 为每个 currency 创建 account + currency 组合
        foreach ($account_currencies as $ac_currency) {
            $currency_id = (int) $ac_currency['currency_id'];
            $currency_code = strtoupper($ac_currency['currency_code']);
            if (!empty($filter_currency_codes) && !in_array($currency_code, $filter_currency_codes)) {
                continue;
            }
            $account_currency_combos[] = [
                'account' => $account,
                'currency_id' => $currency_id,
                'currency_code' => $currency_code
            ];
        }
    }

    // 计算每个 account + currency 组合的数据
    $results = [];

    // ==================== BULK DATA PREPARATION ====================
    // N+1 optimization for modern environments.
    $bulk = null;
    if (searchApiTxnHasCurrencyId($pdo)) {
        $bulk = [
            'dcd' => [],
            'txn_win_lose' => [],
            'txn_crdr_to' => [],
            'txn_crdr_from' => [],
            'entry' => []
        ];
        $contra_where_t = contraApprovedWhere($pdo, 't');

        $sql = "SELECT TRIM(COALESCE(CAST(dcd.account_id AS CHAR), '')) AS acc_str, dcd.currency_id, 
                       SUM(CASE WHEN dc.capture_date < ? THEN ROUND(dcd.processed_amount, 2) ELSE 0 END) AS bf_total,
                       SUM(CASE WHEN dc.capture_date BETWEEN ? AND ? THEN ROUND(dcd.processed_amount, 2) ELSE 0 END) AS wl_total,
                       SUM(CASE WHEN dc.capture_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS wl_count,
                       COUNT(*) AS up_to_count
                FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                WHERE dcd.company_id = ? AND dc.company_id = ? AND dc.capture_date <= ? AND dcd.currency_id IS NOT NULL
                GROUP BY TRIM(COALESCE(CAST(dcd.account_id AS CHAR), '')), dcd.currency_id";
        $stmt_bulk = $pdo->prepare($sql);
        $stmt_bulk->execute([$date_from_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $company_id, $company_id, $date_to_db]);
        while ($r = $stmt_bulk->fetch(PDO::FETCH_ASSOC)) {
            $bulk['dcd'][$r['acc_str']][$r['currency_id']] = [
                'bf' => (float) $r['bf_total'],
                'wl' => (float) $r['wl_total'],
                'wl_count' => (int) $r['wl_count'],
                'up_to_count' => (int) ($r['up_to_count'] ?? 0)
            ];
        }

        $has_source_bank_process_id = searchApiHasSourceBankProcessId($pdo); // static 缓存
        $has_source_bank_process_period_type = searchApiHasSourceBankProcessPeriodType($pdo); // static 缓存

        $wlJoinSql = '';
        $wlDateExpr = "DATE(t.transaction_date)";
        $wlFutureGuard = '';
        if ($has_source_bank_process_id) {
            $wlJoinSql = " LEFT JOIN bank_process bp ON t.source_bank_process_id = bp.id";
            $bpDayStartSql = "CASE
                WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' THEN DATE(bp.day_start)
                WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d/%m/%Y')
                WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d-%m-%Y')
                ELSE NULL
            END";

            if ($has_source_bank_process_period_type) {
                // period_type 存在时也统一按 transaction_date 归属，避免补单日期被回绑到原始 day_start。
                $wlDateExpr = "DATE(t.transaction_date)";
                $wlFutureGuard = '';
            } else {
                // 缺少 period_type 字段时，统一按 transactions.transaction_date 归属；
                // 避免 Resend 仅临时改 day_start 后，主表仍被历史 bank_process.day_start（原始锚点）错误归档。
                $wlDateExpr = "DATE(t.transaction_date)";
                $wlFutureGuard = '';
            }
        }

        $sql = "SELECT t.account_id, IFNULL(t.currency_id, 0) AS currency_id,
                 SUM(CASE WHEN $wlDateExpr < ? THEN (
                    CASE 
                        WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS bf_total,
                 SUM(CASE WHEN $wlDateExpr BETWEEN ? AND ? THEN (
                    CASE 
                        WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -ROUND(t.amount, 2)
                        WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS wl_total,
                 SUM(CASE WHEN $wlDateExpr BETWEEN ? AND ? THEN 1 ELSE 0 END) AS wl_count,
                 SUM(CASE WHEN $wlDateExpr <= ? THEN 1 ELSE 0 END) AS up_to_count
                FROM transactions t $wlJoinSql
                WHERE t.company_id = ?
                  AND t.transaction_type IN ('WIN', 'LOSE')
                  $contra_where_t $wlFutureGuard
                GROUP BY t.account_id, IFNULL(t.currency_id, 0)";
        $stmt_bulk = $pdo->prepare($sql);
        $stmt_bulk->execute([$date_from_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $date_to_db, $company_id]);
        while ($r = $stmt_bulk->fetch(PDO::FETCH_ASSOC)) {
            $bulk['txn_win_lose'][$r['account_id']][$r['currency_id']] = [
                'bf' => (float) $r['bf_total'],
                'wl' => (float) $r['wl_total'],
                'wl_count' => (int) $r['wl_count'],
                'up_to_count' => (int) ($r['up_to_count'] ?? 0)
            ];
        }

        $sql = "SELECT t.account_id, t.currency_id,
                 SUM(CASE WHEN t.transaction_date < ? THEN (
                    CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS bf_cr_dr,
                 SUM(CASE WHEN t.transaction_date BETWEEN ? AND ? THEN (
                    CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS wl_cr_dr,
                 SUM(CASE WHEN t.transaction_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS wl_txn_count
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND t.currency_id IS NOT NULL 
                  $contra_where_t
                GROUP BY t.account_id, t.currency_id";
        $stmt_bulk = $pdo->prepare($sql);
        $stmt_bulk->execute([$date_from_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $company_id]);
        while ($r = $stmt_bulk->fetch(PDO::FETCH_ASSOC)) {
            $bulk['txn_crdr_to'][$r['account_id']][$r['currency_id']] = [
                'bf' => (float) $r['bf_cr_dr'],
                'cr_dr' => (float) $r['wl_cr_dr'],
                'count' => (int) $r['wl_txn_count']
            ];
        }

        $sql = "SELECT t.from_account_id AS account_id, t.currency_id,
                 SUM(CASE WHEN t.transaction_date < ? THEN (
                    CASE 
                        WHEN transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS bf_cr_dr,
                 SUM(CASE WHEN t.transaction_date BETWEEN ? AND ? THEN (
                    CASE 
                        WHEN transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)
                        ELSE 0 
                    END
                 ) ELSE 0 END) AS wl_cr_dr,
                 SUM(CASE WHEN t.transaction_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS wl_txn_count
                FROM transactions t
                WHERE t.company_id = ? AND t.from_account_id IS NOT NULL
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND t.currency_id IS NOT NULL 
                  -- Domain Share Commission / Net Profit 不计入 from_account（避免重复）
                  AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_SHARE_COMMISSION|%'
                  AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_NET_PROFIT|%'
                  $contra_where_t
                GROUP BY t.from_account_id, t.currency_id";
        $stmt_bulk = $pdo->prepare($sql);
        $stmt_bulk->execute([$date_from_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $company_id]);
        while ($r = $stmt_bulk->fetch(PDO::FETCH_ASSOC)) {
            $bulk['txn_crdr_from'][$r['account_id']][$r['currency_id']] = [
                'bf' => (float) $r['bf_cr_dr'],
                'cr_dr' => (float) $r['wl_cr_dr'],
                'count' => (int) $r['wl_txn_count']
            ];
        }

        $sql = "SELECT e.account_id, e.currency_id,
                 SUM(CASE WHEN h.transaction_date < ? THEN (
                    CASE
                      WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -ROUND(e.amount, 2)
                      WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -ROUND(e.amount, 2)
                      WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN ROUND(e.amount, 2)
                      ELSE ROUND(e.amount, 2)
                    END
                 ) ELSE 0 END) AS bf_total,
                 SUM(CASE WHEN h.transaction_date BETWEEN ? AND ? AND e.entry_type = 'RATE_MIDDLEMAN' THEN ROUND(e.amount, 2) ELSE 0 END) AS wl_rate_mm,
                 SUM(CASE WHEN h.transaction_date BETWEEN ? AND ? AND e.entry_type = 'RATE_MIDDLEMAN' THEN 1 ELSE 0 END) AS wl_rate_mm_count,
                 SUM(CASE WHEN h.transaction_date <= ? AND e.entry_type = 'RATE_MIDDLEMAN' THEN 1 ELSE 0 END) AS up_to_rate_mm_count,
                 SUM(CASE WHEN h.transaction_date BETWEEN ? AND ? AND e.entry_type <> 'RATE_MIDDLEMAN' THEN (
                    CASE
                      WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -ROUND(e.amount, 2)
                      WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -ROUND(e.amount, 2)
                      ELSE ROUND(e.amount, 2)
                    END
                 ) ELSE 0 END) AS wl_cr_dr_other,
                 SUM(CASE WHEN h.transaction_date BETWEEN ? AND ? AND e.entry_type <> 'RATE_MIDDLEMAN' THEN 1 ELSE 0 END) AS wl_cr_dr_other_count
            FROM transaction_entry e
            JOIN transactions h ON e.header_id = h.id
            WHERE h.company_id = ?
              AND e.company_id = ?
              AND h.transaction_type = 'RATE'
            GROUP BY e.account_id, e.currency_id";
        $stmt_bulk = $pdo->prepare($sql);
        $stmt_bulk->execute([$date_from_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $date_to_db, $date_from_db, $date_to_db, $date_from_db, $date_to_db, $company_id, $company_id]);
        while ($r = $stmt_bulk->fetch(PDO::FETCH_ASSOC)) {
            $bulk['entry'][$r['account_id']][$r['currency_id']] = [
                'bf' => (float) $r['bf_total'],
                'wl_mm' => (float) $r['wl_rate_mm'],
                'wl_mm_count' => (int) $r['wl_rate_mm_count'],
                'wl_mm_up_to_count' => (int) ($r['up_to_rate_mm_count'] ?? 0),
                'cr_dr' => (float) $r['wl_cr_dr_other'],
                'cr_dr_count' => (int) $r['wl_cr_dr_other_count']
            ];
        }
    }
    // ===============================================================

    foreach ($account_currency_combos as $combo) {
        $account = $combo['account'];
        $account_id = $account['id'];
        $currency_id = $combo['currency_id'];
        $currency_code = $combo['currency_code'];

        // 1. 计算 B/F (起始日期之前的所有累计余额，按 currency 过滤)
        $bf = calculateBFByCurrency($pdo, $account_id, $currency_id, $date_from_db, $company_id, $account['account_id'] ?? '', $bulk);

        // 2. 计算 Win/Loss (日期范围内的 Data Capture + WIN/LOSE 交易，按 currency 过滤)
        $wlPack = calculateWinLossByCurrency($pdo, $account_id, $currency_id, $date_from_db, $date_to_db, $company_id, $account['account_id'] ?? '', $bulk);
        $win_loss = $wlPack['win_loss'];
        $has_win_loss_transactions = !empty($wlPack['has_win_loss_transactions']);
        $has_win_loss_history = !empty($wlPack['has_win_loss_history']);

        // 3. 计算 Cr/Dr (日期范围内的 PAYMENT/RECEIVE/CONTRA 交易，按 Edit Formula 的 currency 过滤)
        $cr_dr_result = calculateCrDrByCurrency($pdo, $account_id, $currency_id, $date_from_db, $date_to_db, $company_id, $bulk);
        $cr_dr = $cr_dr_result['value'];
        $has_crdr_transactions = $cr_dr_result['has_transactions'];

        // Layer 2 过滤：(账户 + 货币) 组合级别。两者互相对称：
        // 情况A：仅 Show Win/Loss Only —— 跳过该货币“本期没有任何 Win/Loss 相关记录”的行
        if ($show_capture_only && !$show_inactive) {
            if (!$has_win_loss_transactions) {
                continue;
            }
        }
        // 情况B：仅 Show Payment Only —— 跳过该货币没有 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 的行
        // 注意：$has_crdr_transactions 已在 calculateCrDrByCurrency 中修正，
        // 不再受 RATE 分录（transaction_entry）count 污染。
        if ($show_inactive && !$show_capture_only) {
            if (!$has_crdr_transactions) {
                continue;
            }
        }

        // 4. 计算 Balance（显示口径）
        // 公式：Balance = trunc(B/F,2) + trunc(Win/Loss,2) + trunc(Cr/Dr,2)
        // 这样与表格上可见列值的手算结果一致，避免 0.01 浮点尾差
        $bf_display = trunc2((float) $bf);
        $win_loss_display = trunc2((float) $win_loss);
        $cr_dr_display = trunc2((float) $cr_dr);
        $balance = trunc2($bf_display + $win_loss_display + $cr_dr_display);

        // 4b. 本期是否有 RATE Middle-Man 分录（与 Win/Loss 内 RATE_MIDDLEMAN 查询合并，避免每条组合多一次 EXISTS）
        $is_rate_middleman = !empty($wlPack['has_rate_middleman']);
        if (!$is_rate_middleman && !searchApiTxnHasCurrencyId($pdo)) {
            $is_rate_middleman = hasRateMiddlemanInPeriod($pdo, $account_id, $currency_id, $date_from_db, $date_to_db, $company_id, $bulk);
        }

        // 5. 检查 Alert 条件是否达成
        $is_alert = false;

        // 左边列表（balance >= 0）完全不变色
        if ($balance >= 0) {
            $is_alert = false;
        } elseif ($account['payment_alert'] == 1) {
            // 右边列表（balance < 0）：需要同时满足两个条件才变色
            // 1. balance <= alert_amount（负数阈值）
            // 2. 满足 alert_type 和 alert_start_date 的时间条件（变色频率）

            $alertAmountMet = false;
            $timeConditionMet = false;

            // 条件1：检查 Alert Amount - balance 是否达到或低于设定的金额（负数阈值）
            if (!empty($account['alert_amount']) && $account['alert_amount'] < 0) {
                $alertAmount = (float) $account['alert_amount'];
                // 当 balance 小于等于这个负数阈值时，满足金额条件
                if ($balance <= $alertAmount) {
                    $alertAmountMet = true;
                }
            }

            // 条件2：检查 Alert Type 和 Start Date - 变色的频率（从开始时间算起，多久会变色）
            // alert_day 现在存储 alert_type (weekly/monthly/1-31)
            // alert_specific_date 现在存储 alert_start_date (日期格式)
            $alert_type = $account['alert_day']; // 兼容：alert_day 现在存储 alert_type
            $alert_start_date = $account['alert_specific_date']; // 兼容：alert_specific_date 现在存储 alert_start_date

            if ($alert_type && $alert_start_date) {
                try {
                    // 使用搜索日期范围的结束日期（date_to）来判断 alert，而不是当前现实时间
                    // 这样查看历史数据时，可以正确显示当时的 alert 状态
                    $checkDate = new DateTime($date_to_db); // 使用搜索的结束日期
                    $checkDate->setTime(0, 0, 0);
                    $startDate = new DateTime($alert_start_date);
                    $startDate->setTime(0, 0, 0);

                    // 如果开始日期在未来，不满足时间条件
                    if ($startDate <= $checkDate) {
                        $alert_type_lower = strtolower($alert_type);

                        // 计算从开始日期到检查日期（date_to）的天数差（使用更可靠的方法）
                        $daysDiff = (int) $startDate->diff($checkDate)->days;

                        // 确保开始日期 <= 检查日期
                        if ($startDate > $checkDate) {
                            $timeConditionMet = false;
                        } elseif ($alert_type_lower === 'weekly') {
                            // Weekly: 从开始日期算起每七天会再次变色
                            // 开始日期当天（daysDiff = 0）会触发，然后每7天触发一次
                            if ($daysDiff >= 0 && $daysDiff % 7 === 0) {
                                $timeConditionMet = true;
                            }
                        } elseif ($alert_type_lower === 'monthly') {
                            // Monthly: 从开始日期算起每个月会再次变色
                            // 检查是否是同一天（月份可以不同）
                            $startDay = (int) $startDate->format('j');
                            $checkDay = (int) $checkDate->format('j');

                            // 如果日期相同，且检查日期 >= 开始日期，则满足条件
                            if ($startDay === $checkDay && $startDate <= $checkDate) {
                                $timeConditionMet = true;
                            }
                        } else {
                            // 1-31: 根据选择的天数多久变色一次（从开始日期算起每N天变色一次）
                            $daysInterval = (int) $alert_type;
                            if ($daysInterval >= 1 && $daysInterval <= 31) {
                                // 开始日期当天（daysDiff = 0）会触发，然后每N天触发一次
                                if ($daysDiff >= 0 && $daysDiff % $daysInterval === 0) {
                                    $timeConditionMet = true;
                                }
                            }
                        }
                    }
                } catch (Exception $e) {
                    // 如果日期解析失败，不满足时间条件
                    $timeConditionMet = false;
                }
            }

            // 只有同时满足金额条件和时间条件，才触发警报（变色）
            // 必须同时设置 alert_amount、alert_type 和 alert_start_date 才会变色
            // 从开始日期算起，按照 alert_type 的频率（weekly/monthly/N天），如果 balance <= alert_amount 就变色
            if ($alertAmountMet && $alert_type && $alert_start_date) {
                // 必须同时满足金额条件和时间条件
                $is_alert = $timeConditionMet;
            } else {
                // 如果缺少任何条件，不变色
                $is_alert = false;
            }
        }

        $dispAccountId = domainProvisionedMemberAccountIdForDisplay(
            (string) ($account['account_id'] ?? ''),
            (string) ($account['role'] ?? ''),
            isset($account['created_source']) ? (string) $account['created_source'] : null
        );
        if ($dispAccountId === '') {
            $dispAccountId = (string) ($account['account_id'] ?? '');
        }

        $results[] = [
            'account_id' => $dispAccountId,
            'account_name' => $account['name'],
            'account_db_id' => $account_id,
            'role' => $account['role'],
            'currency' => $currency_code,
            'currency_id_debug' => $currency_id,
            // 与 history_api 显示口径保持一致：统一在后端保留 2 位小数再返回
            'bf' => $bf_display,
            'win_loss' => $win_loss_display,
            'cr_dr' => $cr_dr_display,
            'balance' => trunc2((float) $balance),
            'has_crdr_transactions' => $has_crdr_transactions ? 1 : 0,
            'has_win_loss_transactions' => $has_win_loss_transactions ? 1 : 0,
            'has_win_loss_history' => $has_win_loss_history ? 1 : 0,
            'is_alert' => $is_alert ? 1 : 0,
            'is_rate_middleman' => $is_rate_middleman ? 1 : 0
        ];
    }

    // 去重：按 account_id + currency 组合去重（防止重复）
    $seen_combos = [];
    $deduplicated_results = [];
    foreach ($results as $row) {
        $combo_key = $row['account_db_id'] . '_' . $row['currency'];
        if (!isset($seen_combos[$combo_key])) {
            $seen_combos[$combo_key] = true;
            $deduplicated_results[] = $row;
        }
    }
    $results = $deduplicated_results;

    // 第一笔 Domain List Fee：以客户公司（如 LGA）展示在 Transaction Payment。
    // 当分类仅选择 PROFIT 时，不追加 Domain 虚拟来源行，避免筛选结果混入非 PROFIT 行。
    $isProfitOnlyCategory = (count($category_filters) === 1 && strtoupper((string) $category_filters[0]) === 'PROFIT');
    if (!$isProfitOnlyCategory) {
        searchApiAppendDomainListFeeVirtualRows(
            $pdo,
            $results,
            $company_id,
            $date_from_db,
            $date_to_db,
            $filter_currency_codes,
            $currency_id_map
        );
    }
    // 无论分类如何，都要执行池账号净额校正（List Fee - Commission），
    // 否则 PROFIT only 会显示毛额，与 Payment History 的净额口径不一致。
    searchApiApplyDomainSourceCompanyRows(
        $pdo,
        $results,
        $company_id,
        $date_from_db,
        $date_to_db,
        $filter_currency_codes,
        $currency_id_map
    );
    // Domain 净利润行已停用：最终利润由 Share/Commission 实际分配结果体现。
    // 按 currency 和 account_id 排序
    usort($results, function ($a, $b) {
        if ($a['currency'] !== $b['currency']) {
            return strcmp($a['currency'], $b['currency']);
        }
        return strcmp($a['account_id'], $b['account_id']);
    });

    // 分离左右表格（正数 vs 负数）
    $left_table = array_filter($results, function ($row) {
        return $row['balance'] >= 0;
    });

    $right_table = array_filter($results, function ($row) {
        return $row['balance'] < 0;
    });

    // 重新索引数组
    $left_table = array_values($left_table);
    $right_table = array_values($right_table);

    // 计算总和
    $left_totals = calculateTotals($left_table);
    $right_totals = calculateTotals($right_table);
    $summary_totals = [
        'bf' => $left_totals['bf'] + $right_totals['bf'],
        'win_loss' => $left_totals['win_loss'] + $right_totals['win_loss'],
        'cr_dr' => $left_totals['cr_dr'] + $right_totals['cr_dr'],
        'balance' => $left_totals['balance'] + $right_totals['balance']
    ];

    // 返回结果（含 active_currency_codes：Edit Account 里勾选的货币，Show 0 balance 时只显示这些）
    $payload = [
        'success' => true,
        'data' => [
            'left_table' => $left_table,
            'right_table' => $right_table,
            'totals' => [
                'left' => $left_totals,
                'right' => $right_totals,
                'summary' => $summary_totals
            ],
            'active_currency_codes' => $active_currency_codes
        ]
    ];
    $json = json_encode($payload);
    if (!empty($cache_file) && $json !== false) {
        @file_put_contents($cache_file, $json, LOCK_EX);
    }
    echo $json;

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '数据库错误: ' . $e->getMessage(),
        'data' => null,
        'error' => '数据库错误: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

// ==================== 辅助函数 ====================

/**
 * 计算 B/F (Balance Forward)
 * B/F = 起始日期之前的所有累计余额
 * 公式：B/F = Data Capture + Win/Loss + Cr/Dr (起始日期之前)
 */
function calculateBF($pdo, $account_id, $date_from, $company_id)
{
    $bf = 0;

    // 1. 计算起始日期之前所有 data_capture 的 processed_amount
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dc.capture_date < ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $date_from]);
    $bf += $stmt->fetchColumn();

    // 2. 计算起始日期之前所有 Cr/Dr（包括 WIN/LOSE/RATE/PAYMENT/RECEIVE/CONTRA/CLAIM，作为 To Account）
    $sql = "SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -amount
                    WHEN transaction_type = 'RATE' THEN amount
                    WHEN transaction_type = 'CONTRA' THEN -amount
                    WHEN transaction_type = 'CLEAR' THEN -amount
                    WHEN transaction_type = 'PAYMENT' THEN -amount
                    WHEN transaction_type = 'WIN' THEN amount
                    WHEN transaction_type = 'LOSE' THEN -amount
                    ELSE 0
                END), 0) as cr_dr
            FROM transactions
            WHERE company_id = ?
              AND account_id = ?
              AND transaction_date < ?
              AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'RATE', 'WIN', 'LOSE')
              AND (
                  -- 对于 RATE 类型，允许 from_account_id 为 NULL（手续费记录）
                  (transaction_type = 'RATE')
                  OR
                  -- 对于其他类型，from_account_id 可以为 NULL（WIN/LOSE）或不为 NULL
                  (transaction_type != 'RATE')
              )" . contraApprovedWhere($pdo, '');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $account_id, $date_from]);
    $bf += $stmt->fetchColumn();

    // 3. 计算起始日期之前所有 Cr/Dr（作为 From Account）
    // 注意：RATE 类型的 from_account_id 可能为 NULL（手续费记录），这些记录不会在这里被计算
    $sql = "SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type = 'CONTRA' THEN amount
                    WHEN transaction_type = 'CLEAR' THEN amount
                    WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'RATE') THEN amount
                    ELSE 0
                END), 0) as cr_dr
            FROM transactions
            WHERE company_id = ?
              AND from_account_id = ?
              AND transaction_date < ?
              AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'RATE')"
        . contraApprovedWhere($pdo, '');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $account_id, $date_from]);
    $bf += $stmt->fetchColumn(); // 改为加号

    return $bf;
}

/**
 * 计算 Win/Loss
 * Win/Loss = 日期范围内的 Data Capture + WIN/LOSE 交易
 */
function calculateWinLoss($pdo, $account_id, $date_from, $date_to, $company_id)
{
    $win_loss = 0;

    // 只计算日期范围内的 Data Capture
    // WIN/LOSE/RATE 交易已移到 Cr/Dr 中计算
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dc.capture_date BETWEEN ? AND ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $date_from, $date_to]);
    $win_loss += $stmt->fetchColumn();

    return $win_loss;
}

/**
 * 计算 Cr/Dr
 * Cr/Dr = 日期范围内的 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 交易
 */
function calculateCrDr($pdo, $account_id, $date_from, $date_to)
{
    $cr_dr = 0;

    // 作为 To Account - 包括 WIN/LOSE/RATE/PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM
    $sql = "SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -amount
                    WHEN transaction_type = 'RATE' THEN amount
                    WHEN transaction_type = 'CONTRA' THEN -amount
                    WHEN transaction_type = 'CLEAR' THEN -amount
                    WHEN transaction_type = 'PAYMENT' THEN -amount
                    WHEN transaction_type = 'WIN' THEN amount
                    WHEN transaction_type = 'LOSE' THEN -amount
                    ELSE 0
                END), 0) as cr_dr
            FROM transactions
            WHERE account_id = ?
              AND transaction_date BETWEEN ? AND ?
              AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE', 'WIN', 'LOSE')
              AND (
                  -- 对于 RATE 类型，允许 from_account_id 为 NULL（手续费记录）
                  (transaction_type = 'RATE')
                  OR
                  -- 对于其他类型，from_account_id 可以为 NULL（WIN/LOSE）或不为 NULL
                  (transaction_type != 'RATE')
              )" . contraApprovedWhere($pdo, '');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$account_id, $date_from, $date_to]);
    $cr_dr += $stmt->fetchColumn();

    // 作为 From Account
    // 注意：RATE 类型的 from_account_id 可能为 NULL（手续费记录），这些记录不会在这里被计算
    $sql = "SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type = 'CONTRA' THEN amount
                    WHEN transaction_type = 'RATE' THEN -amount
                    WHEN transaction_type = 'CLEAR' THEN amount
                    WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN amount
                    ELSE 0
                END), 0) as cr_dr
            FROM transactions
            WHERE from_account_id = ?
              AND transaction_date BETWEEN ? AND ?
              AND transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE')"
        . contraApprovedWhere($pdo, '');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$account_id, $date_from, $date_to]);
    $cr_dr += $stmt->fetchColumn();

    return $cr_dr;
}

/**
 * 计算表格总和
 */
function calculateTotals($data)
{
    $totals = ['bf' => 0, 'win_loss' => 0, 'cr_dr' => 0, 'balance' => 0];

    foreach ($data as $row) {
        $totals['bf'] += $row['bf'];
        $totals['win_loss'] += $row['win_loss'];
        $totals['cr_dr'] += $row['cr_dr'];
        $totals['balance'] += $row['balance'];
    }

    // IMPORTANT: Keep raw values (not rounded) for accurate calculations
    // Frontend will round to 2 decimal places for display
    // 重要：保持原始值（不四舍五入）以确保计算精度
    // 前端会在显示时四舍五入到2位小数
    // Note: Totals are calculated from already-rounded row values in the array,
    // but we keep them as-is to maintain precision for display formatting
    // 注意：总计是从数组中已四舍五入的行值计算的，但我们保持原样以保持显示格式化的精度

    return $totals;
}

/**
 * 按 Currency 计算 B/F (Balance Forward)
 * B/F = 起始日期之前的所有累计余额（按 currency 过滤）
 */
function calculateBFByCurrency($pdo, $account_id, $currency_id, $date_from, $company_id, $account_code = '', &$bulk = null)
{
    if ($bulk !== null) {
        $bf = 0;
        $acc_str = trim((string) $account_id);
        $code_str = trim((string) $account_code);

        $bf += $bulk['dcd'][$acc_str][$currency_id]['bf'] ?? 0;
        if ($code_str !== '' && $code_str !== $acc_str) {
            $bf += $bulk['dcd'][$code_str][$currency_id]['bf'] ?? 0;
        }

        $bf += $bulk['txn_crdr_to'][$account_id][$currency_id]['bf'] ?? 0;
        $bf += $bulk['txn_crdr_from'][$account_id][$currency_id]['bf'] ?? 0;
        $bf += $bulk['entry'][$account_id][$currency_id]['bf'] ?? 0;

        $txn_wl = $bulk['txn_win_lose'][$account_id][$currency_id] ?? ['bf' => 0, 'wl' => 0];
        $bf += $txn_wl['bf'];

        // Check fallback for currency_id IS NULL in WIN/LOSE transactions
        $txn_wl_null = $bulk['txn_win_lose'][$account_id][0] ?? null;
        if ($txn_wl_null !== null) {
            // Only aggregate if this currency exists in DCD for this account
            if (isset($bulk['dcd'][$acc_str][$currency_id]) || ($code_str !== '' && isset($bulk['dcd'][$code_str][$currency_id]))) {
                $bf += $txn_wl_null['bf'];
            }
        }

        return $bf;
    }

    $bf = 0;

    $has_transaction_currency = searchApiTxnHasCurrencyId($pdo);

    // 与 history_api 一致：Bank WIN/LOSE 仅 partial_first_month 按 day_start 归属；day_end_tail/monthly 使用 transaction_date
    $has_source_bank_process_id = searchApiHasSourceBankProcessId($pdo); // static 缓存，跨函数共享
    $has_source_bank_process_period_type = searchApiHasSourceBankProcessPeriodType($pdo); // static 缓存
    $wlJoinSql = '';
    $wlDateExpr = "DATE(t.transaction_date)";
    $wlFutureGuard = '';
    if ($has_source_bank_process_id) {
        $wlJoinSql = " LEFT JOIN bank_process bp ON t.source_bank_process_id = bp.id";
        $bpDayStartSql = "CASE
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' THEN DATE(bp.day_start)
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d/%m/%Y')
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d-%m-%Y')
            ELSE NULL
        END";
        if ($has_source_bank_process_period_type) {
            // period_type 存在时也统一按 transaction_date 归属，避免补单日期被回绑到原始 day_start。
            $wlDateExpr = "DATE(t.transaction_date)";
            $wlFutureGuard = '';
        } else {
            // 缺少 period_type 字段时，避免把所有 Bank WIN/LOSE 回绑到旧 day_start。
            $wlDateExpr = "DATE(t.transaction_date)";
            $wlFutureGuard = '';
        }
    }

    // 1. 计算起始日期之前所有 data_capture（按 currency 过滤）
    // 必须与 calculateWinLossByCurrency 一致：SUM(ROUND(processed_amount,2))，否则「当日 Balance」与「次日 B/F」会因舍入顺序差 0.01
    $sql = "SELECT COALESCE(SUM(ROUND(dcd.processed_amount, 2)), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND (
                  CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
                  OR (? <> '' AND TRIM(COALESCE(dcd.account_id, '')) = TRIM(?))
              )
              AND dcd.currency_id = ?
              AND dc.capture_date < ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, (string) $account_code, (string) $account_code, $currency_id, $date_from]);
    $bf += $stmt->fetchColumn();

    // 2. 起始日期之前：Win/Loss 来自 WIN/LOSE（含 PROFIT）+ Cr/Dr 来自 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM（作为 To Account）；RATE 单独用 transaction_entry 处理
    if ($has_transaction_currency) {
        // 2a. WIN/LOSE（含 PROFIT）：Bank Process 保持 WIN 正 LOSE 负；手动 PROFIT 与 PAYMENT 一致 TO 负 FROM 正
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN ROUND(t.amount, 2)
                  ELSE 0
                END), 0) as total
                FROM transactions t $wlJoinSql
                WHERE t.company_id = ?
                  AND CAST(t.account_id AS CHAR) = CAST(? AS CHAR)
                  AND $wlDateExpr < ?
                  AND t.transaction_type IN ('WIN', 'LOSE')
                  AND (
                      (t.currency_id = ?)
                      OR (t.currency_id IS NULL AND EXISTS (
                          SELECT 1 FROM data_capture_details dcd
                          JOIN data_captures dc ON dcd.capture_id = dc.id
                          WHERE dcd.company_id = ? AND dc.company_id = ?
                            AND CAST(dcd.account_id AS CHAR) = CAST(t.account_id AS CHAR)
                            AND dcd.currency_id = ?
                      ))
                  )" . contraApprovedWhere($pdo, 't') . $wlFutureGuard;
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $currency_id, $company_id, $company_id, $currency_id]);
        $bf += $stmt->fetchColumn();

        // 2b. PAYMENT/RECEIVE/CONTRA/CLAIM 作为 To Account 计入 B/F 的 Cr/Dr 部分
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        -- Domain Share Commission：收款方显示正数
                        WHEN transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE t.company_id = ?
                  AND CAST(t.account_id AS CHAR) = CAST(? AS CHAR)
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND t.currency_id = ?"
            . contraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $currency_id]);
        $bf += $stmt->fetchColumn();
    } else {
        // WIN/LOSE 计入 B/F（Bank Process 保持原符号；手动 PROFIT TO 负 FROM 正）
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -ROUND(t.amount, 2)
                  WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN ROUND(t.amount, 2)
                  ELSE 0
                END), 0) as total
                FROM transactions t $wlJoinSql
                WHERE t.company_id = ? AND t.account_id = ? AND $wlDateExpr < ?
                  AND t.transaction_type IN ('WIN', 'LOSE')
                  AND EXISTS (
                      SELECT 1 FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ? AND dc.company_id = ? AND dcd.account_id = t.account_id AND dcd.currency_id = ?
                  )" . contraApprovedWhere($pdo, 't') . $wlFutureGuard;
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $company_id, $company_id, $currency_id]);
        $bf += $stmt->fetchColumn();

        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.account_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.account_id
                        AND dcd.currency_id = ?
                  )"
            . contraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $company_id, $company_id, $currency_id]);
        $bf += $stmt->fetchColumn();
    }

    // 3. 计算起始日期之前所有 Cr/Dr（作为 From Account，按 currency 过滤；RATE 单独用 transaction_entry 处理）
    if ($has_transaction_currency) {
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.from_account_id = ?
                  AND t.currency_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')"
            . " AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_SHARE_COMMISSION|%'"
            . contraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $currency_id, $date_from]);
    } else {
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.from_account_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.from_account_id
                        AND dcd.currency_id = ?
                  )"
            . contraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $company_id, $company_id, $currency_id]);
    }
    $bf += $stmt->fetchColumn();

    // 4. 追加起始日期之前的所有 RATE 分录（统一从 transaction_entry 计算）
    $rateStmt = $pdo->prepare("
        SELECT COALESCE(SUM(CASE
          WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -ROUND(e.amount, 2)
          WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -ROUND(e.amount, 2)
          WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN ROUND(e.amount, 2)
          ELSE ROUND(e.amount, 2)
        END), 0) AS total
        FROM transaction_entry e
        JOIN transactions h ON e.header_id = h.id
        WHERE h.company_id = ?
          AND e.company_id = ?
          AND h.transaction_type = 'RATE'
          AND e.account_id = ?
          AND e.currency_id = ?
          AND h.transaction_date < ?
    ");
    $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from]);
    $bf += $rateStmt->fetchColumn();

    return $bf;
}

/**
 * 按 Currency 计算 Win/Loss
 * Win/Loss = Data Capture + Bank Process 的 WIN/LOSE（description 以 "Process: " 开头）
 *          + 手动 PROFIT（WIN/LOSE 且 description 不以 Process: 开头）
 *          + RATE Middle-Man 手续费（RATE_MIDDLEMAN）
 *
 * @return array{win_loss: float, has_rate_middleman: bool, has_win_loss_transactions: bool, has_win_loss_history: bool}
 */
function calculateWinLossByCurrency($pdo, $account_id, $currency_id, $date_from, $date_to, $company_id, $account_code = '', &$bulk = null)
{
    if ($bulk !== null) {
        $win_loss = 0;
        $wl_row_count = 0;
        $wl_up_to_count = 0;
        $acc_str = trim((string) $account_id);
        $code_str = trim((string) $account_code);

        $win_loss += $bulk['dcd'][$acc_str][$currency_id]['wl'] ?? 0;
        $wl_row_count += (int) ($bulk['dcd'][$acc_str][$currency_id]['wl_count'] ?? 0);
        $wl_up_to_count += (int) ($bulk['dcd'][$acc_str][$currency_id]['up_to_count'] ?? 0);
        if ($code_str !== '' && $code_str !== $acc_str) {
            $win_loss += $bulk['dcd'][$code_str][$currency_id]['wl'] ?? 0;
            $wl_row_count += (int) ($bulk['dcd'][$code_str][$currency_id]['wl_count'] ?? 0);
            $wl_up_to_count += (int) ($bulk['dcd'][$code_str][$currency_id]['up_to_count'] ?? 0);
        }

        $txn_wl = $bulk['txn_win_lose'][$account_id][$currency_id] ?? ['bf' => 0, 'wl' => 0];
        $win_loss += $txn_wl['wl'];
        $wl_row_count += (int) ($txn_wl['wl_count'] ?? 0);
        $wl_up_to_count += (int) ($txn_wl['up_to_count'] ?? 0);

        // Handle fallback for currency_id IS NULL in transactions (fallback to DCD check)
        $txn_wl_null = $bulk['txn_win_lose'][$account_id][0] ?? null;
        if ($txn_wl_null !== null) {
            // Only aggregate if this currency_id exists in DCD for this account
            if (isset($bulk['dcd'][$acc_str][$currency_id]) || ($code_str !== '' && isset($bulk['dcd'][$code_str][$currency_id]))) {
                $win_loss += $txn_wl_null['wl'];
                $wl_row_count += (int) ($txn_wl_null['wl_count'] ?? 0);
                $wl_up_to_count += (int) ($txn_wl_null['up_to_count'] ?? 0);
            }
        }

        $win_loss += $bulk['entry'][$account_id][$currency_id]['wl_mm'] ?? 0;

        $has_rate_mm = ($bulk['entry'][$account_id][$currency_id]['wl_mm_count'] ?? 0) > 0;
        $has_rate_mm_up_to = ($bulk['entry'][$account_id][$currency_id]['wl_mm_up_to_count'] ?? 0) > 0;
        $has_win_loss_transactions = $wl_row_count > 0 || $has_rate_mm;
        $has_win_loss_history = $wl_up_to_count > 0 || $has_rate_mm_up_to;
        return [
            'win_loss' => $win_loss,
            'has_rate_middleman' => $has_rate_mm,
            'has_win_loss_transactions' => $has_win_loss_transactions,
            'has_win_loss_history' => $has_win_loss_history,
        ];
    }

    $win_loss = 0;
    $has_rate_middleman = false;
    $wl_row_count = 0;

    // 与 history_api 一致：Bank WIN/LOSE 仅 partial_first_month 按 day_start 归属；day_end_tail/monthly 使用 transaction_date
    $has_source_bank_process_id = searchApiHasSourceBankProcessId($pdo); // static 缓存，跨函数共享
    $has_source_bank_process_period_type = searchApiHasSourceBankProcessPeriodType($pdo); // static 缓存
    $wlJoinSql = '';
    $wlDateExpr = "DATE(t.transaction_date)";
    $wlFutureGuard = '';
    if ($has_source_bank_process_id) {
        $wlJoinSql = " LEFT JOIN bank_process bp ON t.source_bank_process_id = bp.id";
        $bpDayStartSql = "CASE
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' THEN DATE(bp.day_start)
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d/%m/%Y')
            WHEN CAST(bp.day_start AS CHAR) REGEXP '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN STR_TO_DATE(bp.day_start, '%d-%m-%Y')
            ELSE NULL
        END";
        if ($has_source_bank_process_period_type) {
            // period_type 存在时也统一按 transaction_date 归属，避免补单日期被回绑到原始 day_start。
            $wlDateExpr = "DATE(t.transaction_date)";
            $wlFutureGuard = '';
        } else {
            // 缺少 period_type 字段时，避免把所有 Bank WIN/LOSE 回绑到旧 day_start。
            $wlDateExpr = "DATE(t.transaction_date)";
            $wlFutureGuard = '';
        }
    }

    // 1. 日期范围内的 Data Capture（按 currency 过滤）
    $sql = "SELECT COALESCE(SUM(ROUND(dcd.processed_amount, 2)), 0) as total, COUNT(*) AS cnt
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND (
                  CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
                  OR (? <> '' AND TRIM(COALESCE(dcd.account_id, '')) = TRIM(?))
              )
              AND dcd.currency_id = ?
              AND dc.capture_date BETWEEN ? AND ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, (string) $account_code, (string) $account_code, $currency_id, $date_from, $date_to]);
    $dcdRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'cnt' => 0];
    $win_loss += (float) ($dcdRow['total'] ?? 0);
    $wl_row_count += (int) ($dcdRow['cnt'] ?? 0);

    // 2. 所有 Bank Process 的 WIN/LOSE（Cost/Sell Price/Profit，Remaining days 与 1号/Monthly 均计入 Win/Loss）
    if (searchApiTxnHasCurrencyId($pdo)) {
        // 与 history_api 的事件口径一致：每条 transaction 金额先 round(2) 再求和
        $sql = "SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN ROUND(t.amount, 2)
                    WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -ROUND(t.amount, 2)
                    ELSE 0 END), 0) as total, COUNT(*) AS cnt
                FROM transactions t $wlJoinSql
                WHERE t.company_id = ? AND t.account_id = ? AND $wlDateExpr BETWEEN ? AND ?
                  AND t.currency_id = ? AND t.transaction_type IN ('WIN', 'LOSE')
                  AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %')"
            . $wlFutureGuard;
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $txnBankRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'cnt' => 0];
        $win_loss += (float) ($txnBankRow['total'] ?? 0);
        $wl_row_count += (int) ($txnBankRow['cnt'] ?? 0);

        // 3. 手动 PROFIT（WIN/LOSE 且 description 不以 Process: 开头）：Select To 显示负数、Select From 显示正数（WIN -> -amount, LOSE -> +amount）
        $sql = "SELECT COALESCE(SUM(CASE WHEN t.transaction_type = 'WIN' THEN -ROUND(t.amount, 2) WHEN t.transaction_type = 'LOSE' THEN ROUND(t.amount, 2) ELSE 0 END), 0) as total, COUNT(*) AS cnt
                FROM transactions t $wlJoinSql
                WHERE t.company_id = ? AND t.account_id = ? AND $wlDateExpr BETWEEN ? AND ?
                  AND t.currency_id = ? AND t.transaction_type IN ('WIN', 'LOSE')
                  AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL)"
            . $wlFutureGuard;
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $currency_id]);
        $txnManualRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'cnt' => 0];
        $win_loss += (float) ($txnManualRow['total'] ?? 0);
        $wl_row_count += (int) ($txnManualRow['cnt'] ?? 0);

        // 4. RATE Middle-Man：手续费应显示在 Win/Loss，而不是 Cr/Dr（一次查询同时得到金额与是否存在）
        $rateStmt = $pdo->prepare("
            SELECT COALESCE(SUM(ROUND(e.amount, 2)), 0) AS total, COUNT(*) AS cnt
            FROM transaction_entry e
            JOIN transactions h ON e.header_id = h.id
            WHERE h.company_id = ?
              AND e.company_id = ?
              AND h.transaction_type = 'RATE'
              AND e.entry_type = 'RATE_MIDDLEMAN'
              AND e.account_id = ?
              AND e.currency_id = ?
              AND h.transaction_date BETWEEN ? AND ?
        ");
        $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
        $mmRow = $rateStmt->fetch(PDO::FETCH_ASSOC);
        $win_loss += (float) ($mmRow['total'] ?? 0);
        $has_rate_middleman = ((int) ($mmRow['cnt'] ?? 0)) > 0;
    }

    return [
        'win_loss' => $win_loss,
        'has_rate_middleman' => $has_rate_middleman,
        'has_win_loss_transactions' => ($wl_row_count > 0 || $has_rate_middleman),
        'has_win_loss_history' => ($wl_row_count > 0 || $has_rate_middleman),
    ];
}

/**
 * 按 Currency 计算 Cr/Dr
 * 返回值包含 sum（value）以及该期间是否存在 PAYMENT/RECEIVE/CONTRA/CLEAR 交易
 *
 * 说明：
 * - 为了保证对称性，这里使用“单条 SQL + CASE WHEN”的方式，
 *   同时处理 To Account（account_id）和 From Account（from_account_id）。
 * - 有 currency_id 时，直接按 company_id + currency_id 过滤；
 * - 没有 currency_id 时，退回旧逻辑，依赖 data_capture_details 过滤 currency。
 */

/**
 * 本期（date_from ~ date_to）内该 account_id + currency_id 是否有 RATE_MIDDLEMAN 分录
 * 用于前端识别 Middle-Man 行并保持其显示在左侧
 */
function hasRateMiddlemanInPeriod(PDO $pdo, $account_id, $currency_id, $date_from, $date_to, $company_id, &$bulk = null): bool
{
    if ($bulk !== null) {
        return ($bulk['entry'][$account_id][$currency_id]['wl_mm_count'] ?? 0) > 0;
    }

    $stmt = $pdo->prepare("
        SELECT 1
        FROM transaction_entry e
        JOIN transactions h ON e.header_id = h.id
        WHERE h.company_id = ?
          AND e.company_id = ?
          AND h.transaction_type = 'RATE'
          AND e.entry_type = 'RATE_MIDDLEMAN'
          AND e.account_id = ?
          AND e.currency_id = ?
          AND h.transaction_date BETWEEN ? AND ?
        LIMIT 1
    ");
    $stmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
    return $stmt->fetchColumn() !== false;
}

function calculateCrDrByCurrency($pdo, $account_id, $currency_id, $date_from, $date_to, $company_id, &$bulk = null)
{
    if ($bulk !== null) {
        $cr_dr = 0;
        // has_transactions 只统计真实的 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 笔数。
        // 修复：不计入 transaction_entry（RATE 分录）的 cr_dr_count，
        // 因为那些是 RATE 汇率交易，不是 Payment，会污染 Show Payment Only 过滤。
        $payment_txn_count = 0;

        $to = $bulk['txn_crdr_to'][$account_id][$currency_id] ?? ['cr_dr' => 0, 'count' => 0];
        $cr_dr += $to['cr_dr'];
        $payment_txn_count += $to['count']; // 纯 PAYMENT 类型计数

        $from = $bulk['txn_crdr_from'][$account_id][$currency_id] ?? ['cr_dr' => 0, 'count' => 0];
        $cr_dr += $from['cr_dr'];
        $payment_txn_count += $from['count']; // 纯 PAYMENT 类型计数

        $entry = $bulk['entry'][$account_id][$currency_id] ?? ['cr_dr' => 0, 'cr_dr_count' => 0];
        $cr_dr += $entry['cr_dr']; // RATE 分录金额仍纳入 cr_dr 计算（影响 Cr/Dr 列显示）
        // 注意：$entry['cr_dr_count'] 故意不加入 $payment_txn_count，
        // 因为它统计的是非 RATE_MIDDLEMAN 的 RATE 分录（如 RATE_FIRST_FROM/TO），
        // 这些不属于 PAYMENT 类型，不应使 has_transactions 为 true。

        return [
            'value' => $cr_dr,
            'has_transactions' => $payment_txn_count > 0 || abs($cr_dr) > 0.01,
        ];
    }

    $cr_dr = 0;
    $transaction_count = 0;

    $has_currency_id = searchApiTxnHasCurrencyId($pdo);

    if ($has_currency_id) {
        // Cr/Dr = 仅 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM；WIN/LOSE（含 PROFIT）计入 Win/Loss 列
        $sql = "
            SELECT
                COALESCE(SUM(
                    CASE
                        -- 作为 To Account（收到 / 支付）；CONTRA 时 TO 显示负数
                        WHEN t.account_id = :acc_id AND t.transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        -- Domain Share Commission：收款方显示正数
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN ROUND(t.amount, 2)
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN t.account_id = :acc_id AND t.transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)

                        -- 作为 From Account（支付 / 收到）；CONTRA 时 FROM 显示正数
                        -- Domain Share Commission：不计入 from_account（避免重复显示池子/右表）
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' THEN 0
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND t.sms LIKE '[DOMAIN_NET_PROFIT|%' THEN 0
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN -ROUND(t.amount, 2)
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'PAYMENT' THEN ROUND(t.amount, 2)
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN t.from_account_id = :acc_id AND t.transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN t.from_account_id = :acc_id AND t.transaction_type IN ('RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)

                        ELSE 0
                    END
                ), 0) AS cr_dr,
                COUNT(*) AS txn_count
            FROM transactions t
            WHERE t.company_id = :company_id
              AND t.transaction_date BETWEEN :date_from AND :date_to
              AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
              AND t.currency_id = :currency_id
              AND (t.account_id = :acc_id OR t.from_account_id = :acc_id)
              " . (hasContraApprovalColumns($pdo) ? " AND (t.transaction_type <> 'CONTRA' OR t.approval_status = 'APPROVED')" : "") . "
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':company_id' => $company_id,
            ':date_from' => $date_from,
            ':date_to' => $date_to,
            ':currency_id' => $currency_id,
            ':acc_id' => $account_id,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr += (float) ($row['cr_dr'] ?? 0);
        $transaction_count += (int) ($row['txn_count'] ?? 0);

    } else {
        // 旧环境（没有 currency_id 字段）：Cr/Dr 仅 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM；WIN/LOSE 计入 Win/Loss
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN -ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %') THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'PAYMENT' THEN -ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr,
                    COUNT(*) as txn_count
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.account_id = ?
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.account_id
                        AND dcd.currency_id = ?
                  )"
            . contraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $company_id, $company_id, $currency_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr += (float) ($row['cr_dr'] ?? 0);
        $transaction_count += (int) ($row['txn_count'] ?? 0);

        // From Account（旧逻辑）；CONTRA 时 FROM 显示正数
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'PAYMENT' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CLEAR' THEN ROUND(t.amount, 2)
                        WHEN transaction_type = 'CONTRA' THEN ROUND(t.amount, 2)
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN ROUND(t.amount, 2)
                        ELSE 0
                    END), 0) as cr_dr,
                    COUNT(*) as txn_count
                FROM transactions t
                WHERE t.company_id = ?
                  AND t.from_account_id = ?
                  AND t.transaction_date BETWEEN ? AND ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.from_account_id
                        AND dcd.currency_id = ?
                  )"
            . contraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$company_id, $account_id, $date_from, $date_to, $company_id, $company_id, $currency_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $cr_dr += (float) ($row['cr_dr'] ?? 0);
        $transaction_count += (int) ($row['txn_count'] ?? 0);
    }

    // 3) 追加本期 RATE 分录（统一从 transaction_entry 计算）
    // RATE_MIDDLEMAN 已改归类到 Win/Loss，这里只保留其余 RATE 分录在 Cr/Dr
    $rateStmt = $pdo->prepare("
        SELECT 
            COALESCE(SUM(CASE
              WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -ROUND(e.amount, 2)
              WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -ROUND(e.amount, 2)
              ELSE ROUND(e.amount, 2)
            END), 0) AS cr_dr,
            COUNT(CASE WHEN e.entry_type <> 'RATE_MIDDLEMAN' THEN 1 END) AS txn_count
        FROM transaction_entry e
        JOIN transactions h ON e.header_id = h.id
        WHERE h.company_id = ?
          AND e.company_id = ?
          AND h.transaction_type = 'RATE'
          AND e.account_id = ?
          AND e.currency_id = ?
          AND h.transaction_date BETWEEN ? AND ?
          AND e.entry_type <> 'RATE_MIDDLEMAN'
    ");
    $rateStmt->execute([$company_id, $company_id, $account_id, $currency_id, $date_from, $date_to]);
    $rateRow = $rateStmt->fetch(PDO::FETCH_ASSOC);
    $cr_dr += (float) ($rateRow['cr_dr'] ?? 0);
    $transaction_count += (int) ($rateRow['txn_count'] ?? 0);

    return [
        'value' => $cr_dr,
        'has_transactions' => $transaction_count > 0 || abs($cr_dr) > 0.01,
    ];
}
?>