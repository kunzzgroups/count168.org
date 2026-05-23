<?php
/**
 * Approval Inbox API (Manager+)
 * 返回当前公司所有待批准的审批交易（approval_status = PENDING）
 * 路径: api/transactions/contra_inbox_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../includes/money_decimal.php';

header('Content-Type: application/json');

function isManagerOrAboveRole(string $role): bool {
    return in_array(strtolower(trim($role)), ['manager', 'admin', 'owner'], true);
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

function resolveContraCompanyId(PDO $pdo): int {
    $userRole = strtolower($_SESSION['role'] ?? '');
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $rid = (int)$_GET['company_id'];
        if ($userRole === 'owner') {
            $oid = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$rid, $oid]);
            if ($stmt->fetchColumn()) return $rid;
            throw new Exception('无权访问该公司');
        }
        if (isset($_SESSION['company_id']) && (int)$_SESSION['company_id'] === $rid) return $rid;
        throw new Exception('无权访问该公司');
    }
    if (!isset($_SESSION['company_id'])) throw new Exception('缺少公司信息');
    return (int)$_SESSION['company_id'];
}

function fetchPendingContras(PDO $pdo, int $companyId): array {
    $hasCurrencyId = tableHasColumn($pdo, 'transactions', 'currency_id');
    $hasCreatedAt = tableHasColumn($pdo, 'transactions', 'created_at');
    $sql = "SELECT t.id, DATE_FORMAT(t.transaction_date, '%d/%m/%Y') AS transaction_date, t.amount,
            COALESCE(t.description, '') AS description,
            to_acc.account_id AS to_account_code, to_acc.name AS to_account_name,
            from_acc.account_id AS from_account_code, from_acc.name AS from_account_name,
            COALESCE(u.login_id, o.owner_code, '-') AS submitted_by";
    $sql .= $hasCurrencyId ? ", UPPER(COALESCE(c.code, '')) AS currency" : ", '' AS currency";
    $sql .= " FROM transactions t
            LEFT JOIN account to_acc ON t.account_id = to_acc.id
            LEFT JOIN account from_acc ON t.from_account_id = from_acc.id
            LEFT JOIN user u ON t.created_by = u.id
            LEFT JOIN owner o ON t.created_by_owner = o.id";
    if ($hasCurrencyId) $sql .= " LEFT JOIN currency c ON t.currency_id = c.id";
    $orderBy = $hasCreatedAt
        ? " ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC"
        : " ORDER BY t.transaction_date ASC, t.id ASC";
    $sql .= " WHERE t.company_id = ? AND UPPER(TRIM(COALESCE(t.approval_status, ''))) = 'PENDING'
              AND t.transaction_type IN ('CONTRA','PAYMENT','RECEIVE','CLAIM','CLEAR','ADJUSTMENT','PROFIT','WIN','LOSE')"
        . $orderBy;
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map(function ($r) {
        return [
            'id' => (int)$r['id'],
            'transaction_date' => $r['transaction_date'] ?? '',
            'from_account_code' => $r['from_account_code'] ?? null,
            'from_account_name' => $r['from_account_name'] ?? null,
            'to_account_code' => $r['to_account_code'] ?? null,
            'to_account_name' => $r['to_account_name'] ?? null,
            'currency' => $r['currency'] ?? '',
            'amount' => money_out($r['amount'] ?? '0'),
            'submitted_by' => $r['submitted_by'] ?? '-',
            'description' => $r['description'] ?? '',
        ];
    }, $rows);
}

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('请先登录', 401);
        exit;
    }
    $userRole = strtolower($_SESSION['role'] ?? '');
    $userType = strtolower($_SESSION['user_type'] ?? 'user');
    if ($userType === 'member' || !isManagerOrAboveRole($userRole)) {
        api_error('无权访问', 403);
        exit;
    }
    if (!tableHasColumn($pdo, 'transactions', 'approval_status')) {
        api_success([]);
        exit;
    }
    $companyId = resolveContraCompanyId($pdo);
    $data = fetchPendingContras($pdo, $companyId);
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'message' => '', 'data' => $data], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    api_error($e->getMessage(), 400);
}