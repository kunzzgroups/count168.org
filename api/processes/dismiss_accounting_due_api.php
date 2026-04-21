<?php
/**
 * Dismiss Accounting Due API
 * 仅从「待入账」列表移除选中的行，不生成 Transaction，不删除 Bank Process。
 * 用户表示「不进行这笔入账」，该行从 Accounting Due 消失，Process 数据不变。
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../bankprocess_maintenance/maintenance_accounting_resend_lib.php';

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

/** 将 period_type 转为「已跳过」类型，写入 process_accounting_posted 后 inbox 不再显示 */
function toSkippedPeriodType(string $periodType): string
{
    $t = trim($periodType);
    if ($t === 'manual_inactive') {
        return 'manual_inactive_skipped';
    }
    if ($t === 'partial_first_month') {
        return 'partial_first_month_skipped';
    }
    if ($t === 'day_end_tail') {
        return 'day_end_tail_skipped';
    }
    if ($t === 'resend_consolidated_range') {
        return 'resend_consolidated_range_skipped';
    }
    return 'monthly_skipped';
}

/** 与 process_post_to_transaction_api 一致：monthly 跳过记录须落在账单所属自然月。 */
function postedDateForMonthlyBillingMonth(?string $billingMonthYn, string $fallbackYmd): string
{
    if ($billingMonthYn === null || trim($billingMonthYn) === '') {
        return $fallbackYmd;
    }
    if (!preg_match('/^(\d{4})-(\d{1,2})$/', trim($billingMonthYn), $m)) {
        return $fallbackYmd;
    }
    $y = (int) $m[1];
    $mo = (int) $m[2];
    if ($y < 1970 || $mo < 1 || $mo > 12) {
        return $fallbackYmd;
    }
    return sprintf('%04d-%02d-01', $y, $mo);
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, '请先登录', null);
        exit;
    }
    $companyId = (int) ($_SESSION['company_id'] ?? 0);
    if (!$companyId) {
        http_response_code(400);
        jsonResponse(false, '缺少公司信息', null);
        exit;
    }

    $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_map('intval', $_POST['ids']) : [];
    $ids = array_filter($ids);
    $periodTypes = isset($_POST['period_types']) && is_array($_POST['period_types']) ? $_POST['period_types'] : [];
    if (empty($ids)) {
        http_response_code(400);
        jsonResponse(false, '请至少选择一行', null);
        exit;
    }

    $billingMonths = isset($_POST['billing_months']) && is_array($_POST['billing_months']) ? $_POST['billing_months'] : [];
    $pairs = [];
    foreach ($ids as $i => $id) {
        $pt = isset($periodTypes[$i]) ? trim((string) $periodTypes[$i]) : 'monthly';
        if ($pt !== 'partial_first_month' && $pt !== 'manual_inactive' && $pt !== 'day_end_tail' && $pt !== 'resend_consolidated_range') {
            $pt = 'monthly';
        }
        $pairs[] = [
            'id' => (int) $id,
            'period_type' => $pt,
            'billing_month' => isset($billingMonths[$i]) ? trim((string) $billingMonths[$i]) : '',
        ];
    }
    $seen = [];
    $pairs = array_values(array_filter($pairs, function ($p) use (&$seen) {
        $key = $p['id'] . '_' . $p['period_type'];
        if (isset($seen[$key])) {
            return false;
        }
        $seen[$key] = true;
        return true;
    }));

    $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
    if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
        http_response_code(500);
        jsonResponse(false, 'process_accounting_posted 表不存在', null);
        exit;
    }
    $hasPeriodType = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');
    if (!$hasPeriodType) {
        http_response_code(500);
        jsonResponse(false, 'process_accounting_posted 缺少 period_type 列', null);
        exit;
    }

    $today = date('Y-m-d');
    $inserted = 0;
    bmp_ensureMaintenanceResendPendingTable($pdo);
    $insPap = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date, period_type) VALUES (?, ?, ?, ?)");
    $selPap = $pdo->prepare("SELECT id FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND posted_date = ? AND period_type = ? LIMIT 1");
    $insRp = $pdo->prepare(
        "INSERT IGNORE INTO bank_process_maintenance_resend_pending
         (company_id, bank_process_id, process_accounting_posted_id, period_type, transaction_date)
         VALUES (?, ?, ?, ?, ?)"
    );
    foreach ($pairs as $p) {
        $processId = $p['id'];
        $periodType = $p['period_type'];
        $stmt = $pdo->prepare("SELECT id FROM bank_process WHERE id = ? AND company_id = ? LIMIT 1");
        $stmt->execute([$processId, $companyId]);
        if (!$stmt->fetch()) {
            continue;
        }
        $skippedType = toSkippedPeriodType($periodType);
        $postDate = $today;
        if (($periodType === 'monthly' || $periodType === 'day_end_tail') && ($p['billing_month'] ?? '') !== '') {
            $postDate = postedDateForMonthlyBillingMonth($p['billing_month'], $today);
        }
        if ($periodType === 'resend_consolidated_range') {
            $dsSql = bmp_bankProcessHasResendScheduleColumns($pdo)
                ? 'COALESCE(accounting_resend_schedule_day_start, day_start) AS ds'
                : 'day_start AS ds';
            $stmtDs = $pdo->prepare("SELECT $dsSql FROM bank_process WHERE id = ? AND company_id = ? LIMIT 1");
            $stmtDs->execute([$processId, $companyId]);
            $dsRaw = $stmtDs->fetchColumn();
            if ($dsRaw !== false && $dsRaw !== null && trim((string) $dsRaw) !== '') {
                $tsDs = strtotime((string) $dsRaw);
                if ($tsDs !== false) {
                    $postDate = date('Y-m-d', $tsDs);
                }
            }
        }
        $insPap->execute([$companyId, $processId, $postDate, $skippedType]);
        $papId = 0;
        if ($insPap->rowCount() > 0) {
            $inserted++;
            $papId = (int) $pdo->lastInsertId();
        } else {
            $selPap->execute([$companyId, $processId, $postDate, $skippedType]);
            $fid = $selPap->fetchColumn();
            $papId = $fid ? (int) $fid : 0;
        }
        if ($papId > 0) {
            $ptNorm = bmp_normalizePeriodType($periodType);
            $insRp->execute([$companyId, $processId, $papId, $ptNorm, $postDate]);
        }
    }

    jsonResponse(true, $inserted === 1 ? '已从待入账列表移除 1 条' : '已从待入账列表移除 ' . $inserted . ' 条', ['dismissed' => $inserted]);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('dismiss_accounting_due_api: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '服务器错误', null);
}