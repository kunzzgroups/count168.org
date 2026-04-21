<?php
/**
 * 客户报表 API：按公司、账户、日期、货币返回 Win/Lose 报表
 * 路径: api/reports/customer_report_api.php
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../permissions.php';
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行

function resolveCompanyId(PDO $pdo): int {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $requested = (int) $_GET['company_id'];
        $role = strtolower($_SESSION['role'] ?? '');
        if ($role === 'owner') {
            $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$requested, $ownerId]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该公司');
        }
        if (isset($_SESSION['company_id']) && (int) $_SESSION['company_id'] === $requested) {
            return $requested;
        }
        throw new Exception('无权访问该公司');
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    return (int) $_SESSION['company_id'];
}

function tableExists(PDO $pdo, string $tableName): bool {
    $stmt = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($tableName));
    return $stmt && $stmt->rowCount() > 0;
}

function columnExists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->query("SHOW COLUMNS FROM `$table` LIKE " . $pdo->quote($column));
    return $stmt && $stmt->rowCount() > 0;
}

function getAccountsForReport(PDO $pdo, int $companyId, string $accountIdFilter): array {
    $useAccountCompany = tableExists($pdo, 'account_company');
    if ($useAccountCompany) {
        $sql = "SELECT a.id, a.account_id, a.name
                FROM account a
                INNER JOIN account_company ac ON a.id = ac.account_id
                WHERE ac.company_id = ?";
    } else {
        $sql = "SELECT id, account_id, name FROM account WHERE company_id = ?";
    }
    $params = [$companyId];
    if ($accountIdFilter !== '') {
        $params[] = (int) $accountIdFilter;
        $sql .= $useAccountCompany ? " AND a.id = ?" : " AND id = ?";
    }
    $sql .= $useAccountCompany ? " ORDER BY a.account_id ASC" : " ORDER BY account_id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getAccountCurrencies(PDO $pdo, int $accountId): array {
    if (tableExists($pdo, 'account_currency')) {
        $stmt = $pdo->prepare("SELECT c.id AS currency_id, c.code AS currency_code
                              FROM account_currency ac
                              INNER JOIN currency c ON ac.currency_id = c.id
                              WHERE ac.account_id = ? ORDER BY ac.created_at ASC");
        $stmt->execute([$accountId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    if (columnExists($pdo, 'account', 'currency_id')) {
        $stmt = $pdo->prepare("SELECT c.id AS currency_id, c.code AS currency_code
                              FROM account a
                              INNER JOIN currency c ON a.currency_id = c.id
                              WHERE a.id = ?");
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? [$row] : [];
    }
    return [];
}

function applyCurrencyFilter(array $currencyList, string $filterCodes): array {
    if ($filterCodes === '') {
        return $currencyList;
    }
    $codes = array_map('strtoupper', array_map('trim', explode(',', $filterCodes)));
    return array_filter($currencyList, function ($c) use ($codes) {
        return in_array(strtoupper($c['currency_code']), $codes);
    });
}

function getWinLoseByCurrency(PDO $pdo, int $accountId, int $currencyId, string $dateFrom, string $dateTo): array {
    $sql = "SELECT
                COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total,
                COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN dcd.processed_amount ELSE 0 END), 0) AS lose_total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dcd.currency_id = ?
              AND dc.capture_date BETWEEN ? AND ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$accountId, $currencyId, $dateFrom, $dateTo]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return [
        'win' => (float) ($row['win_total'] ?? 0),
        'lose' => (float) ($row['lose_total'] ?? 0)
    ];
}

function getWinLoseNoCurrency(PDO $pdo, int $accountId, string $dateFrom, string $dateTo): array {
    $sql = "SELECT
                COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total,
                COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN dcd.processed_amount ELSE 0 END), 0) AS lose_total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dc.capture_date BETWEEN ? AND ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$accountId, $dateFrom, $dateTo]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return [
        'win' => (float) ($row['win_total'] ?? 0),
        'lose' => (float) ($row['lose_total'] ?? 0)
    ];
}

function buildReportData(PDO $pdo, int $companyId, string $accountId, string $dateFrom, string $dateTo, bool $showAll, string $currencyFilter): array {
    $accounts = getAccountsForReport($pdo, $companyId, $accountId);
    $reportData = [];
    $totalWin = 0.0;
    $totalLose = 0.0;

    foreach ($accounts as $account) {
        $accId = (int) $account['id'];
        $allCurrencies = getAccountCurrencies($pdo, $accId);
        $currencyList = applyCurrencyFilter($allCurrencies, $currencyFilter);

        if (!empty($currencyList)) {
            foreach ($currencyList as $cur) {
                $wl = getWinLoseByCurrency($pdo, $accId, (int) $cur['currency_id'], $dateFrom, $dateTo);
                if (!$showAll && $wl['win'] == 0 && $wl['lose'] == 0) {
                    continue;
                }
                $totalWin += $wl['win'];
                $totalLose += $wl['lose'];
                $reportData[] = [
                    'id' => $account['id'],
                    'account_id' => $account['account_id'],
                    'name' => $account['name'],
                    'currency' => $cur['currency_code'],
                    'win' => $wl['win'],
                    'lose' => $wl['lose']
                ];
            }
        } elseif (!empty($allCurrencies)) {
            continue;
        } else {
            if ($currencyFilter !== '') {
                continue;
            }
            $wl = getWinLoseNoCurrency($pdo, $accId, $dateFrom, $dateTo);
            if (!$showAll && $wl['win'] == 0 && $wl['lose'] == 0) {
                continue;
            }
            $totalWin += $wl['win'];
            $totalLose += $wl['lose'];
            $reportData[] = [
                'id' => $account['id'],
                'account_id' => $account['account_id'],
                'name' => $account['name'],
                'currency' => null,
                'win' => $wl['win'],
                'lose' => $wl['lose']
            ];
        }
    }

    return [$reportData, $totalWin, $totalLose];
}

function jsonResponse(bool $success, string $message, $data = null, array $extra = []): void {
    $out = [
        'success' => $success,
        'message' => $message,
        'data' => $data
    ];
    foreach ($extra as $k => $v) {
        $out[$k] = $v;
    }
    echo json_encode($out);
}

try {
    $companyId = resolveCompanyId($pdo);

    if (!checkCompanyCategoryPermission($pdo, $companyId, 'Games')) {
        throw new Exception('Unauthorized permission category');
    }

    $dateFrom = trim($_GET['date_from'] ?? '');
    $dateTo = trim($_GET['date_to'] ?? '');
    if ($dateFrom === '' || $dateTo === '') {
        http_response_code(400);
        jsonResponse(false, '开始日期和结束日期不能为空', null);
        return;
    }

    $dateFromObj = DateTime::createFromFormat('Y-m-d', $dateFrom);
    $dateToObj = DateTime::createFromFormat('Y-m-d', $dateTo);
    if (!$dateFromObj || !$dateToObj) {
        http_response_code(400);
        jsonResponse(false, '日期格式不正确，请使用 YYYY-MM-DD 格式', null);
        return;
    }
    if ($dateFromObj > $dateToObj) {
        http_response_code(400);
        jsonResponse(false, '开始日期不能大于结束日期', null);
        return;
    }

    $accountId = trim($_GET['account_id'] ?? '');
    $showAll = filter_var($_GET['show_all'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $currencyFilter = trim($_GET['currency'] ?? '');

    list($reportData, $totalWin, $totalLose) = buildReportData($pdo, $companyId, $accountId, $dateFrom, $dateTo, $showAll, $currencyFilter);

    jsonResponse(true, '', $reportData, [
        'total_win' => $totalWin,
        'total_lose' => $totalLose,
        'date_from' => $dateFrom,
        'date_to' => $dateTo
    ]);

} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('Customer Report API Error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '数据库查询失败', null);
}