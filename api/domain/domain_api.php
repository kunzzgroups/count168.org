<?php
session_start();
// session_write_close() 将在 session 写入（回填 company_code）完成后调用
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../includes/c168_domain_access.php';
require_once __DIR__ . '/../includes/money_decimal.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Get JSON input
$json = file_get_contents('php://input');
$data = json_decode($json, true);

$action = $data['action'] ?? '';

// 检查用户是否已登录（对于需要权限的操作）
if (in_array($action, ['create', 'update', 'delete', 'get_domain_fee_settings', 'save_domain_fee_settings', 'get_company_share_settings', 'save_company_share_settings'], true)) {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'User not logged in', 'data' => null]);
        exit;
    }

    // 根据 company_id 回填 company_code（Remember me、仅更新了 id 等情况下 session 可能缺 code，导致误判非 C168）
    $sessCoId = $_SESSION['company_id'] ?? null;
    if ($sessCoId) {
        try {
            $ccStmt = $pdo->prepare('SELECT company_id FROM company WHERE id = ? LIMIT 1');
            $ccStmt->execute([(int) $sessCoId]);
            $ccVal = $ccStmt->fetchColumn();
            if ($ccVal !== false && $ccVal !== null && trim((string) $ccVal) !== '') {
                $_SESSION['company_code'] = trim((string) $ccVal);
            }
        } catch (PDOException $e) {
            // ignore
        }
    }
    // session 写入完成，立即释放锁，允许并发请求执行
    session_write_close();
    
    // C168：$canUseC168DomainActions = userlist 角色白名单；修改他人二级密码仍用 $isOwnerOrAdmin
    $user_role = strtolower($_SESSION['role'] ?? '');
    $company_id = $_SESSION['company_id'] ?? null;
    $company_code = strtoupper($_SESSION['company_code'] ?? '');
    
    $isOwnerOrAdmin = in_array($user_role, ['owner', 'admin'], true);
    $isC168ByCode = ($company_code === 'C168');
    $isC168ById = isC168Company($pdo, $company_id);
    $hasC168Context = ($isC168ByCode || $isC168ById);
    $canUseC168DomainActions = $hasC168Context && userHasC168DomainPageAccess($user_role);
} else {
    // 不需要写 session，直接释放锁
    session_write_close();
}

/**
 * 将 ID 数组标准化为唯一的整型列表
 */
function normalizeIds(array $ids): array
{
    $normalized = [];
    foreach ($ids as $id) {
        if ($id === null || $id === '') {
            continue;
        }
        $normalized[] = (int)$id;
    }
    return array_values(array_unique($normalized));
}

/**
 * 根据给定 SQL 查询返回整型 ID 列
 */
function fetchIds(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return normalizeIds($stmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * 为 IN 语句生成占位符
 */
function buildInPlaceholders(int $count): string
{
    return implode(',', array_fill(0, $count, '?'));
}

/**
 * 仅允许公司代码映射为安全库名（字母/数字/下划线），并统一大写。
 */
function domainApiDatabaseNameFromCompanyId(string $companyId): string
{
    global $dbname;

    $normalized = strtoupper(trim($companyId));
    if ($normalized === '') {
        throw new InvalidArgumentException('Company ID is required for database provisioning');
    }
    if (!preg_match('/^[A-Z0-9_]+$/', $normalized)) {
        throw new InvalidArgumentException('Company ID may only contain letters, numbers, and underscore for database name');
    }

    // Shared-hosting safe default: reuse current DB account prefix (e.g. u857194726_XXX).
    $currentDb = trim((string) ($dbname ?? ''));
    if ($currentDb !== '' && preg_match('/^([a-zA-Z0-9]+)_/', $currentDb, $m)) {
        return strtolower($m[1] . '_' . $normalized);
    }

    return strtolower($normalized);
}

function domainApiIsIgnorableProvisioningError(PDOException $e): bool
{
    $msg = strtolower(trim($e->getMessage()));
    if ($msg === '') {
        return false;
    }
    return (
        strpos($msg, 'access denied') !== false ||
        strpos($msg, 'create command denied') !== false ||
        strpos($msg, 'unknown database') !== false ||
        strpos($msg, 'not allowed') !== false
    );
}

function domainApiExtractErrorMessageFromApiPayload($payload): string
{
    if (is_string($payload)) {
        return trim($payload);
    }
    if (!is_array($payload)) {
        return '';
    }
    foreach (['message', 'error', 'detail', 'title'] as $key) {
        if (isset($payload[$key]) && is_string($payload[$key]) && trim($payload[$key]) !== '') {
            return trim($payload[$key]);
        }
    }
    if (isset($payload['errors']) && is_array($payload['errors'])) {
        $flat = [];
        foreach ($payload['errors'] as $item) {
            if (is_string($item) && trim($item) !== '') {
                $flat[] = trim($item);
            } elseif (is_array($item)) {
                foreach ($item as $v) {
                    if (is_string($v) && trim($v) !== '') {
                        $flat[] = trim($v);
                    }
                }
            }
        }
        if (!empty($flat)) {
            return implode('; ', array_unique($flat));
        }
    }
    return '';
}

function domainApiTryCreateDatabaseViaHostingerApi(string $dbName): bool
{
    if (!function_exists('hostingerCreateDatabase')) {
        return false;
    }

    // Per current Hostinger setup, {account} uses hosting username.
    $account = 'u857194726';
    $apiToken = 'k56McvyXP4eHks4fAGfYLyfTcod4Ia6xZDBOE77Wb62535d6';
    $connCfg = function_exists('getDbConnectionConfig') ? getDbConnectionConfig($dbName) : null;
    $dbUser = is_array($connCfg) ? trim((string) ($connCfg['dbuser'] ?? '')) : '';
    $dbPassword = is_array($connCfg) ? trim((string) ($connCfg['dbpass'] ?? '')) : '';
    if ($dbUser === '') {
        $dbUser = $dbName;
    }
    $hostOverride = trim((string) ($_SERVER['HOSTINGER_VHOST'] ?? ''));
    $detectedHost = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $vhost = $hostOverride !== '' ? $hostOverride : ($detectedHost !== '' ? $detectedHost : 'count168.com');

    if ($apiToken === '') {
        throw new RuntimeException('Hostinger API token is required in domain_api.php');
    }
    if ($dbPassword === '') {
        throw new RuntimeException('Hostinger DB password is required in domain_api.php');
    }

    $apiResult = hostingerCreateDatabase($account, $dbName, $apiToken, [
        'user' => $dbUser,
        'password' => $dbPassword,
        'vhost' => $vhost,
    ]);
    $status = (int) ($apiResult['status'] ?? 0);
    $ok = (bool) ($apiResult['ok'] ?? false);
    $payload = $apiResult['data'] ?? null;

    if ($ok) {
        return true;
    }

    $msg = strtolower(domainApiExtractErrorMessageFromApiPayload($payload));
    $alreadyExists = ($status === 409)
        || strpos($msg, 'already exists') !== false
        || strpos($msg, 'must be unique') !== false
        || strpos($msg, 'has already been taken') !== false;
    if ($alreadyExists) {
        return true;
    }

    // Hostinger API/Cloudflare temporary outage fallback:
    // allow flow to continue so provisioning can still work for manually created DBs.
    $isGatewayOutage = ($status === 530)
        || strpos($msg, 'error code: 1016') !== false
        || strpos($msg, 'origin dns error') !== false
        || strpos($msg, 'cloudflare') !== false;
    if ($isGatewayOutage) {
        return false;
    }

    throw new RuntimeException(
        'Hostinger API create database failed'
        . ($status > 0 ? " (HTTP {$status})" : '')
        . ($msg !== '' ? ': ' . $msg : '')
    );
}

/**
 * Add Company 建库模板只允许 Bank/Games 二选一。
 *
 * @param mixed $permissions
 * @return 'bank'|'games'
 */
function domainApiResolveSchemaTypeFromPermissions($permissions): string
{
    if (!is_array($permissions)) {
        throw new InvalidArgumentException('Permission must be an array and include exactly one of Bank/Games');
    }

    $normalized = array_map(static function ($item): string {
        return strtoupper(trim((string) $item));
    }, $permissions);
    $normalized = array_values(array_unique(array_filter($normalized, static function (string $v): bool {
        return $v !== '';
    })));

    $hasBank = in_array('BANK', $normalized, true);
    $hasGames = in_array('GAMES', $normalized, true);

    if ($hasBank === $hasGames) {
        throw new InvalidArgumentException('Permission must select exactly one of Bank or Games');
    }
    return $hasBank ? 'bank' : 'games';
}

function domainApiExecuteSchemaSql(PDO $dbPdo, string $schemaPath): void
{
    $sql = @file_get_contents($schemaPath);
    if ($sql === false) {
        throw new RuntimeException('Failed to read schema file: ' . basename($schemaPath));
    }

    // Remove UTF-8 BOM and common comment forms before splitting statements.
    $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql);
    $sql = preg_replace('/\/\*![\s\S]*?\*\//', '', $sql);
    $sql = preg_replace('/\/\*[\s\S]*?\*\//', '', $sql);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);

    $statements = domainApiSplitSqlStatements((string) $sql);
    try {
        foreach ($statements as $statement) {
            $statement = trim($statement);
            if ($statement === '') {
                continue;
            }
            // Schema files should be DB-agnostic; ignore legacy CREATE DATABASE/USE directives.
            if (preg_match('/^CREATE\s+DATABASE\b/i', $statement) || preg_match('/^USE\b/i', $statement)) {
                continue;
            }
            try {
                $dbPdo->exec($statement);
            } catch (PDOException $e) {
                if (domainApiIsIgnorableSchemaExecError($e)) {
                    continue;
                }
                throw $e;
            }
        }
    } finally {
        // Best effort restore for current connection even when schema fails mid-way.
        try {
            $dbPdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        } catch (Throwable $t) {
            // ignore
        }
    }
}

function domainApiSplitSqlStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $inSingle = false;
    $inDouble = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $ch = $sql[$i];
        $prev = $i > 0 ? $sql[$i - 1] : '';

        if ($ch === "'" && !$inDouble && $prev !== '\\') {
            $inSingle = !$inSingle;
            $buffer .= $ch;
            continue;
        }

        if ($ch === '"' && !$inSingle && $prev !== '\\') {
            $inDouble = !$inDouble;
            $buffer .= $ch;
            continue;
        }

        if ($ch === ';' && !$inSingle && !$inDouble) {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }

        $buffer .= $ch;
    }

    $tail = trim($buffer);
    if ($tail !== '') {
        $statements[] = $tail;
    }

    return $statements;
}

function domainApiIsIgnorableSchemaExecError(PDOException $e): bool
{
    $code = isset($e->errorInfo[1]) ? (int) $e->errorInfo[1] : 0;
    if (in_array($code, [1050, 1060, 1061, 1826], true)) {
        return true;
    }
    $msg = strtolower((string) $e->getMessage());
    return strpos($msg, 'already exists') !== false
        || strpos($msg, 'duplicate key name') !== false
        || strpos($msg, 'duplicate column name') !== false
        || strpos($msg, 'duplicate foreign key constraint name') !== false;
}

