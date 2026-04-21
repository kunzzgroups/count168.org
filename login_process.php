<?php
// 会话超时配置（单位：秒，这里为 1 小时，与dashboard.php保持一致）
$sessionTimeout = 3600;
$cookieOptions = [
    'lifetime' => $sessionTimeout,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
];

ini_set('session.gc_maxlifetime', (string) $sessionTimeout);
session_set_cookie_params($cookieOptions);
session_start();

// 超过指定时长未操作则销毁会话，要求重新登录
if (isset($_SESSION['last_activity']) && (time() - (int) $_SESSION['last_activity']) > $sessionTimeout) {
    session_unset();
    session_destroy();
    session_set_cookie_params($cookieOptions);
    session_start();
}

// 设置错误处理，确保返回 JSON
header('Content-Type: application/json');

// 开启输出缓冲，防止意外输出（必须在 header 之后）
ob_start();

// 检查数据库连接，如果失败返回 JSON 错误
if (!file_exists('config.php')) {
    echo json_encode(['status' => 'error', 'message' => 'Configuration file does not exist']);
    exit;
}

require_once 'config.php';

// 检查 $pdo 是否已定义
if (!isset($pdo) || !$pdo) {
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed']);
    exit;
}

/**
 * 规则：
 * - C168 永远可登录（不受 expiration_date 限制）
 * - 其他公司：未设置到期日（Not set）或已过期，视为不可登录
 */
function isCompanyExpiredOrUnset($expirationDate, $companyCode = null): bool
{
    if (strtoupper(trim((string)$companyCode)) === 'C168') {
        return false;
    }

    if ($expirationDate === null || trim((string)$expirationDate) === '') {
        return true;
    }

    $expTs = strtotime((string)$expirationDate);
    if ($expTs === false) {
        return true;
    }

    return $expTs < strtotime(date('Y-m-d'));
}

