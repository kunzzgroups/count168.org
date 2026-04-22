<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function ann_get_bearer_token(): ?string
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

$claims = api_token_verify(ann_get_bearer_token());
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
        'error_code' => 'ANN_COMPANY_INVALID',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

// Check if user has C168 access
$checkC168Sql = "SELECT COUNT(*) as cnt FROM company WHERE id = ? AND UPPER(company_id) = 'C168'";
$checkC168Stmt = $mysqli->prepare($checkC168Sql);
$checkC168Stmt->bind_param('i', $companyId);
$checkC168Stmt->execute();
$isC168 = (int) $checkC168Stmt->get_result()->fetch_assoc()['cnt'] > 0;
$checkC168Stmt->close();

if (!$isC168) {
    respond_json(403, [
        'success' => false,
        'error' => '无权限访问公告模块',
        'error_code' => 'ANN_FORBIDDEN',
    ]);
}

if ($method === 'GET') {
    $search = trim((string) ($_GET['search'] ?? ''));
    
    $where = ["a.company_code = 'C168'"];
    $types = '';
    $params = [];
    
    if ($search !== '') {
        $where[] = '(a.title LIKE ? OR a.content LIKE ?)';
        $types .= 'ss';
        $like = '%' . $search . '%';
        $params[] = $like;
        $params[] = $like;
    }

    $sql = "
      SELECT 
          a.id,
          a.title,
          a.content,
          a.status,
          DATE_FORMAT(a.created_at, '%d/%m/%Y %H:%i:%s') as created_at,
          COALESCE(u.name, o.name) as created_by_name,
          COALESCE(u.login_id, o.owner_code) as created_by_login
      FROM announcements a
      LEFT JOIN user u ON a.created_by = u.id AND a.user_type = 'user'
      LEFT JOIN owner o ON a.created_by = o.id AND a.user_type = 'owner'
      WHERE " . implode(' AND ', $where) . "
      ORDER BY a.created_at DESC
      LIMIT 300
    ";

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '查询准备失败',
            'error_code' => 'ANN_LIST_PREPARE_FAILED',
        ]);
    }
    
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'] ?? '',
            'content' => $row['content'] ?? '',
            'status' => $row['status'] ?? 'active',
            'created_at' => $row['created_at'] ?? '',
            'created_by' => $row['created_by_name'] ?? ($row['created_by_login'] ?? 'Unknown')
        ];
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
// We assume user_type is 'user' for now as per JWT structure, unless modified.
$userType = 'user';

if ($action === 'delete') {
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        respond_json(400, [
            'success' => false,
            'error' => '公告 ID 无效',
            'error_code' => 'ANN_ID_INVALID',
        ]);
    }

    $sql = 'DELETE FROM announcements WHERE id = ? AND company_code = "C168"';
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        respond_json(404, [
            'success' => false,
            'error' => '记录不存在或无权限',
            'error_code' => 'ANN_NOT_FOUND',
        ]);
    }

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

$title = trim((string) ($body['title'] ?? ''));
$content = trim((string) ($body['content'] ?? ''));

if ($title === '') {
    respond_json(400, [
        'success' => false,
        'error' => '标题不能为空',
        'error_code' => 'ANN_TITLE_INVALID',
    ]);
}
if (mb_strlen($title) > 500) {
    respond_json(400, [
        'success' => false,
        'error' => '标题不能超过 500 个字符',
        'error_code' => 'ANN_TITLE_TOO_LONG',
    ]);
}
if ($content === '') {
    respond_json(400, [
        'success' => false,
        'error' => '内容不能为空',
        'error_code' => 'ANN_CONTENT_INVALID',
    ]);
}

if ($action === 'create') {
    $insertSql = "INSERT INTO announcements (title, content, company_code, created_by, user_type, status, created_at) VALUES (?, ?, 'C168', ?, ?, 'active', NOW())";
    $insertStmt = $mysqli->prepare($insertSql);
    if ($insertStmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '新增公告准备失败',
            'error_code' => 'ANN_CREATE_PREPARE_FAILED',
        ]);
    }
    $insertStmt->bind_param('ssis', $title, $content, $userId, $userType);
    $insertStmt->execute();
    $newId = (int) $insertStmt->insert_id;
    $insertStmt->close();

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $newId],
    ]);
}

if ($action === 'update') {
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        respond_json(400, [
            'success' => false,
            'error' => '公告 ID 无效',
            'error_code' => 'ANN_ID_INVALID',
        ]);
    }
    
    $status = trim((string) ($body['status'] ?? 'active'));
    
    $updateSql = "UPDATE announcements SET title = ?, content = ?, status = ?, updated_at = NOW() WHERE id = ? AND company_code = 'C168'";
    $updateStmt = $mysqli->prepare($updateSql);
    $updateStmt->bind_param('sssi', $title, $content, $status, $id);
    $updateStmt->execute();
    $affected = $updateStmt->affected_rows;
    $updateStmt->close();
    
    if ($affected <= 0) {
        // Might not be affected if values are the same, but let's just return success anyway
    }
    
    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

respond_json(400, [
    'success' => false,
    'error' => '未知的操作类型',
    'error_code' => 'UNKNOWN_ACTION',
]);
