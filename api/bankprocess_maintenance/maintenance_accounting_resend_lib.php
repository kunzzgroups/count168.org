<?php
/**
 * 维护页删除 Bank process 来源的 transactions 后，记录「Resend → Accounting Due」待办。
 * Resend 成功时清除该 bank_process 下全部 process_accounting_posted（避免只删了部分 period 时残留 PAP 导致 Inbox 少行）。
 * Resend 成功后可置 accounting_resend_relax_created_floor：Inbox / 入账推断里「创建日门槛」与 day_start 取较早者，避免用户修正 day_start 后仍被「旧数据不拿」挡住（正常新建流程不受影响）。
 */

if (!function_exists('bmp_resend_tableHasColumn')) {
    function bmp_resend_tableHasColumn(PDO $pdo, string $table, string $column): bool
    {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        return $stmt->rowCount() > 0;
    }
}

if (!function_exists('bmp_ensureMaintenanceResendPendingTable')) {
    function bmp_ensureMaintenanceResendPendingTable(PDO $pdo): void
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS bank_process_maintenance_resend_pending (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                bank_process_id INT NOT NULL,
                process_accounting_posted_id INT NULL,
                period_type VARCHAR(64) NOT NULL DEFAULT 'monthly',
                transaction_date DATE NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_bmp_resend_pap (process_accounting_posted_id),
                UNIQUE KEY uq_bmp_resend_fallback (company_id, bank_process_id, period_type, transaction_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ";
        $pdo->exec($sql);
    }
}

if (!function_exists('bmp_ensureBankProcessAccountingResendRelaxColumn')) {
    /** 若无列则 ALTER，避免未跑迁移时 Resend 无法置 accounting_resend_relax_created_floor */
    function bmp_ensureBankProcessAccountingResendRelaxColumn(PDO $pdo): void
    {
        if (bmp_resend_tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor')) {
            return;
        }
        try {
            $pdo->exec(
                "ALTER TABLE bank_process ADD COLUMN accounting_resend_relax_created_floor TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT '1=Resend 后 Inbox 放宽创建日门槛并允许多账期'"
            );
        } catch (Throwable $e) {
            // 并发重复添加等：忽略
        }
    }
}

if (!function_exists('bmp_ensureBankProcessAccountingResendScheduleColumns')) {
    /**
     * Resend 弹窗中的 day_start / day_end / frequency 不写入「编辑流程」字段，但入账与 Inbox 须与弹窗一致：
     * 在 accounting_resend_relax_created_floor=1 期间用下列暂存列覆盖计算；入账成功后与 relax 一并清空。
     */
    function bmp_ensureBankProcessAccountingResendScheduleColumns(PDO $pdo): void
    {
        $defs = [
            'accounting_resend_schedule_day_start' => "DATE NULL COMMENT 'Resend 弹窗 day_start，仅 relax 期间'",
            'accounting_resend_schedule_day_end' => "DATE NULL COMMENT 'Resend 弹窗 day_end，仅 relax 期间'",
            'accounting_resend_schedule_frequency' => "VARCHAR(40) NULL COMMENT 'monthly 或 1st_of_every_month，仅 relax 期间'",
        ];
        foreach ($defs as $col => $ddlTail) {
            if (bmp_resend_tableHasColumn($pdo, 'bank_process', $col)) {
                continue;
            }
            try {
                $pdo->exec("ALTER TABLE bank_process ADD COLUMN `$col` $ddlTail");
            } catch (Throwable $e) {
                // ignore
            }
        }
    }
}

if (!function_exists('bmp_bankProcessHasResendScheduleColumns')) {
    function bmp_bankProcessHasResendScheduleColumns(PDO $pdo): bool
    {
        return bmp_resend_tableHasColumn($pdo, 'bank_process', 'accounting_resend_schedule_day_start');
    }
}

/**
 * Resend 成功后 relax=1 时，用暂存列覆盖 day_start / day_end / day_start_frequency 供 Inbox 与入账推断（不改编辑表单里的持久字段）。
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
if (!function_exists('bmp_mergeResendScheduleIntoBankProcessRowForAccounting')) {
    function bmp_mergeResendScheduleIntoBankProcessRowForAccounting(array $row): array
    {
        if (empty($row['accounting_resend_relax_created_floor'])) {
            unset(
                $row['accounting_resend_schedule_day_start'],
                $row['accounting_resend_schedule_day_end'],
                $row['accounting_resend_schedule_frequency'],
                $row['accounting_resend_single_period_from_schedule'],
                $row['accounting_resend_consolidated_range'],
                $row['bank_process_stored_day_start']
            );
            return $row;
        }
        // 入账 API 在清除 Resend 覆盖前可比对「编辑里持久化的 day_start」与弹窗锚点，避免补历史整月后仍排队真实锚点的首月 partial。
        $row['bank_process_stored_day_start'] = $row['day_start'] ?? null;
        $ds = $row['accounting_resend_schedule_day_start'] ?? null;
        $hadScheduleStart = $ds !== null && trim((string) $ds) !== '';
        if ($hadScheduleStart) {
            // 弹窗指定了 day_start：只补该锚点所在那一期（如 1/13→2/13），不按合同把后续月全部列进 Accounting Due。
            $row['accounting_resend_single_period_from_schedule'] = 1;
        }
        if ($hadScheduleStart) {
            $row['day_start'] = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) $ds, $m) ? $m[1] : $ds;
        }
        $de = $row['accounting_resend_schedule_day_end'] ?? null;
        $hadScheduleEnd = $de !== null && trim((string) $de) !== '';
        if ($hadScheduleEnd) {
            $row['day_end'] = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) $de, $m) ? $m[1] : $de;
        }
        // Resend 弹窗同时填 day_start + day_end：按自然月切段合并为一笔（仅 relax 期间；不入库为独立列）
        if ($hadScheduleStart && $hadScheduleEnd) {
            $row['accounting_resend_consolidated_range'] = 1;
        }
        $fq = isset($row['accounting_resend_schedule_frequency']) ? strtolower(trim((string) $row['accounting_resend_schedule_frequency'])) : '';
        if ($fq === 'monthly' || $fq === '1st_of_every_month' || $fq === 'week' || $fq === 'day' || $fq === 'once') {
            $row['day_start_frequency'] = $fq;
        }
        if (!$hadScheduleStart && !empty($row['accounting_resend_relax_created_floor'])
            && ($fq === 'monthly' || $fq === '1st_of_every_month')) {
            // Resend stored frequency but left schedule_day_start NULL: still one anchor month for this relax session.
            $row['accounting_resend_single_period_from_schedule'] = 1;
        }
        unset(
            $row['accounting_resend_schedule_day_start'],
            $row['accounting_resend_schedule_day_end'],
            $row['accounting_resend_schedule_frequency']
        );
        // bank_process_stored_day_start 仅内存字段，供入账 API 使用，不入库
        return $row;
    }
}

if (!function_exists('bmp_normalizePeriodType')) {
    function bmp_normalizePeriodType(?string $raw): string
    {
        $t = strtolower(trim((string) $raw));
        if ($t === 'partial_first_month' || $t === 'manual_inactive' || $t === 'day_end_tail'
            || $t === 'resend_consolidated_range' || $t === 'once_one_off' || $t === 'weekly'
            || $t === 'daily' || $t === 'daily_consolidated') {
            return $t;
        }
        return 'monthly';
    }
}

/**
 * 与 process_accounting_inbox_api / process_post 一致：优先 d/m/Y，避免原始 day_start 被 strtotime 误解析，
 * 导致 dismiss 写入的 posted_date 与 Inbox 判定锚点不一致（Resend 合并行删后仍显示）。
 */
if (!function_exists('bmp_bankProcessDateFieldToYmd')) {
    function bmp_bankProcessDateFieldToYmd($raw): ?string
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
}

/**
 * Resend（accounting_resend_relax_created_floor）且合并后的 day_start / day_end 跨自然月时：
 * 勿再对其中某一整月单独套用「月初～day_end」按月截断，否则会多出下一月的 Accounting Due / Transaction，
 * 与「单笔合并区间」或用户预期的单日总价冲突。
 */
if (!function_exists('bmp_shouldSkipDayEndMonthlyCapForResendCrossMonthRange')) {
    function bmp_shouldSkipDayEndMonthlyCapForResendCrossMonthRange(array $row): bool
    {
        if (empty($row['accounting_resend_relax_created_floor'])) {
            return false;
        }
        $ds = bmp_bankProcessDateFieldToYmd($row['day_start'] ?? null);
        $de = bmp_bankProcessDateFieldToYmd($row['day_end'] ?? null);
        if ($ds === null || $de === null || $ds > $de) {
            return false;
        }
        try {
            return (new DateTimeImmutable($ds))->format('Y-m') !== (new DateTimeImmutable($de))->format('Y-m');
        } catch (Throwable $e) {
            return false;
        }
    }
}

/**
 * Accounting Inbox / 入账推断：Resend 后放宽「旧数据不拿」的创建日门槛。
 * 将 effectiveCreated = min(dts_created 日, day_start)，使修正后的 day_start 不晚于创建日时仍可按新锚点排队。
 *
 * @param string $createdYmd 来自 dts_created 的 Y-m-d
 * @param string|null $dayStartYmd 解析后的 day_start（Y-m-d），无效时传 null
 */
if (!function_exists('bmp_inboxEffectiveCreatedYmd')) {
    function bmp_inboxEffectiveCreatedYmd(string $createdYmd, ?string $dayStartYmd, bool $relaxCreatedFloor): string
    {
        if (!$relaxCreatedFloor || $dayStartYmd === null || $dayStartYmd === '') {
            return $createdYmd;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayStartYmd)) {
            return $createdYmd;
        }
        return min($createdYmd, $dayStartYmd);
    }
}

