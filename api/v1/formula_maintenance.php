<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/bootstrap.php';

function fm_get_token(): ?string {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
    elseif (function_exists('getallheaders')) { $hd = getallheaders(); if (is_array($hd) && isset($hd['Authorization'])) $h = (string)$hd['Authorization']; }
    if ($h === '' || !preg_match('/^\s*Bearer\s+(.+)\s*$/i', $h, $m)) return null;
    $t = trim((string)($m[1] ?? '')); return $t === '' ? null : $t;
}

$claims = api_token_verify(fm_get_token());
if ($claims === null) respond_json(401, ['success' => false, 'error' => 'Auth invalid']);
$companyId = isset($claims['cid']) ? (int)$claims['cid'] : 0;
if ($companyId <= 0) respond_json(400, ['success' => false, 'error' => 'Company invalid']);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

if ($method === 'GET') {
    $sql = "SELECT ft.id, ft.name, ft.formula_expression, ft.target_field, ft.is_active,
            DATE_FORMAT(ft.created_at,'%d/%m/%Y %H:%i:%s') AS created_at
            FROM formula_templates ft
            WHERE ft.company_id = ?
            ORDER BY ft.name ASC LIMIT 300";
    $stmt = $mysqli->prepare($sql);
    if (!$stmt) respond_json(500, ['success' => false, 'error' => 'Query failed']);
    $stmt->bind_param('i', $companyId);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    $stmt->close();
    respond_json(200, ['success' => true, 'data' => $rows]);
}

respond_json(405, ['success' => false, 'error' => 'Method not allowed']);
