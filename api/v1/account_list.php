<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function acc_get_bearer_token(): ?string
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

function acc_has_column(mysqli $mysqli, string $column): bool
{
    $safe = $mysqli->real_escape_string($column);
    $result = $mysqli->query("SHOW COLUMNS FROM account LIKE '{$safe}'");
    if ($result === false) {
        return false;
    }
    $has = $result->num_rows > 0;
    $result->free();
    return $has;
}

$claims = api_token_verify(acc_get_bearer_token());
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
        'error_code' => 'ACCOUNT_COMPANY_INVALID',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

$hasStatus = acc_has_column($mysqli, 'status');
$hasDeletedAt = acc_has_column($mysqli, 'deleted_at');
$hasDeletedBy = acc_has_column($mysqli, 'deleted_by');
$hasUpdatedAt = acc_has_column($mysqli, 'updated_at');
$hasCreatedAt = acc_has_column($mysqli, 'created_at');
$hasIsDeleted = acc_has_column($mysqli, 'is_deleted');

if ($method === 'GET') {
    $search = trim((string) ($_GET['search'] ?? ''));
    $showInactive = strtolower(trim((string) ($_GET['showInactive'] ?? 'false'))) === 'true';

    $where = ['ac.company_id = ?'];
    if ($hasDeletedAt) {
        $where[] = 'a.deleted_at IS NULL';
    }
    if ($hasIsDeleted) {
        $where[] = 'COALESCE(a.is_deleted, 0) = 0';
    }
    if ($hasStatus) {
        $where[] = $showInactive ? "a.status = 'inactive'" : "a.status = 'active'";
    }

    $types = 'i';
    $params = [$companyId];
    if ($search !== '') {
        $where[] = '(a.account_id LIKE ? OR a.name LIKE ? OR a.role LIKE ?)';
        $types .= 'sss';
        $like = '%' . $search . '%';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }

    $sql = "
        SELECT a.id, a.account_id, a.name, COALESCE(a.role, '') AS role, COALESCE(a.status, 'active') AS status
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY a.account_id ASC
        LIMIT 300
    ";

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '查询准备失败',
            'error_code' => 'ACCOUNT_LIST_PREPARE_FAILED',
        ]);
    }
    $stmt->bind_param($types, ...$params);
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
$userId = isset($claims['uid']) ? (int) $claims['uid'] : 0;

if ($action === 'soft_delete') {
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        respond_json(400, [
            'success' => false,
            'error' => '账户 ID 无效',
            'error_code' => 'ACCOUNT_ID_INVALID',
        ]);
    }

    if (!$hasStatus && !$hasDeletedAt && !$hasIsDeleted) {
        respond_json(500, [
            'success' => false,
            'error' => '当前数据表未配置软删除字段',
            'error_code' => 'ACCOUNT_SOFT_DELETE_NOT_SUPPORTED',
        ]);
    }

    $setParts = [];
    $types = '';
    $params = [];
    if ($hasStatus) {
        $setParts[] = "status = 'inactive'";
    }
    if ($hasDeletedAt) {
        $setParts[] = 'deleted_at = NOW()';
    }
    if ($hasDeletedBy) {
        $setParts[] = 'deleted_by = ?';
        $types .= 'i';
        $params[] = $userId;
    }
    if ($hasIsDeleted) {
        $setParts[] = 'is_deleted = 1';
    }
    if ($hasUpdatedAt) {
        $setParts[] = 'updated_at = NOW()';
    }

    $sql = '
      UPDATE account a
      INNER JOIN account_company ac ON ac.account_id = a.id
      SET ' . implode(', ', $setParts) . '
      WHERE a.id = ? AND ac.company_id = ?
    ';
    $types .= 'ii';
    $params[] = $id;
    $params[] = $companyId;

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '软删除准备失败',
            'error_code' => 'ACCOUNT_SOFT_DELETE_PREPARE_FAILED',
        ]);
    }
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        respond_json(404, [
            'success' => false,
            'error' => '记录不存在或无权限',
            'error_code' => 'ACCOUNT_NOT_FOUND',
        ]);
    }

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