/** Monthly 先付：该应付日是否已有 monthly / monthly_skipped（按 DATE(posted_date)，非整自然月）。 */
if (!function_exists('bmp_hasMonthlyPostedOrSkippedForDueYmd')) {
    function bmp_hasMonthlyPostedOrSkippedForDueYmd(PDO $pdo, int $companyId, int $processId, string $dueYmd): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueYmd)) {
            return false;
        }
        try {
            $stmt = $pdo->prepare(
                "SELECT 1 FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?)
                   AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '')
                 LIMIT 1"
            );
            $stmt->execute([$companyId, $processId, $dueYmd]);
            return (bool) $stmt->fetch();
        } catch (Throwable $e) {
            return false;
        }
    }
}

/**
 * 由 billing_month 锚点（Y-n 或 Y-m-d）与 day_start 推算 Monthly 应付日；无法解析时返回 null。
 */
if (!function_exists('bmp_monthlyDueYmdFromBillingAnchor')) {
    function bmp_monthlyDueYmdFromBillingAnchor(string $billingAnchor, string $dayStartYmd, string $frequency = 'monthly'): ?string
    {
        $anchor = trim($billingAnchor);
        if ($anchor === '') {
            return null;
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $anchor, $md) && checkdate((int) $md[2], (int) $md[3], (int) $md[1])) {
            return $md[1] . '-' . $md[2] . '-' . $md[3];
        }
        if (!preg_match('/^(\d{4})-(\d{1,2})$/', $anchor, $m)) {
            return null;
        }
        $billY = (int) $m[1];
        $billMo = (int) $m[2];
        if ($billY < 1970 || $billMo < 1 || $billMo > 12) {
            return null;
        }
        if ($frequency === '1st_of_every_month') {
            return sprintf('%04d-%02d-01', $billY, $billMo);
        }
        $startTs = strtotime($dayStartYmd);
        if ($startTs === false) {
            return null;
        }
        $last = (int) date('t', mktime(0, 0, 0, $billMo, 1, $billY));
        $dueDay = min(max(1, (int) date('j', $startTs)), $last);
        $dueYmd = sprintf('%04d-%02d-%02d', $billY, $billMo, $dueDay);
        try {
            $billYm = sprintf('%04d-%d', $billY, $billMo);
            if ((new DateTimeImmutable($dayStartYmd))->format('Y-n') === $billYm) {
                return $dayStartYmd;
            }
        } catch (Throwable $e) {
            // keep $dueYmd
        }
        return $dueYmd;
    }
}

