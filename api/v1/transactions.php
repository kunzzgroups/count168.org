<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function tx_get_bearer_token(): ?string
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

function tx_has_column(mysqli $mysqli, string $column): bool
{
    $safe = $mysqli->real_escape_string($column);
    $result = $mysqli->query("SHOW COLUMNS FROM transactions LIKE '{$safe}'");
    if ($result === false) {
        return false;
    }
    $has = $result->num_rows > 0;
    $result->free();
    return $has;
}

function tx_parse_date(string $dateRaw): ?string
{
    $dateRaw = trim($dateRaw);
    if ($dateRaw === '') {
        return null;
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateRaw) === 1) {
        return $dateRaw;
    }

    $dt = DateTime::createFromFormat('d/m/Y', $dateRaw);
    if ($dt instanceof DateTime) {
        return $dt->format('Y-m-d');
    }

    $dt2 = DateTime::createFromFormat('d-m-Y', $dateRaw);
    if ($dt2 instanceof DateTime) {
        return $dt2->format('Y-m-d');
    }

    return null;
}

$claims = api_token_verify(tx_get_bearer_token());
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
        'error_code' => 'TRANSACTION_COMPANY_INVALID',
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mysqli = mysqli_bootstrap();

$hasDeletedAt = tx_has_column($mysqli, 'deleted_at');
$hasDeletedBy = tx_has_column($mysqli, 'deleted_by');
$hasIsDeleted = tx_has_column($mysqli, 'is_deleted');
$hasStatus = tx_has_column($mysqli, 'status');
$hasCategory = tx_has_column($mysqli, 'category');
$hasDescription = tx_has_column($mysqli, 'description');
$hasRemark = tx_has_column($mysqli, 'remark');
$hasUpdatedAt = tx_has_column($mysqli, 'updated_at');
$hasCreatedAt = tx_has_column($mysqli, 'created_at');

if ($method === 'GET') {
    $where = ['t.company_id = ?'];
    if ($hasDeletedAt) {
        $where[] = 't.deleted_at IS NULL';
    }
    if ($hasIsDeleted) {
        $where[] = 'COALESCE(t.is_deleted, 0) = 0';
    }
    if ($hasStatus) {
        $where[] = "COALESCE(t.status, 'active') <> 'deleted'";
    }

    $remarkExpr = $hasRemark
        ? "COALESCE(t.remark, '')"
        : ($hasDescription ? "COALESCE(t.description, '')" : "''");
    $categoryExpr = $hasCategory ? "COALESCE(t.category, '')" : "''";

    $sql = "
        SELECT
            t.id,
            DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date,
            LOWER(COALESCE(t.transaction_type, '')) AS type,
            {$categoryExpr} AS category,
            CAST(COALESCE(t.amount, 0) AS DECIMAL(18,2)) AS amount,
            {$remarkExpr} AS remark
        FROM transactions t
        WHERE " . implode(' AND ', $where) . "
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT 200
    ";

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '查询准备失败',
            'error_code' => 'TRANSACTION_LIST_PREPARE_FAILED',
        ]);
    }
    $stmt->bind_param('i', $companyId);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $type = (string) ($row['type'] ?? '');
        $row['type'] = $type === 'income' ? 'income' : ($type === 'expense' ? 'expense' : 'expense');
        $row['amount'] = round((float) ($row['amount'] ?? 0), 2);
        $rows[] = $row;
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

