<?php
/**
 * Process Post to Transaction API
 * 将选中的 Bank Process 的 Buy Price / Sell Price / Profit 分别记入 Supplier / Customer / Company 账户（Transaction 页面显示）
 * 支持 period_types[]：partial_first_month = 首月按比例（day_start 到月底），monthly = 按 frequency=monthly 的「对日对月」服务区间比例（与 Inbox 一致），day_end_tail = day_end 超出合同自然结束日的尾段按比例，
 * resend_consolidated_range = 仅 Resend 弹窗同时填 day_start+day_end 时：按自然月切段 [day_start, day_end] 合并为一笔（与 Inbox 一致）。
 * 仅处理 status = 'active' 的 process。
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../bankprocess_maintenance/maintenance_accounting_resend_lib.php';
require_once __DIR__ . '/contract_billing_addon.php';

/** 统一 JSON 响应 */
function jsonResponse(bool $success, string $message = '', $data = null): void
{
    $payload = ['success' => $success, 'message' => $message];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload);
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

function getBankProcessIssueFlagSql(string $tableAlias, bool $hasIssueFlagColumn, bool $hasFlagColumn): string
{
    if ($hasIssueFlagColumn && $hasFlagColumn) {
        return "COALESCE(NULLIF($tableAlias.`flag`, ''), NULLIF($tableAlias.`issue_flag`, ''))";
    }
    if ($hasFlagColumn)
        return "$tableAlias.`flag`";
    if ($hasIssueFlagColumn)
        return "$tableAlias.`issue_flag`";
    return "NULL";
}

function normalizedBankIssueFlagSql(string $columnRef): string
{
    return "LOWER(REPLACE(REPLACE(TRIM(COALESCE($columnRef, '')), '-', '_'), ' ', '_'))";
}

function insertTransactionRow(PDO $pdo, array $data): int
{
    $columns = array_keys($data);
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $sql = "INSERT INTO transactions (`" . implode('`,`', $columns) . "`) VALUES ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($data));
    return (int) $pdo->lastInsertId();
}

/**
 * 兼容旧库里的 transactions 金额触发器（要求 amount > 0）。
 * 业务需要允许 0.00（如 Profit 被 Share 抵消），仅禁止负数。
 */