if (!function_exists('bmp_resolveProcessAccountingPostedId')) {
    function bmp_resolveProcessAccountingPostedId(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $periodType,
        string $transactionDateYmd
    ): ?int {
        $stmtCh = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCh || $stmtCh->rowCount() === 0) {
            return null;
        }
        if (!bmp_resend_tableHasColumn($pdo, 'process_accounting_posted', 'period_type')) {
            return null;
        }

        $pt = bmp_normalizePeriodType($periodType);

        if ($pt === 'manual_inactive') {
            $stmt = $pdo->prepare(
                "SELECT id FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ('manual_inactive','manual_inactive_skipped')
                 ORDER BY posted_date DESC, id DESC LIMIT 1"
            );
            $stmt->execute([$companyId, $bankProcessId]);
            $id = $stmt->fetchColumn();
            return $id ? (int) $id : null;
        }

        $typeSets = [
            'monthly' => ['monthly', 'monthly_skipped'],
            'weekly' => ['weekly', 'weekly_skipped'],
            'daily' => ['daily', 'daily_skipped'],
            'daily_consolidated' => ['daily', 'daily_skipped'],
            'day_end_tail' => ['day_end_tail', 'day_end_tail_skipped'],
            'partial_first_month' => ['partial_first_month', 'partial_first_month_skipped'],
            'resend_consolidated_range' => ['resend_consolidated_range', 'resend_consolidated_range_skipped'],
        ];
        $types = $typeSets[$pt] ?? ['monthly', 'monthly_skipped'];
        $in = implode(',', array_fill(0, count($types), '?'));

        $sql = "SELECT id FROM process_accounting_posted
                WHERE company_id = ? AND process_id = ?
                AND period_type IN ($in) AND posted_date = ? LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd]));
        $id = $stmt->fetchColumn();
        if ($id) {
            return (int) $id;
        }

        if ($pt === 'monthly' || $pt === 'day_end_tail' || $pt === 'resend_consolidated_range') {
            $sql2 = "SELECT id FROM process_accounting_posted
                     WHERE company_id = ? AND process_id = ?
                     AND period_type IN ($in)
                     AND YEAR(posted_date) = YEAR(?) AND MONTH(posted_date) = MONTH(?)
                     LIMIT 1";
            $stmt2 = $pdo->prepare($sql2);
            $stmt2->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd, $transactionDateYmd]));
            $id2 = $stmt2->fetchColumn();
            return $id2 ? (int) $id2 : null;
        }

        return null;
    }
}

