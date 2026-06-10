<?php
/**
 * Auto renew subscription helpers.
 * Ensures company columns exist; shared by auto_renew_api.php.
 */

require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../../includes/expiration_status.php';

const AUTO_RENEW_VALID_PERIODS = ['7days', '1month', '3months', '6months', '1year'];

function auto_renew_ensure_columns(PDO $pdo): void
{
    $columns = [
        'auto_renew_enabled' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'auto_renew_period' => 'VARCHAR(20) NULL DEFAULT NULL',
        'payment_customer_id' => 'VARCHAR(255) NULL DEFAULT NULL',
        'payment_subscription_id' => 'VARCHAR(255) NULL DEFAULT NULL',
        'auto_renew_updated_at' => 'DATETIME NULL DEFAULT NULL',
        'auto_renew_updated_by' => 'VARCHAR(50) NULL DEFAULT NULL',
    ];

    foreach ($columns as $name => $definition) {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM company LIKE ?');
        $stmt->execute([$name]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE company ADD COLUMN `$name` $definition");
        }
    }
}

function auto_renew_is_valid_period(?string $period): bool
{
    if ($period === null || $period === '') {
        return false;
    }
    return in_array($period, AUTO_RENEW_VALID_PERIODS, true);
}

function auto_renew_normalize_period(?string $period): ?string
{
    $period = trim((string) ($period ?? ''));
    return auto_renew_is_valid_period($period) ? $period : null;
}

function auto_renew_calculate_next_expiration(string $period, ?string $baseDate): ?string
{
    if (!auto_renew_is_valid_period($period)) {
        return null;
    }

    $base = $baseDate ? strtotime((string) $baseDate) : false;
    if ($base === false) {
        $base = strtotime(date('Y-m-d'));
    }
    if ($base === false) {
        return null;
    }

    $dt = new DateTime('@' . $base);
    $dt->setTimezone(new DateTimeZone(date_default_timezone_get()));
    $dt->setTime(0, 0, 0);

    switch ($period) {
        case '7days':
            $dt->modify('+7 days');
            break;
        case '1month':
            $dt->modify('+1 month');
            break;
        case '3months':
            $dt->modify('+3 months');
            break;
        case '6months':
            $dt->modify('+6 months');
            break;
        case '1year':
            $dt->modify('+1 year');
            break;
        default:
            return null;
    }

    return $dt->format('Y-m-d');
}

function auto_renew_days_until(?string $expirationDate): ?int
{
    if ($expirationDate === null || trim((string) $expirationDate) === '') {
        return null;
    }
    $expTs = strtotime((string) $expirationDate);
    if ($expTs === false) {
        return null;
    }
    $today = strtotime(date('Y-m-d'));
    return (int) floor(($expTs - $today) / 86400);
}

function auto_renew_expiration_status(?int $daysLeft): string
{
    return company_expiration_status($daysLeft);
}

function auto_renew_can_edit(array $session, ?PDO $pdo = null): bool
{
    $userType = strtolower(trim((string) ($session['user_type'] ?? '')));
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    if ($userType === 'member') {
        return false;
    }
    if ((int) ($session['read_only'] ?? 0) === 1) {
        return false;
    }
    if ($pdo instanceof PDO) {
        return userHasC168AutoRenewAccess($pdo, $role, $userType);
    }
    return in_array($role, c168AutoRenewAllowedRoles(), true);
}

function auto_renew_page_access(PDO $pdo, array $session): bool
{
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    $userType = strtolower(trim((string) ($session['user_type'] ?? '')));
    return userHasC168AutoRenewAccess($pdo, $role, $userType);
}

function auto_renew_status_map_access(PDO $pdo, array $session): bool
{
    if (auto_renew_page_access($pdo, $session)) {
        return true;
    }
    $role = strtolower(trim((string) ($session['role'] ?? '')));
    return userSessionHasC168CompanyContext($pdo) && userHasC168DomainPageAccess($role);
}

function auto_renew_list_client_companies(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id, company_id, group_id, expiration_date, auto_renew_enabled, auto_renew_period,
               auto_renew_updated_at, auto_renew_updated_by
        FROM company
        WHERE UPPER(company_id) <> 'C168'
        ORDER BY company_id ASC
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $list = [];
    foreach ($rows as $row) {
        $list[] = array_merge(
            auto_renew_format_row($row),
            ['company_numeric_id' => (int) ($row['id'] ?? 0)]
        );
    }
    return $list;
}

function auto_renew_resolve_target_company_id(PDO $pdo, array $input, array $session): ?int
{
    $targetId = isset($input['target_company_id']) ? (int) $input['target_company_id'] : 0;
    if ($targetId <= 0) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND UPPER(company_id) <> 'C168' LIMIT 1");
    $stmt->execute([$targetId]);
    $found = $stmt->fetchColumn();
    return $found ? (int) $found : null;
}

function auto_renew_is_c168(?string $companyCode): bool
{
    return strtoupper(trim((string) $companyCode)) === 'C168';
}

function auto_renew_format_row(array $row): array
{
    $expirationDate = !empty($row['expiration_date']) ? (string) $row['expiration_date'] : null;
    $daysLeft = auto_renew_days_until($expirationDate);
    $enabled = (int) ($row['auto_renew_enabled'] ?? 0) === 1;
    $period = auto_renew_normalize_period($row['auto_renew_period'] ?? null);

    return [
        'company_code' => (string) ($row['company_id'] ?? ''),
        'group_id' => !empty($row['group_id']) ? (string) $row['group_id'] : null,
        'expiration_date' => $expirationDate,
        'days_until_expiration' => $daysLeft,
        'expiration_status' => auto_renew_expiration_status($daysLeft),
        'auto_renew_enabled' => $enabled,
        'auto_renew_period' => $period,
        'preview_next_expiration' => ($enabled && $period && $expirationDate)
            ? auto_renew_calculate_next_expiration($period, $expirationDate)
            : null,
        'auto_renew_updated_at' => $row['auto_renew_updated_at'] ?? null,
        'auto_renew_updated_by' => $row['auto_renew_updated_by'] ?? null,
        'has_payment_gateway' => !empty($row['payment_subscription_id']),
    ];
}

// ── Manual approval queue (company_auto_renew_request) ─────────────────────

require_once __DIR__ . '/money_decimal.php';
require_once __DIR__ . '/payment_delete_shared.php';