$accountCode = strtoupper(trim((string) ($body['account_id'] ?? '')));
$name = trim((string) ($body['name'] ?? ''));
$role = strtolower(trim((string) ($body['role'] ?? 'user')));

if ($accountCode === '' || mb_strlen($accountCode) > 50) {
    respond_json(400, [
        'success' => false,
        'error' => '账号不能为空且长度不能超过 50',
        'error_code' => 'ACCOUNT_CODE_INVALID',
    ]);
}
if ($name === '' || mb_strlen($name) > 120) {
    respond_json(400, [
        'success' => false,
        'error' => '名称不能为空且长度不能超过 120',
        'error_code' => 'ACCOUNT_NAME_INVALID',
    ]);
}
if ($role === '' || mb_strlen($role) > 30) {
    respond_json(400, [
        'success' => false,
        'error' => '角色无效',
        'error_code' => 'ACCOUNT_ROLE_INVALID',
    ]);
}

$checkSql = '
  SELECT a.id
  FROM account a
  INNER JOIN account_company ac ON ac.account_id = a.id
  WHERE ac.company_id = ? AND a.account_id = ?
  LIMIT 1
';
$checkStmt = $mysqli->prepare($checkSql);
if ($checkStmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '重复检查准备失败',
        'error_code' => 'ACCOUNT_DUPLICATE_PREPARE_FAILED',
    ]);
}
$checkStmt->bind_param('is', $companyId, $accountCode);
$checkStmt->execute();
$exists = $checkStmt->get_result()->fetch_assoc();
$checkStmt->close();
if ($exists !== null) {
    respond_json(400, [
        'success' => false,
        'error' => '账号已存在',
        'error_code' => 'ACCOUNT_DUPLICATE',
    ]);
}

$columns = ['account_id', 'name', 'role'];
$types = 'sss';
$values = [$accountCode, $name, $role];
if ($hasStatus) {
    $columns[] = 'status';
    $types .= 's';
    $values[] = 'active';
}
if ($hasIsDeleted) {
    $columns[] = 'is_deleted';
    $types .= 'i';
    $values[] = 0;
}
if ($hasCreatedAt) {
    $columns[] = 'created_at';
}
if ($hasUpdatedAt) {
    $columns[] = 'updated_at';
}
if (acc_has_column($mysqli, 'last_login')) {
    $columns[] = 'last_login';
}

$placeholders = [];
foreach ($columns as $column) {
    if ($column === 'created_at' || $column === 'updated_at') {
        $placeholders[] = 'NOW()';
    } elseif ($column === 'last_login') {
        $placeholders[] = 'NULL';
    } else {
        $placeholders[] = '?';
    }
}

$insertSql = 'INSERT INTO account (`' . implode('`,`', $columns) . '`) VALUES (' . implode(',', $placeholders) . ')';
$insertStmt = $mysqli->prepare($insertSql);
if ($insertStmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '新增账户准备失败',
        'error_code' => 'ACCOUNT_CREATE_PREPARE_FAILED',
    ]);
}
$insertStmt->bind_param($types, ...$values);
$insertStmt->execute();
$newId = (int) $insertStmt->insert_id;
$insertStmt->close();

$linkStmt = $mysqli->prepare('INSERT INTO account_company (account_id, company_id) VALUES (?, ?)');
if ($linkStmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '账户公司关联准备失败',
        'error_code' => 'ACCOUNT_COMPANY_LINK_PREPARE_FAILED',
    ]);
}
$linkStmt->bind_param('ii', $newId, $companyId);
$linkStmt->execute();
$linkStmt->close();

respond_json(200, [
    'success' => true,
    'data' => ['id' => $newId],
]);
