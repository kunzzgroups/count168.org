<?php
/**
 * 账户关联 API：获取/建立/解除账户关联及连接类型
 */
require_once __DIR__ . '/../../session_check.php';
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => '用户未登录', 'data' => null]);
    exit;
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$isDirectRequest = (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'account_link_api.php');

if ($isDirectRequest) {
    try {
        switch ($action) {
            case 'get_linked_accounts':
                $account_id = isset($_GET['account_id']) ? (int)$_GET['account_id'] : 0;
                $company_id = isset($_GET['company_id']) ? (int)$_GET['company_id'] : 0;
                if (!$account_id || !$company_id) {
                    throw new Exception('缺少必要参数');
                }
                if (!linkAccountBelongsToCompany($pdo, $account_id, $company_id)) {
                    throw new Exception('账户不属于该公司');
                }
                $linked_accounts_data = getAllLinkedAccountsForDisplayWithType($pdo, $account_id, $company_id);
                $link_type_info = getLinkTypeInfo($pdo, $account_id, $company_id);
                echo json_encode([
                    'success' => true,
                    'message' => '',
                    'data' => [
                        'accounts' => $linked_accounts_data['accounts'],
                        'link_type_info' => $link_type_info,
                        'link_types_map' => $linked_accounts_data['link_types_map'],
                    ],
                ]);
                break;

            case 'link_accounts':
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $account_id_1 = isset($input['account_id_1']) ? (int)$input['account_id_1'] : 0;
                $account_id_2 = isset($input['account_id_2']) ? (int)$input['account_id_2'] : 0;
                $company_id = isset($input['company_id']) ? (int)$input['company_id'] : 0;
                $link_type = isset($input['link_type']) ? $input['link_type'] : 'bidirectional';
                $source_account_id = isset($input['source_account_id']) ? (int)$input['source_account_id'] : null;
                if (!$account_id_1 || !$account_id_2 || !$company_id) {
                    throw new Exception('缺少必要参数');
                }
                if ($account_id_1 === $account_id_2) {
                    throw new Exception('不能关联同一个账户');
                }
                if (!in_array($link_type, ['bidirectional', 'unidirectional'])) {
                    $link_type = 'bidirectional';
                }
                if ($link_type === 'unidirectional' && !$source_account_id) {
                    throw new Exception('单向连接必须指定发起账户');
                }
                if ($account_id_1 > $account_id_2) {
                    [$account_id_1, $account_id_2] = [$account_id_2, $account_id_1];
                }
                if (!linkAccountBelongsToCompany($pdo, $account_id_1, $company_id)) {
                    throw new Exception('账户1不属于该公司');
                }
                if (!linkAccountBelongsToCompany($pdo, $account_id_2, $company_id)) {
                    throw new Exception('账户2不属于该公司');
                }
                linkAccountsUpsert($pdo, $account_id_1, $account_id_2, $company_id, $link_type, $source_account_id);
                echo json_encode(['success' => true, 'message' => '账户关联成功', 'data' => null]);
                break;

            case 'unlink_accounts':
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $account_id_1 = isset($input['account_id_1']) ? (int)$input['account_id_1'] : 0;
                $account_id_2 = isset($input['account_id_2']) ? (int)$input['account_id_2'] : 0;
                $company_id = isset($input['company_id']) ? (int)$input['company_id'] : 0;
                if (!$account_id_1 || !$account_id_2 || !$company_id) {
                    throw new Exception('缺少必要参数');
                }
                if ($account_id_1 > $account_id_2) {
                    [$account_id_1, $account_id_2] = [$account_id_2, $account_id_1];
                }
                unlinkAccounts($pdo, $account_id_1, $account_id_2, $company_id);
                echo json_encode(['success' => true, 'message' => '账户关联已移除', 'data' => null]);
                break;

            case 'get_all_linked_accounts':
                $account_id = isset($_GET['account_id']) ? (int)$_GET['account_id'] : 0;
                $company_id = isset($_GET['company_id']) ? (int)$_GET['company_id'] : 0;
                if (!$account_id || !$company_id) {
                    throw new Exception('缺少必要参数');
                }
                $linked_accounts = getLinkedAccountsForMember($pdo, $account_id, $company_id);
                $account_ids = array_column($linked_accounts, 'id');
                if (!in_array($account_id, $account_ids)) {
                    $current_account = getAccountById($pdo, $account_id);
                    if ($current_account) {
                        array_unshift($linked_accounts, $current_account);
                    }
                } else {
                    $current_index = array_search($account_id, $account_ids);
                    if ($current_index !== false) {
                        $current_account = $linked_accounts[$current_index];
                        unset($linked_accounts[$current_index]);
                        array_unshift($linked_accounts, $current_account);
                        $linked_accounts = array_values($linked_accounts);
                    }
                }
                echo json_encode(['success' => true, 'message' => '', 'data' => $linked_accounts]);
                break;

            case 'update_link_type':
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $account_id_1 = isset($input['account_id_1']) ? (int)$input['account_id_1'] : 0;
                $account_id_2 = isset($input['account_id_2']) ? (int)$input['account_id_2'] : 0;
                $company_id = isset($input['company_id']) ? (int)$input['company_id'] : 0;
                $link_type = isset($input['link_type']) ? $input['link_type'] : 'bidirectional';
                $source_account_id = isset($input['source_account_id']) ? (int)$input['source_account_id'] : null;
                if (!$account_id_1 || !$account_id_2 || !$company_id) {
                    throw new Exception('缺少必要参数');
                }
                if (!in_array($link_type, ['bidirectional', 'unidirectional'])) {
                    $link_type = 'bidirectional';
                }
                if ($account_id_1 > $account_id_2) {
                    [$account_id_1, $account_id_2] = [$account_id_2, $account_id_1];
                }
                updateLinkType($pdo, $account_id_1, $account_id_2, $company_id, $link_type, $source_account_id);
                echo json_encode(['success' => true, 'message' => '连接类型更新成功', 'data' => null]);
                break;

            default:
                throw new Exception('无效的操作');
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '数据库错误: ' . $e->getMessage(), 'data' => null]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => $e->getMessage(), 'data' => null]);
    }
}