const AUTO_RENEW_WINDOW_DAYS = 30;
const AUTO_RENEW_HISTORY_DAYS = 90;

function auto_renew_table_has_column(PDO $pdo, string $table, string $column): bool
{
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . str_replace('`', '', $table) . '` LIKE ?');
        $stmt->execute([$column]);
        return $stmt->rowCount() > 0;
    } catch (Exception $e) {
        return false;
    }
}

function auto_renew_ensure_request_table(PDO $pdo): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'company_auto_renew_request'");
        if ($stmt && $stmt->fetch(PDO::FETCH_NUM) !== false) {
            $ensured = true;
            return;
        }
    } catch (Exception $e) {
        // continue to create
    }
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `company_auto_renew_request` (
          `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
          `company_id` int(10) UNSIGNED NOT NULL,
          `expiration_snapshot` date NOT NULL,
          `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          `period` varchar(20) DEFAULT NULL,
          `price` decimal(25,8) DEFAULT NULL,
          `from_account_id` int(11) DEFAULT NULL,
          `to_account_id` int(11) DEFAULT NULL,
          `transaction_id` int(11) DEFAULT NULL,
          `new_expiration_date` date DEFAULT NULL,
          `processed_by` varchar(50) DEFAULT NULL,
          `processed_at` datetime DEFAULT NULL,
          `reject_reason` varchar(255) DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT current_timestamp(),
          `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
          PRIMARY KEY (`id`),
          UNIQUE KEY `uq_auto_renew_company_exp` (`company_id`,`expiration_snapshot`),
          KEY `idx_auto_renew_status` (`status`),
          KEY `idx_auto_renew_company` (`company_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $ensured = true;
}

function auto_renew_get_c168_pk(PDO $pdo): ?int
{
    $stmt = $pdo->prepare("SELECT id FROM company WHERE UPPER(TRIM(company_id)) = 'C168' LIMIT 1");
    $stmt->execute();
    $v = $stmt->fetchColumn();
    if ($v === false || $v === null || $v === '') {
        return null;
    }
    return (int) $v;
}