function ensureTransactionsAllowZeroAmount(PDO $pdo): void
{
    $triggers = $pdo->query("SHOW TRIGGERS WHERE `Table` = 'transactions'")->fetchAll(PDO::FETCH_ASSOC);
    $legacyTriggerNames = [];

    foreach ($triggers as $tr) {
        $stmt = strtolower((string) ($tr['Statement'] ?? ''));
        $isAmountGuard = (
            strpos($stmt, 'new.amount') !== false
            && strpos($stmt, '45000') !== false
            && (
                strpos($stmt, '金额必须大于 0') !== false
                || strpos($stmt, '金额必须大于0') !== false
                || strpos($stmt, 'amount must be greater than 0') !== false
                || strpos($stmt, '<= 0') !== false
            )
        );
        if ($isAmountGuard && !empty($tr['Trigger'])) {
            $legacyTriggerNames[] = (string) $tr['Trigger'];
        }
    }

    foreach ($legacyTriggerNames as $name) {
        $safeName = str_replace('`', '``', $name);
        $pdo->exec("DROP TRIGGER IF EXISTS `$safeName`");
    }

    // 标准化为“金额不能小于 0”（允许 0.00）
    $pdo->exec("DROP TRIGGER IF EXISTS `tr_transactions_amount_guard_bi`");
    $pdo->exec("DROP TRIGGER IF EXISTS `tr_transactions_amount_guard_bu`");

    $pdo->exec("
        CREATE TRIGGER `tr_transactions_amount_guard_bi`
        BEFORE INSERT ON `transactions`
        FOR EACH ROW
        BEGIN
            IF NEW.amount < 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '金额不能小于 0';
            END IF;
        END
    ");

    $pdo->exec("
        CREATE TRIGGER `tr_transactions_amount_guard_bu`
        BEFORE UPDATE ON `transactions`
        FOR EACH ROW
        BEGIN
            IF NEW.amount < 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '金额不能小于 0';
            END IF;
        END
    ");
}

/**
 * 清理 Transaction List 搜索缓存，确保 Process 入账（含 Resend）后列表立即同步。
 */
function clearTransactionSearchCache(): void
{
    $cacheDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'count168_tx_search';
    if (!is_dir($cacheDir)) {
        return;
    }
    foreach (scandir($cacheDir) as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $fullPath = $cacheDir . DIRECTORY_SEPARATOR . $file;
        if (is_file($fullPath)) {
            @unlink($fullPath);
        }
    }
}

/** Pro-rated cost/price/profit for partial first month (day_start to end of that month) */
function partialFirstMonthAmounts(string $dayStart, float $cost, float $price, float $profit): array
{
    $ts = strtotime($dayStart);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $ratio = $daysRemaining / $daysInMonth;
    return [
        'cost' => round($cost * $ratio, 2),
        'price' => round($price * $ratio, 2),
        'profit' => round($profit * $ratio, 2),
    ];
}

/** Pro-rated amounts from $startYmd (inclusive) to end of that month (inclusive). */
function prorateToMonthEndFromStart(string $startYmd, float $cost, float $price, float $profit): array
{
    $ts = strtotime($startYmd);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysRemaining = max(0, $daysInMonth - $dayOfMonth + 1);
    $ratio = $daysRemaining / $daysInMonth;
    return [
        'cost' => round($cost * $ratio, 2),
        'price' => round($price * $ratio, 2),
        'profit' => round($profit * $ratio, 2),
    ];
}

function ymdFromNullableDateTime($raw, string $fallbackYmd): string
{
    if ($raw === null) {
        return $fallbackYmd;
    }
    $s = trim((string) $raw);
    if ($s === '') {
        return $fallbackYmd;
    }
    $ts = strtotime($s);
    return $ts === false ? $fallbackYmd : date('Y-m-d', $ts);
}

/**
 * bank_process.day_start 等：优先解析 d/m/Y、d-m-Y，避免 "06-04-2026" 被 strtotime 当成美式 m-d-Y。
 */
function bankProcessDateFieldToYmd($raw): ?string
{
    if ($raw === null) {
        return null;
    }
    $s = trim((string) $raw);
    if ($s === '') {
        return null;
    }
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
        $y = (int) $m[1];
        $mo = (int) $m[2];
        $d = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    if (preg_match('#^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$#', $s, $m)) {
        $d = (int) $m[1];
        $mo = (int) $m[2];
        $y = (int) $m[3];
        if ($mo >= 1 && $mo <= 12 && $d >= 1 && $d <= 31 && checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
    }
    $dateStr = str_replace('/', '-', $s);
    if (preg_match('/^\d{1,2}-\d{1,2}$/', $dateStr)) {
        $dateStr .= '-' . date('Y');
    }
    $ts = strtotime($dateStr);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

function maxYmd(string $a, string $b): string
{
    return ($a >= $b) ? $a : $b;
}

function getBillingTermMonthsFromContract(?string $contract): ?int
{
    if ($contract === null || trim($contract) === '') {
        return null;
    }
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) {
        // 1+N 在 active regular billing 仅计 1 个月；
        // 额外 N 个月仅在 manual_inactive 赔付逻辑中处理（见 getExtraMonthsFromContract / multiplier）。
        return 1;
    }
    if (preg_match('/^(\d+)\s*MONTHS?$/i', $c, $m)) {
        return max(1, (int) $m[1]);
    }
    return null;
}

function billingContractExclusiveEndYmd(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        return (new DateTimeImmutable($dayStartYmd))->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function billingContractExclusiveEndYmdFirstOfMonth(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
        if ((int) $start->format('j') === 1) {
            return $start->modify("+{$termMonths} months")->format('Y-m-d');
        }
        $firstAnchor = $start->modify('first day of next month');
        return $firstAnchor->modify('+' . ($termMonths - 1) . ' months')->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/** 与 process_accounting_inbox_api::inboxAnchorMonthCapAfterPartialFirst 一致 */
function txnAnchorMonthCapAfterPartialFirst(?string $contract, int $startDayOfMonth): ?int
{
    if ($startDayOfMonth === 1) {
        return null;
    }
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return null;
    }
    return max(0, $term - 1);
}

function contractExclusiveEndYmdForFrequency(string $startYmd, ?string $contract, string $frequency): ?string
{
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return null;
    }
    if ($frequency === 'monthly') {
        return billingContractExclusiveEndYmd($startYmd, $term);
    }
    return billingContractExclusiveEndYmdFirstOfMonth($startYmd, $term);
}

function prorateInclusiveDateRange(string $fromYmd, string $toYmd, float $cost, float $price, float $profit): array
{
    if ($fromYmd > $toYmd) {
        return ['cost' => 0.0, 'price' => 0.0, 'profit' => 0.0];
    }
    try {
        $cur = new DateTimeImmutable($fromYmd);
        $end = new DateTimeImmutable($toYmd);
    } catch (Throwable $e) {
        return ['cost' => 0.0, 'price' => 0.0, 'profit' => 0.0];
    }
    $tc = 0.0;
    $tp = 0.0;
    $tf = 0.0;
    while ($cur <= $end) {
        $dim = (int) $cur->format('t');
        $monthEnd = $cur->modify('last day of this month');
        $chunkEnd = $monthEnd <= $end ? $monthEnd : $end;
        $d0 = (int) $cur->format('j');
        $d1 = (int) $chunkEnd->format('j');
        $chunkDays = $d1 - $d0 + 1;
        if ($dim > 0 && $chunkDays > 0) {
            $ratio = $chunkDays / $dim;
            $tc += $cost * $ratio;
            $tp += $price * $ratio;
            $tf += $profit * $ratio;
        }
        $cur = $chunkEnd->modify('+1 day');
    }
    return [
        'cost' => round($tc, 2),
        'price' => round($tp, 2),
        'profit' => round($tf, 2),
    ];
}

/** 某月第 N 日（不超过该月最后一天） */
function calendarMonthDueYmd(int $year, int $month, int $dueDay): string
{
    $last = (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    $d = min(max(1, $dueDay), $last);
    return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

/**
 * Accounting Due 的 monthly 行：账单所属自然月的应付日（与 inbox 规则一致），用于 process_accounting_posted.posted_date；
 * Payment History 的 transaction_date 另用 day_start 锚定（见主循环 monthly 分支）。
 */
function monthlyDueYmdForBillingMonth(string $billingMonthYn, string $dayStartYmd, string $frequency): ?string
{
    if (!preg_match('/^(\d{4})-(\d{1,2})$/', trim($billingMonthYn), $m)) {
        return null;
    }
    $billY = (int) $m[1];
    $billMo = (int) $m[2];
    if ($billY < 1970 || $billMo < 1 || $billMo > 12) {
        return null;
    }
    $startTs = strtotime($dayStartYmd);
    if ($startTs === false) {
        return null;
    }
    $billYm = sprintf('%04d-%d', $billY, $billMo);
    if ($frequency === '1st_of_every_month') {
        return sprintf('%04d-%02d-01', $billY, $billMo);
    }
    $startDay = (int) date('j', $startTs);
    $dueYmd = calendarMonthDueYmd($billY, $billMo, $startDay);
    try {
        if ((new DateTimeImmutable($dayStartYmd))->format('Y-n') === $billYm) {
            $dueYmd = $dayStartYmd;
        }
    } catch (Throwable $e) {
        // keep $dueYmd
    }
    return $dueYmd;
}

/** 与 process_accounting_inbox_api 一致：某自然月是否已有 monthly / monthly_skipped */
function hasMonthlyPostedOrSkippedInCalendarMonthForTxn(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    try {
        $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND YEAR(posted_date) = ? AND MONTH(posted_date) = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '') LIMIT 1");
        $stmt->execute([$companyId, $processId, $year, $month]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 与 process_accounting_inbox_api 的 isWithinRecurringBillingWindow 一致 */
function isWithinRecurringBillingWindowForTxn(string $todayYmd, ?string $dayStartYmd, ?string $contract, ?string $dayEndYmd, ?string $frequency = null, bool $bypassPreStartGate = false, bool $ignoreContractEndForResendSingle = false): bool
{
    if ($dayStartYmd === null || $dayStartYmd === '' || strtotime($dayStartYmd) === false) {
        return true;
    }
    $start = date('Y-m-d', strtotime($dayStartYmd));
    if (!$bypassPreStartGate && $todayYmd < $start) {
        return false;
    }
    if ($ignoreContractEndForResendSingle) {
        return true;
    }

    $freq = ($frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
    $exclusiveFirstDayAfter = contractExclusiveEndYmdForFrequency($start, $contract, $freq);

    $contractLastInclusive = null;
    if ($exclusiveFirstDayAfter !== null) {
        try {
            $contractLastInclusive = (new DateTimeImmutable($exclusiveFirstDayAfter))->modify('-1 day')->format('Y-m-d');
        } catch (Throwable $e) {
            $contractLastInclusive = null;
        }
    }

    $dayEndInc = null;
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $dayEndInc = date('Y-m-d', strtotime($dayEndYmd));
    }

    if ($contractLastInclusive === null && $dayEndInc === null) {
        return true;
    }
    if ($contractLastInclusive !== null && $dayEndInc === null) {
        return $todayYmd <= $contractLastInclusive;
    }
    if ($contractLastInclusive === null) {
        return $todayYmd <= $dayEndInc;
    }
    if ($dayEndInc > $contractLastInclusive) {
        return $todayYmd <= $dayEndInc;
    }
    return $todayYmd <= min($contractLastInclusive, $dayEndInc);
}

/**
 * 未传 billing_month 时，按 Accounting Inbox 的 regular monthly 规则推断第一个未结清账单所属自然月（Y-n），
 * 使入账时的 billing_month 与 posted_date（应付日）一致；transaction_date 在 post API 中对 monthly 固定为 day_start。
 */
function inferOpenMonthlyBillingMonthYn(PDO $pdo, int $companyId, array $r, string $today): ?string
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return null;
        }
    } catch (Throwable $e) {
        return null;
    }

    $frequency = $r['day_start_frequency'] ?? '1st_of_every_month';
    $dayStart = $r['day_start'] ?? null;
    $startDate = !empty($dayStart) ? bankProcessDateFieldToYmd($dayStart) : null;
    if ($startDate === null) {
        return null;
    }
    $startTs = strtotime($startDate);
    if ($startTs === false) {
        return null;
    }
    $contract = $r['contract'] ?? null;
    $dayEnd = $r['day_end'] ?? null;
    $processId = (int) ($r['id'] ?? 0);
    if ($processId <= 0) {
        return null;
    }
    $createdYmd = ymdFromNullableDateTime($r['dts_created'] ?? null, $today);
    $createdYmd = bmp_inboxEffectiveCreatedYmd($createdYmd, $startDate, !empty($r['accounting_resend_relax_created_floor']));
    $resendSinglePeriod = !empty($r['accounting_resend_single_period_from_schedule']);

    if ($frequency === '1st_of_every_month') {
        $resendRelax = !empty($r['accounting_resend_relax_created_floor']);
        $todayYm = (new DateTimeImmutable($today))->format('Y-n');
        $createdYmOnly = (new DateTimeImmutable($createdYmd))->format('Y-n');
        // 规则：
        // 1) 非 resend：旧月份不补（仅保留创建当月及之后）；
        // 2) day_start 在 1 号时，首月按 day_start(1号) 锚定，不按创建日截断；
        // 3) day_start 非 1 号时，monthly 从次月起按整月（1号）判断，不受创建日当月日影响。
        try {
            $startDayOfMonth = (int) date('j', $startTs);
            $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
            $todayYm = (new DateTimeImmutable($today))->format('Y-n');
            $billYear = (int) date('Y', $startTs);
            $billMonth = (int) date('n', $startTs);
            // 与 process_accounting_inbox_api：Resend 单期 + day_start=1 号时须能推断锚点自然月，不依赖「今天与 day_start 同月」。
            if ($startDayOfMonth === 1
                && ($todayYm === $startYm || $resendSinglePeriod)
                && $today >= $startDate
                && !hasMonthlyPostedOrSkippedInCalendarMonthForTxn($pdo, $companyId, $processId, $billYear, $billMonth)
                && isWithinRecurringBillingWindowForTxn($today, $dayStart, $contract, $dayEnd, '1st_of_every_month', $resendRelax, $resendSinglePeriod)) {
                return $startYm;
            }
        } catch (Throwable $e) {
            // continue
        }
        $firstAccountingTs = strtotime('first day of next month', $startTs);
        $firstAccountingDate = $firstAccountingTs !== false ? date('Y-m-d', $firstAccountingTs) : '';
        if ($firstAccountingDate === '' || (!$resendRelax && $today < $firstAccountingDate)) {
            return null;
        }
        if (!isWithinRecurringBillingWindowForTxn($today, $dayStart, $contract, $dayEnd, '1st_of_every_month', $resendRelax, $resendSinglePeriod)) {
            return null;
        }
        try {
            $iter = new DateTimeImmutable($firstAccountingDate);
            $iter = $iter->modify('first day of this month');
            $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
            if ($resendRelax && $iter > $endCap) {
                $endCap = $iter;
            }
            $term = getBillingTermMonthsFromContract($contract);
            $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmdFirstOfMonth($startDate, $term) : null;
            $anchorMonthCap = txnAnchorMonthCapAfterPartialFirst($contract, (int) date('j', $startTs));
            $anchorSlotIndex = 0;
            $onlyAnchorYmFirstOfMonth = null;
            if ($resendSinglePeriod && $startDate !== '') {
                try {
                    $onlyAnchorYmFirstOfMonth = (new DateTimeImmutable($startDate))->format('Y-n');
                } catch (Throwable $e) {
                    $onlyAnchorYmFirstOfMonth = null;
                }
            }
            while ($iter <= $endCap) {
                if ($anchorMonthCap !== null && $anchorSlotIndex >= $anchorMonthCap) {
                    break;
                }
                $y = (int) $iter->format('Y');
                $mo = (int) $iter->format('n');
                $firstOfThis = $iter->format('Y-m-d');
                if ($exclusiveEnd !== null && $firstOfThis >= $exclusiveEnd) {
                    break;
                }
                $billYm = $iter->format('Y-n');
                if ($onlyAnchorYmFirstOfMonth !== null && $billYm !== $onlyAnchorYmFirstOfMonth) {
                    $anchorSlotIndex++;
                    $iter = $iter->modify('+1 month');
                    continue;
                }
                // 非 resend：旧数据不拿，仅允许当前自然月进入候选（例如 today=4月，只可出4月）。
                if (!$resendRelax && $billYm !== $todayYm) {
                    $anchorSlotIndex++;
                    $iter = $iter->modify('+1 month');
                    continue;
                }
                // 非 resend：旧月（创建月之前）直接跳过，不补历史账。
                if (!$resendRelax) {
                    $billYmInt = $y * 100 + $mo;
                    $createdYmInt = ((int) date('Y', strtotime($createdYmd))) * 100 + ((int) date('n', strtotime($createdYmd)));
                    if ($billYmInt < $createdYmInt) {
                        $anchorSlotIndex++;
                        $iter = $iter->modify('+1 month');
                        continue;
                    }
                }
                // 1st_of_every_month 的 regular monthly（day_start 非 1 号）按整月判断；
                // 仅 day_start=1 且首月=创建月时，首笔可按创建日截断。
                $effectiveDue = $firstOfThis;
                if (!$resendRelax && $startDayOfMonth === 1 && $billYm === $startYm && $createdYmOnly === $startYm) {
                    $effectiveDue = maxYmd($firstOfThis, $createdYmd);
                }
                if (($today >= $effectiveDue || $resendRelax)
                    && !hasMonthlyPostedOrSkippedInCalendarMonthForTxn($pdo, $companyId, $processId, $y, $mo)) {
                    return $iter->format('Y-n');
                }
                $anchorSlotIndex++;
                $iter = $iter->modify('+1 month');
            }
        } catch (Throwable $e) {
            return null;
        }
        return null;
    }

    $resendRelaxMonthly = !empty($r['accounting_resend_relax_created_floor']);
    if (!isWithinRecurringBillingWindowForTxn($today, $dayStart, $contract, $dayEnd, 'monthly', $resendRelaxMonthly, $resendSinglePeriod)) {
        return null;
    }
    $startDayOfMonth = (int) date('j', $startTs);
    $onlyAnchorYmMonthly = null;
    if ($resendSinglePeriod) {
        try {
            $onlyAnchorYmMonthly = (new DateTimeImmutable($startDate))->format('Y-n');
        } catch (Throwable $e) {
            $onlyAnchorYmMonthly = null;
        }
    }
    if ($startDate !== '' && ($resendRelaxMonthly || $today >= $createdYmd)) {
        try {
            $iter = new DateTimeImmutable($startDate);
            $iter = $iter->modify('first day of this month');
            $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
            if ($resendRelaxMonthly) {
                try {
                    $startMonthFirst = (new DateTimeImmutable($startDate))->modify('first day of this month');
                    if ($startMonthFirst > $endCap) {
                        $endCap = $startMonthFirst;
                    }
                } catch (Throwable $e) {
                    // ignore
                }
            }
            $startYm = (new DateTimeImmutable($startDate))->format('Y-m');
            $term = getBillingTermMonthsFromContract($contract);
            $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmd($startDate, $term) : null;
            while ($iter <= $endCap) {
                $y = (int) $iter->format('Y');
                $mo = (int) $iter->format('n');
                if ($onlyAnchorYmMonthly !== null && $iter->format('Y-n') !== $onlyAnchorYmMonthly) {
                    $iter = $iter->modify('+1 month');
                    continue;
                }
                $due = ($iter->format('Y-m') === $startYm)
                    ? $startDate
                    : calendarMonthDueYmd($y, $mo, $startDayOfMonth);
                if (!$resendSinglePeriod && $exclusiveEnd !== null && $due >= $exclusiveEnd) {
                    break;
                }
                if (!$resendRelaxMonthly && $due < $createdYmd) {
                    try {
                        $billYm = $iter->format('Y-n');
                        $createdYmOnly = (new DateTimeImmutable($createdYmd))->format('Y-n');
                        if ($billYm !== $createdYmOnly) {
                            $iter = $iter->modify('+1 month');
                            continue;
                        }
                    } catch (Throwable $e) {
                        $iter = $iter->modify('+1 month');
                        continue;
                    }
                }
                if (($today >= $due || $resendRelaxMonthly)
                    && !hasMonthlyPostedOrSkippedInCalendarMonthForTxn($pdo, $companyId, $processId, $y, $mo)) {
                    return $iter->format('Y-n');
                }
                $iter = $iter->modify('+1 month');
            }
        } catch (Throwable $e) {
            return null;
        }
    }
    return null;
}

/** 根据 id 列表获取 Bank Process（含 company/owner），支持 active、inactive，以及 OFFICIAL / E-INVOICE 这类 inactive-like 记录（Accounting Due 中 manual_inactive 可入账） */
function fetchBankProcessesByIds(PDO $pdo, array $ids, int $companyId): array
{
    if (empty($ids)) {
        return [];
    }
    bmp_ensureBankProcessAccountingResendScheduleColumns($pdo);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $hasFrequency = tableHasColumn($pdo, 'bank_process', 'day_start_frequency');
    $hasIssueFlagColumn = tableHasColumn($pdo, 'bank_process', 'issue_flag');
    $hasFlagColumn = tableHasColumn($pdo, 'bank_process', 'flag');
    $hasResendRelax = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');
    $hasSchedCols = bmp_bankProcessHasResendScheduleColumns($pdo);
    $issueFlagSql = getBankProcessIssueFlagSql('bp', $hasIssueFlagColumn, $hasFlagColumn);
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit, bp.day_start, bp.day_end, bp.contract, bp.status,
            bp.dts_created" . ($hasFrequency ? ", bp.day_start_frequency" : "") .
        ($hasResendRelax ? ", bp.accounting_resend_relax_created_floor" : "") .
        ($hasSchedCols ? ", bp.accounting_resend_schedule_day_start, bp.accounting_resend_schedule_day_end, bp.accounting_resend_schedule_frequency" : "") . ",
            bp.card_merchant_id, bp.customer_id, bp.profit_account_id, bp.company_id, bp.profit_sharing, c.owner_id
            FROM bank_process bp
            LEFT JOIN company c ON bp.company_id = c.id
            WHERE bp.id IN ($placeholders) AND bp.company_id = ? AND (" .
        (($hasIssueFlagColumn || $hasFlagColumn)
            ? "bp.status IN ('active','inactive') OR " . normalizedBankIssueFlagSql($issueFlagSql) . " IN ('official','e_invoice')"
            : "bp.status IN ('active','inactive')") .
        ")";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_merge($ids, [$companyId]));
    $byId = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $merged = bmp_mergeResendScheduleIntoBankProcessRowForAccounting($row);
        $byId[(int) $merged['id']] = $merged;
    }
    return $byId;
}

/** 1+1/1+2/1+3 的「额外月数」：1+1→1，1+2→2，1+3→3，其他 0（用于 manual_inactive 入账后给 day_end 加月） */
function getExtraMonthsFromContract(?string $contract): int
{
    if ($contract === null || $contract === '') {
        return 0;
    }
    $c = trim($contract);
    if ($c === '1+1') {
        return 1;
    }
    if ($c === '1+2') {
        return 2;
    }
    if ($c === '1+3') {
        return 3;
    }
    return 0;
}

/** 赔款月份文案：1+1 => One Month, 1+2 => Two Month, 1+3 => Three Month */
function getCompensationMonthLabelFromContract(?string $contract): string
{
    $extra = getExtraMonthsFromContract($contract);
    if ($extra === 1) {
        return 'One Month';
    }
    if ($extra === 2) {
        return 'Two Month';
    }
    if ($extra === 3) {
        return 'Three Month';
    }
    return 'One Month';
}

/** 日期加 N 个月，返回 Y-m-d */
function addMonthsToDate(?string $dateStr, int $months): ?string
{
    if ($dateStr === null || $dateStr === '' || $months <= 0) {
        return $dateStr;
    }
    try {
        $dt = new DateTime($dateStr);
        $dt->modify("+{$months} month");
        return $dt->format('Y-m-d');
    } catch (Throwable $e) {
        return $dateStr;
    }
}

/** 根据 contract 与当前 day_start 计算下次 day_start（用于 manual_inactive 入账后恢复 active 并更新日期） */
function nextDayStartFromContract(?string $dayStart, ?string $contract): string
{
    $base = $dayStart && strtotime($dayStart) !== false ? $dayStart : date('Y-m-d');
    $ts = strtotime($base);
    if ($ts === false) {
        return date('Y-m-d');
    }
    $months = 1;
    if ($contract !== null && $contract !== '') {
        if (preg_match('/^(\d+)\s*MONTHS?$/i', trim($contract), $m)) {
            $months = (int) $m[1];
        } elseif (preg_match('/^1\+(\d+)$/i', trim($contract), $m)) {
            $months = 1 + (int) $m[1];
        }
    }
    $next = strtotime("+{$months} month", $ts);
    return $next !== false ? date('Y-m-d', $next) : date('Y-m-d');
}

/** 获取或创建 currency 的 id（按 code + company_id） */
function getOrCreateCurrencyId(PDO $pdo, string $code, int $companyId): ?int
{
    $stmt = $pdo->prepare("SELECT id FROM currency WHERE code = ? AND company_id = ?");
    $stmt->execute([$code, $companyId]);
    $id = $stmt->fetchColumn();
    if ($id) {
        return (int) $id;
    }
    $stmt = $pdo->prepare("INSERT INTO currency (code, company_id) VALUES (?, ?)");
    $stmt->execute([$code, $companyId]);
    return (int) $pdo->lastInsertId();
}

/** 记录 process 已入账到 process_accounting_posted */
function recordProcessAccountingPosted(PDO $pdo, int $companyId, int $processId, string $date, string $periodType, bool $hasPeriodType): void
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return;
        }
        if ($hasPeriodType) {
            $ins = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date, period_type) VALUES (?, ?, ?, ?)");
            $ins->execute([$companyId, $processId, $date, $periodType]);
        } else {
            $ins = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date) VALUES (?, ?, ?)");
            $ins->execute([$companyId, $processId, $date]);
        }
    } catch (Throwable $e) {
        // ignore
    }
}

