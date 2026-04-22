<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function user_get_bearer_token(): ?string
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

$claims = api_token_verify(user_get_bearer_token());
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
        'error_code' => 'USER_COMPANY_INVALID',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

if ($method === 'GET') {
    $search = trim((string) ($_GET['search'] ?? ''));
    
    $where = ['ucm.company_id = ?'];
    $types = 'i';
    $params = [$companyId];
    
    if ($search !== '') {
        $where[] = '(u.login_id LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.role LIKE ?)';
        $types .= 'ssss';
        $like = '%' . $search . '%';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }

    $sql = "
      SELECT u.id, u.login_id, u.name, u.email, COALESCE(u.role, '') AS role, COALESCE(u.status, 'active') AS status
      FROM user u
      INNER JOIN user_company_map ucm ON ucm.user_id = u.id
      WHERE " . implode(' AND ', $where) . "
      ORDER BY u.id DESC
      LIMIT 300
    ";

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '查询准备失败',
            'error_code' => 'USER_LIST_PREPARE_FAILED',
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
            'error' => '用户 ID 无效',
            'error_code' => 'USER_ID_INVALID',
        ]);
    }

    $sql = '
      UPDATE user u
      INNER JOIN user_company_map ucm ON ucm.user_id = u.id
      SET u.status = "inactive"
      WHERE u.id = ? AND ucm.company_id = ?
    ';
    
    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '禁用用户准备失败',
            'error_code' => 'USER_DISABLE_PREPARE_FAILED',
        ]);
    }
    $stmt->bind_param('ii', $id, $companyId);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        respond_json(404, [
            'success' => false,
            'error' => '记录不存在或无权限或已停用',
            'error_code' => 'USER_NOT_FOUND',
        ]);
    }

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

$loginId = trim((string) ($body['login_id'] ?? ''));
$name = trim((string) ($body['name'] ?? ''));
$email = trim((string) ($body['email'] ?? ''));
$role = strtolower(trim((string) ($body['role'] ?? 'manager')));
$password = (string) ($body['password'] ?? '');
$status = strtolower(trim((string) ($body['status'] ?? 'active')));

if ($loginId === '') {
    respond_json(400, [
        'success' => false,
        'error' => '登录账号不能为空',
        'error_code' => 'USER_LOGINID_INVALID',
    ]);
}
if ($name === '') {
    respond_json(400, [
        'success' => false,
        'error' => '名称不能为空',
        'error_code' => 'USER_NAME_INVALID',
    ]);
}
if ($action === 'create' && trim($password) === '') {
    respond_json(400, [
        'success' => false,
        'error' => '密码不能为空',
        'error_code' => 'USER_PASSWORD_REQUIRED',
    ]);
}

$checkSql = '
  SELECT u.id
  FROM user u
  INNER JOIN user_company_map ucm ON ucm.user_id = u.id
  WHERE ucm.company_id = ? AND u.login_id = ?
  LIMIT 1
';
$checkStmt = $mysqli->prepare($checkSql);
if ($checkStmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '重复检查准备失败',
        'error_code' => 'USER_DUPLICATE_PREPARE_FAILED',
    ]);
}
$checkStmt->bind_param('is', $companyId, $loginId);
$checkStmt->execute();
$exists = $checkStmt->get_result()->fetch_assoc();
$checkStmt->close();

if ($action === 'create') {
    if ($exists !== null) {
        respond_json(400, [
            'success' => false,
            'error' => '该登录账号已存在',
            'error_code' => 'USER_DUPLICATE',
        ]);
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    $insertSql = 'INSERT INTO user (`login_id`, `name`, `email`, `role`, `status`, `password`, `created_at`, `created_by`) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)';
    $insertStmt = $mysqli->prepare($insertSql);
    if ($insertStmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '新增用户准备失败',
            'error_code' => 'USER_CREATE_PREPARE_FAILED',
        ]);
    }
    $insertStmt->bind_param('ssssssi', $loginId, $name, $email, $role, $status, $hashedPassword, $userId);
    $insertStmt->execute();
    $newId = (int) $insertStmt->insert_id;
    $insertStmt->close();

    $linkStmt = $mysqli->prepare('INSERT INTO user_company_map (user_id, company_id) VALUES (?, ?)');
    if ($linkStmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '用户公司关联准备失败',
            'error_code' => 'USER_COMPANY_LINK_PREPARE_FAILED',
        ]);
    }
    $linkStmt->bind_param('ii', $newId, $companyId);
    $linkStmt->execute();
    $linkStmt->close();

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $newId],
    ]);
}

respond_json(400, [
    'success' => false,
    'error' => '未知的操作类型',
    'error_code' => 'UNKNOWN_ACTION',
]);