function auto_renew_ensure_domain_fee_settings(PDO $pdo): void
{
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'domain_list_fee_settings'");
        if (!$stmt || $stmt->fetch(PDO::FETCH_NUM) === false) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `domain_list_fee_settings` (
                    `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
                    `price` DECIMAL(25,8) NULL DEFAULT NULL,
                    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            $pdo->exec("INSERT IGNORE INTO `domain_list_fee_settings` (`id`, `price`) VALUES (1, NULL)");
        } else {
            $pdo->exec("INSERT IGNORE INTO `domain_list_fee_settings` (`id`, `price`) VALUES (1, NULL)");
        }
    } catch (Exception $e) {
        // best effort
    }
    foreach (['group_price', 'company_price'] as $col) {
        try {
            $pdo->exec("ALTER TABLE `domain_list_fee_settings` ADD COLUMN `{$col}` DECIMAL(25,8) NULL DEFAULT NULL");
        } catch (Exception $e) {
            // may exist
        }
    }
    $ensured = true;
}

/**
 * @return array{price: ?string, group_price: ?string, company_price: ?string}
 */
function auto_renew_fetch_domain_fee_settings(PDO $pdo): array
{
    auto_renew_ensure_domain_fee_settings($pdo);
    $stmt = $pdo->query('SELECT `price`, `group_price`, `company_price` FROM `domain_list_fee_settings` WHERE `id` = 1');
    $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    if (!$row) {
        return ['price' => null, 'group_price' => null, 'company_price' => null];
    }
    foreach (['price', 'group_price', 'company_price'] as $key) {
        if ($row[$key] !== null && $row[$key] !== '') {
            $row[$key] = money_out($row[$key]);
        } else {
            $row[$key] = null;
        }
    }
    return $row;
}

function auto_renew_resolve_price_for_company(PDO $pdo, ?string $groupId): ?string
{
    $settings = auto_renew_fetch_domain_fee_settings($pdo);
    $groupId = trim((string) ($groupId ?? ''));
    if ($groupId !== '') {
        $gp = $settings['group_price'] ?? null;
        if ($gp !== null && $gp !== '' && money_cmp($gp, '0') > 0) {
            return money_normalize($gp);
        }
    }
    $cp = $settings['company_price'] ?? null;
    if ($cp !== null && $cp !== '' && money_cmp($cp, '0') > 0) {
        return money_normalize($cp);
    }
    $legacy = $settings['price'] ?? null;
    if ($legacy !== null && $legacy !== '' && money_cmp($legacy, '0') > 0) {
        return money_normalize($legacy);
    }
    return null;
}

function auto_renew_resolve_c168_company_code_account(PDO $pdo, int $c168Pk, string $companyCode, int $excludeAccountId = 0): ?int
{
    $code = strtoupper(trim($companyCode));
    if ($c168Pk <= 0 || $code === '') {
        return null;
    }
    try {
        $st = $pdo->prepare("
            SELECT a.id
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND UPPER(TRIM(a.account_id)) = ?
              AND a.id <> ?
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
            LIMIT 1
        ");
        $st->execute([$c168Pk, $code, (int) $excludeAccountId]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? (int) $v : null;
    } catch (PDOException $e) {
        return null;
    }
}

function auto_renew_resolve_default_from_account(PDO $pdo, int $c168Pk, string $companyCode, int $excludeAccountId = 0): ?int
{
    $from = auto_renew_resolve_c168_company_code_account($pdo, $c168Pk, $companyCode, $excludeAccountId);
    if ($from && $from > 0) {
        return $from;
    }
    $src = strtoupper(trim($companyCode));
    if ($c168Pk <= 0 || $src === '') {
        return null;
    }
    try {
        $st = $pdo->prepare("
            SELECT UPPER(TRIM(COALESCE(o.owner_code, ''))) AS oc
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            WHERE UPPER(TRIM(c.company_id)) = ?
            ORDER BY c.id ASC
            LIMIT 1
        ");
        $st->execute([$src]);
        $ownerUpper = strtoupper(trim((string) ($st->fetchColumn() ?: '')));
        if ($ownerUpper === '') {
            return null;
        }
        $legacyCode = preg_replace('/[^A-Z0-9]/', '', $ownerUpper) . '_' . $src;
        if ($legacyCode === '_' . $src) {
            $legacyCode = 'DOM_' . $src;
        }
        foreach ([$src, $legacyCode] as $accountCode) {
            $st2 = $pdo->prepare("
                SELECT a.id
                FROM account a
                INNER JOIN account_company ac ON ac.account_id = a.id
                WHERE ac.company_id = ?
                  AND UPPER(TRIM(a.account_id)) = UPPER(TRIM(?))
                  AND a.id <> ?
                  AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
                LIMIT 1
            ");
            $st2->execute([$c168Pk, $accountCode, (int) $excludeAccountId]);
            $v = $st2->fetchColumn();
            if ($v !== false && $v !== null) {
                return (int) $v;
            }
        }
    } catch (PDOException $e) {
        return null;
    }
    return null;
}

function auto_renew_resolve_c168_default_currency_id(PDO $pdo, int $c168Pk): ?int
{
    if ($c168Pk <= 0 || !auto_renew_table_has_column($pdo, 'transactions', 'currency_id')) {
        return null;
    }
    try {
        $st = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? AND UPPER(TRIM(code)) = 'MYR' ORDER BY id ASC LIMIT 1");
        $st->execute([$c168Pk]);
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null) {
            return (int) $v;
        }
        $st2 = $pdo->prepare('SELECT id FROM currency WHERE company_id = ? ORDER BY id ASC LIMIT 1');
        $st2->execute([$c168Pk]);
        $v2 = $st2->fetchColumn();
        if ($v2 !== false && $v2 !== null) {
            return (int) $v2;
        }
    } catch (Exception $e) {
        return null;
    }
    return null;
}

/**
 * @return list<array{id:int, account_code:string, name:string}>
 */
function auto_renew_list_c168_accounts(PDO $pdo, int $c168Pk): array
{
    if ($c168Pk <= 0) {
        return [];
    }
    try {
        $st = $pdo->prepare("
            SELECT a.id, a.account_id, a.name
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
            ORDER BY UPPER(TRIM(a.account_id)) ASC
        ");
        $st->execute([$c168Pk]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int) ($row['id'] ?? 0),
                'account_code' => (string) ($row['account_id'] ?? ''),
                'name' => (string) ($row['name'] ?? ''),
            ];
        }
        return $out;
    } catch (PDOException $e) {
        return [];
    }
}

function auto_renew_company_in_window(?string $expirationDate): bool
{
    $days = auto_renew_days_until($expirationDate);
    if ($days === null) {
        return false;
    }
    return $days <= AUTO_RENEW_WINDOW_DAYS;
}

function auto_renew_sync_window_requests(PDO $pdo): void
{
    auto_renew_ensure_request_table($pdo);
    $stmt = $pdo->query("
        SELECT id, expiration_date
        FROM company
        WHERE UPPER(TRIM(company_id)) <> 'C168'
          AND expiration_date IS NOT NULL
          AND expiration_date <> ''
    ");
    $companies = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $insert = $pdo->prepare("
        INSERT IGNORE INTO company_auto_renew_request (company_id, expiration_snapshot, status)
        VALUES (?, ?, 'pending')
    ");
    foreach ($companies as $row) {
        $exp = (string) ($row['expiration_date'] ?? '');
        if (!auto_renew_company_in_window($exp)) {
            continue;
        }
        $insert->execute([(int) $row['id'], $exp]);
    }
}

function auto_renew_count_pending(PDO $pdo): int
{
    auto_renew_sync_window_requests($pdo);
    $stmt = $pdo->query("
        SELECT COUNT(*)
        FROM company_auto_renew_request r
        INNER JOIN company c ON c.id = r.company_id
        WHERE r.status = 'pending'
          AND r.expiration_snapshot = c.expiration_date
          AND UPPER(TRIM(c.company_id)) <> 'C168'
          AND c.expiration_date IS NOT NULL
          AND DATEDIFF(c.expiration_date, CURDATE()) <= " . (int) AUTO_RENEW_WINDOW_DAYS . '
    ');
    return (int) ($stmt->fetchColumn() ?: 0);
}

/**
 * Domain page company-chip renew badges removed — use Auto Renew page + sidebar pending count.
 * Kept for API compatibility; returns pending companies not yet renewed for current expiration.
 *
 * @return array<string, string> company_code => pending
 */
function auto_renew_status_map(PDO $pdo): array
{
    auto_renew_sync_window_requests($pdo);
    $stmt = $pdo->query("
        SELECT UPPER(TRIM(c.company_id)) AS company_code
        FROM company_auto_renew_request r
        INNER JOIN company c ON c.id = r.company_id
        WHERE UPPER(TRIM(c.company_id)) <> 'C168'
          AND r.status = 'pending'
          AND r.expiration_snapshot = c.expiration_date
          AND DATEDIFF(c.expiration_date, CURDATE()) <= " . (int) AUTO_RENEW_WINDOW_DAYS . "
          AND NOT EXISTS (
            SELECT 1
            FROM company_auto_renew_request ap
            WHERE ap.company_id = c.id
              AND ap.status = 'approved'
              AND ap.new_expiration_date = c.expiration_date
          )
    ");
    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $code = (string) ($row['company_code'] ?? '');
        if ($code !== '') {
            $map[$code] = 'pending';
        }
    }
    return $map;
}

function auto_renew_period_display_label(?string $period): string
{
    $period = auto_renew_normalize_period($period);
    if (!$period) {
        return '';
    }
    $map = [
        '7days' => '7 days',
        '1month' => '1 month',
        '3months' => '3 months',
        '6months' => '6 months',
        '1year' => '1 year',
    ];
    return $map[$period] ?? $period;
}

function auto_renew_format_payment_description(string $companyCode, ?string $period): string
{
    $label = auto_renew_period_display_label($period);
    $code = strtoupper(trim($companyCode));
    if ($label === '') {
        return 'Renew ' . $code;
    }
    return 'Renew ' . $code . ' | ' . $label;
}

/**
 * @return array{0:?string, 1:?string} [date_from, date_to] as Y-m-d
 */
function auto_renew_parse_list_date_range(?string $dateFrom, ?string $dateTo): array
{
    $from = trim((string) ($dateFrom ?? ''));
    $to = trim((string) ($dateTo ?? ''));
    if ($from === '' || $to === '') {
        return [null, null];
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        return [null, null];
    }
    if ($from > $to) {
        [$from, $to] = [$to, $from];
    }
    return [$from, $to];
}

function auto_renew_format_approval_row(array $row, PDO $pdo, int $c168Pk, array $accountsById): array
{
    $companyCode = (string) ($row['company_code'] ?? '');
    $groupId = !empty($row['group_id']) ? (string) $row['group_id'] : null;
    $expirationDate = !empty($row['expiration_date']) ? (string) $row['expiration_date'] : null;
    $daysLeft = auto_renew_days_until($expirationDate);
    $price = auto_renew_resolve_price_for_company($pdo, $groupId);
    $requestStatus = (string) ($row['request_status'] ?? 'pending');
    $period = auto_renew_normalize_period($row['request_period'] ?? null);
    $fromId = !empty($row['from_account_id']) ? (int) $row['from_account_id'] : null;
    $toId = !empty($row['to_account_id']) ? (int) $row['to_account_id'] : null;

    if (!$fromId && $c168Pk > 0) {
        $fromId = auto_renew_resolve_default_from_account($pdo, $c168Pk, $companyCode, (int) ($toId ?? 0));
    }

    $defaultFrom = ($c168Pk > 0)
        ? auto_renew_resolve_default_from_account($pdo, $c168Pk, $companyCode, (int) ($toId ?? 0))
        : null;

    return [
        'request_id' => (int) ($row['request_id'] ?? 0),
        'deleted_payment_id' => !empty($row['deleted_payment_id']) ? (int) $row['deleted_payment_id'] : null,
        'is_payment_deleted' => !empty($row['is_payment_deleted']),
        'company_numeric_id' => (int) ($row['company_numeric_id'] ?? 0),
        'company_code' => $companyCode,
        'owner_name' => (string) ($row['owner_name'] ?? ''),
        'group_id' => $groupId,
        'price' => $price,
        'expiration_date' => $expirationDate,
        'expiration_snapshot' => !empty($row['expiration_snapshot']) ? (string) $row['expiration_snapshot'] : $expirationDate,
        'days_until_expiration' => $daysLeft,
        'expiration_status' => auto_renew_expiration_status($daysLeft),
        'status' => $requestStatus,
        'period' => $period,
        'from_account_id' => $fromId,
        'to_account_id' => $toId,
        'default_from_account_id' => $defaultFrom,
        'transaction_id' => !empty($row['transaction_id']) ? (int) $row['transaction_id'] : null,
        'new_expiration_date' => !empty($row['new_expiration_date']) ? (string) $row['new_expiration_date'] : null,
        'processed_by' => $row['processed_by'] ?? null,
        'processed_at' => $row['processed_at'] ?? null,
        'submitter' => $row['processed_by'] ?? null,
        'submitter_at' => $row['processed_at'] ?? null,
        'payment_description' => !empty($row['payment_description'])
            ? (string) $row['payment_description']
            : ($period ? auto_renew_format_payment_description($companyCode, $period) : null),
        'reject_reason' => $row['reject_reason'] ?? null,
        'can_approve' => $requestStatus === 'pending' && $price !== null && empty($row['is_payment_deleted']),
        'can_delete' => $requestStatus === 'approved'
            && !empty($row['transaction_id'])
            && empty($row['is_payment_deleted']),
    ];
}

/**
 * Deleted auto-renew PAYMENT rows (red-line history in same table).
 *
 * @return list<array<string, mixed>>
 */
function auto_renew_list_deleted_payment_rows(
    PDO $pdo,
    int $c168Pk,
    ?string $rangeFrom,
    ?string $rangeTo,
    bool $applyDateFilter
): array {
    if ($c168Pk <= 0) {
        return [];
    }
    try {
        payment_delete_ensure_transactions_deleted_table($pdo);
    } catch (Throwable $e) {
        return [];
    }

    $historyDays = (int) AUTO_RENEW_HISTORY_DAYS;
    $sql = "
        SELECT
            td.transaction_id,
            td.description,
            td.sms,
            td.amount,
            td.transaction_date,
            td.deleted_at,
            td.account_id,
            td.from_account_id,
            COALESCE(u.login_id, o.owner_code, '') AS deleted_by_login
        FROM transactions_deleted td
        LEFT JOIN user u ON u.id = td.deleted_by_user_id
        LEFT JOIN owner o ON o.id = td.deleted_by_owner_id
        WHERE td.company_id = ?
          AND td.transaction_type = 'PAYMENT'
          AND td.sms LIKE '[AUTO_RENEW|%'
    ";
    $params = [$c168Pk];
    if ($applyDateFilter && $rangeFrom && $rangeTo) {
        $sql .= ' AND DATE(td.deleted_at) >= ? AND DATE(td.deleted_at) <= ?';
        $params[] = $rangeFrom;
        $params[] = $rangeTo;
    } else {
        $sql .= " AND td.deleted_at >= DATE_SUB(NOW(), INTERVAL {$historyDays} DAY)";
    }
    $sql .= ' ORDER BY td.deleted_at DESC';

    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $deleted = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (PDOException $e) {
        return [];
    }

    $out = [];
    foreach ($deleted as $td) {
        $sms = (string) ($td['sms'] ?? '');
        if (!preg_match('/^\[AUTO_RENEW\|([^|\]]+)\|([^|\]]+)/i', $sms, $m)) {
            continue;
        }
        $companyCode = strtoupper(trim((string) $m[1]));
        $expSnapshot = trim((string) $m[2]);
        if ($companyCode === '') {
            continue;
        }

        $companyStmt = $pdo->prepare("
            SELECT c.id, c.company_id, c.group_id, c.expiration_date, COALESCE(o.name, '') AS owner_name
            FROM company c
            LEFT JOIN owner o ON o.id = c.owner_id
            WHERE UPPER(TRIM(c.company_id)) = ?
            LIMIT 1
        ");
        $companyStmt->execute([$companyCode]);
        $companyRow = $companyStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $period = null;
        $desc = trim((string) ($td['description'] ?? ''));
        if (preg_match('/^\s*Renew\s+[^|]+\|\s*(.+)$/i', $desc, $mPeriod)) {
            $periodLabel = trim((string) $mPeriod[1]);
            foreach (AUTO_RENEW_VALID_PERIODS as $p) {
                if (strcasecmp(auto_renew_period_display_label($p), $periodLabel) === 0) {
                    $period = $p;
                    break;
                }
            }
        }

        $out[] = [
            'request_id' => 0,
            'deleted_payment_id' => (int) ($td['transaction_id'] ?? 0),
            'is_payment_deleted' => true,
            'request_status' => 'approved',
            'request_period' => $period,
            'from_account_id' => !empty($td['from_account_id']) ? (int) $td['from_account_id'] : null,
            'to_account_id' => !empty($td['account_id']) ? (int) $td['account_id'] : null,
            'transaction_id' => (int) ($td['transaction_id'] ?? 0),
            'new_expiration_date' => null,
            'expiration_snapshot' => $expSnapshot,
            'processed_by' => ($td['deleted_by_login'] ?? '') !== '' ? (string) $td['deleted_by_login'] : null,
            'processed_at' => $td['deleted_at'] ?? null,
            'reject_reason' => null,
            'company_numeric_id' => (int) ($companyRow['id'] ?? 0),
            'company_code' => $companyCode,
            'group_id' => $companyRow['group_id'] ?? null,
            'expiration_date' => !empty($companyRow['expiration_date']) ? (string) $companyRow['expiration_date'] : $expSnapshot,
            'owner_name' => (string) ($companyRow['owner_name'] ?? ''),
            'payment_description' => $desc !== '' ? $desc : auto_renew_format_payment_description($companyCode, $period),
        ];
    }
    return $out;
}

/**
 * @return array{rows: list<array>, counts: array{pending:int, approved:int, rejected:int, total:int}}
 */
function auto_renew_list_approvals(PDO $pdo, ?string $statusFilter = null, ?string $dateFrom = null, ?string $dateTo = null): array
{
    auto_renew_sync_window_requests($pdo);
    $c168Pk = auto_renew_get_c168_pk($pdo) ?? 0;
    $accounts = auto_renew_list_c168_accounts($pdo, $c168Pk);
    $accountsById = [];
    foreach ($accounts as $acc) {
        $accountsById[(int) $acc['id']] = $acc;
    }

    $windowDays = (int) AUTO_RENEW_WINDOW_DAYS;
    $historyDays = (int) AUTO_RENEW_HISTORY_DAYS;
    $filter = strtolower(trim((string) ($statusFilter ?? 'pending')));
    [$rangeFrom, $rangeTo] = auto_renew_parse_list_date_range($dateFrom, $dateTo);
    $applyDateFilter = $rangeFrom !== null && $rangeTo !== null && $filter !== 'pending';

    if ($filter === 'approved' || $filter === 'rejected') {
        $sql = "
            SELECT
                r.id AS request_id,
                r.status AS request_status,
                r.period AS request_period,
                r.from_account_id,
                r.to_account_id,
                r.transaction_id,
                r.new_expiration_date,
                r.expiration_snapshot,
                r.processed_by,
                r.processed_at,
                r.reject_reason,
                c.id AS company_numeric_id,
                c.company_id AS company_code,
                c.group_id,
                c.expiration_date,
                COALESCE(o.name, '') AS owner_name
            FROM company_auto_renew_request r
            INNER JOIN company c ON c.id = r.company_id
            LEFT JOIN owner o ON o.id = c.owner_id
            WHERE r.status = ?
              AND UPPER(TRIM(c.company_id)) <> 'C168'
              AND r.processed_at >= DATE_SUB(NOW(), INTERVAL {$historyDays} DAY)
        ";
        $params = [$filter];
        if ($applyDateFilter) {
            $sql .= ' AND DATE(r.processed_at) >= ? AND DATE(r.processed_at) <= ?';
            $params[] = $rangeFrom;
            $params[] = $rangeTo;
        }
        $sql .= ' ORDER BY r.processed_at DESC, c.company_id ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } elseif ($filter === 'all') {
        $sql = "
            SELECT
                r.id AS request_id,
                r.status AS request_status,
                r.period AS request_period,
                r.from_account_id,
                r.to_account_id,
                r.transaction_id,
                r.new_expiration_date,
                r.expiration_snapshot,
                r.processed_by,
                r.processed_at,
                r.reject_reason,
                c.id AS company_numeric_id,
                c.company_id AS company_code,
                c.group_id,
                c.expiration_date,
                COALESCE(o.name, '') AS owner_name
            FROM company c
            INNER JOIN company_auto_renew_request r
                ON r.company_id = c.id AND r.expiration_snapshot = c.expiration_date
            LEFT JOIN owner o ON o.id = c.owner_id
            WHERE UPPER(TRIM(c.company_id)) <> 'C168'
              AND c.expiration_date IS NOT NULL
              AND (
                    (r.status = 'pending' AND DATEDIFF(c.expiration_date, CURDATE()) <= {$windowDays})
                    OR (
                        r.status IN ('approved','rejected')
                        AND r.processed_at >= DATE_SUB(NOW(), INTERVAL {$historyDays} DAY)
        ";
        $params = [];
        if ($applyDateFilter) {
            $sql .= ' AND DATE(r.processed_at) >= ? AND DATE(r.processed_at) <= ?';
            $params[] = $rangeFrom;
            $params[] = $rangeTo;
        }
        $sql .= "
                    )
              )
            ORDER BY
                CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
                COALESCE(r.processed_at, '9999-12-31') DESC,
                c.expiration_date ASC,
                c.company_id ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
    } else {
        $stmt = $pdo->query("
            SELECT
                r.id AS request_id,
                r.status AS request_status,
                r.period AS request_period,
                r.from_account_id,
                r.to_account_id,
                r.transaction_id,
                r.new_expiration_date,
                r.expiration_snapshot,
                r.processed_by,
                r.processed_at,
                r.reject_reason,
                c.id AS company_numeric_id,
                c.company_id AS company_code,
                c.group_id,
                c.expiration_date,
                COALESCE(o.name, '') AS owner_name
            FROM company c
            INNER JOIN company_auto_renew_request r
                ON r.company_id = c.id AND r.expiration_snapshot = c.expiration_date
            LEFT JOIN owner o ON o.id = c.owner_id
            WHERE UPPER(TRIM(c.company_id)) <> 'C168'
              AND c.expiration_date IS NOT NULL
              AND DATEDIFF(c.expiration_date, CURDATE()) <= {$windowDays}
              AND r.status = 'pending'
            ORDER BY c.expiration_date ASC, c.company_id ASC
        ");
    }

    $rawRows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    $rows = [];
    foreach ($rawRows as $row) {
        $rows[] = auto_renew_format_approval_row($row, $pdo, $c168Pk, $accountsById);
    }

    if ($filter === 'approved' || $filter === 'all') {
        $deletedRows = auto_renew_list_deleted_payment_rows($pdo, $c168Pk, $rangeFrom, $rangeTo, $applyDateFilter);
        foreach ($deletedRows as $row) {
            $rows[] = auto_renew_format_approval_row($row, $pdo, $c168Pk, $accountsById);
        }
        usort($rows, static function (array $a, array $b): int {
            if (!empty($a['is_payment_deleted']) !== !empty($b['is_payment_deleted'])) {
                return !empty($a['is_payment_deleted']) ? 1 : -1;
            }
            $at = (string) ($a['submitter_at'] ?? $a['processed_at'] ?? '');
            $bt = (string) ($b['submitter_at'] ?? $b['processed_at'] ?? '');
            if ($at !== $bt) {
                return strcmp($bt, $at);
            }
            return strcmp((string) ($a['company_code'] ?? ''), (string) ($b['company_code'] ?? ''));
        });
    }

    $countStmt = $pdo->query("
        SELECT
            SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending_cnt,
            SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) AS approved_cnt,
            SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_cnt,
            COUNT(*) AS total_cnt
        FROM company c
        INNER JOIN company_auto_renew_request r
            ON r.company_id = c.id AND r.expiration_snapshot = c.expiration_date
        WHERE UPPER(TRIM(c.company_id)) <> 'C168'
          AND c.expiration_date IS NOT NULL
          AND DATEDIFF(c.expiration_date, CURDATE()) <= {$windowDays}
    ");
    $countsRow = $countStmt ? ($countStmt->fetch(PDO::FETCH_ASSOC) ?: []) : [];

    $approvedHist = $pdo->query("
        SELECT COUNT(*) FROM company_auto_renew_request
        WHERE status = 'approved'
          AND processed_at >= DATE_SUB(NOW(), INTERVAL {$historyDays} DAY)
    ");
    $rejectedHist = $pdo->query("
        SELECT COUNT(*) FROM company_auto_renew_request
        WHERE status = 'rejected'
          AND processed_at >= DATE_SUB(NOW(), INTERVAL {$historyDays} DAY)
    ");

    return [
        'rows' => $rows,
        'accounts' => $accounts,
        'counts' => [
            'pending' => (int) ($countsRow['pending_cnt'] ?? 0),
            'approved' => max((int) ($countsRow['approved_cnt'] ?? 0), (int) ($approvedHist->fetchColumn() ?: 0)),
            'rejected' => max((int) ($countsRow['rejected_cnt'] ?? 0), (int) ($rejectedHist->fetchColumn() ?: 0)),
            'total' => (int) ($countsRow['total_cnt'] ?? 0),
        ],
    ];
}

function auto_renew_get_request_row(PDO $pdo, int $requestId): ?array
{
    $stmt = $pdo->prepare("
        SELECT r.*, c.company_id AS company_code, c.group_id, c.expiration_date, c.id AS company_numeric_id,
               COALESCE(o.name, '') AS owner_name
        FROM company_auto_renew_request r
        INNER JOIN company c ON c.id = r.company_id
        LEFT JOIN owner o ON o.id = c.owner_id
        WHERE r.id = ?
        LIMIT 1
    ");
    $stmt->execute([$requestId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function auto_renew_validate_account_in_c168(PDO $pdo, int $c168Pk, int $accountId): bool
{
    if ($c168Pk <= 0 || $accountId <= 0) {
        return false;
    }
    $st = $pdo->prepare("
        SELECT 1 FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ? AND a.id = ?
          AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
        LIMIT 1
    ");
    $st->execute([$c168Pk, $accountId]);
    return $st->fetchColumn() !== false;
}

/**
 * @return array{created:bool, transaction_id:?int, skipped_duplicate:bool, error:?string}
 */
function auto_renew_create_fee_payment(
    PDO $pdo,
    int $c168Pk,
    string $customerCompanyCode,
    string $expirationSnapshot,
    int $fromAccountId,
    int $toAccountId,
    string $amount,
    ?string $period,
    ?int $createdByUser,
    ?int $createdByOwner
): array {
    $out = ['created' => false, 'transaction_id' => null, 'skipped_duplicate' => false, 'error' => null];
    $custCodeU = strtoupper(trim($customerCompanyCode));
    $feeSms = '[AUTO_RENEW|' . $custCodeU . '|' . $expirationSnapshot . ']';
    $dupStmt = $pdo->prepare("
        SELECT id FROM transactions
        WHERE company_id = ? AND transaction_type = 'PAYMENT'
          AND (sms = ? OR sms LIKE ?)
        LIMIT 1
    ");
    $dupStmt->execute([$c168Pk, $feeSms, $feeSms . '|%']);
    if ($dupStmt->fetchColumn() !== false) {
        $out['skipped_duplicate'] = true;
        return $out;
    }
    if ($fromAccountId <= 0 || $toAccountId <= 0 || $fromAccountId === $toAccountId) {
        $out['error'] = 'invalid_accounts';
        return $out;
    }
    $today = date('Y-m-d');
    $now = date('Y-m-d H:i:s');
    $desc = auto_renew_format_payment_description($custCodeU, $period);
    $amountNorm = money_normalize($amount, 2);

    $hasCurrencyId = auto_renew_table_has_column($pdo, 'transactions', 'currency_id');
    $hasApprovalStatus = auto_renew_table_has_column($pdo, 'transactions', 'approval_status');
    $hasApprovedBy = auto_renew_table_has_column($pdo, 'transactions', 'approved_by');
    $hasApprovedByOwner = auto_renew_table_has_column($pdo, 'transactions', 'approved_by_owner');
    $hasApprovedAt = auto_renew_table_has_column($pdo, 'transactions', 'approved_at');
    $hasCreatedAt = auto_renew_table_has_column($pdo, 'transactions', 'created_at');
    $defaultTxnCurrencyId = $hasCurrencyId ? auto_renew_resolve_c168_default_currency_id($pdo, $c168Pk) : null;

    $insertCols = [
        'company_id' => $c168Pk,
        'transaction_type' => 'PAYMENT',
        'account_id' => $toAccountId,
        'from_account_id' => $fromAccountId,
        'amount' => $amountNorm,
        'transaction_date' => $today,
        'description' => $desc,
        'sms' => $feeSms,
        'created_by' => $createdByUser,
        'created_by_owner' => $createdByOwner,
    ];
    if ($hasCurrencyId) {
        $insertCols['currency_id'] = $defaultTxnCurrencyId;
    }
    if ($hasApprovalStatus) {
        $insertCols['approval_status'] = 'APPROVED';
        if ($hasApprovedBy) {
            $insertCols['approved_by'] = $createdByUser;
        }
        if ($hasApprovedByOwner) {
            $insertCols['approved_by_owner'] = $createdByOwner;
        }
        if ($hasApprovedAt) {
            $insertCols['approved_at'] = $now;
        }
    }
    if ($hasCreatedAt) {
        $insertCols['created_at'] = $now;
    }
    $columns = array_keys($insertCols);
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $sql = 'INSERT INTO transactions (`' . implode('`,`', $columns) . "`) VALUES ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($insertCols));
    $out['created'] = true;
    $out['transaction_id'] = (int) $pdo->lastInsertId();
    return $out;
}

function auto_renew_save_draft(PDO $pdo, int $requestId, array $input, array $session): array
{
    $row = auto_renew_get_request_row($pdo, $requestId);
    if (!$row) {
        throw new RuntimeException('Request not found');
    }
    if ((string) ($row['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Only pending requests can be edited');
    }
    if (!auto_renew_can_edit($session, $pdo)) {
        throw new RuntimeException('Access denied');
    }

    $period = auto_renew_normalize_period($input['period'] ?? null);
    $fromId = isset($input['from_account_id']) ? (int) $input['from_account_id'] : null;
    $toId = isset($input['to_account_id']) ? (int) $input['to_account_id'] : null;
    $c168Pk = auto_renew_get_c168_pk($pdo) ?? 0;

    if ($fromId !== null && $fromId > 0 && !auto_renew_validate_account_in_c168($pdo, $c168Pk, $fromId)) {
        throw new RuntimeException('Invalid from account');
    }
    if ($toId !== null && $toId > 0 && !auto_renew_validate_account_in_c168($pdo, $c168Pk, $toId)) {
        throw new RuntimeException('Invalid to account');
    }

    $price = auto_renew_resolve_price_for_company($pdo, $row['group_id'] ?? null);

    $upd = $pdo->prepare('
        UPDATE company_auto_renew_request
        SET period = ?, from_account_id = ?, to_account_id = ?, price = ?
        WHERE id = ? AND status = \'pending\'
    ');
    $upd->execute([
        $period,
        ($fromId && $fromId > 0) ? $fromId : null,
        ($toId && $toId > 0) ? $toId : null,
        $price,
        $requestId,
    ]);

    $updated = auto_renew_get_request_row($pdo, $requestId);
    $c168Pk = auto_renew_get_c168_pk($pdo) ?? 0;
    $formatted = auto_renew_format_approval_row([
        'request_id' => $updated['id'],
        'request_status' => $updated['status'],
        'request_period' => $updated['period'],
        'from_account_id' => $updated['from_account_id'],
        'to_account_id' => $updated['to_account_id'],
        'transaction_id' => $updated['transaction_id'],
        'new_expiration_date' => $updated['new_expiration_date'],
        'expiration_snapshot' => $updated['expiration_snapshot'],
        'processed_by' => $updated['processed_by'],
        'processed_at' => $updated['processed_at'],
        'reject_reason' => $updated['reject_reason'],
        'company_numeric_id' => $updated['company_numeric_id'],
        'company_code' => $updated['company_code'],
        'group_id' => $updated['group_id'],
        'expiration_date' => $updated['expiration_date'],
        'owner_name' => $updated['owner_name'],
    ], $pdo, $c168Pk, []);

    return $formatted;
}

function auto_renew_approve(PDO $pdo, int $requestId, array $input, array $session): array
{
    if (!auto_renew_can_edit($session, $pdo)) {
        throw new RuntimeException('Access denied');
    }
    $row = auto_renew_get_request_row($pdo, $requestId);
    if (!$row) {
        throw new RuntimeException('Request not found');
    }
    if ((string) ($row['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Request is not pending');
    }

    $period = auto_renew_normalize_period($input['period'] ?? ($row['period'] ?? null));
    $fromId = isset($input['from_account_id']) ? (int) $input['from_account_id'] : (int) ($row['from_account_id'] ?? 0);
    $toId = isset($input['to_account_id']) ? (int) $input['to_account_id'] : (int) ($row['to_account_id'] ?? 0);
    $c168Pk = auto_renew_get_c168_pk($pdo);
    if (!$c168Pk) {
        throw new RuntimeException('C168 company not found');
    }

    if (!$period) {
        throw new RuntimeException('Renewal period is required');
    }
    if ($fromId <= 0 || $toId <= 0) {
        throw new RuntimeException('From and To accounts are required');
    }
    if ($fromId === $toId) {
        throw new RuntimeException('From and To accounts must differ');
    }
    if (!auto_renew_validate_account_in_c168($pdo, $c168Pk, $fromId) || !auto_renew_validate_account_in_c168($pdo, $c168Pk, $toId)) {
        throw new RuntimeException('Invalid account selection');
    }

    $price = auto_renew_resolve_price_for_company($pdo, $row['group_id'] ?? null);
    if ($price === null || money_cmp($price, '0') <= 0) {
        throw new RuntimeException('Domain renewal price is not configured. Set it in Domain first.');
    }

    $baseExp = (string) ($row['expiration_date'] ?? $row['expiration_snapshot'] ?? '');
    $newExp = auto_renew_calculate_next_expiration($period, $baseExp);
    if (!$newExp) {
        throw new RuntimeException('Could not calculate new expiration date');
    }

    $processedBy = (string) ($session['login_id'] ?? 'system');
    $createdByUser = isset($session['user_id']) ? (int) $session['user_id'] : null;
    $createdByOwner = isset($session['owner_id']) ? (int) $session['owner_id'] : null;
    $companyCode = (string) ($row['company_code'] ?? '');
    $snapshot = (string) ($row['expiration_snapshot'] ?? '');

    $pdo->beginTransaction();
    try {
        $pay = auto_renew_create_fee_payment(
            $pdo,
            $c168Pk,
            $companyCode,
            $snapshot,
            $fromId,
            $toId,
            $price,
            $period,
            $createdByUser,
            $createdByOwner
        );
        if ($pay['skipped_duplicate']) {
            throw new RuntimeException('Renewal payment already exists for this cycle');
        }
        if (!$pay['created']) {
            throw new RuntimeException('Failed to create renewal payment');
        }

        $updCompany = $pdo->prepare('UPDATE company SET expiration_date = ? WHERE id = ?');
        $updCompany->execute([$newExp, (int) $row['company_id']]);

        $updReq = $pdo->prepare("
            UPDATE company_auto_renew_request
            SET status = 'approved',
                period = ?,
                price = ?,
                from_account_id = ?,
                to_account_id = ?,
                transaction_id = ?,
                new_expiration_date = ?,
                processed_by = ?,
                processed_at = NOW()
            WHERE id = ? AND status = 'pending'
        ");
        $updReq->execute([
            $period,
            money_normalize($price),
            $fromId,
            $toId,
            $pay['transaction_id'],
            $newExp,
            $processedBy,
            $requestId,
        ]);

        if ($updReq->rowCount() === 0) {
            throw new RuntimeException('Request was already processed');
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $updated = auto_renew_get_request_row($pdo, $requestId);
    return auto_renew_format_approval_row([
        'request_id' => $updated['id'],
        'request_status' => $updated['status'],
        'request_period' => $updated['period'],
        'from_account_id' => $updated['from_account_id'],
        'to_account_id' => $updated['to_account_id'],
        'transaction_id' => $updated['transaction_id'],
        'new_expiration_date' => $updated['new_expiration_date'],
        'expiration_snapshot' => $updated['expiration_snapshot'],
        'processed_by' => $updated['processed_by'],
        'processed_at' => $updated['processed_at'],
        'reject_reason' => $updated['reject_reason'],
        'company_numeric_id' => $updated['company_numeric_id'],
        'company_code' => $updated['company_code'],
        'group_id' => $updated['group_id'],
        'expiration_date' => $newExp,
        'owner_name' => $updated['owner_name'],
    ], $pdo, $c168Pk, []);
}

function auto_renew_reject(PDO $pdo, int $requestId, array $input, array $session): array
{
    if (!auto_renew_can_edit($session, $pdo)) {
        throw new RuntimeException('Access denied');
    }
    $row = auto_renew_get_request_row($pdo, $requestId);
    if (!$row) {
        throw new RuntimeException('Request not found');
    }
    if ((string) ($row['status'] ?? '') !== 'pending') {
        throw new RuntimeException('Request is not pending');
    }

    $upd = $pdo->prepare("
        UPDATE company_auto_renew_request
        SET period = NULL,
            from_account_id = NULL,
            to_account_id = NULL,
            price = NULL,
            reject_reason = NULL
        WHERE id = ? AND status = 'pending'
    ");
    $upd->execute([$requestId]);

    $updated = auto_renew_get_request_row($pdo, $requestId);
    $c168Pk = auto_renew_get_c168_pk($pdo) ?? 0;
    return auto_renew_format_approval_row([
        'request_id' => $updated['id'],
        'request_status' => $updated['status'],
        'request_period' => $updated['period'],
        'from_account_id' => $updated['from_account_id'],
        'to_account_id' => $updated['to_account_id'],
        'transaction_id' => $updated['transaction_id'],
        'new_expiration_date' => $updated['new_expiration_date'],
        'expiration_snapshot' => $updated['expiration_snapshot'],
        'processed_by' => $updated['processed_by'],
        'processed_at' => $updated['processed_at'],
        'reject_reason' => $updated['reject_reason'],
        'company_numeric_id' => $updated['company_numeric_id'],
        'company_code' => $updated['company_code'],
        'group_id' => $updated['group_id'],
        'expiration_date' => $updated['expiration_date'],
        'owner_name' => $updated['owner_name'],
    ], $pdo, $c168Pk, []);
}

function auto_renew_delete(PDO $pdo, int $requestId, array $session): array
{
    if (!auto_renew_can_edit($session, $pdo)) {
        throw new RuntimeException('Access denied');
    }
    $row = auto_renew_get_request_row($pdo, $requestId);
    if (!$row) {
        throw new RuntimeException('Request not found');
    }
    if ((string) ($row['status'] ?? '') !== 'approved') {
        throw new RuntimeException('Only approved renewals can be deleted');
    }
    $txnId = (int) ($row['transaction_id'] ?? 0);
    if ($txnId <= 0) {
        throw new RuntimeException('No payment linked to this renewal');
    }

    $c168Pk = auto_renew_get_c168_pk($pdo);
    if (!$c168Pk) {
        throw new RuntimeException('C168 company not found');
    }

    $snapshot = (string) ($row['expiration_snapshot'] ?? '');
    if ($snapshot === '') {
        throw new RuntimeException('Missing expiration snapshot');
    }

    $pdo->beginTransaction();
    try {
        payment_delete_transactions_by_ids(
            $pdo,
            $c168Pk,
            [$txnId],
            $session,
            '/api/subscription/auto_renew_api.php',
            false
        );

        $updCompany = $pdo->prepare('UPDATE company SET expiration_date = ? WHERE id = ?');
        $updCompany->execute([$snapshot, (int) $row['company_id']]);

        $updReq = $pdo->prepare("
            UPDATE company_auto_renew_request
            SET status = 'pending',
                period = NULL,
                price = NULL,
                from_account_id = NULL,
                to_account_id = NULL,
                transaction_id = NULL,
                new_expiration_date = NULL,
                processed_by = NULL,
                processed_at = NULL,
                reject_reason = NULL
            WHERE id = ? AND status = 'approved'
        ");
        $updReq->execute([$requestId]);
        if ($updReq->rowCount() === 0) {
            throw new RuntimeException('Request was already changed');
        }

        $pdo->commit();
        payment_delete_clear_tx_search_cache();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $updated = auto_renew_get_request_row($pdo, $requestId);
    return auto_renew_format_approval_row([
        'request_id' => $updated['id'],
        'request_status' => $updated['status'],
        'request_period' => $updated['period'],
        'from_account_id' => $updated['from_account_id'],
        'to_account_id' => $updated['to_account_id'],
        'transaction_id' => $updated['transaction_id'],
        'new_expiration_date' => $updated['new_expiration_date'],
        'expiration_snapshot' => $updated['expiration_snapshot'],
        'processed_by' => $updated['processed_by'],
        'processed_at' => $updated['processed_at'],
        'reject_reason' => $updated['reject_reason'],
        'company_numeric_id' => $updated['company_numeric_id'],
        'company_code' => $updated['company_code'],
        'group_id' => $updated['group_id'],
        'expiration_date' => $snapshot,
        'owner_name' => $updated['owner_name'],
    ], $pdo, $c168Pk, []);
}