// ---------- 数据库与业务辅助函数 ----------

function linkAccountBelongsToCompany(PDO $pdo, int $account_id, int $company_id): bool {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM account_company WHERE account_id = ? AND company_id = ?");
    $stmt->execute([$account_id, $company_id]);
    return $stmt->fetchColumn() > 0;
}

function linkAccountsUpsert(PDO $pdo, int $account_id_1, int $account_id_2, int $company_id, string $link_type, ?int $source_account_id): void {
    $stmt = $pdo->prepare("SELECT id FROM account_link WHERE account_id_1 = ? AND account_id_2 = ? AND company_id = ?");
    $stmt->execute([$account_id_1, $account_id_2, $company_id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    $source = $link_type === 'unidirectional' ? $source_account_id : null;
    if ($existing) {
        $updateStmt = $pdo->prepare("UPDATE account_link SET link_type = ?, source_account_id = ? WHERE id = ?");
        $updateStmt->execute([$link_type, $source, $existing['id']]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO account_link (account_id_1, account_id_2, company_id, link_type, source_account_id) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$account_id_1, $account_id_2, $company_id, $link_type, $source]);
    }
}

function unlinkAccounts(PDO $pdo, int $account_id_1, int $account_id_2, int $company_id): void {
    $stmt = $pdo->prepare("DELETE FROM account_link WHERE account_id_1 = ? AND account_id_2 = ? AND company_id = ?");
    $stmt->execute([$account_id_1, $account_id_2, $company_id]);
}

function updateLinkType(PDO $pdo, int $account_id_1, int $account_id_2, int $company_id, string $link_type, ?int $source_account_id): void {
    $stmt = $pdo->prepare("UPDATE account_link SET link_type = ?, source_account_id = ? WHERE account_id_1 = ? AND account_id_2 = ? AND company_id = ?");
    $stmt->execute([$link_type, $link_type === 'unidirectional' ? $source_account_id : null, $account_id_1, $account_id_2, $company_id]);
}

function getAccountById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function getLinkTypeInfo($pdo, $account_id, $company_id) {
    $check_column_stmt = $pdo->query("SHOW COLUMNS FROM account_link LIKE 'link_type'");
    $has_link_type = $check_column_stmt->rowCount() > 0;
    if (!$has_link_type) {
        return ['link_type' => 'bidirectional', 'has_unidirectional' => false];
    }
    $stmt = $pdo->prepare("SELECT link_type, source_account_id FROM account_link WHERE (account_id_1 = ? OR account_id_2 = ?) AND company_id = ?");
    $stmt->execute([$account_id, $account_id, $company_id]);
    $links = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($links)) {
        return ['link_type' => 'bidirectional', 'has_unidirectional' => false];
    }
    $has_bidirectional = false;
    $has_unidirectional_as_source = false;
    $has_unidirectional_as_target = false;
    foreach ($links as $link) {
        if ($link['link_type'] === 'bidirectional') {
            $has_bidirectional = true;
        } elseif ($link['link_type'] === 'unidirectional') {
            if (isset($link['source_account_id']) && (int)$link['source_account_id'] == $account_id) {
                $has_unidirectional_as_source = true;
            } else {
                $has_unidirectional_as_target = true;
            }
        }
    }
    if ($has_bidirectional) {
        return ['link_type' => 'bidirectional', 'has_unidirectional' => $has_unidirectional_as_source || $has_unidirectional_as_target];
    }
    if ($has_unidirectional_as_source) {
        return ['link_type' => 'unidirectional', 'has_unidirectional' => true];
    }
    return ['link_type' => 'bidirectional', 'has_unidirectional' => false];
}

