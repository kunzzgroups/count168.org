<?php
/**
 * Account Currency API
 * 管理账户与货币的多对多关系
 * 路径: api/accounts/account_currency_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

/**
 * 标准 JSON 响应
 */
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

/**
 * 检查 account_company 表是否存在
 */
function hasAccountCompanyTable($pdo) {
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'account_company'");
        return $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * 验证账户是否属于当前公司（通过 account_company）
 */
function dbAccountBelongsToCompany($pdo, $account_id, $company_id) {
    $stmt = $pdo->prepare("
        SELECT a.id FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.id = ? AND ac.company_id = ?
    ");
    $stmt->execute([$account_id, $company_id]);
    return (bool) $stmt->fetchColumn();
}

/**
 * 获取当前公司 ID（支持 GET company_id 覆盖，仅 owner）
 */
function resolveCompanyId($pdo) {
    $company_id = $_SESSION['company_id'] ?? null;
    $requested = isset($_GET['company_id']) ? (int)$_GET['company_id'] : null;
    if (!$requested) {
        return $company_id;
    }
    $user_id = $_SESSION['user_id'];
    $role = $_SESSION['role'] ?? '';
    if ($role === 'owner') {
        $owner_id = $_SESSION['owner_id'] ?? $user_id;
        $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$requested, $owner_id]);
        if ($stmt->fetchColumn()) {
            return $requested;
        }
    } elseif ($requested === (int)$_SESSION['company_id']) {
        return $requested;
    }
    return $company_id;
}

/**
 * 获取账户关联的货币列表（当前公司）
 */