if (!function_exists('bmp_deletePapFallback')) {
    function bmp_deletePapFallback(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $periodType,
        string $transactionDateYmd
    ): int {
        if (!bmp_resend_tableHasColumn($pdo, 'process_accounting_posted', 'period_type')) {
            return 0;
        }
        $pt = bmp_normalizePeriodType($periodType);
        if ($pt === 'manual_inactive') {
            $stmt = $pdo->prepare(
                "DELETE FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ('manual_inactive','manual_inactive_skipped')
                 ORDER BY posted_date DESC, id DESC LIMIT 1"
            );
            $stmt->execute([$companyId, $bankProcessId]);
            return $stmt->rowCount();
        }
        $typeSets = [
            'monthly' => ['monthly', 'monthly_skipped'],
            'weekly' => ['weekly', 'weekly_skipped'],
            'daily' => ['daily', 'daily_skipped'],
            'daily_consolidated' => ['daily', 'daily_skipped'],
            'day_end_tail' => ['day_end_tail', 'day_end_tail_skipped'],
            'partial_first_month' => ['partial_first_month', 'partial_first_month_skipped'],
            'resend_consolidated_range' => ['resend_consolidated_range', 'resend_consolidated_range_skipped'],
        ];
        $types = $typeSets[$pt] ?? ['monthly', 'monthly_skipped'];
        $in = implode(',', array_fill(0, count($types), '?'));
        $sql = "DELETE FROM process_accounting_posted
                WHERE company_id = ? AND process_id = ?
                AND period_type IN ($in) AND posted_date = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd]));
        $n = $stmt->rowCount();
        if ($n > 0 || ($pt !== 'monthly' && $pt !== 'day_end_tail' && $pt !== 'resend_consolidated_range' && $pt !== 'weekly' && $pt !== 'daily' && $pt !== 'daily_consolidated')) {
            return $n;
        }
        $sql2 = "DELETE FROM process_accounting_posted
                 WHERE company_id = ? AND process_id = ?
                 AND period_type IN ($in)
                 AND YEAR(posted_date) = YEAR(?) AND MONTH(posted_date) = MONTH(?) LIMIT 1";
        $stmt2 = $pdo->prepare($sql2);
        $stmt2->execute(array_merge([$companyId, $bankProcessId], $types, [$transactionDateYmd, $transactionDateYmd]));
        return $stmt2->rowCount();
    }
}

