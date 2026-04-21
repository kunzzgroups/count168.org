<?php
/**
 * 用户列表 CRUD API（创建/更新/删除/获取用户）
 * 路径: api/users/userlist_api.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../../config.php';

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行

// 检查用户是否登录
if (!isset($_SESSION['user_id']) || !isset($_SESSION['company_id'])) {
    sendResponse(false, 'Unauthorized access', null);
}

$current_company_id = $_SESSION['company_id'];
$current_user_role = $_SESSION['role'] ?? '';

// 获取当前登录用户（你需要根据你的登录系统调整这个逻辑）
function getCurrentUser() {
    // 这里你需要根据你的登录系统来获取当前用户
    // 示例：如果你在 session 中存储了 login_id
    return $_SESSION['login_id'] ?? 'admin001'; // 默认为 admin001
}

// 检查是否是owner影子记录
function isOwnerShadow($pdo, $id, $company_id) {
    // 先检查user表中是否存在且通过 user_company_map 关联到该 company
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        WHERE u.id = ? AND ucm.company_id = ?
    ");
    $stmt->execute([$id, $company_id]);
    if ($stmt->fetchColumn() > 0) {
        return false; // 是普通用户
    }
    
    // 检查owner表中是否存在且属于该company
    $stmt = $pdo->prepare("
        SELECT COUNT(*) 
        FROM owner o
        INNER JOIN company c ON c.owner_id = o.id
        WHERE o.id = ? AND c.id = ?
    ");
    $stmt->execute([$id, $company_id]);
    return $stmt->fetchColumn() > 0; // 是owner影子
}

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

// Response function
function sendResponse($success, $message = '', $data = null) {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

// Validate required fields for create/update
function validateUserData($data, $isUpdate = false) {
    $required = ['login_id', 'name', 'email', 'role', 'status'];
    if (!$isUpdate) {
        $required[] = 'password';
    }
    
    foreach ($required as $field) {
        if (!isset($data[$field]) || trim($data[$field]) === '') {
            return "Field '$field' is required";
        }
    }
    
    // Validate email format
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        return "Invalid email format";
    }
    
    // Validate role
    $validRoles = ['partnership', 'admin', 'manager', 'supervisor', 'accountant', 'audit', 'customer service', 'company'];
    if (!in_array($data['role'], $validRoles)) {
        return "Invalid role";
    }

    // Validate status (添加这个)
    $validStatuses = ['active', 'inactive'];
    if (!in_array($data['status'], $validStatuses)) {
        return "Invalid status";
    }
    
    return true;
}

// Check if login_id already exists
function checkLoginIdExists($pdo, $login_id, $company_id, $excludeId = null) {
    // 使用 user_company_map 来检查 login_id 是否存在
    $sql = "SELECT COUNT(*) 
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE u.login_id = ? AND ucm.company_id = ?";
    $params = [$login_id, $company_id];
    
    if ($excludeId) {
        $sql .= " AND u.id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn() > 0;
}

// Check if email already exists
function checkEmailExists($pdo, $email, $company_id, $excludeId = null) {
    // 使用 user_company_map 来检查 email 是否存在
    $sql = "SELECT COUNT(*) 
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE u.email = ? AND ucm.company_id = ?";
    $params = [$email, $company_id];
    
    if ($excludeId) {
        $sql .= " AND u.id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn() > 0;
}

try {
    if (!$input || !isset($input['action'])) {
        sendResponse(false, 'Invalid request');
    }
    
    $action = $input['action'];
    
    switch ($action) {
        case 'create':
            // Validate input
            $required = ['login_id', 'name', 'password', 'email', 'role', 'status'];
            foreach ($required as $field) {
                if (!isset($input[$field]) || trim($input[$field]) === '') {
                    sendResponse(false, "Field '$field' is required");
                }
            }
            
            // Validate email format
            if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                sendResponse(false, "Invalid email format");
            }
            
            // Validate role
            $validRoles = ['partnership', 'admin', 'manager', 'supervisor', 'accountant', 'audit', 'customer service', 'company'];
            if (!in_array($input['role'], $validRoles)) {
                sendResponse(false, "Invalid role");
            }
            
            // Validate status
            $validStatuses = ['active', 'inactive'];
            if (!in_array($input['status'], $validStatuses)) {
                sendResponse(false, "Invalid status");
            }
            
            // 验证 company_ids
            global $current_company_id;
            $company_ids = isset($input['company_ids']) && is_array($input['company_ids']) ? $input['company_ids'] : [];
            if (empty($company_ids)) {
                // 如果没有提供 company_ids，使用当前 session 的 company_id
                $company_ids = [$current_company_id];
            }
            
            // 验证所有 company_ids 是否存在
            if (count($company_ids) > 0) {
                $placeholders = str_repeat('?,', count($company_ids) - 1) . '?';
                $stmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                $stmt->execute($company_ids);
                $validCompanies = $stmt->fetchAll(PDO::FETCH_COLUMN);
                
                if (count($validCompanies) !== count($company_ids)) {
                    sendResponse(false, 'One or more selected companies are invalid');
                }
            }
            
            // 使用第一个 company_id 作为主 company_id（用于兼容性）
            $primary_company_id = $company_ids[0];
            
            // Check if login_id already exists in any of the selected companies (通过 user_company_map)
            if (count($company_ids) > 0) {
                $placeholders = str_repeat('?,', count($company_ids) - 1) . '?';
                $stmt = $pdo->prepare("
                    SELECT COUNT(*) 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE u.login_id = ? AND ucm.company_id IN ($placeholders)
                ");
                $checkParams = array_merge([$input['login_id']], $company_ids);
                $stmt->execute($checkParams);
                if ($stmt->fetchColumn() > 0) {
                    sendResponse(false, 'Login ID already exists in one of the selected companies');
                }
                
                // Check if email already exists in any of the selected companies (通过 user_company_map)
                $stmt = $pdo->prepare("
                    SELECT COUNT(*) 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE u.email = ? AND ucm.company_id IN ($placeholders)
                ");
                $checkParams = array_merge([$input['email']], $company_ids);
                $stmt->execute($checkParams);
                if ($stmt->fetchColumn() > 0) {
                    sendResponse(false, 'Email already exists in one of the selected companies');
                }
            }
            
            // Hash password
            $hashedPassword = password_hash($input['password'], PASSWORD_DEFAULT);
            if ($hashedPassword === false) {
                sendResponse(false, 'Failed to hash password');
            }
            
            // Hash secondary_password if provided (for c168 company users)
            $hashedSecondaryPassword = null;
            if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                // 验证二级密码：必须是6位数字
                if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                    sendResponse(false, 'Secondary password must be exactly 6 digits');
                }
                $hashedSecondaryPassword = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
                if ($hashedSecondaryPassword === false) {
                    sendResponse(false, 'Failed to hash secondary password');
                }
            }
            
            // 处理权限数据
            $permissions = isset($input['permissions']) ? json_encode($input['permissions']) : null;

            // 开始事务
            $pdo->beginTransaction();
            
            try {
                // Insert new user (不再使用 company_id，因为已移除)
                $readOnly = isset($input['read_only']) ? (int)$input['read_only'] : 1;
                $sql = "INSERT INTO user (login_id, name, password, secondary_password, email, role, permissions, read_only, status, created_by, created_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";
                
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute([
                    $input['login_id'],
                    $input['name'],
                    $hashedPassword,
                    $hashedSecondaryPassword,
                    $input['email'],
                    $input['role'],
                    $permissions,
                    $readOnly,
                    $input['status'],
                    getCurrentUser()
                ]);
                
                if (!$result) {
                    $errorInfo = $stmt->errorInfo();
                    error_log("Failed to create user - SQL Error: " . print_r($errorInfo, true));
                    throw new Exception('Failed to create user: ' . ($errorInfo[2] ?? 'Unknown database error'));
                }
                
                $newUserId = $pdo->lastInsertId();
                
                if (!$newUserId || $newUserId <= 0) {
                    error_log("Failed to get new user ID after insert");
                    throw new Exception('Failed to get new user ID');
                }
                
                // 在 user_company_map 中创建所有关联
                $mapStmt = $pdo->prepare("INSERT INTO user_company_map (user_id, company_id) VALUES (?, ?)");
                foreach ($company_ids as $company_id) {
                    $mapResult = $mapStmt->execute([$newUserId, $company_id]);
                    if (!$mapResult) {
                        $mapErrorInfo = $mapStmt->errorInfo();
                        error_log("Failed to create user_company_map - SQL Error: " . print_r($mapErrorInfo, true));
                        throw new Exception('Failed to create company association: ' . ($mapErrorInfo[2] ?? 'Unknown database error'));
                    }
                }
                
                // 为新用户在所有关联的公司下初始化权限
                // 如果提供了 account_permissions 或 process_permissions，则在当前公司下设置它们
                // 其他公司则使用默认值（null，表示未设置，默认全部可见）
                if (isset($input['account_permissions']) || isset($input['process_permissions'])) {
                    $accountPerms = null;
                    $processPerms = null;
                    
                    if (isset($input['account_permissions'])) {
                        if (is_array($input['account_permissions']) && count($input['account_permissions']) > 0) {
                            $accountPerms = json_encode($input['account_permissions']);
                        } else {
                            $accountPerms = json_encode([]);
                        }
                    }
                    
                    if (isset($input['process_permissions'])) {
                        if (is_array($input['process_permissions']) && count($input['process_permissions']) > 0) {
                            $processPerms = json_encode($input['process_permissions']);
                        } else {
                            $processPerms = json_encode([]);
                        }
                    }
                    
                    // 只在当前公司下设置权限
                    $permStmt = $pdo->prepare("INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions) VALUES (?, ?, ?, ?)");
                    $permStmt->execute([$newUserId, $current_company_id, $accountPerms, $processPerms]);
                }
                
                // 提交事务
                $pdo->commit();
                
                // 获取新创建的用户信息，包括当前公司的权限
                $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, status, last_login, created_by FROM user WHERE id = ?");
                $stmt->execute([$newUserId]);
                $newUser = $stmt->fetch(PDO::FETCH_ASSOC);
                
                // 获取当前公司的权限（如果存在）
                $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                $stmt->execute([$newUserId, $current_company_id]);
                $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($companyPermissions) {
                    $newUser['account_permissions'] = $companyPermissions['account_permissions'];
                    $newUser['process_permissions'] = $companyPermissions['process_permissions'];
                } else {
                    $newUser['account_permissions'] = null;
                    $newUser['process_permissions'] = null;
                }
                
                sendResponse(true, 'User created successfully', $newUser);
            } catch (PDOException $e) {
                $pdo->rollBack();
                error_log("Create user PDO error: " . $e->getMessage());
                error_log("SQL State: " . $e->getCode());
                error_log("Error Info: " . print_r($e->errorInfo, true));
                sendResponse(false, 'Database error: ' . $e->getMessage());
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Create user error: " . $e->getMessage());
                sendResponse(false, 'Failed to create user: ' . $e->getMessage());
            }
            break;
            
        case 'update':
            if (!isset($input['id'])) {
                sendResponse(false, 'User ID is required');
            }
            
            global $current_company_id, $current_user_role;
            
            // 检查是否是owner影子
            if (isOwnerShadow($pdo, $input['id'], $current_company_id)) {
                // 只有owner本人可以更新owner记录
                if ($current_user_role !== 'owner') {
                    sendResponse(false, '只有owner本人可以编辑owner记录');
                }
                
                // 更新owner表
                $updateFields = [];
                $updateValues = [];
                
                if (isset($input['name'])) {
                    $updateFields[] = "name = ?";
                    $updateValues[] = $input['name'];
                }
                
                if (isset($input['email'])) {
                    // Validate email format
                    if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                        sendResponse(false, "Invalid email format");
                    }
                    $updateFields[] = "email = ?";
                    $updateValues[] = $input['email'];
                }
                
                if (isset($input['status'])) {
                    $validStatuses = ['active', 'inactive'];
                    if (!in_array($input['status'], $validStatuses)) {
                        sendResponse(false, "Invalid status");
                    }
                    $updateFields[] = "status = ?";
                    $updateValues[] = $input['status'];
                }
                
                // Only update password if provided
                if (isset($input['password']) && trim($input['password']) !== '') {
                    $updateFields[] = "password = ?";
                    $updateValues[] = password_hash($input['password'], PASSWORD_DEFAULT);
                }
                
                // Only update secondary_password if provided (for c168 company)
                if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                    // 验证二级密码：必须是6位数字
                    if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                        sendResponse(false, 'Secondary password must be exactly 6 digits');
                    }
                    $updateFields[] = "secondary_password = ?";
                    $updateValues[] = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
                }
                
                if (empty($updateFields)) {
                    sendResponse(false, 'No fields to update');
                }
                
                $updateValues[] = $input['id'];
                $sql = "UPDATE owner SET " . implode(', ', $updateFields) . " WHERE id = ?";
                
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute($updateValues);
                
                if ($result) {
                    // 获取更新后的owner信息
                    $stmt = $pdo->prepare("
                        SELECT o.id, o.owner_code as login_id, o.name, o.email, 'owner' as role, o.status, NULL as last_login, NULL as created_by
                        FROM owner o
                        INNER JOIN company c ON c.owner_id = o.id
                        WHERE o.id = ? AND c.id = ?
                    ");
                    $stmt->execute([$input['id'], $current_company_id]);
                    $updatedOwner = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    sendResponse(true, 'Owner updated successfully', $updatedOwner);
                } else {
                    sendResponse(false, 'Failed to update owner');
                }
                break;
            }
            
            // 获取原有的 login_id 并验证用户是否存在
            // 注意：用户可能属于多个公司，所以不限制在当前公司
            $stmt = $pdo->prepare("
                SELECT u.login_id 
                FROM user u
                WHERE u.id = ?
            ");
            $stmt->execute([$input['id']]);
            $originalUser = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$originalUser) {
                sendResponse(false, 'User not found');
            }
            
            // 验证用户是否至少属于当前公司（用于权限检查）
            // 如果用户要编辑其他公司的用户，需要确保有权限
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user_company_map 
                WHERE user_id = ? AND company_id = ?
            ");
            $stmt->execute([$input['id'], $current_company_id]);
            $belongsToCurrentCompany = $stmt->fetchColumn() > 0;
            
            // 如果没有提交 login_id，使用原有的
            if (!isset($input['login_id'])) {
                $input['login_id'] = $originalUser['login_id'];
            }
            
            // Validate input
            $validation = validateUserData($input, true);
            if ($validation !== true) {
                sendResponse(false, $validation);
            }
            
            // Check if login_id already exists in current company (excluding current user)
            // 注意：只检查当前公司内是否有重复的 login_id，允许不同公司有相同的 login_id
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.login_id = ? AND u.id != ? AND ucm.company_id = ?
            ");
            $stmt->execute([$input['login_id'], $input['id'], $current_company_id]);
            if ($stmt->fetchColumn() > 0) {
                sendResponse(false, 'Login ID already exists in current company');
            }
            
            // Check if email already exists in current company (excluding current user)
            // 注意：只检查当前公司内是否有重复的 email，允许不同公司有相同的 email
            $stmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.email = ? AND u.id != ? AND ucm.company_id = ?
            ");
            $stmt->execute([$input['email'], $input['id'], $current_company_id]);
            if ($stmt->fetchColumn() > 0) {
                sendResponse(false, 'Email already exists in current company');
            }
            
            // Prepare update query
            $updateFields = [];
            $updateValues = [];
            
            $updateFields[] = "login_id = ?";
            $updateValues[] = $input['login_id'];
            
            $updateFields[] = "name = ?";
            $updateValues[] = $input['name'];
            
            $updateFields[] = "email = ?";
            $updateValues[] = $input['email'];
            
            $updateFields[] = "role = ?";
            $updateValues[] = $input['role'];

            $updateFields[] = "status = ?";
            $updateValues[] = $input['status'];

            // 保存 read_only 字段（只有 partnership 角色才有意义，但所有用户都存储）
            if (isset($input['read_only'])) {
                $updateFields[] = "read_only = ?";
                $updateValues[] = (int)$input['read_only'];
            }

            // 添加权限字段到更新列表（系统级权限仍然存储在 user 表）
            $updateFields[] = "permissions = ?";
            $updateValues[] = isset($input['permissions']) ? json_encode($input['permissions']) : null;
            
            // Account 和 Process 权限不再更新到 user 表，而是更新到 user_company_permissions 表
            // 这些字段保留在 $input 中，稍后在事务中处理
            
            // Only update password if provided
            if (isset($input['password']) && trim($input['password']) !== '') {
                $updateFields[] = "password = ?";
                $updateValues[] = password_hash($input['password'], PASSWORD_DEFAULT);
            }
            
            // Only update secondary_password if provided (for c168 company users)
            if (isset($input['secondary_password']) && trim($input['secondary_password']) !== '') {
                // 验证二级密码：必须是6位数字
                if (!preg_match('/^\d{6}$/', $input['secondary_password'])) {
                    sendResponse(false, 'Secondary password must be exactly 6 digits');
                }
                $updateFields[] = "secondary_password = ?";
                $updateValues[] = password_hash($input['secondary_password'], PASSWORD_DEFAULT);
            }
            
            // 添加 WHERE 条件的参数
            $updateValues[] = $input['id'];
            
            // 开始事务
            $pdo->beginTransaction();
            
            try {
                // 更新用户基本信息
                $sql = "UPDATE user SET " . implode(', ', $updateFields) . " WHERE id = ?";
                $stmt = $pdo->prepare($sql);
                $result = $stmt->execute($updateValues);
                
                if (!$result) {
                    throw new Exception('Failed to update user');
                }
                
                // 同步 read_only 到 company_ownership
                if (isset($input['read_only']) && strtolower($input['role']) === 'partnership') {
                    $updCoStmt = $pdo->prepare("UPDATE company_ownership SET read_only = ? WHERE company_id = ? AND account_id = ? AND owner_type = 'user'");
                    $updCoStmt->execute([(int)$input['read_only'], $current_company_id, $input['id']]);
                }
                
                // 如果提供了 company_ids，更新 company 关联
                if (isset($input['company_ids']) && is_array($input['company_ids']) && count($input['company_ids']) > 0) {
                    // 验证所有 company_ids 是否存在
                    $placeholders = str_repeat('?,', count($input['company_ids']) - 1) . '?';
                    $stmt = $pdo->prepare("SELECT id FROM company WHERE id IN ($placeholders)");
                    $stmt->execute($input['company_ids']);
                    $validCompanies = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    
                    if (count($validCompanies) !== count($input['company_ids'])) {
                        throw new Exception('One or more selected companies are invalid');
                    }
                    
                    // 检查移除后用户是否还属于当前公司（用于提示）
                    // 允许移除当前公司的关联，但会在响应中标记
                    $will_lose_access = false;
                    if ($belongsToCurrentCompany && !in_array($current_company_id, $input['company_ids'])) {
                        $will_lose_access = true;
                    }
                    
                    // 删除旧的 company 关联
                    $stmt = $pdo->prepare("DELETE FROM user_company_map WHERE user_id = ?");
                    $stmt->execute([$input['id']]);
                    
                    // 创建新的 company 关联
                    $mapStmt = $pdo->prepare("INSERT INTO user_company_map (user_id, company_id) VALUES (?, ?)");
                    foreach ($input['company_ids'] as $company_id) {
                        $mapStmt->execute([$input['id'], $company_id]);
                    }
                } else {
                    // 如果没有提供 company_ids，保持原有的关联不变
                    // 但需要确保用户至少属于当前公司（如果原本属于的话）
                }
                
                // 保存 Account 和 Process 权限到 user_company_permissions 表（按当前公司）
                // 只有当提供了 account_permissions 或 process_permissions 时才更新
                if (isset($input['account_permissions']) || isset($input['process_permissions'])) {
                    // 准备权限值
                    $accountPerms = null;
                    $processPerms = null;
                    
                    if (isset($input['account_permissions'])) {
                        if (is_array($input['account_permissions']) && count($input['account_permissions']) > 0) {
                            $accountPerms = json_encode($input['account_permissions']);
                        } else {
                            // 空数组 [] 表示已设置但为空（不选任何账户）
                            $accountPerms = json_encode([]);
                        }
                    }
                    
                    if (isset($input['process_permissions'])) {
                        if (is_array($input['process_permissions']) && count($input['process_permissions']) > 0) {
                            $processPerms = json_encode($input['process_permissions']);
                        } else {
                            // 空数组 [] 表示已设置但为空（不选任何流程）
                            $processPerms = json_encode([]);
                        }
                    }
                    
                    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 来更新或插入
                    $stmt = $pdo->prepare("
                        INSERT INTO user_company_permissions (user_id, company_id, account_permissions, process_permissions) 
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            account_permissions = IF(? IS NOT NULL, VALUES(account_permissions), account_permissions),
                            process_permissions = IF(? IS NOT NULL, VALUES(process_permissions), process_permissions),
                            updated_at = CURRENT_TIMESTAMP
                    ");
                    $stmt->execute([
                        $input['id'], 
                        $current_company_id, 
                        $accountPerms, 
                        $processPerms,
                        $accountPerms, // 用于条件判断
                        $processPerms  // 用于条件判断
                    ]);
                }
                
                // 提交事务
                $pdo->commit();
                
                // 获取更新后的用户信息，包括当前公司的权限
                $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, status, last_login, created_by FROM user WHERE id = ?");
                $stmt->execute([$input['id']]);
                $updatedUser = $stmt->fetch(PDO::FETCH_ASSOC);
                
                // 获取当前公司的权限（从 user_company_permissions 表）
                $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                $stmt->execute([$input['id'], $current_company_id]);
                $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($companyPermissions) {
                    $updatedUser['account_permissions'] = $companyPermissions['account_permissions'];
                    $updatedUser['process_permissions'] = $companyPermissions['process_permissions'];
                } else {
                    // 如果公司特定的权限不存在，使用 user 表中的全局权限作为后备
                    $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user WHERE id = ?");
                    $stmt->execute([$input['id']]);
                    $userPerms = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($userPerms) {
                        $updatedUser['account_permissions'] = $userPerms['account_permissions'];
                        $updatedUser['process_permissions'] = $userPerms['process_permissions'];
                    } else {
                        $updatedUser['account_permissions'] = null;
                        $updatedUser['process_permissions'] = null;
                    }
                }
                
                $message = 'User updated successfully';
                if ($will_lose_access) {
                    $message .= '。注意：移除后用户将不再属于当前公司，如需继续操作请切换到用户所属的其他公司';
                }
                
                // 在响应中添加 will_lose_access 标志
                $responseData = $updatedUser;
                if (isset($responseData)) {
                    $responseData = array_merge((array)$responseData, ['will_lose_access' => $will_lose_access]);
                } else {
                    $responseData = ['will_lose_access' => $will_lose_access];
                }
                
                sendResponse(true, $message, $responseData);
            } catch (PDOException $e) {
                $pdo->rollBack();
                error_log("Update user PDO error: " . $e->getMessage());
                error_log("SQL State: " . $e->getCode());
                error_log("Error Info: " . print_r($e->errorInfo, true));
                sendResponse(false, 'Database error: ' . $e->getMessage());
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Update user error: " . $e->getMessage());
                sendResponse(false, 'Failed to update user: ' . $e->getMessage());
            }
            break;
            
        case 'delete':
            if (!isset($input['id'])) {
                sendResponse(false, 'User ID is required');
            }
            
            // 确保ID是整数类型
            $userId = intval($input['id']);
            if ($userId <= 0) {
                sendResponse(false, 'Invalid user ID');
            }
            
            global $current_company_id, $current_user_role;
            
            // 检查用户是否试图删除自己
            $currentUserId = $_SESSION['user_id'] ?? null;
            if ($currentUserId && intval($currentUserId) === $userId) {
                sendResponse(false, 'You cannot delete your own account');
            }
            
            // 检查是否是owner影子
            if (isOwnerShadow($pdo, $userId, $current_company_id)) {
                // 只有owner本人可以删除owner记录
                if ($current_user_role !== 'owner') {
                    sendResponse(false, '只有owner本人可以删除owner记录');
                }
                
                // owner记录不允许删除（因为company表有外键约束）
                sendResponse(false, 'Owner记录不能删除，因为它是公司的所有者');
            }
            
            // Check if user exists and belongs to same company
            $checkStmt = $pdo->prepare("
                SELECT u.id, u.login_id, u.name, u.role
                FROM user u
                INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                WHERE u.id = ? AND ucm.company_id = ?
            ");
            $checkStmt->execute([$userId, $current_company_id]);
            $user = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$user) {
                sendResponse(false, 'User not found or access denied');
            }
            
            // 检查是否试图删除同等级或更高层级的用户
            $role_hierarchy = [
                'owner' => 0,
                'partnership' => 1,
                'admin' => 2,
                'manager' => 3,
                'supervisor' => 4,
                'accountant' => 5,
                'audit' => 6,
                'customer service' => 7,

            ];
            $current_user_level = $role_hierarchy[strtolower($current_user_role)] ?? 999;
            $target_user_level = $role_hierarchy[strtolower($user['role'] ?? '')] ?? 999;
            
            if ($current_user_level === $target_user_level) {
                sendResponse(false, 'You cannot delete accounts with the same role level');
            }
            
            // 检查是否试图删除比自己层级更高的用户（数字越小，层级越高）
            if ($target_user_level < $current_user_level) {
                sendResponse(false, 'You cannot delete accounts with higher role level');
            }
            
            // 获取当前登录用户ID（用于替换NOT NULL字段）
            $currentUserId = $_SESSION['user_id'] ?? null;
            
            // 获取替换用户ID（用于NOT NULL字段和优先使用替换用户的字段）
            $replacementUserId = null;
            
                // 优先级1: 使用当前登录用户（如果不是要删除的用户）
                if (isset($_SESSION['user_id']) && $_SESSION['user_id'] != $userId) {
                    $currentUserId = $_SESSION['user_id'];
                    // 验证当前用户是否存在且属于同一公司
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE u.id = ? AND ucm.company_id = ?
                        LIMIT 1
                    ");
                    $stmt->execute([$currentUserId, $current_company_id]);
                    $replacementUserId = $stmt->fetchColumn();
                }
                
                // 优先级2: 如果当前用户不可用，找同公司的活动用户
                if (!$replacementUserId) {
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE ucm.company_id = ? AND u.id != ? AND u.status = 'active'
                        LIMIT 1
                    ");
                    $stmt->execute([$current_company_id, $userId]);
                    $replacementUserId = $stmt->fetchColumn();
                }
                
                // 优先级3: 如果还是没有活动用户，找任何同公司的用户
                if (!$replacementUserId) {
                    $stmt = $pdo->prepare("
                        SELECT u.id 
                        FROM user u
                        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                        WHERE ucm.company_id = ? AND u.id != ?
                        LIMIT 1
                    ");
                    $stmt->execute([$current_company_id, $userId]);
                    $replacementUserId = $stmt->fetchColumn();
                }
            
            // 定义所有需要处理的表和字段配置
            // 格式: [表名 => [字段名 => ['nullable' => true/false, 'description' => '描述']]]
            $userReferences = [
                'transactions' => [
                    'created_by' => ['nullable' => false, 'description' => '交易记录的创建者']
                ],
                'submitted_processes' => [
                    'user_id' => ['nullable' => false, 'description' => '提交处理记录的用户']
                ],
                'data_captures' => [
                    'created_by' => ['nullable' => true, 'description' => '数据捕获记录的创建者']
                ],
                'process' => [
                    'created_by' => ['nullable' => true, 'description' => '流程记录的创建者'],
                    'modified_by' => ['nullable' => true, 'description' => '流程记录的修改者']
                ],
                'company' => [
                    'created_by' => ['nullable' => true, 'description' => '公司记录的创建者']
                ]
            ];
            
            // 检查NOT NULL字段的引用，如果没有替换用户则阻止删除
            if (!$replacementUserId) {
                $constraints = [];
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        if (!$config['nullable']) {
                            try {
                                $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                $checkStmt->execute([$userId]);
                                if ($checkStmt->fetchColumn() > 0) {
                                    $constraints[] = "{$table}.{$field} ({$config['description']})";
                                }
                            } catch (PDOException $e) {
                                // 如果表不存在，跳过
                                error_log("Table {$table} may not exist: " . $e->getMessage());
                            }
                        }
                    }
                }
                
                if (!empty($constraints)) {
                    sendResponse(false, 'Cannot delete user. No replacement user available. The user is referenced by: ' . implode(', ', $constraints) . '. Please ensure there is at least one other user in the company.');
                }
            }
            
            // 开始事务
            $pdo->beginTransaction();
            
            try {
                $updatedCounts = [];
                
                // 统一处理所有表和字段的引用转移
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        try {
                            $count = 0;
                            
                            if (!$config['nullable']) {
                                // NOT NULL字段：必须有替换用户才能更新
                                if ($replacementUserId) {
                                    $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = ? WHERE `{$field}` = ?");
                                    $stmt->execute([$replacementUserId, $userId]);
                                    $count = $stmt->rowCount();
                                } else {
                                    // 如果没有替换用户且是NOT NULL字段，记录错误
                                    error_log("Cannot update {$table}.{$field}: No replacement user available for NOT NULL field");
                                }
                            } else {
                                // NULL字段：优先使用替换用户，如果没有则设置为NULL
                                if ($replacementUserId) {
                                    // 如果有替换用户，优先使用替换用户
                                    $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = ? WHERE `{$field}` = ?");
                                    $stmt->execute([$replacementUserId, $userId]);
                                    $count = $stmt->rowCount();
                                    
                                    if ($count == 0) {
                                        // 如果没有更新任何行，检查是否真的有引用
                                        $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                        $checkStmt->execute([$userId]);
                                        $hasRefs = $checkStmt->fetchColumn();
                                        if ($hasRefs > 0) {
                                            error_log("Warning: UPDATE {$table}.{$field} returned 0 rows but there are {$hasRefs} references. Replacement user ID: {$replacementUserId}");
                                        }
                                    }
                                } else {
                                    // 如果没有替换用户，尝试设置为NULL
                                    try {
                                        $stmt = $pdo->prepare("UPDATE `{$table}` SET `{$field}` = NULL WHERE `{$field}` = ?");
                                        $stmt->execute([$userId]);
                                        $count = $stmt->rowCount();
                                        
                                        if ($count == 0) {
                                            // 检查是否真的有引用
                                            $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                            $checkStmt->execute([$userId]);
                                            $hasRefs = $checkStmt->fetchColumn();
                                            if ($hasRefs > 0) {
                                                error_log("Warning: UPDATE {$table}.{$field} to NULL returned 0 rows but there are {$hasRefs} references.");
                                            }
                                        }
                                    } catch (PDOException $e) {
                                        // 如果字段不允许NULL或更新失败，记录错误并抛出异常
                                        $errorMsg = "Cannot set {$table}.{$field} to NULL: " . $e->getMessage();
                                        error_log($errorMsg);
                                        throw new Exception($errorMsg . " Please ensure there is a replacement user available.");
                                    }
                                }
                            }
                            
                            // 记录更新数量
                            if ($count > 0) {
                                $updatedCounts[] = "{$table}.{$field} ({$count} records)";
                            }
                        } catch (PDOException $e) {
                            // 如果表不存在或字段不存在，记录错误并抛出异常
                            $errorMsg = "Error updating {$table}.{$field}: " . $e->getMessage();
                            error_log($errorMsg);
                            // 对于NOT NULL字段，必须抛出异常阻止删除
                            if (!$config['nullable']) {
                                throw new Exception($errorMsg . " - Cannot update NOT NULL field without replacement user.");
                            }
                            // 对于NULL字段，如果设置为NULL失败，说明字段可能不允许NULL，抛出异常
                            if ($config['nullable'] && !$replacementUserId) {
                                throw new Exception($errorMsg . " - Cannot set nullable field to NULL. Please ensure there is a replacement user.");
                            }
                        }
                    }
                }
                
                // 验证所有引用是否已被清除（在删除前再次检查）
                $remainingRefs = [];
                foreach ($userReferences as $table => $fields) {
                    foreach ($fields as $field => $config) {
                        try {
                            $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                            $checkStmt->execute([$userId]);
                            $remainingCount = $checkStmt->fetchColumn();
                            if ($remainingCount > 0) {
                                $remainingRefs[] = "{$table}.{$field} ({$remainingCount} records)";
                            }
                        } catch (PDOException $e) {
                            // 表不存在，跳过
                            error_log("Cannot check {$table}.{$field}: " . $e->getMessage());
                        }
                    }
                }
                
                // 如果还有引用，阻止删除并报错
                if (!empty($remainingRefs)) {
                    throw new Exception('Cannot delete user. The user is still referenced by: ' . implode(', ', $remainingRefs) . '. Please ensure there is a replacement user available.');
                }
                
                // 6. 删除用户（先删除 user_company_map 中的关联，然后删除用户）
                // 删除 user_company_map 中的关联
                $stmt = $pdo->prepare("DELETE FROM user_company_map WHERE user_id = ? AND company_id = ?");
                $stmt->execute([$userId, $current_company_id]);
                
                // 检查是否还有其他 company 关联
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_company_map WHERE user_id = ?");
                $stmt->execute([$userId]);
                $remainingCompanies = $stmt->fetchColumn();
                
                // 如果还有其他关联，只删除当前公司的关联；否则删除整个用户
                if ($remainingCompanies > 0) {
                    // 只删除当前公司的关联，保留用户
                    $result = true;
                } else {
                    // 删除整个用户
                    $stmt = $pdo->prepare("DELETE FROM user WHERE id = ?");
                    $result = $stmt->execute([$userId]);
                }
                
                if (!$result || $stmt->rowCount() == 0) {
                    throw new Exception('Failed to delete user. No rows were affected. This may be due to foreign key constraints.');
                }
                
                // 提交事务
                $pdo->commit();
                
                // 构建成功消息
                $message = 'User deleted successfully';
                if (!empty($updatedCounts)) {
                    $message .= '. Updated references: ' . implode(', ', $updatedCounts);
                }
                
                sendResponse(true, $message);
                
            } catch (Exception $e) {
                // 回滚事务
                $pdo->rollBack();
                error_log("Delete user error: " . $e->getMessage());
                
                // 检查是否是外键约束错误
                if (strpos($e->getMessage(), 'foreign key') !== false || 
                    strpos($e->getMessage(), '1451') !== false ||
                    strpos($e->getMessage(), 'Cannot delete') !== false ||
                    strpos($e->getMessage(), 'a foreign key constraint fails') !== false) {
                    
                    // 详细检查是哪些表还有引用
                    $remainingRefs = [];
                    foreach ($userReferences as $table => $fields) {
                        foreach ($fields as $field => $config) {
                            try {
                                $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$field}` = ?");
                                $checkStmt->execute([$userId]);
                                $count = $checkStmt->fetchColumn();
                                if ($count > 0) {
                                    $remainingRefs[] = "{$table}.{$field} ({$count} records)";
                                }
                            } catch (PDOException $ex) {
                                // 表不存在，跳过
                            }
                        }
                    }
                    
                    $errorMsg = 'Cannot delete user due to foreign key constraint. ';
                    if (!empty($remainingRefs)) {
                        $errorMsg .= 'The user is still referenced by: ' . implode(', ', $remainingRefs) . '. ';
                        $errorMsg .= 'Please ensure there is a replacement user available.';
                    } else {
                        $errorMsg .= 'The user is referenced by other records that could not be transferred.';
                    }
                    
                    sendResponse(false, $errorMsg);
                } else {
                    sendResponse(false, 'Database error: ' . $e->getMessage());
                }
            }
            break;
            
        case 'get':
            global $current_company_id;
            if (isset($input['id'])) {
                // Get specific user - 只从 user 表获取基本字段，权限从 user_company_permissions 表获取
                $stmt = $pdo->prepare("SELECT id, login_id, name, email, role, permissions, status, read_only, created_by, created_at, last_login FROM user WHERE id = ?");
                $stmt->execute([$input['id']]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($user) {
                    // 获取用户关联的所有 company_ids
                    $stmt = $pdo->prepare("SELECT company_id FROM user_company_map WHERE user_id = ?");
                    $stmt->execute([$user['id']]);
                    $companyIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    $user['company_ids'] = $companyIds;
                    
                    // 从 user_company_permissions 表获取当前公司下的权限（如果存在）
                    $stmt = $pdo->prepare("SELECT account_permissions, process_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
                    $stmt->execute([$user['id'], $current_company_id]);
                    $companyPermissions = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($companyPermissions) {
                        // 使用公司特定的权限
                        $user['account_permissions'] = $companyPermissions['account_permissions'];
                        $user['process_permissions'] = $companyPermissions['process_permissions'];
                    } else {
                        // 如果公司特定的权限不存在，设置为 null（表示未设置，默认可以看到所有）
                        $user['account_permissions'] = null;
                        $user['process_permissions'] = null;
                    }
                    
                    // 同步获取 company_ownership 中的 read_only 状态（如果有，优先级更高）
                    if (strtolower($user['role']) === 'partnership') {
                        $roStmt = $pdo->prepare("SELECT read_only FROM company_ownership WHERE company_id = ? AND account_id = ? AND owner_type = 'user'");
                        $roStmt->execute([$current_company_id, $user['id']]);
                        $co_ro = $roStmt->fetchColumn();
                        if ($co_ro !== false) {
                            $user['read_only'] = (int)$co_ro;
                        }
                    }
                    
                    sendResponse(true, 'User found', $user);
                } else {
                    // 如果不是user，检查是否是owner影子
                    if (isOwnerShadow($pdo, $input['id'], $current_company_id)) {
                        $stmt = $pdo->prepare("
                            SELECT o.id, o.owner_code as login_id, o.name, o.email, 'owner' as role, o.status, NULL as last_login, NULL as created_by, NULL as permissions
                            FROM owner o
                            INNER JOIN company c ON c.owner_id = o.id
                            WHERE o.id = ? AND c.id = ?
                        ");
                        $stmt->execute([$input['id'], $current_company_id]);
                        $owner = $stmt->fetch(PDO::FETCH_ASSOC);
                        
                        if ($owner) {
                            sendResponse(true, 'Owner found', $owner);
                        } else {
                            sendResponse(false, 'Owner not found or access denied');
                        }
                    } else {
                        sendResponse(false, 'User not found or access denied');
                    }
                }
            } else {
                // Get all users - 添加permissions字段 并通过 user_company_map 过滤company_id
                $stmt = $pdo->prepare("
                    SELECT DISTINCT u.id, u.login_id, u.name, u.email, u.role, u.permissions, u.status, u.created_by, u.created_at, u.last_login 
                    FROM user u
                    INNER JOIN user_company_map ucm ON u.id = ucm.user_id
                    WHERE ucm.company_id = ? 
                    ORDER BY 
                        CASE 
                            WHEN u.login_id REGEXP '^[0-9]' THEN 0 
                            ELSE 1 
                        END,
                        CASE 
                            WHEN u.login_id REGEXP '^[0-9]' THEN CAST(u.login_id AS UNSIGNED)
                            ELSE ASCII(UPPER(u.login_id))
                        END,
                        u.login_id ASC
                ");
                $stmt->execute([$current_company_id]);
                $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
                sendResponse(true, 'Users retrieved successfully', $users);
            }
            break;
            
        default:
            sendResponse(false, 'Invalid action');
            break;
    }
    
} catch (PDOException $e) {
    error_log("Database error in userlist_api: " . $e->getMessage());
    error_log("SQL State: " . $e->getCode());
    error_log("Error Info: " . print_r($e->errorInfo, true));
    sendResponse(false, 'Database error occurred: ' . $e->getMessage(), null);
} catch (Exception $e) {
    error_log("General error in userlist_api: " . $e->getMessage());
    sendResponse(false, 'An error occurred: ' . $e->getMessage(), null);
}
