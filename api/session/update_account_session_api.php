<?php
/**
 * 更新 session 中的 account 信息的 API（用于 member 用户切换账户）
 * 路径: api/session/update_account_session_api.php
 */

// 此 API 需要写入 session（切换账户），不能让 session_check.php 提前关闭锁
define('SESSION_KEEP_OPEN', true);

require_once __DIR__ . '/../../session_check.php';

header('Content-Type: application/json');

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

function hasAccountLinkTable(PDO $pdo) {
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'account_link'");
        return $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

function getAccountByCompany(PDO $pdo, $account_id, $company_id) {
    $stmt = $pdo->prepare("
        SELECT a.id, a.account_id, a.name, a.status
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.id = ? AND ac.company_id = ? AND a.status = 'active'
    ");
    $stmt->execute([$account_id, $company_id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function getLinkedAccountIds(PDO $pdo, $start_account_id, $company_id) {
    $linked = [];
    $visited = [];
    $queue = [$start_account_id];
    while (!empty($queue)) {
        $current_id = array_shift($queue);
        if (isset($visited[$current_id])) continue;
        $visited[$current_id] = true;
        $linked[] = $current_id;
        $stmt = $pdo->prepare("
            SELECT account_id_2 AS linked_id FROM account_link WHERE account_id_1 = ? AND company_id = ?
            UNION
            SELECT account_id_1 AS linked_id FROM account_link WHERE account_id_2 = ? AND company_id = ?
        ");
        $stmt->execute([$current_id, $company_id, $current_id, $company_id]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $linked_id) {
            if (!isset($visited[$linked_id])) $queue[] = $linked_id;
        }
    }
    return $linked;
}

try {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(false, '用户未登录', null, 401);
        exit;
    }
    $current_user_type = strtolower($_SESSION['user_type'] ?? '');
    if ($current_user_type !== 'member') {
        jsonResponse(false, '只有 member 用户可以使用此功能', null, 403);
        exit;
    }

    $requested_account_id = null;
    if (isset($_GET['account_id']) && $_GET['account_id'] !== '') {
        $requested_account_id = (int) $_GET['account_id'];
    } elseif (isset($_POST['account_id']) && $_POST['account_id'] !== '') {
        $requested_account_id = (int) $_POST['account_id'];
    }
    if (!$requested_account_id) {
        jsonResponse(false, '缺少 account_id 参数', null, 400);
        exit;
    }

    $current_account_id = $_SESSION['user_id'];
    $current_company_id = $_SESSION['company_id'] ?? null;
    if (!$current_company_id) {
        jsonResponse(false, '缺少公司信息', null, 400);
        exit;
    }

    if (!hasAccountLinkTable($pdo)) {
        jsonResponse(false, '账户关联功能未启用', null, 500);
        exit;
    }

    $target_account = getAccountByCompany($pdo, $requested_account_id, $current_company_id);
    if (!$target_account) {
        jsonResponse(false, '账户不存在、不属于当前公司或已停用', null, 403);
        exit;
    }

    if ($requested_account_id == $current_account_id) {
        jsonResponse(true, '已经是当前账户', ['account_id' => $requested_account_id]);
        exit;
    }

    $linked_account_ids = getLinkedAccountIds($pdo, $current_account_id, $current_company_id);
    if (!in_array($requested_account_id, $linked_account_ids)) {
        jsonResponse(false, '该账户与当前账户未关联，无法切换', null, 403);
        exit;
    }

    $_SESSION['user_id'] = $requested_account_id;
    $_SESSION['login_id'] = $target_account['account_id'];
    $_SESSION['name'] = $target_account['name'];
    $_SESSION['account_id'] = $target_account['account_id'];

    require_once __DIR__ . '/../../includes/api_auth_token.php';
    api_auth_persist_current_session($pdo);

    // 写入完成，立即释放 session 锁
    session_write_close();

    jsonResponse(true, '账户已切换', [
        'account_id'   => $requested_account_id,
        'account_code' => $target_account['account_id'],
        'account_name' => $target_account['name']
    ]);
} catch (Exception $e) {
    session_write_close();
    jsonResponse(false, $e->getMessage(), null, 500);
}