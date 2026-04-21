<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function get_bearer_token(): ?string
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

    if ($authHeader === '') {
        return null;
    }

    if (!preg_match('/^\s*Bearer\s+(.+)\s*$/i', $authHeader, $matches)) {
        return null;
    }

    $token = trim((string) ($matches[1] ?? ''));
    return $token === '' ? null : $token;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    respond_json(405, [
        'success' => false,
        'error' => '仅支持 GET',
        'error_code' => 'HTTP_METHOD_NOT_ALLOWED',
    ]);
}

$claims = api_token_verify(get_bearer_token());
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
        'error_code' => 'DASHBOARD_COMPANY_INVALID',
    ]);
}

$mysqli = mysqli_bootstrap();

$sql = <<<'SQL'
SELECT
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('WIN', 'INCOME', 'CREDIT', 'RECEIVE') THEN t.amount ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('LOSE', 'EXPENSE', 'DEBIT', 'PAY') THEN t.amount ELSE 0 END), 0) AS total_expense,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('WIN', 'INCOME', 'CREDIT', 'RECEIVE')
                      AND YEAR(t.transaction_date) = YEAR(CURDATE())
                      AND MONTH(t.transaction_date) = MONTH(CURDATE())
                      THEN t.amount ELSE 0 END), 0) AS month_income,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('LOSE', 'EXPENSE', 'DEBIT', 'PAY')
                      AND YEAR(t.transaction_date) = YEAR(CURDATE())
                      AND MONTH(t.transaction_date) = MONTH(CURDATE())
                      THEN t.amount ELSE 0 END), 0) AS month_expense
FROM transactions t
WHERE t.company_id = ?
SQL;

$stmt = $mysqli->prepare($sql);
if ($stmt === false) {
    respond_json(500, [
        'success' => false,
        'error' => '查询准备失败',
        'error_code' => 'DASHBOARD_DB_PREPARE_FAILED',
    ]);
}

$stmt->bind_param('i', $companyId);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();
$stmt->close();

$totalIncome = round((float) ($row['total_income'] ?? 0), 2);
$totalExpense = round((float) ($row['total_expense'] ?? 0), 2);
$monthIncome = round((float) ($row['month_income'] ?? 0), 2);
$monthExpense = round((float) ($row['month_expense'] ?? 0), 2);
$currentBalance = round($totalIncome - $totalExpense, 2);

respond_json(200, [
    'success' => true,
    'data' => [
        'balance' => $currentBalance,
        'month_income' => $monthIncome,
        'month_expense' => $monthExpense,
    ],
]);