/**
 * Resend 合并区间入账后：为 [fromYmd, toYmd] 覆盖的每个自然月写 monthly_skipped，
 * 避免列表页「Transaction」再按 inferOpenMonthly 推断出 5/1 等整月重复入账。
 */
function txnRecordMonthlySkippedCoveringConsolidatedRange(
    PDO $pdo,
    int $companyId,
    int $processId,
    string $fromYmd,
    string $toYmd,
    bool $hasPeriodType
): void {
    if (!$hasPeriodType) {
        return;
    }
    try {
        $cur = (new DateTimeImmutable($fromYmd))->modify('first day of this month');
        $endM = (new DateTimeImmutable($toYmd))->modify('first day of this month');
    } catch (Throwable $e) {
        return;
    }
    while ($cur <= $endM) {
        recordProcessAccountingPosted($pdo, $companyId, $processId, $cur->format('Y-m-01'), 'monthly_skipped', $hasPeriodType);
        $cur = $cur->modify('+1 month');
    }
}

/** 与 Inbox：首月 partial 是否已入账或已 dismiss（任一则不再排队 partial） */
function txnIsPartialFirstMonthPostedOrSkipped(PDO $pdo, int $companyId, int $processId): bool
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return false;
        }
        if (!tableHasColumn($pdo, 'process_accounting_posted', 'period_type')) {
            return false;
        }
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ?
             AND period_type IN ('partial_first_month','partial_first_month_skipped') LIMIT 1"
        );
        $stmt->execute([$companyId, $processId]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 解析 profit_sharing 字符串 "RUP3 - 55, RUP4 - 10" 为 [['account_text'=>'RUP3','amount'=>55], ...] */
function parseProfitSharingString(string $profitSharing): array
{
    $result = [];
    $s = trim($profitSharing);
    if ($s === '') {
        return $result;
    }
    foreach (explode(',', $s) as $part) {
        $t = trim($part);
        $dash = strrpos($t, ' - ');
        if ($dash !== false) {
            $accountText = trim(substr($t, 0, $dash));
            $amountStr = trim(substr($t, $dash + 3));
            $amount = (float) $amountStr;
            if ($accountText !== '' && $amount > 0) {
                $result[] = ['account_text' => $accountText, 'amount' => round($amount, 2)];
            }
        }
    }
    return $result;
}

/** 按公司内 account_id 或 name 解析账户，返回 account.id，找不到返回 null */
function resolveAccountIdByText(PDO $pdo, int $companyId, string $accountText): ?int
{
    $text = trim($accountText);
    if ($text === '') {
        return null;
    }
    $stmt = $pdo->prepare("SELECT a.id FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id AND ac.company_id = ?
            WHERE (LOWER(TRIM(a.account_id)) = LOWER(?) OR LOWER(TRIM(a.name)) = LOWER(?)) LIMIT 1");
    $stmt->execute([$companyId, $text, $text]);
    $id = $stmt->fetchColumn();
    return $id ? (int) $id : null;
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, '请先登录', null);
        exit;
    }

    $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('intval', $_POST['ids']) : [];
    $ids = array_filter($ids);
    $periodTypes = isset($_POST['period_types']) && is_array($_POST['period_types']) ? $_POST['period_types'] : [];
    if (empty($ids)) {
        http_response_code(400);
        jsonResponse(false, '请至少选择一个 Process', null);
        exit;
    }

    $billingMonths = isset($_POST['billing_months']) && is_array($_POST['billing_months']) ? $_POST['billing_months'] : [];
    $allowFutureMonthly = !empty($_POST['allow_future_monthly']);
    $pairs = [];
    foreach ($ids as $i => $id) {
        $pt = isset($periodTypes[$i]) ? trim($periodTypes[$i]) : 'monthly';
        if ($pt !== 'partial_first_month' && $pt !== 'manual_inactive' && $pt !== 'day_end_tail' && $pt !== 'resend_consolidated_range') {
            $pt = 'monthly';
        }
        $pairs[] = [
            'id' => (int) $id,
            'period_type' => $pt,
            'billing_month' => isset($billingMonths[$i]) ? trim((string) $billingMonths[$i]) : '',
        ];
    }
    // Accounting Due 每行只入账一次：monthly 按 billing_month 区分多期；其它 period_type 仍按 process_id + period_type 去重
    $seen = [];
    $pairs = array_values(array_filter($pairs, function ($p) use (&$seen) {
        $pt = $p['period_type'] ?? '';
        $bm = trim((string) ($p['billing_month'] ?? ''));
        $key = $p['id'] . '_' . $pt . '_' . (($pt === 'monthly' && $bm !== '') ? $bm : '');
        if (isset($seen[$key])) {
            return false;
        }
        $seen[$key] = true;
        return true;
    }));

    usort($pairs, static function ($a, $b) {
        if ((int) $a['id'] !== (int) $b['id']) {
            return (int) $a['id'] <=> (int) $b['id'];
        }
        $ba = trim((string) ($a['billing_month'] ?? ''));
        $bb = trim((string) ($b['billing_month'] ?? ''));
        if ($ba === '' && $bb === '') {
            return 0;
        }
        if (!preg_match('/^(\d{4})-(\d{1,2})$/', $ba, $ma)) {
            return $ba <=> $bb;
        }
        if (!preg_match('/^(\d{4})-(\d{1,2})$/', $bb, $mb)) {
            return $ba <=> $bb;
        }
        $ta = (int) $ma[1] * 100 + (int) $ma[2];
        $tb = (int) $mb[1] * 100 + (int) $mb[2];
        return $ta <=> $tb;
    });

    $company_id = (int) ($_SESSION['company_id'] ?? 0);
    if (!$company_id) {
        http_response_code(400);
        jsonResponse(false, '缺少公司信息', null);
        exit;
    }
    // 自动移除“金额必须大于 0”的旧触发器限制（允许 0.00）。
    ensureTransactionsAllowZeroAmount($pdo);
    $isOwner = isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner';
    $owner_id = $isOwner ? ($_SESSION['owner_id'] ?? $_SESSION['user_id']) : null;
    $created_by_user = $isOwner ? null : $_SESSION['user_id'];

    $uniqueIds = array_values(array_unique(array_column($pairs, 'id')));
    $processesById = fetchBankProcessesByIds($pdo, $uniqueIds, $company_id);
    if (empty($processesById)) {
        http_response_code(400);
        jsonResponse(false, '未找到可入账的 Process（仅处理当前公司下 active 或 Accounting Due 中的 Process）', null);
        exit;
    }

    $has_currency_id = tableHasColumn($pdo, 'transactions', 'currency_id');
    $has_approval_status = tableHasColumn($pdo, 'transactions', 'approval_status');
    $has_source_bank_process_id = tableHasColumn($pdo, 'transactions', 'source_bank_process_id');
    $has_source_bank_process_period_type = tableHasColumn($pdo, 'transactions', 'source_bank_process_period_type');
    $has_period_type = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');
    $has_resend_relax_col = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');
    $fallbackDate = date('Y-m-d');
    $createdCount = 0;
    $skippedFutureMonthlyDueCount = 0;
    $currencyCache = [];

    foreach ($pairs as $pair) {
        $p = $processesById[$pair['id']] ?? null;
        if (!$p) {
            continue;
        }
        $skipCurrentPair = false;
        $monthlyProrationPsRatio = null;
        $periodType = trim((string) ($pair['period_type'] ?? 'monthly'));
        $cost = (float) ($p['cost'] ?? 0);
        $price = (float) ($p['price'] ?? 0);
        $profit = (float) ($p['profit'] ?? 0);
        $lastProrationRatio = null;

        $dayStartYmd = !empty($p['day_start']) ? bankProcessDateFieldToYmd($p['day_start']) : null;
        $frequency = $p['day_start_frequency'] ?? '1st_of_every_month';
        $createdYmd = bmp_inboxEffectiveCreatedYmd(
            ymdFromNullableDateTime($p['dts_created'] ?? null, $fallbackDate),
            $dayStartYmd,
            $has_resend_relax_col && !empty($p['accounting_resend_relax_created_floor'])
        );

        // monthly：若前端未传 billing_month（例如列表页批量 Transaction），按 Inbox 规则推断账单自然月，保证 proration 与 transaction_date 一致
        $resolvedMonthlyBm = '';
        if ($periodType === 'monthly') {
            $resolvedMonthlyBm = trim((string) ($pair['billing_month'] ?? ''));
            if ($resolvedMonthlyBm === '' && $dayStartYmd) {
                $cidForInfer = (int) ($p['company_id'] ?? $company_id);
                $inf = inferOpenMonthlyBillingMonthYn($pdo, $cidForInfer, $p, $fallbackDate);
                if ($inf !== null && $inf !== '') {
                    $resolvedMonthlyBm = $inf;
                }
            }
        }

        if ($periodType === 'resend_consolidated_range' && $dayStartYmd) {
            $dayEndRawRc = $p['day_end'] ?? null;
            $endYmdRc = $dayEndRawRc !== null && trim((string) $dayEndRawRc) !== ''
                ? bankProcessDateFieldToYmd((string) $dayEndRawRc)
                : null;
            if ($endYmdRc === null || $endYmdRc === '' || $dayStartYmd > $endYmdRc) {
                continue;
            }
            $totRc = prorateInclusiveDateRange($dayStartYmd, $endYmdRc, $cost, $price, $profit);
            $cost = $totRc['cost'];
            $price = $totRc['price'];
            $profit = $totRc['profit'];
        } elseif ($periodType === 'partial_first_month' && $dayStartYmd) {
            $startTs = strtotime($dayStartYmd);
            if ($startTs === false) {
                continue;
            }
            // day_start is the 1st → no partial-first-month period; don't create this row.
            if ((int) date('j', $startTs) === 1) {
                continue;
            }
            $firstMonthEnd = date('Y-m-t', $startTs);
            if ($createdYmd > $firstMonthEnd) {
                continue;
            }
            $partialStart = $dayStartYmd;
            if ($partialStart > $firstMonthEnd) {
                continue;
            }
            $lastProrationRatio = ratioRemainingDaysInMonthFromStartYmd($partialStart);
            $partial = prorateToMonthEndFromStart($partialStart, $cost, $price, $profit);
            $cost = $partial['cost'];
            $price = $partial['price'];
            $profit = $partial['profit'];
        } elseif ($periodType === 'day_end_tail' && $dayStartYmd) {
            $dayEndRaw = $p['day_end'] ?? null;
            if ($dayEndRaw === null || trim((string) $dayEndRaw) === '' || strtotime((string) $dayEndRaw) === false) {
                continue;
            }
            $term = getBillingTermMonthsFromContract($p['contract'] ?? null);
            if ($term === null || $term < 1) {
                continue;
            }
            $exclusiveEnd = contractExclusiveEndYmdForFrequency($dayStartYmd, $p['contract'] ?? null, $frequency);
            $dayEndInc = date('Y-m-d', strtotime((string) $dayEndRaw));
            if ($exclusiveEnd === null || $dayEndInc < $exclusiveEnd) {
                continue;
            }
            if ($fallbackDate < maxYmd($dayStartYmd, $createdYmd)) {
                continue;
            }
            $tail = prorateInclusiveDateRange($exclusiveEnd, $dayEndInc, $cost, $price, $profit);
            $cost = $tail['cost'];
            $price = $tail['price'];
            $profit = $tail['profit'];
        }

        // monthly：与 Inbox 一致；1st_of_every_month 新建在创建日晚于当月1号时从创建日摊到月末；Resend 仍从 dueYmd（1号）起算比例。
        if ($periodType === 'monthly' && $resolvedMonthlyBm !== '' && preg_match('/^(\d{4})-(\d{1,2})$/', $resolvedMonthlyBm, $m)) {
            $billY = (int) $m[1];
            $billMo = (int) $m[2];
            $billYm = sprintf('%04d-%d', $billY, $billMo);
            try {
                $createdYm = (new DateTimeImmutable($createdYmd))->format('Y-n');
                $resendRelax = $has_resend_relax_col && !empty($p['accounting_resend_relax_created_floor']);
                // 防呆：1st_of_every_month 且 day_start 非 1 号时，首自然月只能走 partial_first_month；
                // 若客户端误把首月传成 monthly，会造成首月金额重复（例如 partial + full monthly）。
                if ($frequency === '1st_of_every_month' && $dayStartYmd) {
                    $startTsGuard = strtotime($dayStartYmd);
                    if ($startTsGuard !== false && (int) date('j', $startTsGuard) !== 1) {
                        $startYmGuard = (new DateTimeImmutable($dayStartYmd))->format('Y-n');
                        if ($billYm === $startYmGuard) {
                            $skipCurrentPair = true;
                        }
                    }
                }
                if (!$resendRelax) {
                    $billYmInt = $billY * 100 + $billMo;
                    $createdDt = new DateTimeImmutable($createdYmd);
                    $createdYmInt = ((int) $createdDt->format('Y')) * 100 + ((int) $createdDt->format('n'));
                    if ($billYmInt < $createdYmInt) {
                        $skipCurrentPair = true;
                    }
                }
                $firstMonthOnFirstHandled = false;
                if ($frequency === '1st_of_every_month' && $dayStartYmd) {
                    $startYmForBill = (new DateTimeImmutable($dayStartYmd))->format('Y-n');
                    $sdTs = strtotime($dayStartYmd);
                    if ($startYmForBill === $billYm && $sdTs !== false && (int) date('j', $sdTs) === 1) {
                        // 1st_of_every_month + 首月(day_start=1号)统一按1号起算，不按创建日截断。
                        $prorateFrom = $dayStartYmd;
                        $lastProrationRatio = ratioRemainingDaysInMonthFromStartYmd($prorateFrom);
                        $pr = prorateToMonthEndFromStart($prorateFrom, $cost, $price, $profit);
                        $cost = $pr['cost'];
                        $price = $pr['price'];
                        $profit = $pr['profit'];
                        $tPr = strtotime($prorateFrom);
                        if ($tPr !== false) {
                            $dim = (int) date('t', $tPr);
                            $dj = (int) date('j', $tPr);
                            if ($dim > 0) {
                                $monthlyProrationPsRatio = ($dim - $dj + 1) / $dim;
                            }
                        }
                        $firstMonthOnFirstHandled = true;
                    }
                }
                // monthly：按「对日对月」完整服务区间（上一应付日到本期应付前一日）入账，
                // 不再因创建日晚于区间起点而按比例截断，确保整期金额固定为 process 原值。
                if ($frequency === 'monthly' && $dayStartYmd) {
                    $dueYmdM = monthlyDueYmdForBillingMonth($resolvedMonthlyBm, $dayStartYmd, 'monthly');
                    if ($dueYmdM !== null) {
                        [$p0, $p1] = billingMonthlyAnniversaryInclusiveRangeFromDue($dueYmdM, $dayStartYmd);
                        $from = $p0;
                        if ($from <= $p1) {
                            $pr = prorateMonthlyAnniversaryPeriodLinear($p0, $p1, $from, $cost, $price, $profit);
                            $cost = $pr['cost'];
                            $price = $pr['price'];
                            $profit = $pr['profit'];
                            if ($pr['ratio'] !== null) {
                                $monthlyProrationPsRatio = (float) $pr['ratio'];
                            }
                        }
                    }
                }
            } catch (Throwable $e) {
                // ignore
            }
        }

        // 1+1/1+2/1+3：active 期间统一按 1 个月价格入账；仅 manual_inactive 才按赔付月数放大。
        if ($periodType === 'manual_inactive') {
            $mult = getManualInactiveMultiplierFromContract($p['contract'] ?? null);
            $cost = round($cost * $mult, 2);
            $price = round($price * $mult, 2);
            $profit = round($profit * $mult, 2);
        }
        $isManualInactiveCompensation = ($periodType === 'manual_inactive' && getExtraMonthsFromContract($p['contract'] ?? null) > 0);

        $processLabel = $p['name'] ?: ($p['bank'] . ' #' . $p['id']);
        $companyId = (int) $p['company_id'];
        $ownerId = $p['owner_id'] ?? null;
        $currencyCode = trim($p['country'] ?? '');
        if ($currencyCode === '') {
            continue;
        }

        $currencyId = null;
        if ($has_currency_id) {
            $cacheKey = $companyId . '_' . $currencyCode;
            if (isset($currencyCache[$cacheKey])) {
                $currencyId = $currencyCache[$cacheKey];
            } else {
                $currencyId = getOrCreateCurrencyId($pdo, $currencyCode, $companyId);
                $currencyCache[$cacheKey] = $currencyId;
            }
        }
        if (!$currencyId && $has_currency_id) {
            continue;
        }

        // transaction_date：写入「经济归属日」供 Transaction List / Payment History 按 capture 日期筛选；不用 max(day_start,创建日)，否则晚提交会落在 submit 日导致按 day_start 查不到。
        // posted_date：仍单独用应付日（与 Inbox 去重一致）。
        // manual_inactive 的 process_accounting_posted.posted_date 仍用「今天」，否则 posted_date < dts_modified 时
        // fetchInactiveBankProcessesPendingTransaction 的 NOT EXISTS 无法识别本轮已入账（见 process_accounting_inbox_api）。
        $transactionDate = $fallbackDate;
        $postedDateForInbox = $fallbackDate;

        if ($periodType === 'partial_first_month' && $dayStartYmd) {
            $transactionDate = $dayStartYmd;
            $postedDateForInbox = $dayStartYmd;
        } elseif ($periodType === 'resend_consolidated_range' && $dayStartYmd) {
            $transactionDate = $dayStartYmd;
            $postedDateForInbox = $dayStartYmd;
        } elseif ($periodType === 'manual_inactive') {
            // 1+1 / 1+2 / 1+3 的赔款（manual_inactive）按执行当天入账，
            // 不回写到原 process day_start；首月正常合同入账仍走 monthly/partial 逻辑。
            $transactionDate = $fallbackDate;
            $postedDateForInbox = $fallbackDate;
        } elseif ($periodType === 'day_end_tail' && $dayStartYmd) {
            // day_end_tail：交易归属日应落在尾段起始日（通常是合同自然结束次日；1st 频率下即该月1号），
            // 这样 Payment History 会显示在正确账期（例如 4/1-4/15 挂在 4/1）。
            // PAP.posted_date 仍用合同自然结束次日，保持 Inbox 去重口径。
            $term = getBillingTermMonthsFromContract($p['contract'] ?? null);
            if ($term !== null && $term >= 1) {
                $exclusiveEnd = contractExclusiveEndYmdForFrequency($dayStartYmd, $p['contract'] ?? null, $frequency);
                if ($exclusiveEnd !== null) {
                    $transactionDate = $exclusiveEnd;
                    $postedDateForInbox = $exclusiveEnd;
                }
            }
        } elseif ($periodType === 'monthly') {
            // monthly：Payment History 归档日固定为该期应付日（dueYmd），
            // 非 resend 场景未到应付日不允许提前入账；resend 维持可回补旧期能力。
            if ($resolvedMonthlyBm !== '' && $dayStartYmd) {
                $dueTx = monthlyDueYmdForBillingMonth($resolvedMonthlyBm, $dayStartYmd, $frequency);
                if ($dueTx !== null) {
                    $resendRelax = $has_resend_relax_col && !empty($p['accounting_resend_relax_created_floor']);
                    if (!$allowFutureMonthly && !$resendRelax && $dueTx > $fallbackDate) {
                        $skipCurrentPair = true;
                        $skippedFutureMonthlyDueCount++;
                    }
                    $transactionDate = $dueTx;
                    $postedDateForInbox = $dueTx;
                }
            }
        }

        if ($skipCurrentPair) {
            continue;
        }

        // Resend 合并账：流水与 PAP 必须锚在弹窗 Day start，不得落到区间内某月 1 号（与 monthly 应付日逻辑混用）
        if ($periodType === 'resend_consolidated_range' && $dayStartYmd !== null && $dayStartYmd !== '') {
            $transactionDate = $dayStartYmd;
            $postedDateForInbox = $dayStartYmd;
        }

        $ledgerDate = $transactionDate;

        $baseTxn = [
            'company_id' => $companyId,
            'transaction_type' => 'WIN',
            'transaction_date' => $transactionDate,
            'created_by' => $created_by_user,
            'created_by_owner' => $ownerId,
        ];
        if ($has_currency_id && $currencyId) {
            $baseTxn['currency_id'] = $currencyId;
        }
        if ($has_source_bank_process_id) {
            $baseTxn['source_bank_process_id'] = (int) $p['id'];
        }
        if ($has_source_bank_process_period_type) {
            $baseTxn['source_bank_process_period_type'] = $periodType;
        }
        if ($has_approval_status) {
            $baseTxn['approval_status'] = 'APPROVED';
            if (tableHasColumn($pdo, 'transactions', 'approved_at')) {
                $baseTxn['approved_at'] = date('Y-m-d H:i:s');
            }
            if (tableHasColumn($pdo, 'transactions', 'approved_by_owner')) {
                $baseTxn['approved_by_owner'] = $ownerId;
            }
        }

        $suffix = $periodType === 'partial_first_month' ? ' (partial first month)' : ($periodType === 'day_end_tail' ? ' (day end tail)' : ($periodType === 'resend_consolidated_range' ? ' (resend consolidated)' : ''));
        $resendEndMarker = '';
        if ($periodType === 'resend_consolidated_range') {
            $endRawForMarker = $p['day_end'] ?? null;
            $endYmdForMarker = $endRawForMarker !== null && trim((string) $endRawForMarker) !== ''
                ? bankProcessDateFieldToYmd((string) $endRawForMarker)
                : null;
            if ($endYmdForMarker !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $endYmdForMarker)) {
                // 保留在原始 description 供 history 展示层读取 resend 的临时 day_end（入账后该字段会被清除）
                $resendEndMarker = ' [RESEND_END=' . $endYmdForMarker . ']';
            }
        }
        $compMonthLabel = getCompensationMonthLabelFromContract($p['contract'] ?? null);
        // Cost → Supplier(card_merchant)，Price → Customer，Profit → Company；首月按比例时三笔均用折算后的 cost/price/profit
        if (!empty($p['card_merchant_id']) && $cost > 0) {
            $txn = $baseTxn;
            $txn['account_id'] = (int) $p['card_merchant_id'];
            $txn['amount'] = $cost;
            $txn['description'] = $isManualInactiveCompensation
                ? ("Compensation " . $compMonthLabel . ' ' . (($cost == floor($cost)) ? (string) (int) $cost : number_format($cost, 2, '.', '')))
                : ("Process: Buy Price for $processLabel" . $suffix . $resendEndMarker);
            insertTransactionRow($pdo, $txn);
            $createdCount++;
        }
        // Sell Price → Customer：用 LOSE + 正数 amount，Win/Loss 计算时按 -amount 显示在右边「-」侧（Customer 要还钱）；Cost/Profit/Profit Sharing 用 WIN + 正数显示在左边「+」侧
        if (!empty($p['customer_id']) && $price > 0) {
            $txn = $baseTxn;
            $txn['transaction_type'] = 'LOSE';
            $txn['account_id'] = (int) $p['customer_id'];
            $txn['amount'] = round($price, 2);
            $txn['description'] = $isManualInactiveCompensation
                ? ("Compensation " . $compMonthLabel . ' ' . (($price == floor($price)) ? (string) (int) $price : number_format($price, 2, '.', '')))
                : ("Process: Sell Price for $processLabel" . $suffix . $resendEndMarker);
            insertTransactionRow($pdo, $txn);
            $createdCount++;
        }
        // Profit：先扣 Profit Sharing 再入 Company；Profit Sharing 每笔入对应 account（均记 Win/Loss）
        // 1st of every month 首月按比例时，Profit Sharing 金额也按「剩余天数/当月天数」折算，再分给各 account
        $psRatio = 1.0;
        if ($periodType === 'partial_first_month') {
            $ts = strtotime($ledgerDate);
            if ($ts !== false) {
                $daysInMonth = (int) date('t', $ts);
                $dayOfMonth = (int) date('j', $ts);
                $daysRemaining = $daysInMonth - $dayOfMonth + 1;
                if ($daysInMonth > 0) {
                    $psRatio = $daysRemaining / $daysInMonth;
                }
            }
        } elseif ($monthlyProrationPsRatio !== null) {
            $psRatio = $monthlyProrationPsRatio;
        } elseif ($periodType === 'day_end_tail' || $periodType === 'resend_consolidated_range') {
            $fp = (float) ($p['profit'] ?? 0);
            $psRatio = ($fp > 0) ? ($profit / $fp) : 0.0;
        }
        $profitSharingEntries = parseProfitSharingString($p['profit_sharing'] ?? '');
        $profitSharingResolved = [];
        $totalPs = 0;
        $psMult = ($periodType === 'manual_inactive') ? getManualInactiveMultiplierFromContract($p['contract'] ?? null) : 1;
        foreach ($profitSharingEntries as $entry) {
            $accId = resolveAccountIdByText($pdo, $companyId, $entry['account_text']);
            if ($accId !== null && $entry['amount'] > 0) {
                $proratedAmount = round($entry['amount'] * $psRatio * $psMult, 2);
                if ($proratedAmount > 0) {
                    $profitSharingResolved[] = ['account_id' => $accId, 'amount' => $proratedAmount, 'account_text' => $entry['account_text']];
                    $totalPs += $proratedAmount;
                }
            }
        }
        $companyProfit = round($profit - $totalPs, 2);
        if (abs($companyProfit) < 0.00001) {
            $companyProfit = 0.0;
        }
        // Profit 被 Share 抵消为 0.00 时，也要保留一条 Profit 记录给 Transaction Payment / History。
        if (!empty($p['profit_account_id']) && $companyProfit >= 0) {
            $txn = $baseTxn;
            $txn['account_id'] = (int) $p['profit_account_id'];
            $txn['amount'] = $companyProfit;
            $txn['description'] = $isManualInactiveCompensation
                ? ("Compensation " . $compMonthLabel . ' ' . (($profit == floor($profit)) ? (string) (int) $profit : number_format($profit, 2, '.', '')))
                : ("Process: Profit for $processLabel" . $suffix . $resendEndMarker);
            insertTransactionRow($pdo, $txn);
            $createdCount++;
        }
        foreach ($profitSharingResolved as $ps) {
            $txn = $baseTxn;
            $txn['account_id'] = (int) $ps['account_id'];
            $txn['amount'] = $ps['amount'];
            $txn['description'] = $isManualInactiveCompensation
                ? ("Compensation " . $compMonthLabel . ' ' . (($ps['amount'] == floor($ps['amount'])) ? (string) (int) $ps['amount'] : number_format((float) $ps['amount'], 2, '.', '')))
                : ("Process: Profit Sharing for $processLabel (" . $ps['account_text'] . ' ' . $ps['amount'] . ')' . $suffix . $resendEndMarker);
            insertTransactionRow($pdo, $txn);
            $createdCount++;
        }

        recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $postedDateForInbox, $periodType, $has_period_type);

        if ($periodType === 'resend_consolidated_range' && $has_period_type && $dayStartYmd) {
            $endRawPost = $p['day_end'] ?? null;
            $endYmdPost = $endRawPost !== null && trim((string) $endRawPost) !== ''
                ? bankProcessDateFieldToYmd((string) $endRawPost)
                : null;
            if ($endYmdPost !== null && $endYmdPost !== '' && $dayStartYmd <= $endYmdPost) {
                txnRecordMonthlySkippedCoveringConsolidatedRange(
                    $pdo,
                    $companyId,
                    (int) $p['id'],
                    $dayStartYmd,
                    $endYmdPost,
                    $has_period_type
                );
                $termPost = getBillingTermMonthsFromContract($p['contract'] ?? null);
                if ($termPost !== null && $termPost >= 1) {
                    $exclPost = contractExclusiveEndYmdForFrequency($dayStartYmd, $p['contract'] ?? null, $frequency);
                    if ($exclPost !== null && $endYmdPost >= $exclPost) {
                        recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $exclPost, 'day_end_tail_skipped', $has_period_type);
                    }
                }
            }
            if ($frequency === '1st_of_every_month') {
                $storedRawPc = $p['bank_process_stored_day_start'] ?? null;
                $storedYmdPc = $storedRawPc !== null && trim((string) $storedRawPc) !== '' ? bankProcessDateFieldToYmd((string) $storedRawPc) : null;
                if ($storedYmdPc !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $storedYmdPc)) {
                    $tsPc = strtotime($storedYmdPc);
                    if ($tsPc !== false
                        && (int) date('j', $tsPc) !== 1) {
                        if ($has_period_type) {
                            if (!txnIsPartialFirstMonthPostedOrSkipped($pdo, $companyId, (int) $p['id'])) {
                                recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $storedYmdPc, 'partial_first_month_skipped', $has_period_type);
                            }
                        } else {
                            // 兼容无 period_type 结构：写入真实锚点日，避免 Resend 单期后立刻再排出首月/同锚点账单。
                            recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $storedYmdPc, 'monthly', $has_period_type);
                        }
                    }
                }
            }
        }

        // Resend 弹窗锚点（如 1/1）入账整月 monthly 后，会清除暂存并回到库里真实 day_start（如 4/15）。
        // 「1st_of_every_month + 非 1 号真实 day_start」仍会排队首月 partial，与刚补的历史整月无关，易误判为重复 — 写入 skipped 抑制该幽灵行（与 dismiss 一致）。
        if ($periodType === 'monthly'
            && !empty($p['accounting_resend_single_period_from_schedule'])
            && ($frequency === '1st_of_every_month' || $frequency === 'monthly')) {
            $storedRaw = $p['bank_process_stored_day_start'] ?? null;
            $storedYmd = $storedRaw !== null && trim((string) $storedRaw) !== '' ? bankProcessDateFieldToYmd((string) $storedRaw) : null;
            if ($storedYmd !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $storedYmd)) {
                $tsS = strtotime($storedYmd);
                if ($tsS !== false
                    && (int) date('j', $tsS) !== 1) {
                    if ($has_period_type) {
                        if (!txnIsPartialFirstMonthPostedOrSkipped($pdo, $companyId, (int) $p['id'])) {
                            recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $storedYmd, 'partial_first_month_skipped', $has_period_type);
                        }
                    } else {
                        // 兼容无 period_type：用真实锚点日写一条 posted 作为去重锚点。
                        recordProcessAccountingPosted($pdo, $companyId, (int) $p['id'], $storedYmd, 'monthly', $has_period_type);
                    }
                }
            }
        }

        if ($has_resend_relax_col && !empty($p['accounting_resend_relax_created_floor'])) {
            if (bmp_bankProcessHasResendScheduleColumns($pdo)) {
                $clr = $pdo->prepare(
                    'UPDATE bank_process SET accounting_resend_relax_created_floor = 0,
                        accounting_resend_schedule_day_start = NULL,
                        accounting_resend_schedule_day_end = NULL,
                        accounting_resend_schedule_frequency = NULL,
                        dts_modified = NOW() WHERE id = ? AND company_id = ?'
                );
            } else {
                $clr = $pdo->prepare('UPDATE bank_process SET accounting_resend_relax_created_floor = 0, dts_modified = NOW() WHERE id = ? AND company_id = ?');
            }
            $clr->execute([(int) $p['id'], $companyId]);
            $p['accounting_resend_relax_created_floor'] = 0;
        }

        // manual_inactive 入账后：保持 inactive；1+1/1+2/1+3 时给 day_end 加对应月数（与 Frequency 无关，1st of every month 与 monthly 行为一致，仅算账日不同）
        if ($periodType === 'manual_inactive') {
            $extraMonths = getExtraMonthsFromContract($p['contract'] ?? null);
            $dayEnd = $p['day_end'] ?? null;
            $dayStart = $p['day_start'] ?? null;
            $baseDate = ($dayEnd !== null && $dayEnd !== '') ? $dayEnd : $dayStart;
            if ($extraMonths > 0 && $baseDate !== null && $baseDate !== '') {
                $newDayEnd = addMonthsToDate($baseDate, $extraMonths);
                if ($newDayEnd !== null) {
                    $upd = $pdo->prepare("UPDATE bank_process SET day_end = ?, dts_modified = NOW() WHERE id = ? AND company_id = ?");
                    $upd->execute([$newDayEnd, (int) $p['id'], $companyId]);
                }
            }
        }
    }

    // 入账成功后立刻清理 Transaction List 缓存，避免 Resend 后短时间显示旧账单。
    clearTransactionSearchCache();

    if ($createdCount === 0 && $skippedFutureMonthlyDueCount > 0) {
        jsonResponse(true, "未到应付日，暂不生成交易记录（Resend 除外）。", [
            'created_count' => 0,
            'skipped_future_monthly_due_count' => $skippedFutureMonthlyDueCount
        ]);
        exit;
    }

    jsonResponse(true, "已入账，共生成 $createdCount 条交易记录。", ['created_count' => $createdCount]);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('process_post_to_transaction_api: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '服务器错误', null);
}