function dbGetAccountCurrencies($pdo, $account_id, $company_id) {
    $sql = "SELECT ac.id, ac.account_id, ac.currency_id, c.code AS currency_code
            FROM account_currency ac
            INNER JOIN currency c ON ac.currency_id = c.id
            WHERE ac.account_id = ? AND c.company_id = ?
            ORDER BY ac.created_at ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$account_id, $company_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 获取当前公司所有货币
 */
function dbGetCompanyCurrencies($pdo, $company_id) {
    $stmt = $pdo->prepare("SELECT id, code FROM currency WHERE company_id = ? ORDER BY code ASC");
    $stmt->execute([$company_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 获取账户已关联的货币 ID 列表
 */
function dbGetLinkedCurrencyIds($pdo, $account_id) {
    $stmt = $pdo->prepare("SELECT currency_id FROM account_currency WHERE account_id = ?");
    $stmt->execute([$account_id]);
    return array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'currency_id');
}

/**
 * 验证货币属于当前公司
 */
function dbCurrencyBelongsToCompany($pdo, $currency_id, $company_id) {
    $stmt = $pdo->prepare("SELECT id FROM currency WHERE id = ? AND company_id = ?");
    $stmt->execute([$currency_id, $company_id]);
    return (bool) $stmt->fetchColumn();
}

/**
 * 检查账户-货币是否已关联
 */
function dbAccountCurrencyLinked($pdo, $account_id, $currency_id) {
    $stmt = $pdo->prepare("SELECT id FROM account_currency WHERE account_id = ? AND currency_id = ?");
    $stmt->execute([$account_id, $currency_id]);
    return (bool) $stmt->fetchColumn();
}

/**
 * 添加账户-货币关联
 */
function dbAddAccountCurrency($pdo, $account_id, $currency_id) {
    $stmt = $pdo->prepare("INSERT INTO account_currency (account_id, currency_id) VALUES (?, ?)");
    $stmt->execute([$account_id, $currency_id]);
}

/**
 * 获取账户关联货币数量
 */
function dbCountAccountCurrencies($pdo, $account_id) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM account_currency WHERE account_id = ?");
    $stmt->execute([$account_id]);
    return (int) $stmt->fetchColumn();
}

/**
 * 删除账户-货币关联
 */
function dbRemoveAccountCurrency($pdo, $account_id, $currency_id) {
    $stmt = $pdo->prepare("DELETE FROM account_currency WHERE account_id = ? AND currency_id = ?");
    $stmt->execute([$account_id, $currency_id]);
    return $stmt->rowCount();
}

try {
    if (!isset($_SESSION['company_id'])) {
        jsonResponse(false, '用户未登录或缺少公司信息', null, 401);
        exit;
    }

    $company_id = resolveCompanyId($pdo);
    if (!$company_id) {
        jsonResponse(false, '用户未登录或缺少公司信息', null, 401);
        exit;
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    $verifyAccount = function($account_id) use ($pdo, $company_id) {
        return dbAccountBelongsToCompany($pdo, $account_id, $company_id);
    };

    if ($method === 'GET') {
        if ($action === 'get_account_currencies') {
            $account_id = isset($_GET['account_id']) ? (int)$_GET['account_id'] : 0;
            if (!$account_id) {
                jsonResponse(false, '账户ID是必需的', null, 400);
                exit;
            }
            if (!$verifyAccount($account_id)) {
                jsonResponse(false, '账户不存在或无权限访问', null, 403);
                exit;
            }
            $currencies = dbGetAccountCurrencies($pdo, $account_id, $company_id);
            jsonResponse(true, '', $currencies);
            exit;
        }

        if ($action === 'get_available_currencies') {
            $account_id = isset($_GET['account_id']) ? (int)$_GET['account_id'] : 0;
            $all = dbGetCompanyCurrencies($pdo, $company_id);
            $linked_ids = $account_id ? dbGetLinkedCurrencyIds($pdo, $account_id) : [];
            $result = array_map(function($c) use ($linked_ids) {
                return [
                    'id' => (int) $c['id'],
                    'code' => $c['code'],
                    'is_linked' => in_array($c['id'], $linked_ids)
                ];
            }, $all);
            jsonResponse(true, '', $result);
            exit;
        }

        jsonResponse(false, '无效的操作', null, 400);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];

        if ($action === 'add_currency') {
            $account_id = isset($data['account_id']) ? (int)$data['account_id'] : 0;
            $currency_id = isset($data['currency_id']) ? (int)$data['currency_id'] : 0;
            if (!$account_id || !$currency_id) {
                jsonResponse(false, '账户ID和货币ID是必需的', null, 400);
                exit;
            }
            if (!$verifyAccount($account_id)) {
                jsonResponse(false, '账户不存在或无权限访问', null, 403);
                exit;
            }
            if (!dbCurrencyBelongsToCompany($pdo, $currency_id, $company_id)) {
                jsonResponse(false, '货币不存在或无权限访问', null, 403);
                exit;
            }
            if (dbAccountCurrencyLinked($pdo, $account_id, $currency_id)) {
                jsonResponse(false, '该货币已经关联到此账户', null, 400);
                exit;
            }
            dbAddAccountCurrency($pdo, $account_id, $currency_id);
            jsonResponse(true, '货币添加成功', ['account_id' => $account_id, 'currency_id' => $currency_id]);
            exit;
        }

        if ($action === 'remove_currency') {
            $account_id = isset($data['account_id']) ? (int)$data['account_id'] : 0;
            $currency_id = isset($data['currency_id']) ? (int)$data['currency_id'] : 0;
            if (!$account_id || !$currency_id) {
                jsonResponse(false, '账户ID和货币ID是必需的', null, 400);
                exit;
            }
            if (!$verifyAccount($account_id)) {
                jsonResponse(false, '账户不存在或无权限访问', null, 403);
                exit;
            }
            if (dbCountAccountCurrencies($pdo, $account_id) <= 1) {
                jsonResponse(false, '账户必须至少保留一个货币，无法删除', null, 400);
                exit;
            }
            $deleted = dbRemoveAccountCurrency($pdo, $account_id, $currency_id);
            if ($deleted === 0) {
                jsonResponse(false, '关联不存在', null, 400);
                exit;
            }
            jsonResponse(true, '货币移除成功');
            exit;
        }

        jsonResponse(false, '无效的操作', null, 400);
        exit;
    }

    jsonResponse(false, '不支持的请求方法', null, 405);

} catch (PDOException $e) {
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    $code = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 400;
    jsonResponse(false, $e->getMessage(), null, $code);
}