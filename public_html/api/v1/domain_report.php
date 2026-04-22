<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function dr_get_bearer_token(): ?string
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

$claims = api_token_verify(dr_get_bearer_token());
if ($claims === null) {
    respond_json(401, ['success' => false, 'error' => '登录状态无效，请重新登录', 'error_code' => 'AUTH_TOKEN_INVALID']);
}

$companyId = isset($claims['cid']) ? (int) $claims['cid'] : 0;
if ($companyId <= 0) {
    respond_json(400, ['success' => false, 'error' => '公司参数无效', 'error_code' => 'DR_COMPANY_INVALID']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    respond_json(405, ['success' => false, 'error' => '仅支持 GET']);
}

$mysqli = mysqli_bootstrap();
$action = trim((string) ($_GET['action'] ?? ''));

// Endpoint: get processes dropdown
if ($action === 'processes') {
    $sql = "SELECT p.id, p.process_id, d.name AS description FROM process p LEFT JOIN description d ON p.description_id = d.id WHERE p.company_id = ? ORDER BY p.process_id ASC";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param('i', $companyId);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $label = $row['process_id'];
        if (!empty($row['description'])) $label .= ' (' . $row['description'] . ')';
        $rows[] = [
            'id' => (int) $row['id'],
            'process' => $row['process_id'],
            'description' => $row['description'],
            'display_text' => $label
        ];
    }
    $stmt->close();
    respond_json(200, ['success' => true, 'data' => $rows]);
}

// Endpoint: generate report
$dateFrom = trim((string) ($_GET['date_from'] ?? ''));
$dateTo = trim((string) ($_GET['date_to'] ?? ''));
if ($dateFrom === '' || $dateTo === '') {
    respond_json(400, ['success' => false, 'error' => '日期范围不能为空']);
}

$processId = isset($_GET['process_id']) && $_GET['process_id'] !== '' ? (int) $_GET['process_id'] : null;

$sql = "
    SELECT 
        p.id AS process_pk, p.process_id, d.name AS description_name,
        COALESCE(SUM(ABS(dcd.processed_amount)), 0) AS turnover_total,
        COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total,
        COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN ABS(dcd.processed_amount) ELSE 0 END), 0) AS lose_total
    FROM process p
    LEFT JOIN description d ON p.description_id = d.id
    LEFT JOIN data_captures dc ON dc.process_id = p.id AND dc.company_id = ? AND dc.capture_date BETWEEN ? AND ?
    LEFT JOIN data_capture_details dcd ON dcd.capture_id = dc.id AND dcd.company_id = ?
    WHERE p.company_id = ?
";
$types = 'issii';
$params = [$companyId, $dateFrom, $dateTo, $companyId, $companyId];

if ($processId !== null && $processId > 0) {
    $sql .= " AND p.id = ?";
    $types .= 'i';
    $params[] = $processId;
}
$sql .= " GROUP BY p.id, p.process_id, d.name ORDER BY p.process_id ASC";

$stmt = $mysqli->prepare($sql);
if ($stmt === false) {
    respond_json(500, ['success' => false, 'error' => '查询准备失败']);
}
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();

$reportData = [];
$totalTurnover = 0.0;
$totalWin = 0.0;
$totalLose = 0.0;

while ($row = $result->fetch_assoc()) {
    $turnover = (float) $row['turnover_total'];
    $win = (float) $row['win_total'];
    $lose = (float) $row['lose_total'];
    $totalTurnover += $turnover;
    $totalWin += $win;
    $totalLose += $lose;
    $reportData[] = [
        'process_id' => (int) $row['process_pk'],
        'process' => $row['process_id'],
        'description' => $row['description_name'],
        'turnover' => $turnover,
        'win' => $win,
        'lose' => $lose,
        'win_lose' => $win - $lose,
    ];
}
$stmt->close();

respond_json(200, [
    'success' => true,
    'data' => $reportData,
    'totals' => [
        'turnover' => $totalTurnover,
        'win' => $totalWin,
        'lose' => $totalLose,
        'win_lose' => $totalWin - $totalLose,
    ],
    'date_from' => $dateFrom,
    'date_to' => $dateTo,
]);