if (!function_exists('bmp_recordResendPendingForTransactionIds')) {
    function bmp_recordResendPendingForTransactionIds(PDO $pdo, int $companyId, array $transactionIds): void
    {
        if (empty($transactionIds)) {
            return;
        }
        // IMPORTANT:
        // Do not run DDL (CREATE TABLE) inside a transaction, because MySQL may implicitly commit and
        // break the caller's transaction boundary (leading to "There is no active transaction" on commit()).
        // Call bmp_ensureMaintenanceResendPendingTable($pdo) BEFORE starting a DB transaction in the caller.

        $hasSource = bmp_resend_tableHasColumn($pdo, 'transactions', 'source_bank_process_id');
        if (!$hasSource) {
            return;
        }
        $hasPeriodCol = bmp_resend_tableHasColumn($pdo, 'transactions', 'source_bank_process_period_type');
        $periodExpr = $hasPeriodCol
            ? "COALESCE(NULLIF(TRIM(t.source_bank_process_period_type), ''), 'monthly')"
            : "'monthly'";

        $placeholders = implode(',', array_fill(0, count($transactionIds), '?'));
        $sql = "SELECT t.id, t.source_bank_process_id, DATE(t.transaction_date) AS txd, $periodExpr AS period_type
                FROM transactions t
                INNER JOIN account a ON t.account_id = a.id
                INNER JOIN account_company ac ON a.id = ac.account_id
                WHERE t.id IN ($placeholders) AND ac.company_id = ? AND t.source_bank_process_id IS NOT NULL";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($transactionIds, [$companyId]));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $seenPap = [];
        $insPap = $pdo->prepare(
            "INSERT IGNORE INTO bank_process_maintenance_resend_pending
             (company_id, bank_process_id, process_accounting_posted_id, period_type, transaction_date)
             VALUES (?, ?, ?, ?, ?)"
        );
        $insFb = $pdo->prepare(
            "INSERT IGNORE INTO bank_process_maintenance_resend_pending
             (company_id, bank_process_id, process_accounting_posted_id, period_type, transaction_date)
             VALUES (?, ?, NULL, ?, ?)"
        );

        foreach ($rows as $r) {
            $bpId = (int) $r['source_bank_process_id'];
            if ($bpId <= 0) {
                continue;
            }
            $txd = $r['txd'] ?? null;
            $txdStr = $txd ? (string) $txd : '1970-01-01';
            $pt = bmp_normalizePeriodType($r['period_type'] ?? 'monthly');

            $papId = bmp_resolveProcessAccountingPostedId($pdo, $companyId, $bpId, $pt, $txdStr);
            if ($papId !== null && $papId > 0) {
                if (isset($seenPap[$papId])) {
                    continue;
                }
                $seenPap[$papId] = true;
                $insPap->execute([$companyId, $bpId, $papId, $pt, $txdStr]);
            } else {
                $insFb->execute([$companyId, $bpId, $pt, $txdStr]);
            }
        }
    }
}

