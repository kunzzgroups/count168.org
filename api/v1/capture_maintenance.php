<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function cm_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(cm_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') respond_json(405, ['success' => false, 'error' => 'Only GET supported']);

$mysqli = mysqli_bootstrap();

$dateFrom = trim((string)($_GET['date_from'] ?? ''));
$dateTo = trim((string)($_GET['date_to'] ?? ''));

if ($dateFrom === '' || $dateTo === '') respond_json(400, ['success' => false, 'error' => 'Date range required']);

$sql = "SELECT dc.id, DATE_FORMAT(dc.capture_date,'%d/%m/%Y') AS capture_date,
        p.process_id, d.name AS description,
        dc.status, DATE_FORMAT(dc.created_at,'%d/%m/%Y %H:%i:%s') AS created_at
        FROM data_captures dc
        LEFT JOIN process p ON dc.process_id = p.id
        LEFT JOIN description d ON p.description_id = d.id
        WHERE dc.company_id = ? AND dc.capture_date BETWEEN ? AND ?
        ORDER BY dc.capture_date DESC, dc.id DESC LIMIT 500";

$stmt = $mysqli->prepare($sql);
if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
$stmt->bind_param('iss', $companyId, $dateFrom, $dateTo);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];
while ($row = $result->fetch_assoc()) $rows[] = $row;
$stmt->close();

respond_json(200, ['success' => true, 'data' => $rows]);
