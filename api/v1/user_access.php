<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function ua_get_bearer_token(): ?string
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

$claims = api_token_verify(ua_get_bearer_token());
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
        'error_code' => 'UA_COMPANY_INVALID',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

function validatePermissions($permissions) {
    if (!is_array($permissions)) return false;
    $valid = ['home', 'admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'];
    foreach ($permissions as $p) {
        if (!in_array($p, $valid)) return false;
    }
    return true;
}

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'get_all_users';

    if ($action === 'get_all_users') {
        $sql = "
          SELECT u.id, u.login_id, u.name, u.email, COALESCE(u.role, '') AS role, 
                 u.permissions, u.account_permissions, u.process_permissions
          FROM user u
          INNER JOIN user_company_map ucm ON ucm.user_id = u.id
          WHERE ucm.company_id = ?
          ORDER BY u.name ASC
        ";
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param('i', $companyId);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $row['permissions'] = $row['permissions'] ? (json_decode($row['permissions'], true) ?? []) : [];
            $row['account_permissions'] = $row['account_permissions'] ? (json_decode($row['account_permissions'], true) ?? []) : [];
            $row['process_permissions'] = $row['process_permissions'] ? (json_decode($row['process_permissions'], true) ?? []) : [];
            $rows[] = $row;
        }
        $stmt->close();
        respond_json(200, ['success' => true, 'data' => $rows]);
    }
    
    if ($action === 'get_user_permissions') {
        $userId = (int)($_GET['user_id'] ?? 0);
        if ($userId <= 0) {
            respond_json(400, ['success' => false, 'error' => 'Invalid user ID']);
        }
        $sql = "
          SELECT u.id, u.login_id, u.name, u.email, COALESCE(u.role, '') AS role, 
                 u.permissions, u.account_permissions, u.process_permissions
          FROM user u
          INNER JOIN user_company_map ucm ON ucm.user_id = u.id
          WHERE u.id = ? AND ucm.company_id = ?
        ";
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param('ii', $userId, $companyId);
        $stmt->execute();
        $user = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$user) {
            respond_json(404, ['success' => false, 'error' => 'User not found']);
        }
        $user['permissions'] = $user['permissions'] ? (json_decode($user['permissions'], true) ?? []) : [];
        $user['account_permissions'] = $user['account_permissions'] ? (json_decode($user['account_permissions'], true) ?? []) : [];
        $user['process_permissions'] = $user['process_permissions'] ? (json_decode($user['process_permissions'], true) ?? []) : [];
        respond_json(200, ['success' => true, 'data' => $user]);
    }

    respond_json(400, ['success' => false, 'error' => 'Unknown GET action']);
}

if ($method !== 'POST') {
    respond_json(405, ['success' => false, 'error' => 'Method not allowed']);
}

$body = read_json_body();
$action = trim((string) ($body['action'] ?? ''));

if ($action === 'copy_permissions') {
    $affectedUserIds = $body['affected_user_ids'] ?? [];
    $permissions = $body['permissions'] ?? [];
    $accountPermissions = $body['account_permissions'] ?? [];
    $processPermissions = $body['process_permissions'] ?? [];
    
    if (!is_array($affectedUserIds) || empty($affectedUserIds)) {
        respond_json(400, ['success' => false, 'error' => 'No affected users specified']);
    }
    foreach ($affectedUserIds as $uid) {
        if (!is_numeric($uid) || $uid <= 0) {
            respond_json(400, ['success' => false, 'error' => 'Invalid user ID']);
        }
    }
    if (!validatePermissions($permissions)) {
        respond_json(400, ['success' => false, 'error' => 'Invalid permissions']);
    }

    $mysqli->begin_transaction();
    try {
        $permissionsJson = json_encode($permissions);
        $accountPermissionsJson = json_encode($accountPermissions);
        $processPermissionsJson = json_encode($processPermissions);

        $updateSql = "
          UPDATE user u
          INNER JOIN user_company_map ucm ON ucm.user_id = u.id
          SET u.permissions = ?, u.account_permissions = ?, u.process_permissions = ?
          WHERE u.id = ? AND ucm.company_id = ?
        ";
        $updateStmt = $mysqli->prepare($updateSql);
        
        $successCount = 0;
        foreach ($affectedUserIds as $uid) {
            $updateStmt->bind_param('sssii', $permissionsJson, $accountPermissionsJson, $processPermissionsJson, $uid, $companyId);
            $updateStmt->execute();
            if ($updateStmt->affected_rows >= 0) { // >= 0 because it might be the same
                $successCount++;
            }
        }
        $updateStmt->close();
        
        $mysqli->commit();
        respond_json(200, [
            'success' => true, 
            'data' => [
                'success_count' => $successCount,
                'total_count' => count($affectedUserIds)
            ]
        ]);
    } catch (Exception $e) {
        $mysqli->rollback();
        respond_json(500, ['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    }
}

respond_json(400, ['success' => false, 'error' => 'Unknown POST action']);
