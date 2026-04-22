<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function pm_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(pm_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') respond_json(405, ['success' => false, 'error' => 'Only GET supported']);

$mysqli = mysqli_bootstrap();

$dateFrom = trim((string)($_GET['date_from'] ?? ''));
$dateTo = trim((string)($_GET['date_to'] ?? ''));
$search = trim((string)($_GET['search'] ?? ''));

if ($dateFrom === '' || $dateTo === '') {
    respond_json(400, ['success' => false, 'error' => 'Date range required']);
}

$where = ['t.company_id = ?', 't.transaction_date BETWEEN ? AND ?',
           "(t.transaction_type IN ('PAYMENT','RECEIVE','CONTRA','CLAIM'))"];
$types = 'iss';
$params = [$companyId, $dateFrom, $dateTo];

if ($search !== '') {
    $where[] = '(a.account_id LIKE ? OR a.name LIKE ? OR t.description LIKE ?)';
    $types .= 'sss';
    $like = '%' . $search . '%';
    $params[] = $like; $params[] = $like; $params[] = $like;
}

$sql = "SELECT t.id, DATE_FORMAT(t.transaction_date,'%d/%m/%Y') AS transaction_date,
        t.transaction_type, t.amount, t.description, COALESCE(t.sms,'') AS remark,
        a.account_id AS account_code, a.name AS account_name,
        fa.account_id AS from_account_code, fa.name AS from_account_name,
        DATE_FORMAT(t.created_at,'%d/%m/%Y %H:%i:%s') AS created_at
        FROM transactions t
        LEFT JOIN account a ON t.account_id = a.id
        LEFT JOIN account fa ON t.from_account_id = fa.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1000";

$stmt = $mysqli->prepare($sql);
if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];
while ($row = $result->fetch_assoc()) $rows[] = $row;
$stmt->close();

respond_json(200, ['success' => true, 'data' => $rows]);
