<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function gp_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(gp_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') respond_json(405, ['success' => false, 'error' => 'Only GET supported']);

$mysqli = mysqli_bootstrap();
$search = trim((string)($_GET['search'] ?? ''));

$where = ['p.company_id = ?'];
$types = 'i';
$params = [$companyId];

if ($search !== '') {
    $where[] = '(p.process_id LIKE ? OR d.name LIKE ?)';
    $types .= 'ss';
    $like = '%' . $search . '%';
    $params[] = $like; $params[] = $like;
}

$sql = "SELECT p.id, p.process_id, d.name AS description, COALESCE(p.status,'active') AS status,
        p.profit, p.cost, p.price
        FROM process p
        LEFT JOIN description d ON p.description_id = d.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY p.process_id ASC LIMIT 500";

$stmt = $mysqli->prepare($sql);
if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];
while ($row = $result->fetch_assoc()) $rows[] = $row;
$stmt->close();

respond_json(200, ['success' => true, 'data' => $rows]);
