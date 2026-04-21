<?php
/**
 * Bank process 账单类描述（首月 partial_first_month）与日期解析，供 history_api / bankprocess_maintenance 等复用。
 */

declare(strict_types=1);

/**
 * 解析 bank_process.day_start（支持 yyyy-mm-dd、d/m/Y 等），与 history_api 原逻辑一致。
 */
function bankProcessParseDayStartToYmd($raw): ?string
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

function bankProcessBillFormatTripartNumber(float $amt): string
{
    if (abs($amt - (float) (int) round($amt)) < 0.00001) {
        return (string) (int) round($amt);
    }
    return number_format($amt, 2, '.', '');
}

function bankProcessProfitSharingOriginalAmountByAccount(array $t): ?float
{
    $profitSharingRaw = trim((string) ($t['process_profit_sharing'] ?? ''));
    if ($profitSharingRaw === '') {
        return null;
    }
    $currentCode = trim((string) ($t['to_account_code'] ?? $t['account_code'] ?? ''));
    if ($currentCode === '') {
        return null;
    }
    foreach (explode(',', $profitSharingRaw) as $part) {
        $entry = trim($part);
        if ($entry === '') {
            continue;
        }
        $dash = strrpos($entry, ' - ');
        if ($dash === false) {
            continue;
        }
        $accountText = trim(substr($entry, 0, $dash));
        $amountStr = trim(substr($entry, $dash + 3));
        if ($accountText === '' || $amountStr === '') {
            continue;
        }
        if (strcasecmp($accountText, $currentCode) === 0) {
            return (float) $amountStr;
        }
    }
    return null;
}

function bankProcessResolveDisplayValueByAccount(array $t): string
{
    $buy = isset($t['process_cost']) ? (float) $t['process_cost'] : 0.0;
    $sell = isset($t['process_price']) ? (float) $t['process_price'] : 0.0;
    $profit = isset($t['process_profit']) ? (float) $t['process_profit'] : 0.0;

    $txAccountId = (int) ($t['account_id'] ?? 0);
    $cardMerchantId = (int) ($t['card_merchant_id'] ?? 0);
    $customerId = (int) ($t['customer_id'] ?? 0);
    $profitAccountId = (int) ($t['profit_account_id'] ?? 0);

    if ($txAccountId > 0 && $txAccountId === $cardMerchantId) {
        return bankProcessBillFormatTripartNumber($buy);
    }
    if ($txAccountId > 0 && $txAccountId === $customerId) {
        return bankProcessBillFormatTripartNumber(abs($sell));
    }
    if ($txAccountId > 0 && $txAccountId === $profitAccountId) {
        return bankProcessBillFormatTripartNumber($profit);
    }
    $psAmount = bankProcessProfitSharingOriginalAmountByAccount($t);
    if ($psAmount !== null) {
        return bankProcessBillFormatTripartNumber($psAmount);
    }
    return bankProcessBillFormatTripartNumber(isset($t['amount']) ? (float) $t['amount'] : 0.0);
}

/**
 * 首月比例账单描述：Pro-rated(dd/mm - dd/mm)@monthly <对应账单价格>
 * 仅显示当前这条记录对应的价格：
 * - Supplier(card_merchant): buy price
 * - Customer: sell price（始终负号）
 * - Profit account: profit
 * - Profit sharing account: 取 process_profit_sharing 中该账号的原始金额
 *
 * @param array $t 需含 bp_day_start、process_cost、process_price、process_profit；可选 transaction_date 作 day_start 后备
 */
function bankProcessProRatedFirstMonthDescription(array $t): string
{
    // Resend 场景下，transaction_date 会锚到本次执行的 daystart；
    // 这里优先用 transaction_date，确保 Pro-rated 的月份/天数随 resend daystart 变化。
    $startYmd = null;
    $td = trim((string) ($t['transaction_date'] ?? ''));
    if ($td !== '') {
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $td, $m)) {
            $startYmd = $m[1];
        } else {
            $ts = strtotime(str_replace('/', '-', $td));
            if ($ts !== false) {
                $startYmd = date('Y-m-d', $ts);
            }
        }
    }
    if ($startYmd === null) {
        $rawStart = $t['bp_day_start'] ?? null;
        $startYmd = bankProcessParseDayStartToYmd($rawStart);
    }
    if ($startYmd === null) {
        return 'Pro-rated@monthly';
    }
    $tsStart = strtotime($startYmd . ' 12:00:00');
    if ($tsStart === false) {
        return 'Pro-rated@monthly';
    }
    $endYmd = date('Y-m-t', $tsStart);
    $tsEnd = strtotime($endYmd . ' 12:00:00');
    $startDm = date('j/n', $tsStart);
    $endDm = $tsEnd !== false ? date('j/n', $tsEnd) : date('j/n', $tsStart);
    $daysCount = (int) floor((strtotime($endYmd . ' 12:00:00') - $tsStart) / 86400) + 1;
    if ($daysCount < 1) {
        $daysCount = 1;
    }

    $value = bankProcessResolveDisplayValueByAccount($t);

    return "Pro-rated({$startDm} - {$endDm} | {$daysCount}days)@Monthly {$value}";
}

/**
 * day_end 区间账单描述：
 * - $withPrefix=true  => DayEnd - Prorated(dd/mm - dd/mm | N days)@Monthly <value>
 * - $withPrefix=false => Prorated(dd/mm - dd/mm | N days)@Monthly <value>
 */
function bankProcessDayEndProratedDescription(array $t, bool $withPrefix = true): string
{
    $startYmd = null;
    $td = trim((string) ($t['transaction_date'] ?? ''));
    if ($td !== '') {
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $td, $m)) {
            $startYmd = $m[1];
        } else {
            $ts = strtotime(str_replace('/', '-', $td));
            if ($ts !== false) {
                $startYmd = date('Y-m-d', $ts);
            }
        }
    }
    $endYmd = bankProcessParseDayStartToYmd($t['bp_resend_day_end'] ?? null);
    if ($endYmd === null) {
        $endYmd = bankProcessParseDayStartToYmd($t['bp_day_end'] ?? null);
    }
    if ($startYmd === null && $endYmd !== null) {
        $startYmd = $endYmd;
    }
    if ($startYmd === null) {
        $value = bankProcessResolveDisplayValueByAccount($t);
        return ($withPrefix ? 'DayEnd - Prorated@Monthly' : 'Prorated@Monthly') . " {$value}";
    }
    if ($endYmd === null || $endYmd < $startYmd) {
        $endYmd = $startYmd;
    }

    $tsStart = strtotime($startYmd . ' 12:00:00');
    $tsEnd = strtotime($endYmd . ' 12:00:00');
    if ($tsStart === false || $tsEnd === false) {
        $value = bankProcessResolveDisplayValueByAccount($t);
        return ($withPrefix ? 'DayEnd - Prorated@Monthly' : 'Prorated@Monthly') . " {$value}";
    }

    $startDm = date('j/n', $tsStart);
    $endDm = date('j/n', $tsEnd);
    $daysCount = (int) floor(($tsEnd - $tsStart) / 86400) + 1;
    if ($daysCount < 1) {
        $daysCount = 1;
    }

    $prefix = $withPrefix ? 'DayEnd - Prorated(' : 'Prorated(';
    $value = bankProcessResolveDisplayValueByAccount($t);
    return $prefix . $startDm . ' - ' . $endDm . ' | ' . $daysCount . " days)@Monthly {$value}";
}
