<?php
/**
 * 账户列表 API：按公司、搜索、状态与权限返回账户列表
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行

// ---------- 数据库与业务辅助函数 ----------

/** 返回当前用户在某公司下的账户权限列表（用于展示/调试）。未设置时返回 []。 */
function getCurrentUserAccountPermissions(PDO $pdo, int $company_id): array {
    $currentUserId = $_SESSION['user_id'] ?? null;
    if (!$currentUserId) {
        return [];
    }
    $stmt = $pdo->prepare("SELECT account_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
    $stmt->execute([$currentUserId, $company_id]);
    $permission = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($permission && $permission['account_permissions'] !== null) {
        $permissions = json_decode($permission['account_permissions'], true);
        return is_array($permissions) ? $permissions : [];
    }
    return [];
}

/**
 * 返回账户 ID 过滤：null = 不限制，[] = 不显示任何账户，[id,...] = 只显示这些账户。
 */
function getAccountPermissionFilterForCompany(PDO $pdo, int $company_id, string $current_user_role): ?array {
    $currentUserId = $_SESSION['user_id'] ?? null;
    if (!$currentUserId || $current_user_role === 'owner') {
        return null;
    }
    $stmt = $pdo->prepare("SELECT account_permissions FROM user_company_permissions WHERE user_id = ? AND company_id = ?");
    $stmt->execute([$currentUserId, $company_id]);
    $permission = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$permission || $permission['account_permissions'] === null) {
        return null;
    }
    $userAccountPermissions = json_decode($permission['account_permissions'], true);
    if (empty($userAccountPermissions) || !is_array($userAccountPermissions)) {
        return [];
    }
    $accountIds = array_values(array_unique(array_filter(array_map('intval', array_column($userAccountPermissions, 'id')), function ($id) {
        return $id > 0;
    })));
    return $accountIds;
}

function validateCompanyAccess(PDO $pdo, int $company_id): void {
    $current_user_id = $_SESSION['user_id'];
    $current_user_role = $_SESSION['role'] ?? '';
    if ($current_user_role === 'owner') {
        $owner_id = $_SESSION['owner_id'] ?? $current_user_id;
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND owner_id = ?");
        $stmt->execute([$company_id, $owner_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    } else {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_company_map WHERE user_id = ? AND company_id = ?");
        $stmt->execute([$current_user_id, $company_id]);
        if ($stmt->fetchColumn() == 0) {
            throw new Exception('无权限访问该公司');
        }
    }
}

function hasAccountCreatedSourceColumn(PDO $pdo): bool {
    static $has = null;
    if ($has !== null) {
        return $has;
    }
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `account` LIKE 'created_source'");
        $has = $stmt && $stmt->rowCount() > 0;
    } catch (PDOException $e) {
        $has = false;
    }
    return $has;
}

function formatDomainAutoDisplayAccountId(string $rawAccountId): string {
    $rawAccountId = trim($rawAccountId);
    if ($rawAccountId === '' || strpos($rawAccountId, '_') === false) {
        return $rawAccountId;
    }
    $parts = explode('_', $rawAccountId, 2);
    $display = trim((string)($parts[1] ?? ''));
    return $display !== '' ? $display : $rawAccountId;
}

function fetchAccountsForCompany(PDO $pdo, int $company_id, string $searchTerm, bool $showInactive, bool $showAll, ?array $accountIdFilter, ?array $rolesFilter = null): array {
    $hasCreatedSource = hasAccountCreatedSourceColumn($pdo);
    $selectCreatedSource = $hasCreatedSource ? ", a.created_source" : ", NULL AS created_source";
    $sql = "SELECT DISTINCT a.id, a.account_id, a.name, a.status, a.last_login, a.role,
            COALESCE(a.payment_alert, 0) AS payment_alert,
            a.alert_day, a.alert_day AS alert_type, a.alert_specific_date, a.alert_specific_date AS alert_start_date,
            a.alert_amount, a.remark
            {$selectCreatedSource}
            FROM account a
            INNER JOIN account_company ac ON a.id = ac.account_id
            WHERE ac.company_id = ?";
    $params = [$company_id];

    if ($rolesFilter !== null && !empty($rolesFilter)) {
        $placeholders = implode(',', array_fill(0, count($rolesFilter), '?'));
        $sql .= " AND a.role IN ($placeholders)";
        $params = array_merge($params, $rolesFilter);
    }

    if ($accountIdFilter !== null) {
        if (empty($accountIdFilter)) {
            $sql .= " AND 1=0";
        } else {
            $placeholders = str_repeat('?,', count($accountIdFilter) - 1) . '?';
            $sql .= " AND a.id IN ($placeholders)";
            $params = array_merge($params, $accountIdFilter);
        }
    }

    if ($searchTerm !== '') {
        $searchParam = "%$searchTerm%";
        $sql .= " AND (a.account_id LIKE ? OR a.name LIKE ? OR a.status LIKE ? OR a.role LIKE ?)";
        $params[] = $searchParam;
        $params[] = $searchParam;
        $params[] = $searchParam;
        $params[] = $searchParam;
    }

    if ($showAll) {
        // Show All: include both active and inactive (no status constraint)
    } elseif ($showInactive) {
        $sql .= " AND a.status = 'inactive'";
    } else {
        $sql .= " AND a.status = 'active'";
    }

    $sql .= " ORDER BY a.account_id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $createdSource = strtolower(trim((string)($row['created_source'] ?? '')));
        if ($createdSource === 'domain_auto') {
            $row['account_id'] = formatDomainAutoDisplayAccountId((string)($row['account_id'] ?? ''));
        }
        unset($row['created_source']);
    }
    unset($row);
    return $rows;
}

