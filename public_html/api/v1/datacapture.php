<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function dc_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(dc_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

if ($method === 'GET') {
    $date = trim((string)($_GET['date'] ?? ''));
    $processId = isset($_GET['process_id']) && $_GET['process_id'] !== '' ? (int)$_GET['process_id'] : null;
    
    if ($date === '') respond_json(400, ['success' => false, 'error' => 'Date required']);
    
    // Get processes for dropdown
    $action = trim((string)($_GET['action'] ?? ''));
    if ($action === 'processes') {
        $sql = "SELECT p.id, p.process_id, d.name AS description FROM process p LEFT JOIN description d ON p.description_id = d.id WHERE p.company_id = ? ORDER BY p.process_id ASC";
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param('i', $companyId);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) $rows[] = $row;
        $stmt->close();
        respond_json(200, ['success' => true, 'data' => $rows]);
    }
    
    // Get captures for date
    $where = ['dc.company_id = ?', 'dc.capture_date = ?'];
    $types = 'is';
    $params = [$companyId, $date];
    if ($processId !== null) {
        $where[] = 'dc.process_id = ?';
        $types .= 'i';
        $params[] = $processId;
    }
    
    $sql = "SELECT dc.id, DATE_FORMAT(dc.capture_date,'%Y-%m-%d') AS capture_date,
            p.process_id, d.name AS description, dc.status,
            DATE_FORMAT(dc.created_at,'%d/%m/%Y %H:%i:%s') AS created_at
            FROM data_captures dc
            LEFT JOIN process p ON dc.process_id = p.id
            LEFT JOIN description d ON p.description_id = d.id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY p.process_id ASC";
    $stmt = $mysqli->prepare($sql);
    if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    $stmt->close();
    respond_json(200, ['success' => true, 'data' => $rows]);
}

respond_json(405, ['success' => false, 'error' => 'Method not allowed']);