function getAllLinkedAccountsForDisplayWithType($pdo, $account_id, $company_id) {
    $linked_data = [];
    $link_types_map = [];
    $check_column_stmt = $pdo->query("SHOW COLUMNS FROM account_link LIKE 'link_type'");
    $has_link_type = $check_column_stmt->rowCount() > 0;
    if ($has_link_type) {
        $stmt = $pdo->prepare("
            SELECT account_id_2 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_1 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
            UNION
            SELECT account_id_1 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_2 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
        ");
        $stmt->execute([$account_id, $company_id, $account_id, $account_id, $company_id, $account_id]);
        $linked_data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($linked_data as $row) {
            $linked_id = $row['linked_id'];
            if ($linked_id != $account_id) {
                $link_types_map[$linked_id] = $row['link_type'];
            }
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT account_id_2 AS linked_id FROM account_link WHERE account_id_1 = ? AND company_id = ?
            UNION
            SELECT account_id_1 AS linked_id FROM account_link WHERE account_id_2 = ? AND company_id = ?
        ");
        $stmt->execute([$account_id, $company_id, $account_id, $company_id]);
        $linked_ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($linked_ids as $linked_id) {
            if ($linked_id != $account_id) {
                $link_types_map[$linked_id] = 'bidirectional';
            }
        }
    }
    $linked_ids = array_keys($link_types_map);
    $result = [];
    if (!empty($linked_ids)) {
        $placeholders = str_repeat('?,', count($linked_ids) - 1) . '?';
        $stmt = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id IN ($placeholders) ORDER BY account_id ASC");
        $stmt->execute(array_values($linked_ids));
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    return ['accounts' => $result, 'link_types_map' => $link_types_map];
}

function getAllLinkedAccountsForDisplay($pdo, $account_id, $company_id) {
    $result = getAllLinkedAccountsForDisplayWithType($pdo, $account_id, $company_id);
    return $result['accounts'];
}

function getLinkedAccounts($pdo, $account_id, $company_id) {
    $visited = [];
    $result = [];
    $queue = [$account_id];
    while (!empty($queue)) {
        $current_id = array_shift($queue);
        if (isset($visited[$current_id])) {
            continue;
        }
        $visited[$current_id] = true;
        $stmt = $pdo->prepare("
            SELECT account_id_2 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_1 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND (source_account_id = ? OR source_account_id = account_id_2)))
            UNION
            SELECT account_id_1 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_2 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND (source_account_id = ? OR source_account_id = account_id_1)))
        ");
        $stmt->execute([$current_id, $company_id, $current_id, $current_id, $company_id, $current_id]);
        $linked_data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($linked_data as $row) {
            $linked_id = $row['linked_id'];
            if (!isset($visited[$linked_id])) {
                $visited[$linked_id] = true;
                if ($row['link_type'] === 'bidirectional') {
                    $queue[] = $linked_id;
                }
            }
        }
    }
    $linked_ids = array_filter(array_keys($visited), function ($id) use ($account_id) {
        return $id != $account_id;
    });
    if (!empty($linked_ids)) {
        $placeholders = str_repeat('?,', count($linked_ids) - 1) . '?';
        $stmt = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id IN ($placeholders) ORDER BY account_id ASC");
        $stmt->execute(array_values($linked_ids));
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    return $result;
}

function getLinkedAccountsForMember($pdo, $account_id, $company_id) {
    $account_id = (int) $account_id;
    $company_id = (int) $company_id;
    $visited = [];
    $result = [];
    $queue = [$account_id];
    while (!empty($queue)) {
        $current_id = (int) array_shift($queue);
        if (isset($visited[$current_id])) {
            continue;
        }
        $visited[$current_id] = true;
        $stmt = $pdo->prepare("
            SELECT account_id_2 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_1 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
            UNION
            SELECT account_id_1 AS linked_id, link_type, source_account_id
            FROM account_link WHERE account_id_2 = ? AND company_id = ?
            AND (link_type = 'bidirectional' OR (link_type = 'unidirectional' AND source_account_id = ?))
        ");
        $stmt->execute([$current_id, $company_id, $current_id, $current_id, $company_id, $current_id]);
        $linked_data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($linked_data as $row) {
            $linked_id = (int) $row['linked_id'];
            if (!isset($visited[$linked_id])) {
                $visited[$linked_id] = true;
                if ($row['link_type'] === 'bidirectional') {
                    $queue[] = $linked_id;
                }
            }
        }
    }
    $linked_ids = array_filter(array_keys($visited), function ($id) use ($account_id) {
        return (int) $id !== $account_id;
    });
    if (!empty($linked_ids)) {
        $placeholders = str_repeat('?,', count($linked_ids) - 1) . '?';
        $stmt = $pdo->prepare("SELECT id, account_id, name FROM account WHERE id IN ($placeholders) ORDER BY account_id ASC");
        $stmt->execute(array_values($linked_ids));
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    return $result;
}