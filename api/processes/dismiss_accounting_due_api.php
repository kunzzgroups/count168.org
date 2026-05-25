<?php
/**
 * Dismiss Accounting Due API
 * 仅从「待入账」列表移除选中的行，不生成 Transaction，不删除 Bank Process。
 * 用户表示「不进行这笔入账」，该行从 Accounting Due 消失，Process 数据不变。
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');

require_once __DIR__ . '/../../includes/config.php';
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
    if ($t === 'once_one_off') {
        return 'once_one_off_skipped';
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

/**
 * 兜底识别：当前 process 若处于 Resend 合并区间（relax=1 且 schedule 同时有 day_start/day_end），
 * 即使前端传了 monthly，也应按 resend_consolidated_range 处理，避免 Delete 成功提示但 Accounting Due 残留。
 */
function isProcessInResendConsolidatedMode(PDO $pdo, int $companyId, int $processId): bool
{
    bmp_ensureBankProcessAccountingResendRelaxColumn($pdo);
    bmp_ensureBankProcessAccountingResendScheduleColumns($pdo);
    $hasRelaxCol = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');
    $hasSchedCols = bmp_bankProcessHasResendScheduleColumns($pdo);
    if (!$hasRelaxCol || !$hasSchedCols) {
        return false;
    }
    $stmt = $pdo->prepare(
        "SELECT id, day_start, day_end, accounting_resend_relax_created_floor,
                accounting_resend_schedule_day_start, accounting_resend_schedule_day_end, accounting_resend_schedule_frequency
         FROM bank_process
         WHERE id = ? AND company_id = ? LIMIT 1"
    );
    $stmt->execute([$processId, $companyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return false;
    }
    $merged = bmp_mergeResendScheduleIntoBankProcessRowForAccounting($row);
    return !empty($merged['accounting_resend_consolidated_range']);
}

/** 专用 Dismiss 锁：按 process + period_type + anchor_date 标记已从 Accounting Due 移除 */
function ensureAccountingDueDismissedTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS process_accounting_due_dismissed (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            process_id INT NOT NULL,
            period_type VARCHAR(64) NOT NULL,
            anchor_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pad_dismissed (company_id, process_id, period_type, anchor_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function upsertAccountingDueDismissed(PDO $pdo, int $companyId, int $processId, string $periodType, string $anchorDate): void
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $anchorDate)) {
        return;
    }
    $stmt = $pdo->prepare(
        "INSERT INTO process_accounting_due_dismissed
         (company_id, process_id, period_type, anchor_date)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP"
    );
    $stmt->execute([$companyId, $processId, $periodType, $anchorDate]);
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
        if ($pt !== 'partial_first_month' && $pt !== 'manual_inactive' && $pt !== 'day_end_tail' && $pt !== 'resend_consolidated_range' && $pt !== 'once_one_off') {
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
    $processIdsForPrune = [];
    bmp_ensureMaintenanceResendPendingTable($pdo);
    ensureAccountingDueDismissedTable($pdo);
    $insPap = $pdo->prepare("INSERT IGNORE INTO process_accounting_posted (company_id, process_id, posted_date, period_type) VALUES (?, ?, ?, ?)");
    $selPap = $pdo->prepare("SELECT id FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?) AND period_type = ? LIMIT 1");
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
        if (in_array($periodType, ['monthly', 'day_end_tail', 'partial_first_month'], true)) {
            try {
                if (isProcessInResendConsolidatedMode($pdo, $companyId, $processId)) {
                    $periodType = 'resend_consolidated_range';
                }
            } catch (Throwable $e) {
                // ignore fallback detection failure, keep original period type
            }
        }
        $skippedType = toSkippedPeriodType($periodType);
        $postDate = $today;
        if (($periodType === 'monthly' || $periodType === 'day_end_tail') && ($p['billing_month'] ?? '') !== '') {
            $postDate = postedDateForMonthlyBillingMonth($p['billing_month'], $today);
        }
        if ($periodType === 'resend_consolidated_range') {
            // 与 process_accounting_inbox_api 一致：先合并 Resend 弹窗暂存列再取 day_start，避免 COALESCE(库列) 与 Inbox 展示锚点不一致导致无法写入 *_skipped。
            bmp_ensureBankProcessAccountingResendRelaxColumn($pdo);
            bmp_ensureBankProcessAccountingResendScheduleColumns($pdo);
            $hasRelaxCol = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');
            $hasSchedCols = bmp_bankProcessHasResendScheduleColumns($pdo);
            $selectCols = ['bp.id', 'bp.day_start', 'bp.day_end'];
            if ($hasRelaxCol) {
                $selectCols[] = 'bp.accounting_resend_relax_created_floor';
            }
            if ($hasSchedCols) {
                $selectCols[] = 'bp.accounting_resend_schedule_day_start';
                $selectCols[] = 'bp.accounting_resend_schedule_day_end';
                $selectCols[] = 'bp.accounting_resend_schedule_frequency';
            }
            $stmtBp = $pdo->prepare('SELECT ' . implode(', ', $selectCols) . ' FROM bank_process bp WHERE bp.id = ? AND bp.company_id = ? LIMIT 1');
            $stmtBp->execute([$processId, $companyId]);
            $bpRow = $stmtBp->fetch(PDO::FETCH_ASSOC);
            if ($bpRow) {
                $merged = bmp_mergeResendScheduleIntoBankProcessRowForAccounting($bpRow);
                $dsMerged = $merged['day_start'] ?? null;
                $normDs = bmp_bankProcessDateFieldToYmd($dsMerged);
                if ($normDs !== null && $normDs !== '') {
                    $postDate = $normDs;
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
            // INSERT IGNORE 未插入但已有同键 *_skipped 行：视为已移除（重复点 Delete 时条数不为 0）
            if ($papId > 0) {
                $inserted++;
            }
        }
        // 唯一键若与既有 resend_consolidated_range（非 skipped）同键冲突：INSERT IGNORE 不插入且上面 SELECT 也找不到 skipped → 直接改为 skipped。
        if ($papId === 0 && $periodType === 'resend_consolidated_range') {
            $updPap = $pdo->prepare(
                "UPDATE process_accounting_posted SET period_type = ?
                 WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?) AND period_type = 'resend_consolidated_range'"
            );
            $updPap->execute([$skippedType, $companyId, $processId, $postDate]);
            if ($updPap->rowCount() > 0) {
                $selPap->execute([$companyId, $processId, $postDate, $skippedType]);
                $fid2 = $selPap->fetchColumn();
                $papId = $fid2 ? (int) $fid2 : 0;
                if ($papId > 0) {
                    $inserted++;
                }
            }
            // 兜底 1：同锚点日可能是其它 period_type 占位，统一改为 consolidated_skipped。
            if ($papId === 0) {
                $updPapAny = $pdo->prepare(
                    "UPDATE process_accounting_posted SET period_type = ?
                     WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?) AND period_type NOT LIKE '%\\_skipped'"
                );
                $updPapAny->execute([$skippedType, $companyId, $processId, $postDate]);
                if ($updPapAny->rowCount() > 0) {
                    $selPap->execute([$companyId, $processId, $postDate, $skippedType]);
                    $fid2b = $selPap->fetchColumn();
                    $papId = $fid2b ? (int) $fid2b : 0;
                    if ($papId > 0) {
                        $inserted++;
                    }
                }
            }
            // 兜底 2：若锚点日依旧未命中（历史日期漂移），将该 process 最新 consolidated 改为 skipped。
            if ($papId === 0) {
                $updLatest = $pdo->prepare(
                    "UPDATE process_accounting_posted SET period_type = ?
                     WHERE company_id = ? AND process_id = ? AND period_type = 'resend_consolidated_range'
                     ORDER BY id DESC LIMIT 1"
                );
                $updLatest->execute([$skippedType, $companyId, $processId]);
                if ($updLatest->rowCount() > 0) {
                    $selLatest = $pdo->prepare(
                        "SELECT id FROM process_accounting_posted
                         WHERE company_id = ? AND process_id = ? AND period_type = ?
                         ORDER BY id DESC LIMIT 1"
                    );
                    $selLatest->execute([$companyId, $processId, $skippedType]);
                    $fid2c = $selLatest->fetchColumn();
                    $papId = $fid2c ? (int) $fid2c : 0;
                    if ($papId > 0) {
                        $inserted++;
                    }
                }
            }
        }
        if ($periodType === 'resend_consolidated_range') {
            upsertAccountingDueDismissed($pdo, $companyId, $processId, 'resend_consolidated_range', $postDate);
        }
        if ($papId > 0) {
            $ptNorm = bmp_normalizePeriodType($periodType);
            $insRp->execute([$companyId, $processId, $papId, $ptNorm, $postDate]);
        }
        $anchorYmd = bmp_normalizeSqlDateYmd($postDate);
        if ($anchorYmd !== null) {
            bmp_clearAccountingResendDailyGuardForDayStart($pdo, $companyId, $processId, $anchorYmd);
            $processIdsForPrune[$processId] = true;
        }
    }

    foreach (array_keys($processIdsForPrune) as $pid) {
        bmp_pruneStaleAccountingResendDailyGuardsForProcess($pdo, $companyId, (int) $pid);
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