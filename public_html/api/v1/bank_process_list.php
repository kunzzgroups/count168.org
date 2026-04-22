<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function bp_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(bp_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid', 'error_code' => 'AUTH_TOKEN_INVALID']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') respond_json(405, ['success' => false, 'error' => 'Only GET supported']);

$mysqli = mysqli_bootstrap();
$search = trim((string)($_GET['search'] ?? ''));

$where = ['bp.company_id = ?'];
$types = 'i';
$params = [$companyId];

if ($search !== '') {
    $where[] = '(bp.name LIKE ? OR bp.bank LIKE ? OR bp.process_id LIKE ?)';
    $types .= 'sss';
    $like = '%' . $search . '%';
    $params[] = $like; $params[] = $like; $params[] = $like;
}

$sql = "SELECT bp.id, bp.name, bp.bank, bp.process_id, COALESCE(bp.status,'active') AS status,
        bp.profit, bp.cost, bp.price, bp.day_start,
        a.account_id AS card_merchant_code, a.name AS card_merchant_name
        FROM bank_process bp
        LEFT JOIN account a ON bp.card_merchant_id = a.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY bp.id DESC LIMIT 500";

$stmt = $mysqli->prepare($sql);
if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];
while ($row = $result->fetch_assoc()) $rows[] = $row;
$stmt->close();

respond_json(200, ['success' => true, 'data' => $rows]);