if ($action === 'soft_delete') {
    $id = (int) ($body['id'] ?? 0);
    if ($id <= 0) {
        respond_json(400, [
            'success' => false,
            'error' => '记录 ID 无效',
            'error_code' => 'TRANSACTION_ID_INVALID',
        ]);
    }

    $setParts = [];
    $types = '';
    $params = [];
    if ($hasDeletedAt) {
        $setParts[] = 'deleted_at = NOW()';
    }
    if ($hasDeletedBy) {
        $setParts[] = 'deleted_by = ?';
        $types .= 'i';
        $params[] = $userId;
    }
    if ($hasIsDeleted) {
        $setParts[] = 'is_deleted = 1';
    }
    if ($hasStatus) {
        $setParts[] = "status = 'deleted'";
    }
    if ($hasUpdatedAt) {
        $setParts[] = 'updated_at = NOW()';
    }

    if (count($setParts) === 0) {
        respond_json(500, [
            'success' => false,
            'error' => '当前数据表未配置软删除字段',
            'error_code' => 'TRANSACTION_SOFT_DELETE_NOT_SUPPORTED',
        ]);
    }

    $sql = 'UPDATE transactions SET ' . implode(', ', $setParts) . ' WHERE id = ? AND company_id = ?';
    $types .= 'ii';
    $params[] = $id;
    $params[] = $companyId;

    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        respond_json(500, [
            'success' => false,
            'error' => '删除准备失败',
            'error_code' => 'TRANSACTION_DELETE_PREPARE_FAILED',
        ]);
    }
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected <= 0) {
        respond_json(404, [
            'success' => false,
            'error' => '记录不存在或无权限',
            'error_code' => 'TRANSACTION_NOT_FOUND',
        ]);
    }

    respond_json(200, [
        'success' => true,
        'data' => ['id' => $id],
    ]);
}

$date = tx_parse_date((string) ($body['date'] ?? ''));
$type = strtolower(trim((string) ($body['type'] ?? '')));
$category = trim((string) ($body['category'] ?? ''));
$remark = trim((string) ($body['remark'] ?? ''));
$amount = isset($body['amount']) ? (float) $body['amount'] : 0.0;

if ($date === null) {
    respond_json(400, [
        'success' => false,
        'error' => '日期格式无效',
        'error_code' => 'TRANSACTION_DATE_INVALID',
    ]);
}
if ($type !== 'income' && $type !== 'expense') {
    respond_json(400, [
        'success' => false,
        'error' => '类型仅允许 income 或 expense',
        'error_code' => 'TRANSACTION_TYPE_INVALID',
    ]);
}
if ($category === '' || mb_strlen($category) > 100) {
    respond_json(400, [
        'success' => false,
        'error' => '分类不能为空且长度不能超过 100',
        'error_code' => 'TRANSACTION_CATEGORY_INVALID',
    ]);
}
if ($amount <= 0) {
    respond_json(400, [
        'success' => false,
        'error' => '金额必须大于 0',
        'error_code' => 'TRANSACTION_AMOUNT_INVALID',
    ]);
}
if (mb_strlen($remark) > 500) {
    respond_json(400, [
        'success' => false,
        'error' => '备注长度不能超过 500',
        'error_code' => 'TRANSACTION_REMARK_TOO_LONG',
    ]);
}

$columns = ['company_id', 'transaction_date', 'transaction_type', 'amount'];
$types = 'issd';
$values = [$companyId, $date, $type, $amount];

if ($hasCategory) {
    $columns[] = 'category';
    $types .= 's';
    $values[] = $category;
}

if ($hasRemark) {
    $columns[] = 'remark';
    $types .= 's';
    $values[] = $remark;
} elseif ($hasDescription) {
    $columns[] = 'description';
    $types .= 's';
    $values[] = $remark;
}

if ($hasStatus) {
    $columns[] = 'status';
    $types .= 's';
    $values[] = 'active';
}
if ($hasIsDeleted) {
    $columns[] = 'is_deleted';
    $types .= 'i';
    $values[] = 0;
}
if ($hasCreatedAt) {
    $columns[] = 'created_at';
}
if ($hasUpdatedAt) {
    $columns[] = 'updated_at';
}

$placeholders = [];
foreach ($columns as $column) {
    if ($column === 'created_at' || $column === 'updated_at') {
        $placeholders[] = 'NOW()';
    } else {
        $placeholders[] = '?';
    }
}

$sql = 'INSERT INTO transactions (`' . implode('`,`', $columns) . '`) VALUES (' . implode(',', $placeholders) . ')';
$stmt = $mysqli->prepare($sql);
if ($stmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '新增准备失败',
        'error_code' => 'TRANSACTION_CREATE_PREPARE_FAILED',
    ]);
}
$stmt->bind_param($types, ...$values);
$stmt->execute();
$newId = $stmt->insert_id;
$stmt->close();

respond_json(200, [
    'success' => true,
    'data' => ['id' => $newId],
]);