if (!function_exists('bmp_ensureAccountingResendDailyGuardTable')) {
    /**
     * Resend 当日防重复：bank_process_accounting_resend_daily_guard
     * 若用户已在 Maintenance 删除对应账单交易，须 prune 掉无凭证的 guard，否则仍会误拦。
     */
    function bmp_ensureAccountingResendDailyGuardTable(PDO $pdo): void
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS bank_process_accounting_resend_daily_guard (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT NOT NULL,
                bank_process_id INT NOT NULL,
                resend_day_start DATE NOT NULL,
                guard_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_bp_resend_daily_guard (company_id, bank_process_id, resend_day_start, guard_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ";
        $pdo->exec($sql);
        try {
            $pdo->exec(
                'ALTER TABLE bank_process_accounting_resend_daily_guard DROP INDEX uq_bp_resend_daily_guard_company_date'
            );
        } catch (Throwable $e) {
        }
        try {
            $idx = $pdo->query(
                "SHOW INDEX FROM bank_process_accounting_resend_daily_guard WHERE Key_name = 'uq_bp_resend_daily_guard'"
            );
            $cols = [];
            if ($idx) {
                while ($r = $idx->fetch(PDO::FETCH_ASSOC)) {
                    $cols[(int) ($r['Seq_in_index'] ?? 0)] = (string) ($r['Column_name'] ?? '');
                }
            }
            ksort($cols);
            $colList = array_values($cols);
            $hasProcessInUq = in_array('bank_process_id', $colList, true);
            if (!$hasProcessInUq && count($colList) > 0) {
                $pdo->exec('ALTER TABLE bank_process_accounting_resend_daily_guard DROP INDEX uq_bp_resend_daily_guard');
                $pdo->exec(
                    'ALTER TABLE bank_process_accounting_resend_daily_guard
                     ADD UNIQUE KEY uq_bp_resend_daily_guard (company_id, bank_process_id, resend_day_start, guard_date)'
                );
            }
        } catch (Throwable $e) {
        }
    }
}

if (!function_exists('bmp_normalizeSqlDateYmd')) {
    /** @param mixed $raw from DB DATE/DATETIME or string */
    function bmp_normalizeSqlDateYmd($raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $s = trim((string) $raw);
        if ($s === '') {
            return null;
        }
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $s, $m)) {
            return $m[1];
        }
        return null;
    }
}

if (!function_exists('bmp_accountingResendDailyGuardHasLiveEvidence')) {
    /**
     * 该 process 在 Maintenance 是否仍有对应锚日（transaction_date）的入账交易。
     * Accounting Due Delete（*_skipped）不算；仅成功 Post to Transaction 后会有行。
     */
    function bmp_accountingResendDailyGuardHasLiveEvidence(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $resendDayStartYmd
    ): bool {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $resendDayStartYmd)) {
            return false;
        }
        $stmt = $pdo->prepare(
            "SELECT 1
             FROM transactions t
             INNER JOIN account a ON t.account_id = a.id
             INNER JOIN account_company ac ON a.id = ac.account_id
             WHERE ac.company_id = ?
               AND t.source_bank_process_id = ?
               AND DATE(t.transaction_date) = ?
             LIMIT 1"
        );
        $stmt->execute([$companyId, $bankProcessId, $resendDayStartYmd]);
        return (bool) $stmt->fetchColumn();
    }
}