try {
    if ($_POST) {
        $password = trim($_POST['password']);
        $company_id = strtoupper(trim($_POST['company_id'])); // 转换为大写，不区分大小写
        $login_role = isset($_POST['login_role']) ? trim($_POST['login_role']) : 'admin'; // 获取登录角色
    
    // 如果选择的是 member，从 account 表验证
    if ($login_role === 'member') {
        // Member 使用 account_id 字段
        $account_id = trim($_POST['account_id'] ?? '');
        
        if (empty($account_id)) {
            echo json_encode(['status' => 'error', 'message' => 'Please enter account ID']);
            exit;
        }
        
        // 从 account 表验证：验证公司、账号、密码、状态
        // 修改条件，允许匹配 company_id 或者 group_id
        $stmt = $pdo->prepare("
            SELECT a.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date 
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            INNER JOIN company c ON ac.company_id = c.id
            WHERE UPPER(a.account_id) = UPPER(?) 
            AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
            AND a.status = 'active'
        ");
        $stmt->execute([$account_id, $company_id, $company_id]);
        $matched_accounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $account = null;
        $has_expired = false;
        $password_match = false;
        
        foreach ($matched_accounts as $row) {
            if (!empty($row['password']) && $password === $row['password']) {
                $password_match = true;
                if (isCompanyExpiredOrUnset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
                    $has_expired = true;
                } else {
                    $account = $row;
                    break;
                }
            }
        }
        
        // 检查账户是否存在且密码匹配
        if ($account) {
            // Member 登录成功（保留 member_login_account_id 供 Win/Loss 刷新后恢复所选被连接方）
            $_SESSION['member_login_account_id'] = $account['id'];
            $_SESSION['user_id'] = $account['id'];
            $_SESSION['login_id'] = $account['account_id'];
            $_SESSION['name'] = $account['name'];
            $_SESSION['role'] = $account['role'];
            $_SESSION['user_type'] = 'member';
            $_SESSION['account_id'] = $account['account_id'];
            // 使用 match 到的第一家 company 的数字 ID
            $_SESSION['company_id'] = $account['company_numeric_id'];
            $_SESSION['last_activity'] = time();

            // 更新最后登录时间
            $stmt = $pdo->prepare("UPDATE account SET last_login = NOW() WHERE id = ?");
            $stmt->execute([$account['id']]);

            echo json_encode(['status' => 'success', 'redirect' => 'dashboard.php']);
            exit;
        } else {
            if ($password_match && $has_expired) {
                echo json_encode(['status' => 'error', 'message' => 'Company or Group has expired.']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Account ID, Company ID or password is incorrect']);
            }
            exit;
        }
    }
    
    // 如果不是 member，则从 user 表验证（Admin）
    // Admin 使用 login_id 字段
    $login_id = trim($_POST['login_id'] ?? '');
    
    if (empty($login_id)) {
        echo json_encode(['status' => 'error', 'message' => 'Please enter username']);
        exit;
    }
    
    $stmt = $pdo->prepare("
        SELECT 
            u.*,
            c.id AS company_numeric_id,
            c.company_id AS company_code,
            c.expiration_date
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        INNER JOIN company c ON ucm.company_id = c.id
        WHERE u.login_id = ? AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?) AND u.status = 'active'
    ");
    $stmt->execute([$login_id, $company_id, $company_id]);
    $matched_users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $user = null;
    $user_has_expired = false;
    $user_password_match = false;
    
    foreach ($matched_users as $row) {
        if (password_verify($password, $row['password'])) {
            $user_password_match = true;
            if (isCompanyExpiredOrUnset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
                $user_has_expired = true;
            } else {
                $user = $row;
                break;
            }
        }
    }
    
    if ($user) {
        // User 登录成功
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['login_id'] = $user['login_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['user_type'] = 'user';
        $_SESSION['company_id'] = $user['company_numeric_id'];
        $_SESSION['company_code'] = $user['company_code'];
        $_SESSION['last_activity'] = time();
        $_SESSION['read_only'] = isset($user['read_only']) ? (int)$user['read_only'] : 1; // Partnership read-only state

        // 处理Remember Me
        $remember_me = isset($_POST['remember_me']) ? $_POST['remember_me'] : false;
        if ($remember_me) {
            $remember_token = bin2hex(random_bytes(32)); // 生成安全的token
            
            // 将token存储到数据库
            $stmt = $pdo->prepare("UPDATE user SET remember_token = ?, remember_token_expires = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?");
            $stmt->execute([$remember_token, $user['id']]);
            
            // 设置cookie，30天过期
            setcookie('remember_token', $remember_token, time() + (30 * 24 * 60 * 60), "/", "", false, true);
        }

        // 更新最后登录时间
        $stmt = $pdo->prepare("UPDATE user SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$user['id']]);

        // 检查是否是c168公司的用户，且已设置二级密码，则需要二级密码验证
        $needs_secondary_password = false;
        if (strtoupper($user['company_code']) === 'C168') {
            // 检查用户是否设置了二级密码
            $stmt = $pdo->prepare("SELECT secondary_password FROM user WHERE id = ?");
            $stmt->execute([$user['id']]);
            $user_secondary = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user_secondary && !empty($user_secondary['secondary_password'])) {
                $needs_secondary_password = true;
            }
        }

        if ($needs_secondary_password) {
            // 需要二级密码验证，跳转到二级密码验证页面
            echo json_encode(['status' => 'success', 'redirect' => 'api/users/user_secondary_password.php']);
        } else {
            // 不需要二级密码验证，直接跳转到dashboard
            $_SESSION['secondary_password_verified'] = true; // 标记为已验证（对于不需要二级密码的用户）
            echo json_encode(['status' => 'success', 'redirect' => 'dashboard.php']);
        }
        exit;
        
    } else {
        if ($user_password_match && $user_has_expired) {
            echo json_encode(['status' => 'error', 'message' => 'Company or Group has expired.']);
            exit;
        }
        // User 表找不到，尝试从 owner 表验证
        // 通过 company 表关联查询 owner
        $stmt = $pdo->prepare("
            SELECT o.*, c.id AS company_numeric_id, c.company_id AS company_code, c.expiration_date
            FROM owner o
            INNER JOIN company c ON c.owner_id = o.id
            WHERE UPPER(o.owner_code) = UPPER(?) AND (UPPER(c.company_id) = ? OR UPPER(c.group_id) = ?)
        ");
        $stmt->execute([$login_id, $company_id, $company_id]);
        $matched_owners = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $owner = null;
        $owner_has_expired = false;
        $owner_password_match = false;
        $owner_record_to_update = null;
        
        foreach ($matched_owners as $row) {
            $is_pwd_valid = false;
            // 先尝试哈希验证（标准方式）
            if (password_verify($password, $row['password'])) {
                $is_pwd_valid = true;
            } 
            // 如果哈希验证失败，检查是否是明文密码（兼容旧数据）
            elseif ($password === $row['password']) {
                $is_pwd_valid = true;
                $owner_record_to_update = $row;
            }

            if ($is_pwd_valid) {
                $owner_password_match = true;
                if (isCompanyExpiredOrUnset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
                    $owner_has_expired = true;
                } else {
                    $owner = $row;
                    break;
                }
            }
        }
        
        if ($owner) {
            // 如果使用明文密码验证成功，自动升级为哈希密码
            if ($owner_record_to_update && $owner['id'] == $owner_record_to_update['id']) {
                $hashed_password = password_hash($password, PASSWORD_DEFAULT);
                $update_stmt = $pdo->prepare("UPDATE owner SET password = ? WHERE id = ?");
                $update_stmt->execute([$hashed_password, $owner['id']]);
            }

            $_SESSION['user_id'] = $owner['id'];
            $_SESSION['login_id'] = $owner['owner_code'];
            $_SESSION['name'] = $owner['name'];
            $_SESSION['role'] = 'owner';
            $_SESSION['user_type'] = 'owner';
            $_SESSION['owner_id'] = $owner['id'];
            $_SESSION['real_owner_id'] = $owner['id'];
            $_SESSION['owner_code'] = $owner['owner_code'];
            $_SESSION['company_id'] = $owner['company_numeric_id']; // 使用数字 ID
            $_SESSION['company_code'] = $owner['company_code']; // 保存字符串编码供显示用
            $_SESSION['last_activity'] = time();

            // 处理Remember Me (Owner也支持记住我功能)
            $remember_me = isset($_POST['remember_me']) ? $_POST['remember_me'] : false;
            if ($remember_me) {
                // Owner 的 remember me 可以存在 session 或另外处理
            }
            
            echo json_encode(['status' => 'success', 'redirect' => 'dashboard.php']);
        } else {
            if ($owner_password_match && $owner_has_expired) {
                echo json_encode(['status' => 'error', 'message' => 'Company or Group has expired.']);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Username or password is incorrect']);
            }
        }
    }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Invalid request']);
    }
} catch (PDOException $e) {
    // 数据库错误
    error_log("Login PDO Error: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Database error, please try again later']);
} catch (Exception $e) {
    // 其他错误
    error_log("Login Error: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'An error occurred during login: ' . $e->getMessage()]);
}

// 清除输出缓冲并发送输出
ob_end_flush();
?>