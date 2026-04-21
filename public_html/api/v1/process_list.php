<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function pl_get_bearer_token(): ?string
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

function pl_has_column(mysqli $mysqli, string $table, string $column): bool
{
    $safeTable = $mysqli->real_escape_string($table);
    $safeColumn = $mysqli->real_escape_string($column);
    $result = $mysqli->query("SHOW COLUMNS FROM `{$safeTable}` LIKE '{$safeColumn}'");
    if ($result === false) {
        return false;
    }
    $has = $result->num_rows > 0;
    $result->free();
    return $has;
}

$claims = api_token_verify(pl_get_bearer_token());
if ($claims === null) {
    respond_json(401, [
        'success' => false,
        'error' => '登录状态无效，请重新登录',
        'error_code' => 'AUTH_TOKEN_INVALID',
    ]);
}

$companyId = isset($claims['cid']) ? (int) $claims['cid'] : 0;
if ($companyId <= 0) {
    respond_json(400, [
        'success' => false,
        'error' => '公司参数无效',
        'error_code' => 'PROCESS_COMPANY_INVALID',
    ]);
}

$mysqli = mysqli_bootstrap();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$hasStatus = pl_has_column($mysqli, 'process', 'status');
$hasCreatedAt = pl_has_column($mysqli, 'process', 'dts_created');
$hasCreatedBy = pl_has_column($mysqli, 'process', 'created_by');
$hasCreatedByType = pl_has_column($mysqli, 'process', 'created_by_type');
$hasCreatedByOwner = pl_has_column($mysqli, 'process', 'created_by_owner_id');
$hasCompanyId = pl_has_column($mysqli, 'process', 'company_id');
$hasCurrency = pl_has_column($mysqli, 'process', 'currency_id');
$hasDescription = pl_has_column($mysqli, 'process', 'description_id');
$hasRemark = pl_has_column($mysqli, 'process', 'remark');

if ($method === 'GET') {
    $search = trim((string) ($_GET['search'] ?? ''));
    $showInactive = strtolower(trim((string) ($_GET['showInactive'] ?? 'false'))) === 'true';

    $where = [];
    $types = '';
    $params = [];
    if ($hasCompanyId) {
        $where[] = 'p.company_id = ?';
        $types .= 'i';
        $params[] = $companyId;
    }
    if ($hasStatus) {
        $where[] = $showInactive ? "p.status = 'inactive'" : "COALESCE(p.status,'active') = 'active'";
    }
    if ($search !== '') {
        $where[] = '(p.process_id LIKE ? OR CAST(COALESCE(p.description_id, "") AS CHAR) LIKE ? OR COALESCE(p.remark, "") LIKE ?)';
        $types .= 'sss';
        $kw = '%' . $search . '%';
        $params[] = $kw;
        $params[] = $kw;
        $params[] = $kw;
    }

    $sql = "
      SELECT
        p.id,
        p.process_id,
        " . ($hasDescription ? "COALESCE(CAST(p.description_id AS CHAR), '')" : "''") . " AS description_id,
        " . ($hasRemark ? "COALESCE(p.remark, '')" : "''") . " AS remark,
        " . ($hasStatus ? "COALESCE(p.status, 'active')" : "'active'") . " AS status
      FROM process p
      " . (count($where) ? 'WHERE ' . implode(' AND ', $where) : '') . "
      ORDER BY p.id DESC
      LIMIT 300
    ";

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '查询准备失败',
            'error_code' => 'PROCESS_LIST_PREPARE_FAILED',
        ]);
    }
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $stmt->close();

    respond_json(200, [
        'success' => true,
        'data' => $rows,
    ]);
}

if ($method !== 'POST') {
    respond_json(405, [
        'success' => false,
        'error' => '仅支持 GET 或 POST',
        'error_code' => 'HTTP_METHOD_NOT_ALLOWED',
    ]);
}

$body = read_json_body();
$action = strtolower(trim((string) ($body['action'] ?? 'create')));

