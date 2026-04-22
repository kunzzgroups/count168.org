<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function cr_get_bearer_token(): ?string
{
    $authHeader = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = (string) $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['Authorization'])) {
        $authHeader = (string) $_SERVER['Authorization'];
    } elseif (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers) && isset($headers['Authorization'])) {
            $authHeader = (string) $headers['Authorization'];
        }
    }
    if ($authHeader === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $authHeader, $matches)) {
        return null;
    }
    $token = trim((string) ($matches[1] ?? ''));
    return $token === '' ? null : $token;
}

$claims = api_token_verify(cr_get_bearer_token());
if ($claims === null) {
    respond_json(401, ['success' => false, 'error' => '登录状态无效，请重新登录', 'error_code' => 'AUTH_TOKEN_INVALID']);
}

$companyId = isset($claims['cid']) ? (int) $claims['cid'] : 0;
if ($companyId <= 0) {
    respond_json(400, ['success' => false, 'error' => '公司参数无效', 'error_code' => 'CR_COMPANY_INVALID']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    respond_json(405, ['success' => false, 'error' => '仅支持 GET']);
}

$mysqli = mysqli_bootstrap();

// Helper functions
function cr_table_exists(mysqli $mysqli, string $table): bool {
    $result = $mysqli->query("SHOW TABLES LIKE '" . $mysqli->real_escape_string($table) . "'");
    return $result !== false && $result->num_rows > 0;
}

function cr_column_exists(mysqli $mysqli, string $table, string $column): bool {
    $result = $mysqli->query("SHOW COLUMNS FROM `" . $mysqli->real_escape_string($table) . "` LIKE '" . $mysqli->real_escape_string($column) . "'");
    return $result !== false && $result->num_rows > 0;
}

// Get accounts for company
function cr_get_accounts(mysqli $mysqli, int $companyId, string $accountIdFilter): array {
    $useAc = cr_table_exists($mysqli, 'account_company');
    if ($useAc) {
        $sql = "SELECT a.id, a.account_id, a.name FROM account a INNER JOIN account_company ac ON a.id = ac.account_id WHERE ac.company_id = ?";
    } else {
        $sql = "SELECT id, account_id, name FROM account WHERE company_id = ?";
    }
    $params = [$companyId];
    $types = 'i';
    if ($accountIdFilter !== '') {
        $sql .= $useAc ? " AND a.id = ?" : " AND id = ?";
        $params[] = (int) $accountIdFilter;
        $types .= 'i';
    }
    $sql .= $useAc ? " ORDER BY a.account_id ASC" : " ORDER BY account_id ASC";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) { $rows[] = $row; }
    $stmt->close();
    return $rows;
}

// Get currencies for an account
function cr_get_currencies(mysqli $mysqli, int $accountId): array {
    if (cr_table_exists($mysqli, 'account_currency')) {
        $stmt = $mysqli->prepare("SELECT c.id AS currency_id, c.code AS currency_code FROM account_currency ac INNER JOIN currency c ON ac.currency_id = c.id WHERE ac.account_id = ? ORDER BY ac.id ASC");
        $stmt->bind_param('i', $accountId);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) { $rows[] = $row; }
        $stmt->close();
        return $rows;
    }
    if (cr_column_exists($mysqli, 'account', 'currency_id')) {
        $stmt = $mysqli->prepare("SELECT c.id AS currency_id, c.code AS currency_code FROM account a INNER JOIN currency c ON a.currency_id = c.id WHERE a.id = ?");
        $stmt->bind_param('i', $accountId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ? [$row] : [];
    }
    return [];
}

// Get win/lose totals
function cr_get_winlose(mysqli $mysqli, int $accountId, ?int $currencyId, string $dateFrom, string $dateTo): array {
    if ($currencyId !== null) {
        $sql = "SELECT COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total, COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN dcd.processed_amount ELSE 0 END), 0) AS lose_total FROM data_capture_details dcd JOIN data_captures dc ON dcd.capture_id = dc.id WHERE CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR) AND dcd.currency_id = ? AND dc.capture_date BETWEEN ? AND ?";
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param('iiss', $accountId, $currencyId, $dateFrom, $dateTo);
    } else {
        $sql = "SELECT COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total, COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN dcd.processed_amount ELSE 0 END), 0) AS lose_total FROM data_capture_details dcd JOIN data_captures dc ON dcd.capture_id = dc.id WHERE CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR) AND dc.capture_date BETWEEN ? AND ?";
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param('iss', $accountId, $dateFrom, $dateTo);
    }
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return [
        'win' => (float) ($row['win_total'] ?? 0),
        'lose' => (float) ($row['lose_total'] ?? 0)
    ];
}

$dateFrom = trim((string) ($_GET['date_from'] ?? ''));
$dateTo = trim((string) ($_GET['date_to'] ?? ''));
if ($dateFrom === '' || $dateTo === '') {
    respond_json(400, ['success' => false, 'error' => '开始日期和结束日期不能为空']);
}

$accountIdFilter = trim((string) ($_GET['account_id'] ?? ''));
$showAll = strtolower(trim((string) ($_GET['show_all'] ?? 'false'))) === 'true';
$currencyFilter = trim((string) ($_GET['currency'] ?? ''));

$accounts = cr_get_accounts($mysqli, $companyId, $accountIdFilter);
$reportData = [];
$totalWin = 0.0;
$totalLose = 0.0;

foreach ($accounts as $account) {
    $accId = (int) $account['id'];
    $allCurrencies = cr_get_currencies($mysqli, $accId);
    
    $filtered = $allCurrencies;
    if ($currencyFilter !== '') {
        $codes = array_map('strtoupper', array_map('trim', explode(',', $currencyFilter)));
        $filtered = array_filter($allCurrencies, function ($c) use ($codes) {
            return in_array(strtoupper($c['currency_code']), $codes);
        });
    }
    
    if (!empty($filtered)) {
        foreach ($filtered as $cur) {
            $wl = cr_get_winlose($mysqli, $accId, (int) $cur['currency_id'], $dateFrom, $dateTo);
            if (!$showAll && $wl['win'] == 0 && $wl['lose'] == 0) continue;
            $totalWin += $wl['win'];
            $totalLose += $wl['lose'];
            $reportData[] = [
                'id' => $account['id'], 'account_id' => $account['account_id'], 'name' => $account['name'],
                'currency' => $cur['currency_code'], 'win' => $wl['win'], 'lose' => $wl['lose']
            ];
        }
    } elseif (!empty($allCurrencies)) {
        continue;
    } else {
        if ($currencyFilter !== '') continue;
        $wl = cr_get_winlose($mysqli, $accId, null, $dateFrom, $dateTo);
        if (!$showAll && $wl['win'] == 0 && $wl['lose'] == 0) continue;
        $totalWin += $wl['win'];
        $totalLose += $wl['lose'];
        $reportData[] = [
            'id' => $account['id'], 'account_id' => $account['account_id'], 'name' => $account['name'],
            'currency' => null, 'win' => $wl['win'], 'lose' => $wl['lose']
        ];
    }
}

respond_json(200, [
    'success' => true,
    'data' => $reportData,
    'total_win' => $totalWin,
    'total_lose' => $totalLose,
    'date_from' => $dateFrom,
    'date_to' => $dateTo,
]);