function computeAlertStatus(array $accounts): array {
    $today = new DateTime();
    $today->setTime(0, 0, 0);
    foreach ($accounts as &$account) {
        $is_alert = false;
        if (isset($account['payment_alert']) && $account['payment_alert'] == 1) {
            $alert_type = $account['alert_type'] ?? $account['alert_day'] ?? null;
            $alert_start_date = $account['alert_start_date'] ?? $account['alert_specific_date'] ?? null;
            if ($alert_type && $alert_start_date) {
                try {
                    $startDate = new DateTime($alert_start_date);
                    $startDate->setTime(0, 0, 0);
                    if ($startDate > $today) {
                        $account['is_alert'] = 0;
                        continue;
                    }
                    $daysDiff = (int) $startDate->diff($today)->days;
                    $alert_type_lower = strtolower($alert_type);
                    if ($alert_type_lower === 'weekly') {
                        $is_alert = ($daysDiff >= 0 && $daysDiff % 7 === 0);
                    } elseif ($alert_type_lower === 'monthly') {
                        $startDay = (int) $startDate->format('j');
                        $todayDay = (int) $today->format('j');
                        $is_alert = ($startDay === $todayDay && $startDate <= $today);
                    } else {
                        $daysInterval = (int) $alert_type;
                        if ($daysInterval >= 1 && $daysInterval <= 31) {
                            $is_alert = ($daysDiff >= 0 && $daysDiff % $daysInterval === 0);
                        }
                    }
                } catch (Exception $e) {
                    $is_alert = false;
                }
            }
        }
        $account['is_alert'] = $is_alert ? 1 : 0;
    }
    unset($account);
    return $accounts;
}

// ---------- 主逻辑 ----------

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }

    $company_id = null;
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $company_id = (int) $_GET['company_id'];
    } elseif (isset($_SESSION['company_id'])) {
        $company_id = (int) $_SESSION['company_id'];
    }
    if (!$company_id) {
        throw new Exception('缺少公司信息');
    }

    validateCompanyAccess($pdo, $company_id);

    $searchTerm = isset($_GET['search']) ? trim($_GET['search']) : '';
    $showInactive = isset($_GET['showInactive']) ? filter_var($_GET['showInactive'], FILTER_VALIDATE_BOOLEAN) : false;
    $showAll = isset($_GET['showAll']) ? filter_var($_GET['showAll'], FILTER_VALIDATE_BOOLEAN) : false;

    $rolesFilter = null;
    if (isset($_GET['roles']) && $_GET['roles'] !== '') {
        $rolesFilter = array_map('trim', explode(',', $_GET['roles']));
        $rolesFilter = array_values(array_filter($rolesFilter, function ($r) {
            return $r !== '';
        }));
    }

    $current_user_role = $_SESSION['role'] ?? '';
    $accountIdFilter = getAccountPermissionFilterForCompany($pdo, $company_id, $current_user_role);
    $userAccountPermissions = getCurrentUserAccountPermissions($pdo, $company_id);

    $accounts = fetchAccountsForCompany($pdo, $company_id, $searchTerm, $showInactive, $showAll, $accountIdFilter, $rolesFilter);
    $accounts = computeAlertStatus($accounts);

    echo json_encode([
        'success' => true,
        'message' => '',
        'data' => [
            'accounts' => $accounts,
            'count' => count($accounts),
            'searchTerm' => $searchTerm,
            'showInactive' => $showInactive,
            'showAll' => $showAll,
            'company_id' => $company_id,
            'user_permissions_count' => count($userAccountPermissions),
        ],
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '数据库错误: ' . $e->getMessage(), 'data' => null]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '系统错误: ' . $e->getMessage(), 'data' => null]);
}