if ($action === 'soft_delete') {
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        respond_json(400, [
            'success' => false,
            'error' => '流程 ID 无效',
            'error_code' => 'PROCESS_ID_INVALID',
        ]);
    }

    if (!$hasStatus) {
        respond_json(500, [
            'success' => false,
            'error' => '当前数据表未配置软删除字段',
            'error_code' => 'PROCESS_SOFT_DELETE_NOT_SUPPORTED',
        ]);
    }

    $sql = 'UPDATE process SET status = ? WHERE id = ?' . ($hasCompanyId ? ' AND company_id = ?' : '');
    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '软删除准备失败',
            'error_code' => 'PROCESS_SOFT_DELETE_PREPARE_FAILED',
        ]);
    }
    if ($hasCompanyId) {
        $status = 'inactive';
        $stmt->bind_param('sii', $status, $id, $companyId);
    } else {
        $status = 'inactive';
        $stmt->bind_param('si', $status, $id);
    }
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        respond_json(404, [
            'success' => false,
            'error' => '记录不存在或无权限',
            'error_code' => 'PROCESS_NOT_FOUND',
        ]);
    }

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

$processId = strtoupper(trim((string) ($body['process_id'] ?? '')));
$descriptionId = trim((string) ($body['description_id'] ?? ''));
$remark = trim((string) ($body['remark'] ?? ''));

if ($processId === '' || mb_strlen($processId) > 80) {
    respond_json(400, [
        'success' => false,
        'error' => '流程编号不能为空且长度不能超过 80',
        'error_code' => 'PROCESS_CODE_INVALID',
    ]);
}
if ($descriptionId === '' || mb_strlen($descriptionId) > 50) {
    respond_json(400, [
        'success' => false,
        'error' => '描述编号不能为空且长度不能超过 50',
        'error_code' => 'PROCESS_DESC_INVALID',
    ]);
}
if (mb_strlen($remark) > 500) {
    respond_json(400, [
        'success' => false,
        'error' => '备注长度不能超过 500',
        'error_code' => 'PROCESS_REMARK_TOO_LONG',
    ]);
}

$dupSql = 'SELECT id FROM process WHERE process_id = ?' . ($hasCompanyId ? ' AND company_id = ?' : '') . ' LIMIT 1';
$dupStmt = $mysqli->prepare($dupSql);
if ($dupStmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '重复检查准备失败',
        'error_code' => 'PROCESS_DUPLICATE_PREPARE_FAILED',
    ]);
}
if ($hasCompanyId) {
    $dupStmt->bind_param('si', $processId, $companyId);
} else {
    $dupStmt->bind_param('s', $processId);
}
$dupStmt->execute();
$exists = $dupStmt->get_result()->fetch_assoc();
$dupStmt->close();
if ($exists !== null) {
    respond_json(400, [
        'success' => false,
        'error' => '流程编号已存在',
        'error_code' => 'PROCESS_DUPLICATE',
    ]);
}

$columns = ['process_id'];
$types = 's';
$values = [$processId];

if ($hasDescription) {
    $columns[] = 'description_id';
    $types .= 's';
    $values[] = $descriptionId;
}
if ($hasCurrency) {
    $columns[] = 'currency_id';
    $types .= 'i';
    $values[] = 0;
}
if ($hasRemark) {
    $columns[] = 'remark';
    $types .= 's';
    $values[] = $remark;
}
if ($hasStatus) {
    $columns[] = 'status';
    $types .= 's';
    $values[] = 'active';
}
if ($hasCompanyId) {
    $columns[] = 'company_id';
    $types .= 'i';
    $values[] = $companyId;
}
if ($hasCreatedBy) {
    $columns[] = 'created_by';
    $types .= 'i';
    $values[] = (int) ($claims['uid'] ?? 0);
}
if ($hasCreatedByType) {
    $columns[] = 'created_by_type';
    $types .= 's';
    $values[] = ((string) ($claims['typ'] ?? 'user')) === 'owner' ? 'owner' : 'user';
}
if ($hasCreatedByOwner) {
    $columns[] = 'created_by_owner_id';
    $types .= 'i';
    $values[] = ((string) ($claims['typ'] ?? '')) === 'owner' ? (int) ($claims['uid'] ?? 0) : 0;
}
if ($hasCreatedAt) {
    $columns[] = 'dts_created';
}

$placeholders = [];
foreach ($columns as $column) {
    $placeholders[] = $column === 'dts_created' ? 'NOW()' : '?';
}

$sql = 'INSERT INTO process (`' . implode('`,`', $columns) . '`) VALUES (' . implode(',', $placeholders) . ')';
$stmt = $mysqli->prepare($sql);
if ($stmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '新增流程准备失败',
        'error_code' => 'PROCESS_CREATE_PREPARE_FAILED',
    ]);
}
$stmt->bind_param($types, ...$values);
$stmt->execute();
$newId = (int) $stmt->insert_id;
$stmt->close();

respond_json(200, [
    'success' => true,
    'data' => ['id' => $newId],
]);