function domainApiEnsureSchemaMetaTable(PDO $dbPdo): void
{
    $dbPdo->exec("
        CREATE TABLE IF NOT EXISTS `schema_meta` (
            `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
            `schema_type` varchar(20) NOT NULL,
            `schema_version` varchar(50) NOT NULL DEFAULT 'v1',
            `installed_at` datetime NOT NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_schema_meta_schema_type` (`schema_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function domainApiSchemaAlreadyProvisioned(PDO $dbPdo, string $schemaType): bool
{
    try {
        $hasTable = $dbPdo->query("SHOW TABLES LIKE 'schema_meta'");
        if (!$hasTable || $hasTable->fetch(PDO::FETCH_NUM) === false) {
            return false;
        }
        $stmt = $dbPdo->prepare("SELECT COUNT(*) FROM `schema_meta` WHERE `schema_type` = ? LIMIT 1");
        $stmt->execute([$schemaType]);
        return ((int) $stmt->fetchColumn()) > 0;
    } catch (Throwable $t) {
        return false;
    }
}

function domainApiMarkSchemaProvisioned(PDO $dbPdo, string $schemaType): void
{
    domainApiEnsureSchemaMetaTable($dbPdo);
    $stmt = $dbPdo->prepare("
        INSERT INTO `schema_meta` (`schema_type`, `schema_version`)
        VALUES (?, 'v1')
        ON DUPLICATE KEY UPDATE
            `schema_version` = VALUES(`schema_version`),
            `installed_at` = current_timestamp()
    ");
    $stmt->execute([$schemaType]);
}

function domainApiProvisionCompanyDatabase(string $companyId, string $schemaType): void
{
    $dbName = domainApiDatabaseNameFromCompanyId($companyId);
    $schemaByType = [
        'bank' => __DIR__ . '/../../database/banks_schema.sql',
        'games' => __DIR__ . '/../../database/games_schema.sql',
    ];
    $schemaPath = $schemaByType[$schemaType] ?? null;
    if ($schemaPath === null || !is_file($schemaPath)) {
        throw new RuntimeException('Schema file not found for type: ' . $schemaType);
    }

    // Prefer official Hostinger API auto-provision when configured.
    // Requires HOSTINGER_ACCOUNT_ID + HOSTINGER_API_TOKEN in runtime environment.
    domainApiTryCreateDatabaseViaHostingerApi($dbName);

    if (function_exists('createServerPdoForDatabase')) {
        $basePdo = createServerPdoForDatabase($dbName);
    } else {
        global $host, $dbuser, $dbpass;
        $basePdo = new PDO("mysql:host=$host;charset=utf8mb4", $dbuser, $dbpass);
        $basePdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $basePdo->exec("SET time_zone = '+08:00'");
    }
    try {
        $basePdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (PDOException $e) {
        // Shared hosting may deny CREATE DATABASE.
        // If denied, continue and try provisioning into an already existing database.
        if (!domainApiIsIgnorableProvisioningError($e)) {
            throw $e;
        }
    }

    if (function_exists('createPdoForDatabase')) {
        $dbPdo = createPdoForDatabase($dbName);
    } else {
        global $host, $dbuser, $dbpass;
        $dbPdo = new PDO("mysql:host=$host;dbname={$dbName};charset=utf8mb4", $dbuser, $dbpass);
        $dbPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $dbPdo->exec("SET time_zone = '+08:00'");
    }

    // Idempotency: explicit marker is safer than checking arbitrary existing tables.
    if (domainApiSchemaAlreadyProvisioned($dbPdo, $schemaType)) {
        return;
    }

    domainApiExecuteSchemaSql($dbPdo, $schemaPath);
    domainApiMarkSchemaProvisioned($dbPdo, $schemaType);
}

/**
 * 仅为包含 company_id 的条目建库；group-only 条目跳过。
 */
function domainApiProvisionCompanyDatabasesFromRows(array $companies): void
{
    foreach ($companies as $company) {
        if (!is_array($company)) {
            continue;
        }
        $companyId = strtoupper(trim((string) ($company['company_id'] ?? '')));
        if ($companyId === '') {
            continue;
        }
        $schemaType = domainApiResolveSchemaTypeFromPermissions($company['permissions'] ?? null);
        domainApiProvisionCompanyDatabase($companyId, $schemaType);
    }
}

/**
 * 删除指定表中匹配 ID 的记录
 */
function deleteByIds(PDO $pdo, string $table, string $column, array $ids): void
{
    $ids = normalizeIds($ids);
    if (empty($ids)) {
        return;
    }
    
    $placeholders = buildInPlaceholders(count($ids));

    // transactions 需要先清理子表 transaction_entry，避免外键约束失败
    if ($table === 'transactions') {
        $txnIds = fetchIds(
            $pdo,
            sprintf("SELECT `id` FROM `transactions` WHERE `%s` IN (%s)", $column, $placeholders),
            $ids
        );

        if (!empty($txnIds)) {
            try {
                $hasEntry = $pdo->query("SHOW TABLES LIKE 'transaction_entry'")->rowCount() > 0;
                if ($hasEntry) {
                    $txnPh = buildInPlaceholders(count($txnIds));
                    $delEntry = $pdo->prepare("DELETE FROM `transaction_entry` WHERE `header_id` IN ($txnPh)");
                    $delEntry->execute($txnIds);
                }
            } catch (Exception $e) {
                // 保持旧环境兼容：如果不支持/不存在则忽略
            }
        }
    }

    $sql = sprintf("DELETE FROM `%s` WHERE `%s` IN (%s)", $table, $column, $placeholders);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($ids);
}

/**
 * 检查公司是否为 C168（用于二级密码等权限判断）
 */
/**
 * Domain 列表页：全局 Price（单行 id=1）
 * 注意：MySQL/MariaDB 中任意 CREATE TABLE 都会隐式提交并结束当前事务。
 * 表已存在时必须跳过 CREATE，否则在 beginTransaction 之后的入账逻辑里再调用会触发
 * “There is no active transaction”。
 */
function ensureDomainListFeeSettingsTable(PDO $pdo): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'domain_list_fee_settings'");
        if ($stmt && $stmt->fetch(PDO::FETCH_NUM) !== false) {
            $pdo->exec("INSERT IGNORE INTO `domain_list_fee_settings` (`id`, `price`) VALUES (1, NULL)");
            try {
                $pdo->exec("ALTER TABLE `domain_list_fee_settings` MODIFY COLUMN `price` DECIMAL(25,8) NULL DEFAULT NULL");
            } catch (Exception $e) {
                // Best effort for old schemas.
            }
            $ensured = true;
            return;
        }
    } catch (Exception $e) {
        // 继续尝试建表
    }
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `domain_list_fee_settings` (
            `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            `price` DECIMAL(25,8) NULL DEFAULT NULL,
            `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    try {
        $pdo->exec("ALTER TABLE `domain_list_fee_settings` MODIFY COLUMN `price` DECIMAL(25,8) NULL DEFAULT NULL");
    } catch (Exception $e) {
        // Best effort for old schemas; save will still fail visibly if the column is incompatible.
    }
    $pdo->exec("INSERT IGNORE INTO `domain_list_fee_settings` (`id`, `price`) VALUES (1, NULL)");
    $ensured = true;
}

/**
 * company 表：费用分成（Sales / CS / IT），JSON
 */
function ensureCompanyFeeShareColumn(PDO $pdo): void {
    try {
        $check = $pdo->query("SHOW COLUMNS FROM `company` LIKE 'fee_share_allocations'");
        if ($check && $check->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `company` ADD COLUMN `fee_share_allocations` JSON NULL DEFAULT NULL COMMENT 'Sales/CS/IT fee share % by account' AFTER `permissions`");
        }
    } catch (Exception $e) {
        // 兼容旧环境
    }
}

/**
 * account 表：标记账号来源（domain 自动建账 / 手动建账等）
 * 注意：DDL 必须在事务外调用，避免隐式提交。
 */
function ensureAccountCreatedSourceColumn(PDO $pdo): void {
    static $ensured = false;
    if ($ensured) {
        return;
    }
    try {
        $check = $pdo->query("SHOW COLUMNS FROM `account` LIKE 'created_source'");
        if ($check && $check->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `account` ADD COLUMN `created_source` VARCHAR(50) NULL DEFAULT NULL COMMENT 'Account source, e.g. domain_auto/manual' AFTER `status`");
        }
    } catch (Exception $e) {
        // 兼容旧环境
    }
    $ensured = true;
}

function domainApiHasAccountCreatedSourceColumn(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) {
        return $has;
    }
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `account` LIKE 'created_source'");
        $has = $stmt && $stmt->rowCount() > 0;
    } catch (Exception $e) {
        $has = false;
    }
    return $has;
}

/**
 * @param mixed $raw
 * @return array{profit: list<array{account_id:int,percentage:string}>, sales: list, cs: list, it: list}
 */
function normalizeFeeShareAllocationsInput($raw): array {
    $empty = ['profit' => [], 'sales' => [], 'cs' => [], 'it' => []];
    if ($raw === null || $raw === '') {
        return $empty;
    }
    if (is_string($raw)) {
        $raw = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($raw)) {
            return $empty;
        }
    }
    if (!is_array($raw)) {
        return $empty;
    }
    $out = $empty;
    foreach (['profit', 'sales', 'cs', 'it'] as $role) {
        if (empty($raw[$role]) || !is_array($raw[$role])) {
            continue;
        }
        foreach ($raw[$role] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $aid = isset($row['account_id']) ? (int) $row['account_id'] : 0;
            $pct = isset($row['percentage']) && money_is_valid($row['percentage']) ? money_normalize($row['percentage'], 4) : '0.0000';
            // 正数 = account.id（须为 C168 旗下 Account）；负数 = -user.id（Admin 用户）
            if ($aid !== 0 && money_cmp($pct, '0', 4) >= 0) {
                $out[$role][] = [
                    'account_id' => $aid,
                    'percentage' => money_strip_zeros($pct),
                ];
            }
        }
    }
    return $out;
}

function feeShareAllocationsToJson(?array $normalized): ?string {
    if ($normalized === null) {
        return null;
    }
    $allEmpty = empty($normalized['profit']) && empty($normalized['sales']) && empty($normalized['cs']) && empty($normalized['it']);
    if ($allEmpty) {
        return null;
    }
    return json_encode($normalized, JSON_UNESCAPED_UNICODE);
}

/**
 * 读取某来源公司 Share% 中的 Profit 目标账号（必须是 C168 下 role=profit）。
 */
function resolveShareProfitTargetAccountId(PDO $pdo, string $sourceCompanyCode): ?int
{
    $src = strtoupper(trim($sourceCompanyCode));
    if ($src === '') {
        return null;
    }
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return null;
    }
    try {
        $st = $pdo->prepare("SELECT fee_share_allocations FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1");
        $st->execute([$src]);
        $allocRaw = $st->fetchColumn();
        $normalized = normalizeFeeShareAllocationsInput($allocRaw);
        $profitRows = $normalized['profit'] ?? [];
        if (!is_array($profitRows)) {
            return null;
        }
        foreach ($profitRows as $row) {
            $aid = isset($row['account_id']) ? (int) $row['account_id'] : 0;
            if ($aid <= 0) {
                continue;
            }
            $chk = $pdo->prepare("
                SELECT COUNT(*)
                FROM account a
                INNER JOIN account_company ac ON ac.account_id = a.id
                WHERE a.id = ?
                  AND ac.company_id = ?
                  AND LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
            ");
            $chk->execute([$aid, $c168Pk]);
            if ((int) $chk->fetchColumn() > 0) {
                return $aid;
            }
        }
    } catch (PDOException $e) {
        return null;
    }
    return null;
}

function collectUniqueAccountIdsFromFeeShare(array $normalized): array {
    $ids = [];
    foreach (['profit', 'sales', 'cs', 'it'] as $role) {
        foreach ($normalized[$role] as $row) {
            if (!array_key_exists('account_id', $row)) {
                continue;
            }
            $aid = (int) $row['account_id'];
            if ($aid !== 0) {
                $ids[] = $aid;
            }
        }
    }
    return array_values(array_unique($ids));
}

function getC168CompanyPk(PDO $pdo): ?int {
    $stmt = $pdo->prepare("SELECT id FROM company WHERE UPPER(TRIM(company_id)) = 'C168' LIMIT 1");
    $stmt->execute();
    $v = $stmt->fetchColumn();
    if ($v === false || $v === null || $v === '') {
        return null;
    }
    return (int) $v;
}

function getCompanyPkByCode(PDO $pdo, string $companyCode): ?int {
    $companyCode = strtoupper(trim($companyCode));
    if ($companyCode === '') {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1");
    $stmt->execute([$companyCode]);
    $v = $stmt->fetchColumn();
    if ($v === false || $v === null || $v === '') {
        return null;
    }
    return (int) $v;
}

/**
 * Share % 下拉数据：始终仅列出 C168 旗下的 Account（与当前编辑的公司无关），且 role 只能是 staff/agent。
 */
function fetchFeeSharePickerAccounts(PDO $pdo): array {
    $rows = [];
    $c168Pk = getC168CompanyPk($pdo);
    if ($c168Pk) {
        $accStmt = $pdo->prepare("
            SELECT DISTINCT a.id, a.account_id, a.name
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND LOWER(TRIM(COALESCE(a.role, ''))) IN ('staff', 'agent')
            ORDER BY a.account_id ASC
        ");
        $accStmt->execute([$c168Pk]);
        foreach ($accStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rows[] = [
                'id' => (int) $r['id'],
                'account_id' => $r['account_id'],
                'name' => $r['name'],
                'entry_type' => 'account',
            ];
        }
    }
    return $rows;
}

/**
 * Share % Profit 池下拉：C168 旗下且 role 为 profit 的 Account（与 staff/agent 列表分离）。
 */
function fetchFeeShareProfitPickerAccounts(PDO $pdo): array {
    $rows = [];
    $c168Pk = getC168CompanyPk($pdo);
    if ($c168Pk) {
        $accStmt = $pdo->prepare("
            SELECT DISTINCT a.id, a.account_id, a.name
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
            ORDER BY a.account_id ASC
        ");
        $accStmt->execute([$c168Pk]);
        foreach ($accStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $rows[] = [
                'id' => (int) $r['id'],
                'account_id' => $r['account_id'],
                'name' => $r['name'],
                'entry_type' => 'account',
            ];
        }
    }
    return $rows;
}

/**
 * 校验：C168 旗下；Profit 池仅 profit role；Sales/CS/IT 仅 staff/agent。
 */
function feeShareAllocationsTargetsValid(PDO $pdo, array $normalized): bool {
    $c168Pk = getC168CompanyPk($pdo);

    $profitIds = [];
    foreach (($normalized['profit'] ?? []) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $aid = isset($row['account_id']) ? (int) $row['account_id'] : 0;
        if ($aid > 0) {
            $profitIds[] = $aid;
        }
    }
    $profitIds = array_values(array_unique($profitIds));

    $otherIds = [];
    foreach (['sales', 'cs', 'it'] as $role) {
        foreach (($normalized[$role] ?? []) as $row) {
            if (!is_array($row)) {
                continue;
            }
            $aid = isset($row['account_id']) ? (int) $row['account_id'] : 0;
            if ($aid > 0) {
                $otherIds[] = $aid;
            }
        }
    }
    $otherIds = array_values(array_unique($otherIds));

    if (!empty($profitIds)) {
        if (!$c168Pk) {
            return false;
        }
        $placeholders = buildInPlaceholders(count($profitIds));
        $sql = "
            SELECT COUNT(DISTINCT a.id)
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND a.id IN ($placeholders)
              AND LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$c168Pk], $profitIds));
        if ((int) $stmt->fetchColumn() !== count($profitIds)) {
            return false;
        }
    }

    if (!empty($otherIds)) {
        if (!$c168Pk) {
            return false;
        }
        $placeholders = buildInPlaceholders(count($otherIds));
        $sql = "
            SELECT COUNT(DISTINCT a.id)
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND a.id IN ($placeholders)
              AND LOWER(TRIM(COALESCE(a.role, ''))) IN ('staff', 'agent')
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$c168Pk], $otherIds));
        if ((int) $stmt->fetchColumn() !== count($otherIds)) {
            return false;
        }
    }

    return true;
}

/**
 * 表单或 JSON 中的可选十进制数：空为 null，非法返回 false
 *
 * @param mixed $val
 * @return string|null|false
 */
function normalizeOptionalDecimal($val) {
    if ($val === null || $val === '') {
        return null;
    }
    if (is_string($val)) {
        $val = trim($val);
        if ($val === '') {
            return null;
        }
    }
    if (!money_is_valid($val)) {
        return false;
    }
    return money_normalize($val);
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool
{
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        return $stmt->rowCount() > 0;
    } catch (Exception $e) {
        return false;
    }
}

function getDomainFeePrice(PDO $pdo): ?string
{
    ensureDomainListFeeSettingsTable($pdo);
    $stmt = $pdo->query("SELECT `price` FROM `domain_list_fee_settings` WHERE `id` = 1");
    $price = $stmt ? $stmt->fetchColumn() : null;
    if ($price === false || $price === null || $price === '') {
        return null;
    }
    return money_normalize($price);
}

function domainApiClearTransactionSearchCache(): void
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

/**
 * 在指定公司下解析可用于「付款方」的账户：owner 主账号 -> PROFIT -> 任一 active
 */
function resolvePayerAccountInCompany(PDO $pdo, int $companyPk, int $excludeAccountId): ?int
{
    if ($companyPk <= 0) {
        return null;
    }
    $stmtMain = $pdo->prepare("
        SELECT a.id
        FROM company c
        INNER JOIN owner o ON o.id = c.owner_id
        INNER JOIN account a ON UPPER(TRIM(a.account_id)) = UPPER(TRIM(o.owner_code))
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE c.id = ?
          AND ac.company_id = c.id
          AND a.id <> ?
          AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
        LIMIT 1
    ");
    $stmtMain->execute([$companyPk, $excludeAccountId]);
    $mainId = $stmtMain->fetchColumn();
    if ($mainId !== false && $mainId !== null) {
        return (int) $mainId;
    }
    $stmtProfit = $pdo->prepare("
        SELECT a.id
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ?
          AND UPPER(TRIM(a.account_id)) = 'PROFIT'
          AND a.id <> ?
          AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
        ORDER BY a.id ASC
        LIMIT 1
    ");
    $stmtProfit->execute([$companyPk, $excludeAccountId]);
    $profitId = $stmtProfit->fetchColumn();
    if ($profitId !== false && $profitId !== null) {
        return (int) $profitId;
    }
    $stmtAny = $pdo->prepare("
        SELECT a.id
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ?
          AND a.id <> ?
          AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
        ORDER BY a.account_id ASC, a.id ASC
        LIMIT 1
    ");
    $stmtAny->execute([$companyPk, $excludeAccountId]);
    $anyId = $stmtAny->fetchColumn();
    if ($anyId === false || $anyId === null) {
        return null;
    }
    return (int) $anyId;
}

function getCompanyOwnerDisplayLabel(PDO $pdo, int $companyPk): string
{
    if ($companyPk <= 0) {
        return '';
    }
    $stmt = $pdo->prepare("
        SELECT COALESCE(NULLIF(TRIM(o.name), ''), NULLIF(TRIM(o.owner_code), ''), '') AS lbl
        FROM company c
        INNER JOIN owner o ON o.id = c.owner_id
        WHERE c.id = ?
        LIMIT 1
    ");
    $stmt->execute([$companyPk]);
    $v = $stmt->fetchColumn();
    return ($v !== false && $v !== null) ? trim((string) $v) : '';
}

function getCompanyOwnerCodeByPk(PDO $pdo, int $companyPk): string
{
    if ($companyPk <= 0) {
        return '';
    }
    try {
        $stmt = $pdo->prepare("
            SELECT TRIM(COALESCE(o.owner_code, '')) AS oc
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            WHERE c.id = ?
            LIMIT 1
        ");
        $stmt->execute([$companyPk]);
        $v = $stmt->fetchColumn();
        return ($v !== false && $v !== null) ? strtoupper(trim((string)$v)) : '';
    } catch (Exception $e) {
        return '';
    }
}

function resolveCompanyOwnerAccountId(PDO $pdo, int $companyPk): ?int
{
    if ($companyPk <= 0) {
        return null;
    }
    try {
        $st = $pdo->prepare("
            SELECT a.id
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            INNER JOIN account a ON UPPER(TRIM(a.account_id)) = UPPER(TRIM(o.owner_code))
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE c.id = ?
              AND ac.company_id = c.id
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
            LIMIT 1
        ");
        $st->execute([$companyPk]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? (int)$v : null;
    } catch (PDOException $e) {
        return null;
    }
}

function resolveC168OwnerAccountId(PDO $pdo, int $c168Pk): ?int
{
    return resolveCompanyOwnerAccountId($pdo, $c168Pk);
}

function resolveC168ProfitRoleAccountId(PDO $pdo, int $c168Pk, int $excludeAccountId = 0): ?int
{
    if ($c168Pk <= 0) {
        return null;
    }
    try {
        $st = $pdo->prepare("
            SELECT a.id
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
              AND a.id <> ?
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
            ORDER BY CASE WHEN UPPER(TRIM(COALESCE(a.account_id, ''))) = 'PROFIT' THEN 0 ELSE 1 END, a.id ASC
            LIMIT 1
        ");
        $st->execute([$c168Pk, (int)$excludeAccountId]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? (int)$v : null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * 第三笔：C168 最终净利润（fee - commissions）。
 * 用独立标记避免重复写入，同一天同来源公司只写一笔。
 */
function createDomainNetProfitPayment(
    PDO $pdo,
    string $sourceCompanyCode,
    string $feeAmount,
    string $commissionTotal,
    ?int $fromPoolAccountId,
    ?int $createdByUser,
    ?int $createdByOwner
): array {
    $out = [
        'created' => false,
        'skipped_duplicate' => false,
        'skipped_zero_or_negative' => false,
        'amount' => '0',
    ];
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return $out;
    }
    $net = money_sub($feeAmount, $commissionTotal, 2);
    $out['amount'] = money_out($net);
    if (money_cmp($net, '0') <= 0) {
        $out['skipped_zero_or_negative'] = true;
        return $out;
    }

    $today = date('Y-m-d');
    $srcU = strtoupper(trim($sourceCompanyCode));
    $smsMarker = '[DOMAIN_NET_PROFIT|' . $srcU . ']';
    $dupStmt = $pdo->prepare("
        SELECT id FROM transactions
        WHERE company_id = ? AND transaction_type = 'PAYMENT'
          AND (
                sms = ?
                OR sms LIKE ?
          )
        LIMIT 1
    ");
    $dupStmt->execute([$c168Pk, $smsMarker, $smsMarker . '|%']);
    if ($dupStmt->fetchColumn() !== false) {
        $out['skipped_duplicate'] = true;
        return $out;
    }

    // 目标优先使用来源公司 Share% 里配置的 Profit 账号（必须为 C168 且 role=profit）
    $profitAccId = resolveShareProfitTargetAccountId($pdo, $srcU);
    if (!$profitAccId || $profitAccId <= 0) {
        $profitAccId = resolveC168ProfitRoleAccountId($pdo, $c168Pk, 0);
    }
    // 没有有效 Profit 目标则不建单；from_account_id 固定为空（展示为 "-"）
    if (!$profitAccId || $profitAccId <= 0) {
        return $out;
    }

    $hasCurrencyId = tableHasColumn($pdo, 'transactions', 'currency_id');
    $hasApprovalStatus = tableHasColumn($pdo, 'transactions', 'approval_status');
    $hasApprovedBy = tableHasColumn($pdo, 'transactions', 'approved_by');
    $hasApprovedByOwner = tableHasColumn($pdo, 'transactions', 'approved_by_owner');
    $hasApprovedAt = tableHasColumn($pdo, 'transactions', 'approved_at');
    $hasCreatedAt = tableHasColumn($pdo, 'transactions', 'created_at');
    $defaultTxnCurrencyId = $hasCurrencyId ? resolveC168DefaultTransactionCurrencyId($pdo, $c168Pk) : null;
    $now = date('Y-m-d H:i:s');

    $ownerCode = getCompanyOwnerCodeByPk($pdo, $c168Pk);
    if ($ownerCode === '') {
        $ownerCode = 'C168';
    }

    $insertCols = [
        'company_id' => $c168Pk,
        'transaction_type' => 'PAYMENT',
        'account_id' => $profitAccId,
        'from_account_id' => null,
        'amount' => $net,
        'transaction_date' => $today,
        'description' => 'Profit By ' . $ownerCode,
        'sms' => $smsMarker,
        'created_by' => $createdByUser,
        'created_by_owner' => $createdByOwner,
    ];
    if ($hasCurrencyId) {
        $insertCols['currency_id'] = $defaultTxnCurrencyId;
    }
    if ($hasApprovalStatus) {
        $insertCols['approval_status'] = 'APPROVED';
        if ($hasApprovedBy) { $insertCols['approved_by'] = $createdByUser; }
        if ($hasApprovedByOwner) { $insertCols['approved_by_owner'] = $createdByOwner; }
        if ($hasApprovedAt) { $insertCols['approved_at'] = $now; }
    }
    if ($hasCreatedAt) {
        $insertCols['created_at'] = $now;
    }
    $cols = array_keys($insertCols);
    $ph = implode(',', array_fill(0, count($cols), '?'));
    $sql = "INSERT INTO transactions (`" . implode('`,`', $cols) . "`) VALUES ($ph)";
    $st = $pdo->prepare($sql);
    $st->execute(array_values($insertCols));
    $out['created'] = true;
    return $out;
}

/**
 * C168 侧接收 domain list 费用、并向 Agent 付款时使用的资金池账户
 */
function resolveC168DomainFeePoolAccountId(PDO $pdo, int $c168Pk, int $excludeAccountId): ?int
{
    return resolvePayerAccountInCompany($pdo, $c168Pk, $excludeAccountId);
}

function resolveC168DomainFeeReceiverAccountId(PDO $pdo, int $c168Pk, int $excludeAccountId = 0): ?int
{
    if ($c168Pk <= 0) {
        return null;
    }
    $ownerId = resolveC168OwnerAccountId($pdo, $c168Pk);
    if ($ownerId && $ownerId > 0 && $ownerId !== $excludeAccountId) {
        return $ownerId;
    }
    try {
        $stC168 = $pdo->prepare("
            SELECT a.id
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND UPPER(TRIM(COALESCE(a.account_id, ''))) = 'C168'
              AND a.id <> ?
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
            LIMIT 1
        ");
        $stC168->execute([$c168Pk, (int)$excludeAccountId]);
        $c168Id = $stC168->fetchColumn();
        if ($c168Id !== false && $c168Id !== null) {
            return (int)$c168Id;
        }
    } catch (PDOException $e) {
    }
    try {
        $stAny = $pdo->prepare("
            SELECT a.id
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND a.id <> ?
              AND (a.status IS NULL OR LOWER(TRIM(a.status)) = 'active')
              AND LOWER(TRIM(COALESCE(a.role, ''))) <> 'profit'
              AND UPPER(TRIM(COALESCE(a.account_id, ''))) <> 'PROFIT'
            ORDER BY a.id ASC
            LIMIT 1
        ");
        $stAny->execute([$c168Pk, (int)$excludeAccountId]);
        $v = $stAny->fetchColumn();
        return ($v !== false && $v !== null) ? (int)$v : null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * Domain 在 C168 下自动建的 MEMBER 现为公司代码本体（如 AA/95），
 * 但仍需兼容历史 OWNERCODE_COMPANY 旧账号；List Fee 付款方须能解析到该账号。
 */
function resolveC168DomainProvisionedMemberByCompanyCode(PDO $pdo, int $c168Pk, string $customerCompanyCode, int $excludeAccountId = 0): ?int
{
    $src = strtoupper(trim($customerCompanyCode));
    if ($c168Pk <= 0 || $src === '') {
        return null;
    }
    $ownerUpper = '';
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
    } catch (PDOException $e) {
        return null;
    }
    if ($ownerUpper === '') {
        return null;
    }
    $accountCode = domainApiResolveProvisionedMemberAccountCode($pdo, $c168Pk, $ownerUpper, $src);
    try {
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
        // 兼容旧库：OWNERCODE_COMPANY
        $legacyCode = domainApiBuildLegacyOwnerPrefixedProvisionedMemberAccountId($ownerUpper, $src);
        if (strtoupper(trim($legacyCode)) !== strtoupper(trim($accountCode))) {
            $st2->execute([$c168Pk, $legacyCode, (int) $excludeAccountId]);
            $v2 = $st2->fetchColumn();
            if ($v2 !== false && $v2 !== null) {
                return (int) $v2;
            }
        }
        return null;
    } catch (PDOException $e) {
        return null;
    }
}

function resolveDomainFeeSourceAccountId(PDO $pdo, int $c168Pk, string $customerCompanyCode, int $excludeAccountId = 0): ?int
{
    $srcCode = strtoupper(trim($customerCompanyCode));
    if ($srcCode === '') {
        return null;
    }

    $fromC168CompanyCode = resolveC168CompanyCodeAccountId($pdo, $c168Pk, $srcCode, $excludeAccountId);
    if ($fromC168CompanyCode && $fromC168CompanyCode > 0) {
        return $fromC168CompanyCode;
    }

    $fromProvisioned = resolveC168DomainProvisionedMemberByCompanyCode($pdo, $c168Pk, $srcCode, $excludeAccountId);
    if ($fromProvisioned && $fromProvisioned > 0) {
        return $fromProvisioned;
    }

    // 不再回退到 owner/K/任意账号；仅允许公司码映射或 Domain 自动建账映射。
    return null;
}

/**
 * 回退：在 C168 下按公司代码匹配同名 member 账户（例如 LAG -> account.account_id='LAG'）。
 */
function resolveC168CompanyCodeAccountId(PDO $pdo, int $c168Pk, string $companyCode, int $excludeAccountId = 0): ?int
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
        $st->execute([$c168Pk, $code, (int)$excludeAccountId]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? (int)$v : null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * Transaction Payment / search_api 按 currency_id 汇总 Cr/Dr，且忽略 currency_id IS NULL 的 PAYMENT。
 * Domain 入账必须写入 C168 公司下的币种，优先 MYR，否则取该公司第一条 currency。
 */
function resolveC168DefaultTransactionCurrencyId(PDO $pdo, int $c168CompanyPk): ?int {
    if ($c168CompanyPk <= 0 || !tableHasColumn($pdo, 'transactions', 'currency_id')) {
        return null;
    }
    try {
        $st = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? AND UPPER(TRIM(code)) = 'MYR' ORDER BY id ASC LIMIT 1");
        $st->execute([$c168CompanyPk]);
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null) {
            return (int) $v;
        }
        $st2 = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? ORDER BY id ASC LIMIT 1");
        $st2->execute([$c168CompanyPk]);
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
 * 新增公司后自动创建/挂载 MEMBER 账号时，默认绑定该公司币别（优先 MYR）。
 * account_currency 没有 company_id，因此通过 currency.company_id 限定。
 */
function domainApiEnsureAccountDefaultCurrency(PDO $pdo, int $accountId, int $companyPk, string $preferredCode = 'MYR'): void
{
    if ($accountId <= 0 || $companyPk <= 0) {
        return;
    }
    static $hasTable = null;
    if ($hasTable === null) {
        try {
            $hasTable = $pdo->query("SHOW TABLES LIKE 'account_currency'")->rowCount() > 0;
        } catch (Exception $e) {
            $hasTable = false;
        }
    }
    if (!$hasTable) {
        return;
    }

    try {
        // 若该账号已绑定过“本公司”的任一币别，则不覆盖（保持用户自定义）。
        // 注意：account_currency 没有 company_id，因此要 join currency 来限定 company。
        $chk = $pdo->prepare("
            SELECT COUNT(*)
            FROM account_currency ac
            INNER JOIN currency c ON ac.currency_id = c.id
            WHERE ac.account_id = ?
              AND c.company_id = ?
        ");
        $chk->execute([$accountId, $companyPk]);
        if ((int)$chk->fetchColumn() > 0) {
            return;
        }

        $curId = null;
        $st = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? AND UPPER(TRIM(code)) = ? ORDER BY id ASC LIMIT 1");
        $st->execute([$companyPk, strtoupper(trim($preferredCode))]);
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null) {
            $curId = (int)$v;
        } else {
            $st2 = $pdo->prepare("SELECT id FROM currency WHERE company_id = ? ORDER BY id ASC LIMIT 1");
            $st2->execute([$companyPk]);
            $v2 = $st2->fetchColumn();
            if ($v2 !== false && $v2 !== null) {
                $curId = (int)$v2;
            }
        }
        if (!$curId || $curId <= 0) {
            return;
        }

        // 避免重复插入
        $chk2 = $pdo->prepare("SELECT 1 FROM account_currency WHERE account_id = ? AND currency_id = ? LIMIT 1");
        $chk2->execute([$accountId, $curId]);
        if ($chk2->fetchColumn() === false) {
            $ins = $pdo->prepare("INSERT INTO account_currency (account_id, currency_id) VALUES (?, ?)");
            $ins->execute([$accountId, $curId]);
        }
    } catch (PDOException $e) {
        // 忽略重复/兼容性错误
    }
}

/**
 * Domain List Fee：客户公司账户 -> Share% 配置的 Profit 入账账号（与佣金 from、净利润 from 同一池）；
 * 顾客款先入该池，再由佣金 PAYMENT 从该池扣出各 %，剩余留在 Profit 账号即净利润。
 * 无 Share% Profit 时仅回退 C168 PROFIT 角色账号；不再回退到 owner/K 等账户。
 * 去重由 DOMAIN_LIST_FEE sms 标记负责；删除该笔后可再次创建。
 */
function createDomainListFeePayment(
    PDO $pdo,
    string $customerCompanyCode,
    ?int $createdByUser,
    ?int $createdByOwner
): array {
    $out = [
        'created' => false,
        'skipped_duplicate' => false,
        'skipped_no_price' => false,
        'skipped_no_customer' => false,
        'skipped_no_c168' => false,
        'skipped_no_accounts' => false,
        'amount' => '0',
        'pool_account_id' => null,
    ];
    $feePrice = getDomainFeePrice($pdo);
    if ($feePrice === null || money_cmp($feePrice, '0') <= 0) {
        $out['skipped_no_price'] = true;
        return $out;
    }
    $out['amount'] = money_normalize($feePrice, 2);
    $customerPk = getCompanyPkByCode($pdo, $customerCompanyCode);
    if (!$customerPk) {
        $out['skipped_no_customer'] = true;
        return $out;
    }
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        $out['skipped_no_c168'] = true;
        return $out;
    }
    $custCodeU = strtoupper(trim($customerCompanyCode));
    $poolEarly = resolveShareProfitTargetAccountId($pdo, $custCodeU);
    if (!$poolEarly || $poolEarly <= 0) {
        $poolEarly = resolveC168ProfitRoleAccountId($pdo, $c168Pk, 0);
    }
    if ($poolEarly && $poolEarly > 0) {
        $out['pool_account_id'] = (int) $poolEarly;
    }
    $today = date('Y-m-d');
    $feeSms = '[DOMAIN_LIST_FEE|' . $custCodeU . ']';
    $dupStmt = $pdo->prepare("
        SELECT id FROM transactions
        WHERE company_id = ? AND transaction_type = 'PAYMENT'
          AND (
                sms = ?
                OR sms LIKE ?
          )
        LIMIT 1
    ");
    $dupStmt->execute([$c168Pk, $feeSms, $feeSms . '|%']);
    if ($dupStmt->fetchColumn() !== false) {
        $out['skipped_duplicate'] = true;
        return $out;
    }
    // 第一笔 Domain Fee：From=顾客侧账号；To=Share% Profit 池（与后续佣金/净利润同一 account_id）
    $toC168Pool = $poolEarly ? (int) $poolEarly : null;
    if (!$toC168Pool || $toC168Pool <= 0) {
        $out['skipped_no_accounts'] = true;
        return $out;
    }
    $fromCustomer = resolveDomainFeeSourceAccountId($pdo, $c168Pk, $customerCompanyCode, (int)$toC168Pool);
    if (!$fromCustomer || $fromCustomer === $toC168Pool) {
        $out['skipped_no_accounts'] = true;
        return $out;
    }
    $c168OwnerCode = getCompanyOwnerCodeByPk($pdo, $c168Pk);
    if ($c168OwnerCode === '') {
        $c168OwnerCode = 'C168';
    }
    $desc = 'Pay Domain Fee';

    $now = date('Y-m-d H:i:s');
    $hasCurrencyId = tableHasColumn($pdo, 'transactions', 'currency_id');
    $hasApprovalStatus = tableHasColumn($pdo, 'transactions', 'approval_status');
    $hasApprovedBy = tableHasColumn($pdo, 'transactions', 'approved_by');
    $hasApprovedByOwner = tableHasColumn($pdo, 'transactions', 'approved_by_owner');
    $hasApprovedAt = tableHasColumn($pdo, 'transactions', 'approved_at');
    $hasCreatedAt = tableHasColumn($pdo, 'transactions', 'created_at');
    $defaultTxnCurrencyId = $hasCurrencyId ? resolveC168DefaultTransactionCurrencyId($pdo, $c168Pk) : null;

    $insertCols = [
        'company_id' => $c168Pk,
        'transaction_type' => 'PAYMENT',
        'account_id' => $toC168Pool,
        'from_account_id' => $fromCustomer,
        'amount' => $out['amount'],
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
    $sql = "INSERT INTO transactions (`" . implode('`,`', $columns) . "`) VALUES ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($insertCols));
    $out['created'] = true;
    return $out;
}

/**
 * Confirm 建单：C168 资金池 -> 各 C168 Agent/Staff commission；amount = domain fee * % / 100
 * sms 含客户公司代码，避免多客户共用 C168 时去重误判
 */
function createDomainShareCommissionPayments(
    PDO $pdo,
    string $sourceCompanyCode,
    array $normalizedAllocations,
    ?int $c168SourceAccountId,
    ?int $createdByUser,
    ?int $createdByOwner
): array {
    $result = [
        'created_count' => 0,
        'skipped_admin_count' => 0,
        'skipped_invalid_account_count' => 0,
        'skipped_no_from_account_count' => 0,
        'skipped_duplicate_account_count' => 0,
        'commission_total' => '0',
    ];

    $feePrice = getDomainFeePrice($pdo);
    if ($feePrice === null || money_cmp($feePrice, '0') <= 0) {
        return $result;
    }

    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return $result;
    }

    $fromPoolId = $c168SourceAccountId;
    if (!$fromPoolId || $fromPoolId <= 0) {
        $fromPoolId = resolveC168DomainFeePoolAccountId($pdo, $c168Pk, 0);
    }
    if (!$fromPoolId) {
        $result['skipped_no_from_account_count']++;
        return $result;
    }

    $hasCurrencyId = tableHasColumn($pdo, 'transactions', 'currency_id');
    $hasApprovalStatus = tableHasColumn($pdo, 'transactions', 'approval_status');
    $hasApprovedBy = tableHasColumn($pdo, 'transactions', 'approved_by');
    $hasApprovedByOwner = tableHasColumn($pdo, 'transactions', 'approved_by_owner');
    $hasApprovedAt = tableHasColumn($pdo, 'transactions', 'approved_at');
    $hasCreatedAt = tableHasColumn($pdo, 'transactions', 'created_at');
    $defaultTxnCurrencyId = $hasCurrencyId ? resolveC168DefaultTransactionCurrencyId($pdo, $c168Pk) : null;

    $today = date('Y-m-d');
    $now = date('Y-m-d H:i:s');
    $c168OwnerCode = getCompanyOwnerCodeByPk($pdo, $c168Pk);
    if ($c168OwnerCode === '') {
        $c168OwnerCode = 'C168';
    }
    $srcU = strtoupper(trim($sourceCompanyCode));
    $roleLabelMap = [
        'sales' => 'Sales',
        'cs' => 'CS',
        'it' => 'IT',
    ];

    // Profit 在 Share% 中代表总利润去向，不属于 commission。
    foreach (['sales', 'cs', 'it'] as $role) {
        $rows = $normalizedAllocations[$role] ?? [];
        if (!is_array($rows)) {
            continue;
        }
        $roleLabel = $roleLabelMap[$role] ?? ucfirst($role);
        $description = $roleLabel . ' Commision for ' . $c168OwnerCode;
        foreach ($rows as $row) {
            $aid = isset($row['account_id']) ? (int) $row['account_id'] : 0;
            $pct = isset($row['percentage']) && money_is_valid($row['percentage']) ? money_normalize($row['percentage'], 4) : '0.0000';

            if ($aid < 0) {
                $result['skipped_admin_count']++;
                continue;
            }
            if ($aid <= 0 || money_cmp($pct, '0', 4) <= 0) {
                continue;
            }

            $amount = money_div(money_mul($feePrice, $pct, MONEY_CALC_SCALE), '100', 2);
            if (money_cmp($amount, '0') <= 0) {
                continue;
            }

            $roleSql = "LOWER(TRIM(COALESCE(a.role, ''))) IN ('staff', 'agent')";
            $chk = $pdo->prepare("
                SELECT COUNT(*)
                FROM account_company ac
                INNER JOIN account a ON a.id = ac.account_id
                WHERE ac.account_id = ? AND ac.company_id = ?
                  AND ($roleSql)
            ");
            $chk->execute([$aid, $c168Pk]);
            if ((int) $chk->fetchColumn() <= 0) {
                $result['skipped_invalid_account_count']++;
                continue;
            }

            $smsMarker = '[DOMAIN_SHARE_COMMISSION|' . $srcU . '|ROLE:' . strtoupper($role) . '|AID:' . $aid . ']';
            $dupStmt = $pdo->prepare("
                SELECT id
                FROM transactions
                WHERE company_id = ?
                  AND transaction_type = 'PAYMENT'
                  AND account_id = ?
                  AND (
                        sms = ?
                        OR sms LIKE ?
                  )
                LIMIT 1
            ");
            $dupStmt->execute([$c168Pk, $aid, $smsMarker, $smsMarker . '|%']);
            if ($dupStmt->fetchColumn() !== false) {
                $result['skipped_duplicate_account_count']++;
                continue;
            }

            if ($fromPoolId === $aid) {
                $result['skipped_no_from_account_count']++;
                continue;
            }

            $insertCols = [
                'company_id' => $c168Pk,
                'transaction_type' => 'PAYMENT',
                'account_id' => $aid,
                'from_account_id' => $fromPoolId,
                'amount' => $amount,
                'transaction_date' => $today,
                'description' => $description,
                'sms' => $smsMarker,
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
            $sql = "INSERT INTO transactions (`" . implode('`,`', $columns) . "`) VALUES ($placeholders)";
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($insertCols));
            $result['created_count']++;
            $result['commission_total'] = money_add($result['commission_total'], $amount, 2);
        }
    }

    return $result;
}

function hasDomainNetProfitTransactionExecuted(PDO $pdo, string $sourceCompanyCode): bool
{
    $srcU = strtoupper(trim($sourceCompanyCode));
    if ($srcU === '') {
        return false;
    }
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return false;
    }
    try {
        $st = $pdo->prepare("
            SELECT 1
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.sms LIKE ?
            LIMIT 1
        ");
        $st->execute([$c168Pk, '[DOMAIN_NET_PROFIT|' . $srcU . '%']);
        return $st->fetchColumn() !== false;
    } catch (PDOException $e) {
        return false;
    }
}

function getDomainFeeAndCommissionTotalsBySource(PDO $pdo, string $sourceCompanyCode): array
{
    $out = ['fee' => '0', 'commission' => '0'];
    $srcU = strtoupper(trim($sourceCompanyCode));
    if ($srcU === '') {
        return $out;
    }
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return $out;
    }
    try {
        $st = $pdo->prepare("
            SELECT
                SUM(CASE WHEN t.sms LIKE ? THEN t.amount ELSE 0 END) AS fee_total,
                SUM(CASE WHEN t.sms LIKE ? THEN t.amount ELSE 0 END) AS comm_total
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND (t.sms LIKE ? OR t.sms LIKE ?)
        ");
        $st->execute([
            '[DOMAIN_LIST_FEE|' . $srcU . '%',
            '[DOMAIN_SHARE_COMMISSION|' . $srcU . '%',
            $c168Pk,
            '[DOMAIN_LIST_FEE|' . $srcU . '%',
            '[DOMAIN_SHARE_COMMISSION|' . $srcU . '%',
        ]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
        $out['fee'] = money_normalize($row['fee_total'] ?? '0');
        $out['commission'] = money_normalize($row['comm_total'] ?? '0');
    } catch (PDOException $e) {
        return $out;
    }
    return $out;
}

function normalizeDomainListFeeTransactionParties(PDO $pdo, string $sourceCompanyCode): bool
{
    $srcU = strtoupper(trim($sourceCompanyCode));
    if ($srcU === '') {
        return false;
    }
    $c168Pk = getC168CompanyPk($pdo);
    $customerPk = getCompanyPkByCode($pdo, $srcU);
    if (!$c168Pk || !$customerPk) {
        return false;
    }
    $toOwner = resolveC168DomainFeeReceiverAccountId($pdo, (int)$c168Pk, 0);
    $fromOwner = resolveDomainFeeSourceAccountId($pdo, (int)$c168Pk, $srcU, (int)$toOwner);
    if (!$toOwner || !$fromOwner || (int)$toOwner === (int)$fromOwner) {
        return false;
    }
    try {
        $st = $pdo->prepare("
            UPDATE transactions t
            SET t.account_id = ?, t.from_account_id = ?
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.sms LIKE ?
              AND (t.account_id <> ? OR t.from_account_id <> ?)
        ");
        $st->execute([
            (int)$toOwner,
            (int)$fromOwner,
            (int)$c168Pk,
            '[DOMAIN_LIST_FEE|' . $srcU . '%',
            (int)$toOwner,
            (int)$fromOwner,
        ]);
        return $st->rowCount() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

function normalizeDomainNetProfitTransaction(PDO $pdo, string $sourceCompanyCode): bool
{
    $srcU = strtoupper(trim($sourceCompanyCode));
    if ($srcU === '') {
        return false;
    }
    $c168Pk = getC168CompanyPk($pdo);
    if (!$c168Pk) {
        return false;
    }

    $totals = getDomainFeeAndCommissionTotalsBySource($pdo, $srcU);
    $net = money_sub($totals['fee'], $totals['commission'], 2);
    if (money_cmp($net, '0') <= 0) {
        return false;
    }

    $profitAccId = resolveShareProfitTargetAccountId($pdo, $srcU);
    if (!$profitAccId || $profitAccId <= 0) {
        $profitAccId = resolveC168ProfitRoleAccountId($pdo, (int)$c168Pk, 0);
    }
    if (!$profitAccId || $profitAccId <= 0) {
        return false;
    }

    $ownerCode = getCompanyOwnerCodeByPk($pdo, (int)$c168Pk);
    if ($ownerCode === '') {
        $ownerCode = 'C168';
    }
    $desc = 'Profit By ' . $ownerCode;
    $changed = false;

    try {
        $st = $pdo->prepare("
            UPDATE transactions t
            SET t.account_id = ?,
                t.from_account_id = NULL,
                t.amount = ?,
                t.description = ?
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND t.sms LIKE ?
              AND (
                    t.account_id <> ?
                    OR t.from_account_id IS NOT NULL
                    OR t.amount <> ?
                    OR COALESCE(t.description, '') <> ?
              )
        ");
        $st->execute([
            (int)$profitAccId,
            $net,
            $desc,
            (int)$c168Pk,
            '[DOMAIN_NET_PROFIT|' . $srcU . '%',
            (int)$profitAccId,
            $net,
            $desc,
        ]);
        $changed = ($st->rowCount() > 0);
    } catch (PDOException $e) {
        return false;
    }

    if (!hasDomainNetProfitTransactionExecuted($pdo, $srcU)) {
        $createdByUser = isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner'
            ? null
            : (int) ($_SESSION['user_id'] ?? 0);
        $createdByOwner = isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner'
            ? (int) ($_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? 0)
            : null;
        $created = createDomainNetProfitPayment(
            $pdo,
            $srcU,
            $totals['fee'],
            $totals['commission'],
            null,
            $createdByUser > 0 ? $createdByUser : null,
            $createdByOwner > 0 ? $createdByOwner : null
        );
        if (!empty($created['created'])) {
            $changed = true;
        }
    }

    return $changed;
}

/**
 * EDIT DOMAIN 按下 Confirm 後：對 companies 中標記 apply_commission_payments_on_domain_save 的公司
 * 寫入 domain list fee 與 Share% 佣金（transactions.PAYMENT），與 Transaction Payment / Payment History 同一數據源。
 */
function domainApiApplyDomainListFeePaymentsFromPayload(PDO $pdo, $companies, bool $hasC168Context, bool $domainActorAllowed): void {
    if (!$hasC168Context || !$domainActorAllowed || !isset($_SESSION['user_id'])) {
        return;
    }
    $rows = domainApiNormalizeCompaniesPayload($companies);
    $createdByUser = isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner'
        ? null
        : (int) ($_SESSION['user_id'] ?? 0);
    $createdByOwner = isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'owner'
        ? (int) ($_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? 0)
        : null;
    $u = $createdByUser > 0 ? $createdByUser : null;
    $o = $createdByOwner > 0 ? $createdByOwner : null;
    $any = false;
    foreach ($rows as $row) {
        $cid = strtoupper(trim((string) ($row['company_id'] ?? '')));
        if ($cid === '' || $cid === 'C168') {
            continue;
        }
        $apply = filter_var($row['apply_commission_payments_on_domain_save'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$apply) {
            continue;
        }
        // Confirm 路径优先使用数据库里已保存的 share 配置，避免前端 payload 缺 role 导致漏单
        $normalized = normalizeFeeShareAllocationsInput($row['fee_share_allocations'] ?? null);
        try {
            $stAlloc = $pdo->prepare("SELECT fee_share_allocations FROM company WHERE UPPER(TRIM(company_id)) = ? LIMIT 1");
            $stAlloc->execute([$cid]);
            $dbAllocRaw = $stAlloc->fetchColumn();
            $dbNormalized = normalizeFeeShareAllocationsInput($dbAllocRaw);
            $dbHasAny = !empty($dbNormalized['profit']) || !empty($dbNormalized['sales']) || !empty($dbNormalized['cs']) || !empty($dbNormalized['it']);
            if ($dbHasAny) {
                $normalized = $dbNormalized;
            }
        } catch (Exception $e) {
            // ignore and keep payload normalization
        }
        $feeResult = createDomainListFeePayment($pdo, $cid, $u, $o);
        $poolId = isset($feeResult['pool_account_id']) ? (int) $feeResult['pool_account_id'] : null;
        if ($poolId <= 0) {
            $poolId = null;
        }
        $commissionResult = createDomainShareCommissionPayments($pdo, $cid, $normalized, $poolId, $u, $o);
        $profitResult = createDomainNetProfitPayment(
            $pdo,
            $cid,
            (string) ($feeResult['amount'] ?? '0'),
            (string) ($commissionResult['commission_total'] ?? '0'),
            $poolId,
            $u,
            $o
        );
        if (
            !empty($feeResult['created'])
            || (($commissionResult['created_count'] ?? 0) > 0)
            || !empty($profitResult['created'])
        ) {
            $any = true;
        }
    }
    if ($any) {
        domainApiClearTransactionSearchCache();
    }
}

function isC168Company(PDO $pdo, $company_id): bool {
    if (!$company_id) return false;
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
        $stmt->execute([$company_id]);
        return $stmt->fetchColumn() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 主系统 C168 在 company 表中的数字主键（与当前 session 选中的公司无关，用于统一把 MEMBER 挂到 C168 下）
 */
function getMasterC168CompanyNumericId(PDO $pdo): ?int {
    try {
        $stmt = $pdo->query("SELECT id FROM company WHERE UPPER(TRIM(company_id)) = 'C168' ORDER BY id ASC LIMIT 1");
        $v = $stmt->fetchColumn();
        if ($v !== false && $v !== null) {
            return (int) $v;
        }
        $stmt2 = $pdo->query("SELECT id FROM company WHERE UPPER(TRIM(IFNULL(group_id, ''))) = 'C168' ORDER BY id ASC LIMIT 1");
        $v2 = $stmt2->fetchColumn();
        return ($v2 !== false && $v2 !== null) ? (int) $v2 : null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * 写入 Account List 时使用的 C168 公司主键：优先当前 session 已选中的 C168 行，否则按库中 company_id / group_id 解析
 */
function resolveC168TargetCompanyId(PDO $pdo): ?int {
    $sid = (int) ($_SESSION['company_id'] ?? 0);
    if ($sid > 0 && isC168Company($pdo, $sid)) {
        return $sid;
    }
    return getMasterC168CompanyNumericId($pdo);
}

/**
 * 请求体里 companies 可能是 JSON 字符串、已解码数组或逗号列表；避免 json_decode(数组) 失败导致不写 company、不建 account
 */
function domainApiNormalizeCompaniesPayload($companies): array {
    if ($companies === null || $companies === '') {
        return [];
    }
    if (is_array($companies)) {
        if (isset($companies['company_id']) || isset($companies['group_id']) || isset($companies['expiration_date'])) {
            return [$companies];
        }
        $out = [];
        foreach ($companies as $row) {
            if (is_array($row)) {
                $out[] = $row;
            }
        }
        return $out;
    }
    if (!is_string($companies)) {
        return [];
    }
    $trim = trim($companies);
    if ($trim === '') {
        return [];
    }
    if ($trim[0] === '[' || $trim[0] === '{') {
        $decoded = json_decode($trim, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [];
        }
        if (is_string($decoded)) {
            $decoded = json_decode($decoded, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                return [];
            }
        }
        if (!is_array($decoded)) {
            return [];
        }
        if (isset($decoded['company_id']) || isset($decoded['group_id']) || isset($decoded['expiration_date'])) {
            return [$decoded];
        }
        $out = [];
        foreach ($decoded as $row) {
            if (is_array($row)) {
                $out[] = $row;
            }
        }
        return $out;
    }
    $out = [];
    foreach (array_map('trim', explode(',', $trim)) as $cid) {
        if ($cid === '') {
            continue;
        }
        $out[] = [
            'company_id' => strtoupper($cid),
            'expiration_date' => null,
            'permissions' => [],
            'group_id' => null,
            'fee_share_allocations' => null,
        ];
    }
    return $out;
}

function domainApiExtractProvisionCompanyIds($companies): array {
    $ids = [];
    foreach (domainApiNormalizeCompaniesPayload($companies) as $row) {
        $c = strtoupper(trim((string) ($row['company_id'] ?? '')));
        // C168 主公司不参与 Domain 自动建账（任何场景都跳过）
        if ($c !== '' && $c !== 'C168') {
            $ids[] = $c;
        }
    }
    return array_values(array_unique($ids));
}

/**
 * 是否允许为 C168 主公司自动建 MEMBER：C168 Domain 白名单角色，且（当前为 C168 上下文，或用户有权访问 C168 主公司）
 */
function domainApiMayProvisionC168MemberAccounts(PDO $pdo, bool $hasC168Context, bool $domainActorAllowed): bool {
    if (!$domainActorAllowed) {
        return false;
    }
    if ($hasC168Context) {
        return true;
    }
    $uid = (int) ($_SESSION['user_id'] ?? 0);
    $masterId = resolveC168TargetCompanyId($pdo);
    if ($uid <= 0 || $masterId === null) {
        return false;
    }
    $role = strtolower($_SESSION['role'] ?? '');
    if ($role === 'owner') {
        $owner_id = (int) ($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $uid);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$masterId, $owner_id]);
        return $stmt->fetchColumn() > 0;
    }
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?");
    $stmt->execute([$uid, $masterId]);
    return $stmt->fetchColumn() > 0;
}

function domainApiHasAccountLinkTable(PDO $pdo): bool {
    static $v = null;
    if ($v !== null) return $v;
    try {
        $v = $pdo->query("SHOW TABLES LIKE 'account_link'")->rowCount() > 0;
    } catch (PDOException $e) {
        $v = false;
    }
    return $v;
}

/**
 * 与 account_link_api 一致：双向关联，account_id_1 < account_id_2
 */
function domainApiLinkAccountsBidirectional(PDO $pdo, int $account_id_1, int $account_id_2, int $company_id): void {
    if ($account_id_1 === $account_id_2 || $account_id_1 <= 0 || $account_id_2 <= 0 || $company_id <= 0) {
        return;
    }
    if (!domainApiHasAccountLinkTable($pdo)) {
        return;
    }
    $a1 = $account_id_1;
    $a2 = $account_id_2;
    if ($a1 > $a2) {
        [$a1, $a2] = [$a2, $a1];
    }
    $stmt = $pdo->prepare("SELECT id FROM account_link WHERE account_id_1 = ? AND account_id_2 = ? AND company_id = ?");
    $stmt->execute([$a1, $a2, $company_id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    $link_type = 'bidirectional';
    $source = null;
    static $has_link_type = null;
    if ($has_link_type === null) {
        try {
            $check_column_stmt = $pdo->query("SHOW COLUMNS FROM account_link LIKE 'link_type'");
            $has_link_type = $check_column_stmt && $check_column_stmt->rowCount() > 0;
        } catch (PDOException $e) { $has_link_type = false; }
    }
    if ($existing) {
        if ($has_link_type) {
            $updateStmt = $pdo->prepare("UPDATE account_link SET link_type = ?, source_account_id = ? WHERE id = ?");
            $updateStmt->execute([$link_type, $source, $existing['id']]);
        }
        return;
    }
    if ($has_link_type) {
        $ins = $pdo->prepare("INSERT INTO account_link (account_id_1, account_id_2, company_id, link_type, source_account_id) VALUES (?, ?, ?, ?, ?)");
        $ins->execute([$a1, $a2, $company_id, $link_type, $source]);
    } else {
        $ins = $pdo->prepare("INSERT INTO account_link (account_id_1, account_id_2, company_id) VALUES (?, ?, ?)");
        $ins->execute([$a1, $a2, $company_id]);
    }
}

function domainApiMemberRoleAllowed(PDO $pdo): bool {
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM role WHERE LOWER(code) = LOWER(?)");
        $stmt->execute(['MEMBER']);
        if ($stmt->fetchColumn() > 0) {
            return true;
        }
    } catch (PDOException $e) {
        // 继续：role 表可能缺 MEMBER 行，但 login_process 仍按 MEMBER 登录
    }
    return true;
}

/**
 * Domain 自动建账使用的 MEMBER 模板：role=MEMBER、password=111（与 login_process member 一致）。
 * 仅当账户已符合该模板时才允许覆盖 name/role/password，避免误伤手动创建的同名 account_id（如与公司代码相同的 G）。
 */
function domainApiAccountLooksLikeDomainProvisionedMember(PDO $pdo, int $accountDbId): bool {
    if ($accountDbId <= 0) {
        return false;
    }
    try {
        $hasCreatedSource = domainApiHasAccountCreatedSourceColumn($pdo);
        $sql = $hasCreatedSource
            ? "SELECT role, password, created_source FROM account WHERE id = ? LIMIT 1"
            : "SELECT role, password FROM account WHERE id = ? LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$accountDbId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return false;
        }
        if ($hasCreatedSource) {
            $src = strtolower(trim((string) ($row['created_source'] ?? '')));
            if ($src !== '') {
                return $src === 'domain_auto';
            }
        }
        $role = strtolower(trim((string) ($row['role'] ?? '')));
        $pw = (string) ($row['password'] ?? '');
        return $role === 'member' && $pw === '111';
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * Domain 自动创建的 MEMBER 登录账号：固定使用公司代码本体（如 AA / 95）。
 * 不再生成 OWNERCODE_ 前缀（如 K_95），确保 account_id 直接展示 company id。
 */
function domainApiBuildDomainProvisionedMemberAccountId(string $ownerCodeUpper, string $companyCode): string {
    $cc = strtoupper(trim($companyCode));
    return $cc;
}

/** 旧版：OWNERCODE_公司代码，仅用于查找已存在的自动建账账号 */
function domainApiBuildLegacyOwnerPrefixedProvisionedMemberAccountId(string $ownerCodeUpper, string $companyCode): string
{
    $cc = strtoupper(trim($companyCode));
    $owner = strtoupper(preg_replace('/[^A-Z0-9]/', '', trim($ownerCodeUpper)));
    if ($owner === '') {
        $owner = 'DOM';
    }
    return $owner . '_' . $cc;
}

/**
 * 解析最终 account_id：固定使用公司代码本体（如 AA）。
 * 不再自动追加任何后缀（如 _1/_2/_X），从源头杜绝带后缀账号的自动创建。
 */
function domainApiResolveProvisionedMemberAccountCode(PDO $pdo, int $c168CompanyId, string $ownerCodeUpper, string $companyCode): string {
    return domainApiBuildDomainProvisionedMemberAccountId($ownerCodeUpper, $companyCode);
}

/**
 * Domain 同步策略：强制 name = Owner 姓名、role = MEMBER、password = 111（明文，与 member 登录一致）
 */
function domainApiForceMemberDefaultsFromDomain(PDO $pdo, int $accountDbId, string $ownerDisplayName): void {
    if ($accountDbId <= 0) {
        return;
    }
    try {
        $hasCreatedSource = domainApiHasAccountCreatedSourceColumn($pdo);
        $sql = $hasCreatedSource
            ? "UPDATE account SET name = ?, role = 'MEMBER', password = '111', created_source = 'domain_auto' WHERE id = ?"
            : "UPDATE account SET name = ?, role = 'MEMBER', password = '111' WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$ownerDisplayName, $accountDbId]);
    } catch (PDOException $e) {
        error_log('domainApiForceMemberDefaultsFromDomain: ' . $e->getMessage());
        throw $e;
    }
}

/**
 * Admin 等在 user_company_permissions 里用 account_permissions 白名单时，accountlistapi 只返回白名单内账户；
 * 必须把新账户并入该 JSON，否则账户已写入库但列表被 IN 过滤掉（与 addaccountapi 行为一致，不能 require 该文件）。
 */
function domainApiGetUsersWithCompanyAccess(PDO $pdo, array $companyIds): array {
    $companyIds = array_values(array_filter(array_map('intval', $companyIds), function ($id) {
        return $id > 0;
    }));
    if (empty($companyIds)) {
        return [];
    }
    $placeholders = str_repeat('?,', count($companyIds) - 1) . '?';
    $stmt = $pdo->prepare("
        SELECT DISTINCT u.id, ucp.account_permissions
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        LEFT JOIN user_company_permissions ucp ON u.id = ucp.user_id AND ucm.company_id = ucp.company_id
        WHERE ucm.company_id IN ($placeholders)
    ");
    $stmt->execute($companyIds);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function domainApiMergeAccountIntoUserCompanyPermissions(PDO $pdo, array $users, array $companyIdsToLink, int $newAccountId, string $account_id): void {
    if ($newAccountId <= 0 || $account_id === '') {
        return;
    }
    $loadCurrentStmt = $pdo->prepare("
        SELECT account_permissions
        FROM user_company_permissions
        WHERE user_id = ? AND company_id = ?
        LIMIT 1
    ");
    $updateStmt = $pdo->prepare("
        INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE account_permissions = VALUES(account_permissions)
    ");
    foreach ($users as $user) {
        foreach ($companyIdsToLink as $comp_id) {
            $comp_id = (int) $comp_id;
            if ($comp_id <= 0) {
                continue;
            }
            $currentPermissions = [];
            $hasPermissionsSet = false;
            $loadCurrentStmt->execute([(int) $user['id'], $comp_id]);
            $rawPerm = $loadCurrentStmt->fetchColumn();
            if ($rawPerm !== false && $rawPerm !== null && trim((string) $rawPerm) !== '' && strtolower(trim((string) $rawPerm)) !== 'null') {
                $decoded = json_decode((string) $rawPerm, true);
                if (is_array($decoded)) {
                    $hasPermissionsSet = true;
                    $currentPermissions = $decoded;
                }
            } elseif (isset($user['account_permissions']) && $user['account_permissions'] !== null && trim((string) $user['account_permissions']) !== '' && strtolower(trim((string) $user['account_permissions'])) !== 'null') {
                $decodedSeed = json_decode((string) $user['account_permissions'], true);
                if (is_array($decodedSeed)) {
                    $hasPermissionsSet = true;
                    $currentPermissions = $decodedSeed;
                }
            }
            if (!$hasPermissionsSet) {
                continue;
            }
            $accountExists = false;
            foreach ($currentPermissions as $permission) {
                if (isset($permission['id']) && (int) $permission['id'] === (int) $newAccountId) {
                    $accountExists = true;
                    break;
                }
            }
            if ($accountExists) {
                continue;
            }
            $currentPermissions[] = ['id' => (int) $newAccountId, 'account_id' => $account_id];
            $updateStmt->execute([$user['id'], $comp_id, json_encode($currentPermissions)]);
        }
    }
}

/**
 * C168 在 Add Domain 时为公司代码创建 MEMBER 账户：挂在当前 C168 公司 account list，并关联主账号 C168（account_link）。
 * 密码明文 111，与 login_process.php member 校验一致。
 *
 * @param string $ownerCodeUpper Owner.owner_code（保留参数用于兼容；当前 account_id 固定为公司代码本体）。
 */
function domainApiAutoCreateMemberAccountsUnderC168Company(PDO $pdo, int $c168NumericCompanyId, string $ownerDisplayName, array $companyIdStrings, string $ownerCodeUpper = ''): void {
    if ($c168NumericCompanyId <= 0 || empty($companyIdStrings)) {
        return;
    }
    if (!domainApiMemberRoleAllowed($pdo)) {
        return;
    }

    $ownerCodeUpper = strtoupper(trim($ownerCodeUpper));

    $usersForAccountListPerm = domainApiGetUsersWithCompanyAccess($pdo, [$c168NumericCompanyId]);
    $companyIdsForPerm = [$c168NumericCompanyId];
    $syncListPerm = function (int $accDbId, string $accountCode) use ($pdo, $usersForAccountListPerm, $companyIdsForPerm): void {
        domainApiMergeAccountIntoUserCompanyPermissions($pdo, $usersForAccountListPerm, $companyIdsForPerm, $accDbId, $accountCode);
    };

    $parentStmt = $pdo->prepare("
        SELECT a.id FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE ac.company_id = ? AND UPPER(a.account_id) = 'C168'
        LIMIT 1
    ");
    $parentStmt->execute([$c168NumericCompanyId]);
    $parentAccountId = (int) ($parentStmt->fetchColumn() ?: 0);

    $finalizeMember = function (int $accDbId, string $permAccountCode) use ($pdo, $c168NumericCompanyId, $ownerDisplayName, $parentAccountId, $syncListPerm): void {
        if ($accDbId <= 0) {
            return;
        }
        domainApiForceMemberDefaultsFromDomain($pdo, $accDbId, $ownerDisplayName);
        domainApiEnsureAccountDefaultCurrency($pdo, $accDbId, $c168NumericCompanyId, 'MYR');
        if ($parentAccountId > 0) {
            try {
                domainApiLinkAccountsBidirectional($pdo, $parentAccountId, $accDbId, $c168NumericCompanyId);
            } catch (PDOException $e) {
                error_log('domainApiAutoCreateMemberAccountsUnderC168Company: account_link failed: ' . $e->getMessage());
            }
        }
        $syncListPerm($accDbId, $permAccountCode);
    };

    $findC168ScopedAccStmt = $pdo->prepare("
        SELECT a.id
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ?
          AND UPPER(TRIM(a.account_id)) = UPPER(TRIM(?))
        LIMIT 1
    ");
    $hasCreatedSource = domainApiHasAccountCreatedSourceColumn($pdo);
    $insertSql = $hasCreatedSource
        ? "INSERT INTO account (account_id, name, role, password, payment_alert, alert_day, alert_specific_date, alert_amount, remark, status, created_source, last_login)
           VALUES (?, ?, 'MEMBER', '111', 0, NULL, NULL, NULL, NULL, 'active', 'domain_auto', NULL)"
        : "INSERT INTO account (account_id, name, role, password, payment_alert, alert_day, alert_specific_date, alert_amount, remark, status, last_login)
           VALUES (?, ?, 'MEMBER', '111', 0, NULL, NULL, NULL, NULL, 'active', NULL)";
    $insertStmt = $pdo->prepare($insertSql);
    $linkCoStmt = $pdo->prepare('INSERT INTO account_company (account_id, company_id) VALUES (?, ?)');

    foreach ($companyIdStrings as $raw) {
        $cid = strtoupper(trim((string) $raw));
        // 双保险：即便上游漏过，C168 也绝不自动建账
        if ($cid === '' || $cid === 'C168') {
            continue;
        }
        $useAccountId = domainApiResolveProvisionedMemberAccountCode($pdo, $c168NumericCompanyId, $ownerCodeUpper, $cid);

        $findC168ScopedAccStmt->execute([$c168NumericCompanyId, $useAccountId]);
        $existingAccId = (int) ($findC168ScopedAccStmt->fetchColumn() ?: 0);

        if ($existingAccId > 0) {
            if (!domainApiAccountLooksLikeDomainProvisionedMember($pdo, $existingAccId)) {
                error_log('domainApiAutoCreateMemberAccountsUnderC168Company: resolved code occupied by non-domain member: ' . $useAccountId);
                continue;
            }
            try {
                $linkCoStmt->execute([$existingAccId, $c168NumericCompanyId]);
            } catch (PDOException $e) {
                if ((int) ($e->errorInfo[1] ?? 0) !== 1062) {
                    throw $e;
                }
            }
            $finalizeMember($existingAccId, $useAccountId);
            continue;
        }

        try {
            $insertStmt->execute([$useAccountId, $ownerDisplayName]);
            $newAccId = (int) $pdo->lastInsertId();
            if ($newAccId <= 0) {
                continue;
            }
            try {
                $linkCoStmt->execute([$newAccId, $c168NumericCompanyId]);
            } catch (PDOException $e) {
                if ((int) ($e->errorInfo[1] ?? 0) !== 1062) {
                    throw $e;
                }
            }
            $finalizeMember($newAccId, $useAccountId);
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                $findC168ScopedAccStmt->execute([$c168NumericCompanyId, $useAccountId]);
                $retryId = (int) ($findC168ScopedAccStmt->fetchColumn() ?: 0);
                if ($retryId > 0 && domainApiAccountLooksLikeDomainProvisionedMember($pdo, $retryId)) {
                    try {
                        $linkCoStmt->execute([$retryId, $c168NumericCompanyId]);
                    } catch (PDOException $e2) {
                        if ((int) ($e2->errorInfo[1] ?? 0) !== 1062) {
                            throw $e2;
                        }
                    }
                    $finalizeMember($retryId, $useAccountId);
                }
                continue;
            }
            throw $e;
        }
    }
}

/**
 * 根据 owner_id 获取 owner 及其公司列表（含到期日）
 */
function getOwnerWithCompanies(PDO $pdo, $owner_id) {
    $stmt = $pdo->prepare("
        SELECT o.id, o.owner_code, o.name, o.email, o.created_by,
               GROUP_CONCAT(DISTINCT NULLIF(TRIM(c.group_id), '') ORDER BY c.group_id SEPARATOR ', ') as group_ids,
               GROUP_CONCAT(NULLIF(TRIM(c.company_id), '') ORDER BY c.company_id SEPARATOR ', ') as companies
        FROM owner o
        LEFT JOIN company c ON o.id = c.owner_id
        WHERE o.id = ?
        GROUP BY o.id
    ");
    $stmt->execute([$owner_id]);
    $owner = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$owner) return null;
    $stmt2 = $pdo->prepare("SELECT company_id, expiration_date, group_id FROM company WHERE owner_id = ? ORDER BY company_id");
    $stmt2->execute([$owner_id]);
    $owner['companies_full'] = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    return $owner;
}

/**
 * 标准 JSON 响应：success, message, data
 */
function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

try {
    switch($action) {
        case 'create':
            if (!$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            // Create new owner
            $owner_code = strtoupper(trim($data['owner_code'] ?? ''));
            $name = trim($data['name'] ?? '');
            $email = strtolower(trim($data['email'] ?? ''));
            $password = $data['password'] ?? '';
            $secondary_password = $data['secondary_password'] ?? '';
            $companies = $data['companies'] ?? '';
            
            // Validate required fields
            if (empty($owner_code) || empty($name) || empty($email) || empty($password) || empty($secondary_password)) {
                echo json_encode(['success' => false, 'message' => 'All fields are required', 'data' => null]);
                exit;
            }
            
            // 验证二级密码：必须是6位数字
            if (!preg_match('/^\d{6}$/', $secondary_password)) {
                echo json_encode(['success' => false, 'message' => 'Secondary password must be exactly 6 digits', 'data' => null]);
                exit;
            }
            
            // Hash passwords
            $hashed_password = password_hash($password, PASSWORD_DEFAULT);
            $hashed_secondary_password = password_hash($secondary_password, PASSWORD_DEFAULT);
            
            // DDL 在 MySQL 中会隐式提交并结束当前事务，须在 beginTransaction 之前执行
            ensureCompanyFeeShareColumn($pdo);
            ensureDomainListFeeSettingsTable($pdo);
            ensureAccountCreatedSourceColumn($pdo);
            $companies_data = domainApiNormalizeCompaniesPayload($companies);
            domainApiProvisionCompanyDatabasesFromRows($companies_data);

            // Start transaction
            $pdo->beginTransaction();
            
            try {
                // Insert owner
                $stmt = $pdo->prepare("INSERT INTO owner (owner_code, name, email, password, secondary_password, created_by) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$owner_code, $name, $email, $hashed_password, $hashed_secondary_password, $_SESSION['login_id'] ?? 'system']);
                
                $owner_id = $pdo->lastInsertId();
                
                // Insert companies if any（companies 可为 JSON 字符串或已解析数组）
                if (!empty($companies_data)) {
                    $stmt = $pdo->prepare("INSERT INTO company (company_id, owner_id, created_by, expiration_date, permissions, group_id, fee_share_allocations) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    foreach ($companies_data as $company) {
                        $company_id = strtoupper(trim((string) ($company['company_id'] ?? '')));
                        $expiration_date = !empty($company['expiration_date']) ? $company['expiration_date'] : null;
                        $permissions = (isset($company['permissions']) && is_array($company['permissions'])) ? json_encode($company['permissions']) : null;
                        $group_id = !empty($company['group_id']) ? strtoupper(trim((string) $company['group_id'])) : null;
                        $fee_share_json = feeShareAllocationsToJson(normalizeFeeShareAllocationsInput($company['fee_share_allocations'] ?? null));
                        if (!empty($company_id) || !empty($group_id)) {
                            $db_company_id = !empty($company_id) ? $company_id : '';
                            $stmt->execute([$db_company_id, $owner_id, $_SESSION['login_id'] ?? 'system', $expiration_date, $permissions, $group_id, $fee_share_json]);
                        }
                    }
                }

                // 复用已标准化的 companies 数组，避免原始 JSON 字符串格式差异导致只提取到部分 company
                $provisionCompanyIds = domainApiExtractProvisionCompanyIds($companies_data);
                if (!empty($provisionCompanyIds) && isset($hasC168Context) && domainApiMayProvisionC168MemberAccounts($pdo, $hasC168Context, $canUseC168DomainActions)) {
                    $targetC168 = resolveC168TargetCompanyId($pdo);
                    if ($targetC168 !== null) {
                        domainApiAutoCreateMemberAccountsUnderC168Company($pdo, $targetC168, $name, $provisionCompanyIds, $owner_code);
                    }
                }

                domainApiApplyDomainListFeePaymentsFromPayload($pdo, $companies, $hasC168Context, $canUseC168DomainActions);

                $pdo->commit();

                $owner = getOwnerWithCompanies($pdo, $owner_id);
                echo json_encode([
                    'success' => true,
                    'message' => 'Owner created successfully',
                    'data' => $owner
                ]);
                
            } catch (Exception $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            break;
            
        case 'update':
            if (!$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            // Update existing owner
            $id = $data['id'] ?? 0;
            $name = trim($data['name'] ?? '');
            $email = strtolower(trim($data['email'] ?? ''));
            $password = $data['password'] ?? '';
            $secondary_password = $data['secondary_password'] ?? '';
            $companies = $data['companies'] ?? '';
            
            if (empty($id) || empty($name) || empty($email)) {
                echo json_encode(['success' => false, 'message' => 'Required fields are missing', 'data' => null]);
                exit;
            }
            
            // 如果提供了二级密码，验证格式（只有C168的owner/admin可以修改）
            if (!empty($secondary_password)) {
                if (!$hasC168Context || !$isOwnerOrAdmin) {
                    echo json_encode(['success' => false, 'message' => 'Only C168 owner/admin can modify secondary password', 'data' => null]);
                    exit;
                }
                
                // 验证二级密码：必须是6位数字
                if (!preg_match('/^\d{6}$/', $secondary_password)) {
                    echo json_encode(['success' => false, 'message' => 'Secondary password must be exactly 6 digits', 'data' => null]);
                    exit;
                }
            }
            
            // DDL 在 MySQL 中会隐式提交并结束当前事务，须在 beginTransaction 之前执行
            ensureCompanyFeeShareColumn($pdo);
            ensureDomainListFeeSettingsTable($pdo);
            ensureAccountCreatedSourceColumn($pdo);

            // Start transaction
            $pdo->beginTransaction();
            
            try {
                // Update owner - 根据提供的字段构建UPDATE语句
                $updateFields = [];
                $updateValues = [];
                
                $updateFields[] = "name = ?";
                $updateValues[] = $name;
                
                $updateFields[] = "email = ?";
                $updateValues[] = $email;
                
                if (!empty($password)) {
                    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
                    $updateFields[] = "password = ?";
                    $updateValues[] = $hashed_password;
                }
                
                // 只有C168的owner/admin可以修改二级密码
                if (!empty($secondary_password) && $hasC168Context && $isOwnerOrAdmin) {
                    $hashed_secondary_password = password_hash($secondary_password, PASSWORD_DEFAULT);
                    $updateFields[] = "secondary_password = ?";
                    $updateValues[] = $hashed_secondary_password;
                }
                
                $updateValues[] = $id;
                $sql = "UPDATE owner SET " . implode(', ', $updateFields) . " WHERE id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($updateValues);
                
                // Get existing companies for this owner
                $stmt = $pdo->prepare("SELECT id, company_id, group_id FROM company WHERE owner_id = ?");
                $stmt->execute([$id]);
                $existing_companies = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $existing_company_keys = array_map(function($c) { 
                    return !empty($c['company_id']) ? strtoupper($c['company_id']) : 'GROUPONLY:' . strtoupper($c['group_id']); 
                }, $existing_companies);
                
                // Get new company IDs from input（companies 可为 JSON 字符串或已解析数组）
                $new_companies_data = [];
                foreach (domainApiNormalizeCompaniesPayload($companies) as $company) {
                    $company_id = strtoupper(trim((string) ($company['company_id'] ?? '')));
                    $group_id = !empty($company['group_id']) ? strtoupper(trim((string) $company['group_id'])) : null;
                    if (!empty($company_id) || !empty($group_id)) {
                        $db_company_id = !empty($company_id) ? $company_id : '';
                        $key = $db_company_id !== '' ? $db_company_id : 'GROUPONLY:' . $group_id;
                        $new_companies_data[] = [
                            'key' => $key,
                            'company_id' => $db_company_id,
                            'expiration_date' => !empty($company['expiration_date']) ? $company['expiration_date'] : null,
                            'permissions' => (isset($company['permissions']) && is_array($company['permissions'])) ? $company['permissions'] : [],
                            'group_id' => $group_id,
                            'fee_share_allocations' => $company['fee_share_allocations'] ?? null,
                        ];
                    }
                }
                $new_company_keys = array_column($new_companies_data, 'key');
                
                // Find companies to delete (existing but not in new list)
                $companies_to_delete = [];
                foreach ($existing_companies as $existing) {
                    $key = !empty($existing['company_id']) ? strtoupper($existing['company_id']) : 'GROUPONLY:' . strtoupper($existing['group_id']);
                    if (!in_array($key, $new_company_keys)) {
                        $companies_to_delete[] = $existing;
                    }
                }
                
                // 级联删除公司及其相关数据
                if (!empty($companies_to_delete)) {
                    $delete_db_ids = normalizeIds(array_column($companies_to_delete, 'id'));
                    
                    if (!empty($delete_db_ids)) {
                        $companyPlaceholders = buildInPlaceholders(count($delete_db_ids));
                        
                        // 1. account 及其关联的 transactions
                        // account 表已不再直接持有 company_id，通过 account_company 关系表获取账户
                        $accountStmt = $pdo->prepare("
                            SELECT DISTINCT ac.account_id 
                            FROM account_company ac
                            WHERE ac.company_id IN ($companyPlaceholders)
                        ");
                        $accountStmt->execute($delete_db_ids);
                        $accountIds = normalizeIds($accountStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($accountIds)) {
                            // 先删除与这些账户相关的交易
                            deleteByIds($pdo, 'transactions', 'account_id', $accountIds);
                            deleteByIds($pdo, 'transactions', 'from_account_id', $accountIds);
                        }
                        
                        // 2. process 相关
                        $processStmt = $pdo->prepare("SELECT id FROM process WHERE company_id IN ($companyPlaceholders)");
                        $processStmt->execute($delete_db_ids);
                        $processIds = normalizeIds($processStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($processIds)) {
                            deleteByIds($pdo, 'process_day', 'process_id', $processIds);
                            deleteByIds($pdo, 'submitted_processes', 'process_id', $processIds);
                            
                            // data_capture -> details
                            $processPlaceholders = buildInPlaceholders(count($processIds));
                            $captureStmt = $pdo->prepare("SELECT id FROM data_captures WHERE process_id IN ($processPlaceholders)");
                            $captureStmt->execute($processIds);
                            $captureIds = normalizeIds($captureStmt->fetchAll(PDO::FETCH_COLUMN));
                            
                            if (!empty($captureIds)) {
                                deleteByIds($pdo, 'data_capture_details', 'capture_id', $captureIds);
                                deleteByIds($pdo, 'data_captures', 'id', $captureIds);
                            }
                            
                            deleteByIds($pdo, 'process', 'id', $processIds);
                        }
                        
                        // 3. 其他含 company_id 的表
                        // data_captures 和 data_capture_details（直接包含 company_id 的情况）
                        $directCaptureStmt = $pdo->prepare("SELECT id FROM data_captures WHERE company_id IN ($companyPlaceholders)");
                        $directCaptureStmt->execute($delete_db_ids);
                        $directCaptureIds = normalizeIds($directCaptureStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($directCaptureIds)) {
                            deleteByIds($pdo, 'data_capture_details', 'capture_id', $directCaptureIds);
                            deleteByIds($pdo, 'data_captures', 'id', $directCaptureIds);
                        }
                        
                        // data_capture_details（直接包含 company_id 的情况）
                        deleteByIds($pdo, 'data_capture_details', 'company_id', $delete_db_ids);
                        
                        // data_capture_templates
                        deleteByIds($pdo, 'data_capture_templates', 'company_id', $delete_db_ids);
                        
                        // submitted_processes（直接包含 company_id 的情况）
                        deleteByIds($pdo, 'submitted_processes', 'company_id', $delete_db_ids);
                        
                        // 4. 其他含 company / user 关系的表
                        // 由于 user 不再直接持有 company_id（改为 user_company_map 关系表），
                        // 这里通过 user_company_map 找到与这些 company 关联的用户，仅清理其相关数据，用户本身暂不删除。
                        $userStmt = $pdo->prepare("
                            SELECT DISTINCT u.id
                            FROM user u
                            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                            WHERE ucm.company_id IN ($companyPlaceholders)
                        ");
                        $userStmt->execute($delete_db_ids);
                        $userIds = normalizeIds($userStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($userIds)) {
                            deleteByIds($pdo, 'submitted_processes', 'user_id', $userIds);
                            deleteByIds($pdo, 'transactions', 'created_by', $userIds);
                            
                            $userPlaceholder = buildInPlaceholders(count($userIds));
                            $captureByUserStmt = $pdo->prepare("SELECT id FROM data_captures WHERE created_by IN ($userPlaceholder)");
                            $captureByUserStmt->execute($userIds);
                            $userCaptureIds = normalizeIds($captureByUserStmt->fetchAll(PDO::FETCH_COLUMN));
                            
                            if (!empty($userCaptureIds)) {
                                deleteByIds($pdo, 'data_capture_details', 'capture_id', $userCaptureIds);
                                deleteByIds($pdo, 'data_captures', 'id', $userCaptureIds);
                            }
                        }
                        
                        // 5. 删除其他直接包含 company_id 的表
                        deleteByIds($pdo, 'description', 'company_id', $delete_db_ids);
                        deleteByIds($pdo, 'currency', 'company_id', $delete_db_ids);
                        
                        // 6. 删除 account_company 中与这些 company 关联的记录
                        deleteByIds($pdo, 'account_company', 'company_id', $delete_db_ids);
                        
                        // 7. 删除不再关联任何公司的账户本身
                        if (!empty($accountIds)) {
                            $accountPlaceholder = buildInPlaceholders(count($accountIds));
                            $orphanStmt = $pdo->prepare("
                                SELECT id 
                                FROM account 
                                WHERE id IN ($accountPlaceholder)
                                  AND NOT EXISTS (
                                      SELECT 1 FROM account_company ac 
                                      WHERE ac.account_id = account.id
                                  )
                            ");
                            $orphanStmt->execute($accountIds);
                            $orphanAccountIds = normalizeIds($orphanStmt->fetchAll(PDO::FETCH_COLUMN));
                            
                            if (!empty($orphanAccountIds)) {
                                deleteByIds($pdo, 'account', 'id', $orphanAccountIds);
                            }
                        }
                        
                        // 8. 删除 user 与这些 company 的映射关系
                        deleteByIds($pdo, 'user_company_map', 'company_id', $delete_db_ids);
                        
                        // 9. 最后删除公司本身
                        deleteByIds($pdo, 'company', 'id', $delete_db_ids);
                    }
                }
                
                // Find companies to add (in new list but not existing)
                $companies_to_add = [];
                foreach ($new_companies_data as $new_company) {
                    if (!in_array($new_company['key'], $existing_company_keys)) {
                        $companies_to_add[] = $new_company;
                    }
                }
                
                // Insert new companies
                if (!empty($companies_to_add)) {
                    $stmt = $pdo->prepare("INSERT INTO company (company_id, owner_id, created_by, expiration_date, permissions, group_id, fee_share_allocations) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    
                    foreach ($companies_to_add as $company_data) {
                        $permissions_json = !empty($company_data['permissions']) && is_array($company_data['permissions']) ? json_encode($company_data['permissions']) : null;
                        $fee_share_json = feeShareAllocationsToJson(normalizeFeeShareAllocationsInput($company_data['fee_share_allocations'] ?? null));
                        $stmt->execute([
                            $company_data['company_id'], 
                            $id, 
                            $_SESSION['login_id'] ?? 'system',
                            $company_data['expiration_date'],
                            $permissions_json,
                            $company_data['group_id'],
                            $fee_share_json
                        ]);
                    }
                }

                // 对该 domain 表单中所有带 company_id 的公司同步 C168 下 MEMBER（幂等；便于历史数据补建）
                // 统一使用已标准化后的数组，确保批量公司都能触发自动建账
                $provisionFromUpdate = domainApiExtractProvisionCompanyIds($new_companies_data);
                if (!empty($provisionFromUpdate) && isset($hasC168Context) && domainApiMayProvisionC168MemberAccounts($pdo, $hasC168Context, $canUseC168DomainActions)) {
                    $targetC168 = resolveC168TargetCompanyId($pdo);
                    if ($targetC168 !== null) {
                        $ocStmt = $pdo->prepare('SELECT UPPER(TRIM(owner_code)) FROM owner WHERE id = ? LIMIT 1');
                        $ocStmt->execute([$id]);
                        $updateOwnerCode = (string) ($ocStmt->fetchColumn() ?: '');
                        domainApiAutoCreateMemberAccountsUnderC168Company($pdo, $targetC168, $name, $provisionFromUpdate, $updateOwnerCode);
                    }
                }
                
                // Update existing companies' expiration dates and permissions if changed
                foreach ($new_companies_data as $new_company) {
                    if (in_array($new_company['key'], $existing_company_keys)) {
                        foreach ($existing_companies as $existing) {
                            $existing_key = !empty($existing['company_id']) ? strtoupper($existing['company_id']) : 'GROUPONLY:' . strtoupper($existing['group_id']);
                            if ($existing_key === $new_company['key']) {
                                $permissions_json = !empty($new_company['permissions']) && is_array($new_company['permissions']) ? json_encode($new_company['permissions']) : null;
                                $fee_share_json = feeShareAllocationsToJson(normalizeFeeShareAllocationsInput($new_company['fee_share_allocations'] ?? null));
                                $updateStmt = $pdo->prepare("UPDATE company SET expiration_date = ?, permissions = ?, group_id = ?, fee_share_allocations = ? WHERE id = ?");
                                $updateStmt->execute([$new_company['expiration_date'], $permissions_json, $new_company['group_id'], $fee_share_json, $existing['id']]);
                                break;
                            }
                        }
                    }
                }

                domainApiApplyDomainListFeePaymentsFromPayload($pdo, $companies, $hasC168Context, $canUseC168DomainActions);
                
                $pdo->commit();
                
                $owner = getOwnerWithCompanies($pdo, $id);
                echo json_encode([
                    'success' => true,
                    'message' => 'Owner updated successfully',
                    'data' => $owner
                ]);
                
            } catch (Exception $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            break;
            
        case 'delete':
            if (!$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            // Delete owner and cascade delete all related data手動
            $id = $data['id'] ?? 0;
            
            if (empty($id)) {
                echo json_encode(['success' => false, 'message' => 'Invalid ID', 'data' => null]);
                exit;
            }
            
            // Start transaction
            $pdo->beginTransaction();
            
            try {
                // 获取 owner 旗下的所有公司
                $stmt = $pdo->prepare("SELECT id FROM company WHERE owner_id = ?");
                $stmt->execute([$id]);
                $companyIds = normalizeIds($stmt->fetchAll(PDO::FETCH_COLUMN));
                
                if (!empty($companyIds)) {
                    $companyPlaceholders = buildInPlaceholders(count($companyIds));
                    
                    // 1. account 及其关联的 transactions
                    // account 表已不再直接持有 company_id，通过 account_company 关系表获取账户
                    $accountStmt = $pdo->prepare("
                        SELECT DISTINCT ac.account_id 
                        FROM account_company ac
                        WHERE ac.company_id IN ($companyPlaceholders)
                    ");
                    $accountStmt->execute($companyIds);
                    $accountIds = normalizeIds($accountStmt->fetchAll(PDO::FETCH_COLUMN));
                    
                    if (!empty($accountIds)) {
                        // 先删除与这些账户相关的交易
                        deleteByIds($pdo, 'transactions', 'account_id', $accountIds);
                        deleteByIds($pdo, 'transactions', 'from_account_id', $accountIds);
                    }
                    
                    // 2. process 相关
                    $processStmt = $pdo->prepare("SELECT id FROM process WHERE company_id IN ($companyPlaceholders)");
                    $processStmt->execute($companyIds);
                    $processIds = normalizeIds($processStmt->fetchAll(PDO::FETCH_COLUMN));
                    
                    if (!empty($processIds)) {
                        deleteByIds($pdo, 'process_day', 'process_id', $processIds);
                        deleteByIds($pdo, 'submitted_processes', 'process_id', $processIds);
                        
                        // data_capture -> details
                        $processPlaceholders = buildInPlaceholders(count($processIds));
                        $captureStmt = $pdo->prepare("SELECT id FROM data_captures WHERE process_id IN ($processPlaceholders)");
                        $captureStmt->execute($processIds);
                        $captureIds = normalizeIds($captureStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($captureIds)) {
                            deleteByIds($pdo, 'data_capture_details', 'capture_id', $captureIds);
                            deleteByIds($pdo, 'data_captures', 'id', $captureIds);
                        }
                        
                        deleteByIds($pdo, 'process', 'id', $processIds);
                    }
                    
                    // 3. 其他含 company / user 关系的表
                    // 由于 user 不再直接持有 company_id（改为 user_company_map 关系表），
                    // 这里通过 user_company_map 找到与这些 company 关联的用户，仅清理其相关数据，用户本身暂不删除。
                    $userStmt = $pdo->prepare("
                        SELECT DISTINCT u.id
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE ucm.company_id IN ($companyPlaceholders)
                    ");
                    $userStmt->execute($companyIds);
                    $userIds = normalizeIds($userStmt->fetchAll(PDO::FETCH_COLUMN));
                    
                    if (!empty($userIds)) {
                        deleteByIds($pdo, 'submitted_processes', 'user_id', $userIds);
                        deleteByIds($pdo, 'transactions', 'created_by', $userIds);
                        
                        $userPlaceholder = buildInPlaceholders(count($userIds));
                        $captureByUserStmt = $pdo->prepare("SELECT id FROM data_captures WHERE created_by IN ($userPlaceholder)");
                        $captureByUserStmt->execute($userIds);
                        $userCaptureIds = normalizeIds($captureByUserStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($userCaptureIds)) {
                            deleteByIds($pdo, 'data_capture_details', 'capture_id', $userCaptureIds);
                            deleteByIds($pdo, 'data_captures', 'id', $userCaptureIds);
                        }
                    }
                    
                    deleteByIds($pdo, 'description', 'company_id', $companyIds);
                    deleteByIds($pdo, 'currency', 'company_id', $companyIds);
                    
                    // 删除 account_company 中与这些 company 关联的记录
                    deleteByIds($pdo, 'account_company', 'company_id', $companyIds);
                    
                    // 删除不再关联任何公司的账户本身
                    if (!empty($accountIds)) {
                        $accountPlaceholder = buildInPlaceholders(count($accountIds));
                        $orphanStmt = $pdo->prepare("
                            SELECT id 
                            FROM account 
                            WHERE id IN ($accountPlaceholder)
                              AND NOT EXISTS (
                                  SELECT 1 FROM account_company ac 
                                  WHERE ac.account_id = account.id
                              )
                        ");
                        $orphanStmt->execute($accountIds);
                        $orphanAccountIds = normalizeIds($orphanStmt->fetchAll(PDO::FETCH_COLUMN));
                        
                        if (!empty($orphanAccountIds)) {
                            deleteByIds($pdo, 'account', 'id', $orphanAccountIds);
                        }
                    }
                    
                    // 删除 user 与这些 company 的映射关系
                    deleteByIds($pdo, 'user_company_map', 'company_id', $companyIds);
                }
                
                // 删除 owner 直接创建的数据 (data_captures / transactions)
                $ownerCaptureStmt = $pdo->prepare("SELECT id FROM data_captures WHERE user_type = 'owner' AND created_by = ?");
                $ownerCaptureStmt->execute([$id]);
                $ownerCaptureIds = normalizeIds($ownerCaptureStmt->fetchAll(PDO::FETCH_COLUMN));
                
                if (!empty($ownerCaptureIds)) {
                    deleteByIds($pdo, 'data_capture_details', 'capture_id', $ownerCaptureIds);
                    deleteByIds($pdo, 'data_captures', 'id', $ownerCaptureIds);
                }
                
                deleteByIds($pdo, 'transactions', 'created_by', [$id]);
                
                // 删除 company -> owner
                deleteByIds($pdo, 'company', 'owner_id', [$id]);
                deleteByIds($pdo, 'owner', 'id', [$id]);
                
                $pdo->commit();
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Owner and all related data deleted successfully',
                    'data' => null
                ]);
                
            } catch (Exception $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            break;
            
        case 'get_companies':
            // Get companies for a specific owner with expiration dates
            $owner_id = $data['owner_id'] ?? ($_GET['owner_id'] ?? 0);
            
            if (empty($owner_id)) {
                echo json_encode(['success' => false, 'message' => 'Invalid owner ID', 'data' => null]);
                exit;
            }
            
            try {
                ensureCompanyFeeShareColumn($pdo);
                $stmt = $pdo->prepare("SELECT company_id, expiration_date, permissions, group_id, fee_share_allocations FROM company WHERE owner_id = ? ORDER BY company_id");
                $stmt->execute([$owner_id]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $companies = [];
                foreach ($rows as $row) {
                    $perms = $row['permissions'];
                    if ($perms !== null && $perms !== '') {
                        $decoded = json_decode($perms, true);
                        $row['permissions'] = (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) ? $decoded : [];
                    } else {
                        $row['permissions'] = [];
                    }
                    $row['fee_share_allocations'] = normalizeFeeShareAllocationsInput($row['fee_share_allocations'] ?? null);
                    $companies[] = $row;
                }
                echo json_encode([
                    'success' => true,
                    'message' => 'OK',
                    'data' => ['companies' => $companies]
                ]);
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Error: ' . $e->getMessage(),
                    'data' => null
                ]);
            }
            break;
            
        case 'get_company_permissions':
            // Get permissions for a specific company
            $company_id = $data['company_id'] ?? '';
            
            if (empty($company_id)) {
                echo json_encode(['success' => false, 'message' => 'Invalid company ID', 'data' => null]);
                exit;
            }
            
            try {
                // 通过 company_id (字符串) 查找公司
                $stmt = $pdo->prepare("SELECT permissions FROM company WHERE company_id = ?");
                $stmt->execute([strtoupper($company_id)]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($result && $result['permissions'] !== null && $result['permissions'] !== '') {
                    $permissions = json_decode($result['permissions'], true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($permissions)) {
                        echo json_encode([
                            'success' => true,
                            'message' => 'OK',
                            'data' => ['permissions' => $permissions]
                        ]);
                    } else {
                        echo json_encode([
                            'success' => true,
                            'message' => 'OK',
                            'data' => ['permissions' => []]
                        ]);
                    }
                } else {
                    // 无权限设置或公司不存在：返回空数组，不再默认全选
                    echo json_encode([
                        'success' => true,
                        'message' => 'OK',
                        'data' => ['permissions' => []]
                    ]);
                }
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Error: ' . $e->getMessage(),
                    'data' => null
                ]);
            }
            break;
            
        case 'update_company_permissions':
            // Update permissions for a specific company
            $company_id = $data['company_id'] ?? '';
            $permissions = $data['permissions'] ?? [];

            if (empty($company_id)) {
                echo json_encode(['success' => false, 'message' => 'Invalid company ID', 'data' => null]);
                exit;
            }

            if (!is_array($permissions)) {
                echo json_encode(['success' => false, 'message' => 'Invalid permissions format', 'data' => null]);
                exit;
            }

            try {
                // 验证权限值
                $valid_permissions = ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
                $filtered_permissions = array_intersect($permissions, $valid_permissions);

                // 转换为 JSON
                $permissions_json = json_encode(array_values($filtered_permissions));

                // 同步写入 expiration_date（前端传 null 时清除，不传时保持原有）
                if (array_key_exists('expiration_date', $data)) {
                    $expiration_date_val = (!empty($data['expiration_date']) && $data['expiration_date'] !== 'null')
                        ? $data['expiration_date']
                        : null;
                    $stmt = $pdo->prepare("UPDATE company SET permissions = ?, expiration_date = ? WHERE company_id = ?");
                    $stmt->execute([$permissions_json, $expiration_date_val, strtoupper($company_id)]);
                } else {
                    // 旧调用方式兼容：未传 expiration_date 时只更新权限
                    $stmt = $pdo->prepare("UPDATE company SET permissions = ? WHERE company_id = ?");
                    $stmt->execute([$permissions_json, strtoupper($company_id)]);
                }

                echo json_encode([
                    'success' => true,
                    'message' => 'Permissions updated successfully',
                    'data' => null
                ]);
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Error: ' . $e->getMessage(),
                    'data' => null
                ]);
            }
            break;

        case 'get_company_share_settings':
            if (!isset($_SESSION['user_id']) || !$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            $shareCompanyCode = strtoupper(trim($data['company_id'] ?? ''));
            if ($shareCompanyCode === '') {
                jsonResponse(false, 'Invalid company ID', null);
                exit;
            }
            try {
                ensureCompanyFeeShareColumn($pdo);
                $stmt = $pdo->prepare("SELECT id, fee_share_allocations FROM company WHERE company_id = ? LIMIT 1");
                $stmt->execute([$shareCompanyCode]);
                $shareRow = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$shareRow) {
                    jsonResponse(true, 'OK', [
                        'allocations' => normalizeFeeShareAllocationsInput(null),
                        'accounts' => fetchFeeSharePickerAccounts($pdo),
                        'accounts_profit' => fetchFeeShareProfitPickerAccounts($pdo),
                        'company_exists' => false,
                    ]);
                    break;
                }
                $shareAccounts = fetchFeeSharePickerAccounts($pdo);
                jsonResponse(true, 'OK', [
                    'allocations' => normalizeFeeShareAllocationsInput($shareRow['fee_share_allocations'] ?? null),
                    'accounts' => $shareAccounts,
                    'accounts_profit' => fetchFeeShareProfitPickerAccounts($pdo),
                    'company_exists' => true,
                ]);
            } catch (Exception $e) {
                jsonResponse(false, 'Error: ' . $e->getMessage(), null);
            }
            break;

        case 'save_company_share_settings':
            if (!isset($_SESSION['user_id']) || !$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            $saveShareCode = strtoupper(trim($data['company_id'] ?? ''));
            if ($saveShareCode === '') {
                jsonResponse(false, 'Invalid company ID', null);
                exit;
            }
            $saveNormalized = normalizeFeeShareAllocationsInput($data['fee_share_allocations'] ?? null);
            try {
                ensureCompanyFeeShareColumn($pdo);
                $stmt = $pdo->prepare("SELECT id FROM company WHERE company_id = ? LIMIT 1");
                $stmt->execute([$saveShareCode]);
                $saveRow = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$saveRow) {
                    jsonResponse(false, 'Company not found in database yet; save the domain first.', null);
                    exit;
                }
                $saveCompanyPk = (int) $saveRow['id'];
                if (!feeShareAllocationsTargetsValid($pdo, $saveNormalized)) {
                    jsonResponse(false, 'Share %: Profit rows must use profit-role accounts under C168; Sales/CS/IT must use staff or agent under C168.', null);
                    exit;
                }
                $saveJson = feeShareAllocationsToJson($saveNormalized);
                $pdo->beginTransaction();
                try {
                    $up = $pdo->prepare("UPDATE company SET fee_share_allocations = ? WHERE id = ?");
                    $up->execute([$saveJson, $saveCompanyPk]);
                    $pdo->commit();
                } catch (Exception $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    throw $e;
                }

                jsonResponse(true, 'Share settings saved', [
                    'fee_share_allocations' => $saveNormalized,
                    'domain_fee_payment_created' => false,
                    'domain_fee_skipped_duplicate' => false,
                    'domain_fee_amount' => null,
                    'c168_net_after_share' => null,
                    'commission_payment_created' => 0,
                    'commission_total' => null,
                    'commission_skipped_admin' => 0,
                    'commission_skipped_invalid_account' => 0,
                    'commission_skipped_no_from_account' => 0,
                    'commission_skipped_duplicate_account' => 0,
                    'profit_payment_created' => false,
                    'profit_amount' => null,
                    'domain_one_time_skipped' => false,
                ]);
            } catch (Exception $e) {
                jsonResponse(false, 'Error: ' . $e->getMessage(), null);
            }
            break;

        case 'get_domain_fee_settings':
            if (!$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            try {
                ensureDomainListFeeSettingsTable($pdo);
                $stmt = $pdo->query("SELECT `price` FROM `domain_list_fee_settings` WHERE `id` = 1");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    $row = ['price' => null];
                } elseif ($row['price'] !== null && $row['price'] !== '') {
                    $row['price'] = money_out($row['price']);
                }
                jsonResponse(true, 'OK', $row);
            } catch (Exception $e) {
                jsonResponse(false, 'Error: ' . $e->getMessage(), null);
            }
            break;

        case 'save_domain_fee_settings':
            if (!$hasC168Context || !$canUseC168DomainActions) {
                jsonResponse(false, 'Forbidden', null, 403);
                exit;
            }
            $price = normalizeOptionalDecimal($data['price'] ?? null);
            if ($price === false) {
                jsonResponse(false, 'Price must be a number or empty', null);
                exit;
            }
            try {
                ensureDomainListFeeSettingsTable($pdo);
                $stmt = $pdo->prepare("UPDATE `domain_list_fee_settings` SET `price` = ? WHERE `id` = 1");
                $stmt->execute([$price]);
                jsonResponse(true, 'Saved successfully', [
                    'price' => $price !== null ? money_out($price) : null
                ]);
            } catch (Exception $e) {
                jsonResponse(false, 'Error: ' . $e->getMessage(), null);
            }
            break;
            
        default:
            echo json_encode(['success' => false, 'message' => 'Invalid action', 'data' => null]);
            break;
    }
    
} catch(PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage(),
        'data' => null
    ]);
} catch(Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage(),
        'data' => null
    ]);
}
?>