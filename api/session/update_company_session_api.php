<?php
/**
 * 更新 session 中的 company_id 的 API
 * 路径: api/session/update_company_session_api.php
 */

// 此 API 需要写入 session（切换公司），不能让 session_check.php 提前关闭锁
define('SESSION_KEEP_OPEN', true);

require_once __DIR__ . '/../../session_check.php';

header('Content-Type: application/json');

function translateApiMessage(string $message): string {
    $map = [
        '用户未登录' => 'User not logged in',
        '缺少 company_id 参数' => 'Missing company_id parameter',
        '获取公司列表失败' => 'Failed to load company list',
        '无权限访问该公司' => 'No permission to access this company',
        'Company has expired' => 'Company has expired',
        'Company expiration date is not set' => 'Company expiration date is not set',
        'Company 已更新' => 'Company updated',
    ];

    return $map[$message] ?? $message;
}

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    $message = translateApiMessage((string)$message);
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'error' => $success ? null : $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * 返回公司状态：
 * - valid: 可访问（C168 永远 valid）
 * - no_set: 未设置到期日（Not set）
 * - expired: 已到期
 */
function getCompanyExpirationState($expirationDate, $companyCode = null): string {
    if (strtoupper(trim((string)$companyCode)) === 'C168') {
        return 'valid';
    }

    if ($expirationDate === null || trim((string)$expirationDate) === '') {
        return 'no_set';
    }

    $expTs = strtotime((string)$expirationDate);
    if ($expTs === false) {
        return 'no_set';
    }

    if ($expTs < strtotime(date('Y-m-d'))) {
        return 'expired';
    }

    return 'valid';
}

function getUserCompanies(PDO $pdo, $user_id, $user_role, $user_type) {
    if (strtolower($user_type) === 'member') {
        // member 可能来自不同登录入口：有的用 account_company(account_id)，有的仍走 user_company_map(user_id)
        // 为避免切换 company 误判无权限，这里同时检查两种映射。
        $stmt = $pdo->prepare("
            SELECT DISTINCT c.id, c.company_id, c.expiration_date
            FROM company c
            INNER JOIN account_company ac ON c.id = ac.company_id
            WHERE ac.account_id = ?

            UNION

            SELECT DISTINCT c2.id, c2.company_id, c2.expiration_date
            FROM company c2
            INNER JOIN user_company_map ucm ON c2.id = ucm.company_id
            WHERE ucm.user_id = ?

            ORDER BY company_id ASC
        ");
        $stmt->execute([$user_id, $user_id]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    if (strtolower($user_role) === 'owner') {
        // Always use the REAL owner_id (never the swapped one) for listing companies
        $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $user_id;
        $stmt = $pdo->prepare("
            SELECT DISTINCT c.id, c.company_id, c.expiration_date, IF(c.owner_id = ?, 0, 1) as is_external, c.owner_id as real_owner_id
            FROM company c
            LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner'
            WHERE c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0)
            ORDER BY c.company_id ASC
        ");
        $stmt->execute([$owner_id, $owner_id, $owner_id]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    $stmt = $pdo->prepare("
        SELECT DISTINCT c.id, c.company_id, c.expiration_date
        FROM company c
        INNER JOIN user_company_map ucm ON c.id = ucm.company_id
        WHERE ucm.user_id = ?
        ORDER BY c.company_id ASC
    ");
    $stmt->execute([$user_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

try {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(false, '用户未登录', null, 401);
        exit;
    }

    $requested_company_id = null;
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $requested_company_id = (int) $_GET['company_id'];
    } elseif (isset($_POST['company_id']) && $_POST['company_id'] !== '') {
        $requested_company_id = (int) $_POST['company_id'];
    }
    if (!$requested_company_id) {
        jsonResponse(false, '缺少 company_id 参数', null, 400);
        exit;
    }

    $current_user_id = $_SESSION['user_id'];
    $current_user_role = strtolower($_SESSION['role'] ?? '');
    $current_user_type = strtolower($_SESSION['user_type'] ?? '');

    try {
        $user_companies = getUserCompanies($pdo, $current_user_id, $current_user_role, $current_user_type);
    } catch (PDOException $e) {
        error_log("获取用户 company 列表失败: " . $e->getMessage());
        jsonResponse(false, '获取公司列表失败', null, 500);
        exit;
    }

    $valid = false;
    $is_external_view = false;
    $real_owner_id = null;
    $blockedReason = null;
    foreach ($user_companies as $comp) {
        if ((int) $comp['id'] === $requested_company_id) {
            $valid = true;
            $expState = getCompanyExpirationState($comp['expiration_date'] ?? null, $comp['company_id'] ?? null);
            if ($expState === 'expired') {
                $blockedReason = 'expired';
            } elseif ($expState === 'no_set') {
                $blockedReason = 'no_set';
            }
            if (isset($comp['is_external']) && $comp['is_external'] == 1) {
                $is_external_view = true;
            }
            if (isset($comp['real_owner_id'])) {
                $real_owner_id = $comp['real_owner_id'];
            }
            break;
        }
    }
    if (!$valid) {
        jsonResponse(false, '无权限访问该公司', null, 403);
        exit;
    }
    if ($blockedReason === 'expired') {
        jsonResponse(false, 'Company has expired', ['reason' => 'expired'], 403);
        exit;
    }
    if ($blockedReason === 'no_set') {
        jsonResponse(false, 'Company expiration date is not set', ['reason' => 'no_set'], 403);
        exit;
    }

    // 更新当前会话的公司 ID 和外部视图状态
    $_SESSION['company_id'] = $requested_company_id;
    $_SESSION['is_external_view'] = $is_external_view;
    if ($current_user_role === 'owner') {
        // Preserve the REAL owner_id permanently (set once, never changes)
        if (!isset($_SESSION['real_owner_id'])) {
            $_SESSION['real_owner_id'] = $current_user_id;
        }
        if ($is_external_view && $real_owner_id !== null) {
            $_SESSION['owner_id'] = $real_owner_id;
        } else {
            $_SESSION['owner_id'] = $_SESSION['real_owner_id'];
        }
    }

    // 返回当前公司是否有 Games / Bank 权限，供侧边栏即时显示/隐藏 Data Capture、Maintenance > Process 等
    // 同时更新 session 中的 company_code，避免使用 C168 登录后切到其他公司时仍被视为 C168
    $has_gambling = false;
    $has_bank = false;
    $company_code = null;
    try {
        $stmt = $pdo->prepare("SELECT company_id, permissions FROM company WHERE id = ?");
        $stmt->execute([$requested_company_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $company_code = isset($row['company_id']) ? (string) $row['company_id'] : null;
            $permsJson = $row['permissions'] ?? null;
            if ($permsJson) {
                $perms = json_decode($permsJson, true);
                $has_gambling = is_array($perms) && (in_array('Games', $perms) || in_array('Gambling', $perms));
                $has_bank = is_array($perms) && in_array('Bank', $perms);
            }
        }
    } catch (PDOException $e) {
        error_log("获取公司权限失败: " . $e->getMessage());
    }

    // 如果成功获取到公司代码，则同步更新到 session 中
    if ($company_code !== null) {
        $_SESSION['company_code'] = $company_code;
    }

    // 写入完成，立即释放 session 锁
    session_write_close();

    jsonResponse(true, 'Company 已更新', [
        'company_id'   => $requested_company_id,
        'company_code' => $company_code,
        'has_gambling' => $has_gambling,
        'has_bank'     => $has_bank
    ]);
} catch (Exception $e) {
    session_write_close();
    jsonResponse(false, $e->getMessage(), null, 500);
}