if (!function_exists('bmp_accountingResendIsLockedToday')) {
    /**
     * 当日是否禁止再次 Resend：须同时满足 guard_date=今天 且 Maintenance 仍有对应锚日交易。
     * Resend 本身不写 guard；Accounting Due Delete 会清除当日 guard → 可再 Resend。
     * 次日 guard_date 不匹配 → 可再 Resend（即使昨日交易仍在库中）。
     */
    function bmp_accountingResendIsLockedToday(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $resendDayStartYmd
    ): bool {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $resendDayStartYmd)) {
            return false;
        }
        bmp_ensureAccountingResendDailyGuardTable($pdo);
        bmp_pruneStaleAccountingResendDailyGuardsForProcess($pdo, $companyId, $bankProcessId);
        $stmt = $pdo->prepare(
            "SELECT 1
             FROM bank_process_accounting_resend_daily_guard
             WHERE company_id = ?
               AND bank_process_id = ?
               AND resend_day_start = ?
               AND guard_date = CURDATE()
             LIMIT 1"
        );
        $stmt->execute([$companyId, $bankProcessId, $resendDayStartYmd]);
        if (!(bool) $stmt->fetchColumn()) {
            return false;
        }

        return bmp_accountingResendDailyGuardHasLiveEvidence($pdo, $companyId, $bankProcessId, $resendDayStartYmd);
    }
}

if (!function_exists('bmp_recordAccountingResendDailyGuardOnTransactionPost')) {
    /** Bank Process 成功 Post to Transaction 后写入当日 guard（锚日 = transaction_date）。 */
    function bmp_recordAccountingResendDailyGuardOnTransactionPost(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $resendDayStartYmd
    ): void {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $resendDayStartYmd)) {
            return;
        }
        bmp_ensureAccountingResendDailyGuardTable($pdo);
        $ins = $pdo->prepare(
            "INSERT IGNORE INTO bank_process_accounting_resend_daily_guard
             (company_id, bank_process_id, resend_day_start, guard_date)
             VALUES (?, ?, ?, CURDATE())"
        );
        try {
            $ins->execute([$companyId, $bankProcessId, $resendDayStartYmd]);
        } catch (PDOException $e) {
            // ignore duplicate same day
        }
    }
}

if (!function_exists('bmp_clearAccountingResendDailyGuardForDayStart')) {
    /**
     * 从 Accounting Due 移除（Delete）后清除当日 guard，使同日可再次 Resend。
     * 不删除 Maintenance 交易；仅去掉「今日已 Post」的 Resend 锁。
     */
    function bmp_clearAccountingResendDailyGuardForDayStart(
        PDO $pdo,
        int $companyId,
        int $bankProcessId,
        string $resendDayStartYmd
    ): void {
        $ymd = bmp_normalizeSqlDateYmd($resendDayStartYmd);
        if ($ymd === null) {
            return;
        }
        bmp_ensureAccountingResendDailyGuardTable($pdo);
        $del = $pdo->prepare(
            "DELETE FROM bank_process_accounting_resend_daily_guard
             WHERE company_id = ? AND bank_process_id = ?
               AND resend_day_start = ? AND guard_date = CURDATE()"
        );
        $del->execute([$companyId, $bankProcessId, $ymd]);
    }
}

if (!function_exists('bmp_pruneStaleAccountingResendDailyGuardsForProcess')) {
    /**
     * 去掉已无对应交易凭证的当日 guard（删除账单后应可再次 Resend）。
     */
    function bmp_pruneStaleAccountingResendDailyGuardsForProcess(PDO $pdo, int $companyId, int $bankProcessId): void
    {
        bmp_ensureAccountingResendDailyGuardTable($pdo);
        $stmt = $pdo->prepare(
            "SELECT resend_day_start FROM bank_process_accounting_resend_daily_guard
             WHERE company_id = ? AND bank_process_id = ? AND guard_date = CURDATE()"
        );
        $stmt->execute([$companyId, $bankProcessId]);
        $days = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (empty($days)) {
            return;
        }
        $del = $pdo->prepare(
            "DELETE FROM bank_process_accounting_resend_daily_guard
             WHERE company_id = ? AND bank_process_id = ? AND guard_date = CURDATE() AND resend_day_start = ?"
        );
        foreach ($days as $ds) {
            $ymd = bmp_normalizeSqlDateYmd($ds);
            if ($ymd === null) {
                continue;
            }
            if (!bmp_accountingResendDailyGuardHasLiveEvidence($pdo, $companyId, $bankProcessId, $ymd)) {
                $del->execute([$companyId, $bankProcessId, $ymd]);
            }
        }
    }
}
