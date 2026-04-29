<?php
/**
 * Domain Report API - 按 Process 汇总 Domain 报表（Turnover / Win / Lose）
 * 路径: api/reports/domain_report_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../permissions.php';
require_once __DIR__ . '/../includes/money_decimal.php';

function domainReportMoneyOut($value): string {
    return money_out($value ?? '0');
}

/**
 * 标准 JSON 响应：success, message, data
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
 * 解析并验证请求中的 company_id
 */
function getCompanyIdForRequest(PDO $pdo) {
    if (isset($_GET['company_id']) && $_GET['company_id'] !== '') {
        $requestedCompanyId = (int)$_GET['company_id'];
        $userRole = strtolower($_SESSION['role'] ?? '');

        if ($userRole === 'owner') {
            $ownerId = $_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? null;
            if (!$ownerId) {
                throw new Exception('缺少 Owner 信息');
            }
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ? LIMIT 1");
            $stmt->execute([$requestedCompanyId, $ownerId]);
            if (!$stmt->fetchColumn()) {
                throw new Exception('无权访问该公司');
            }
            return $requestedCompanyId;
        }

        if (!isset($_SESSION['company_id'])) {
            throw new Exception('缺少公司信息');
        }
        if ((int)$_SESSION['company_id'] !== $requestedCompanyId) {
            throw new Exception('无权访问该公司');
        }
        return $requestedCompanyId;
    }

    if (!isset($_SESSION['company_id'])) {
        throw new Exception('缺少公司信息');
    }
    return (int)$_SESSION['company_id'];
}

/**
 * 查询 Process 列表（id, process_id, description）
 */
function fetchProcesses(PDO $pdo, int $company_id) {
    $stmt = $pdo->prepare("
        SELECT p.id, p.process_id, d.name AS description
        FROM process p
        LEFT JOIN description d ON p.description_id = d.id
        WHERE p.company_id = ?
        ORDER BY p.process_id ASC
    ");
    $stmt->execute([$company_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 格式化为前端下拉所需结构
 */
function formatProcesses(array $processes) {
    return array_map(function ($row) {
        $label = $row['process_id'];
        if (!empty($row['description'])) {
            $label .= ' (' . $row['description'] . ')';
        }
        return [
            'id' => (int)$row['id'],
            'process' => $row['process_id'],
            'description' => $row['description'],
            'display_text' => $label
        ];
    }, $processes);
}

/**
 * 查询 Domain 报表原始行（按 Process 汇总 Turnover / Win / Lose）
 * 以 process 为主表，无数据的 process 也显示（0）；过滤 dcd.company_id 保证 Win/Lose 只计当前公司
 */
function fetchDomainReportRows(PDO $pdo, int $company_id, string $date_from, string $date_to, ?int $process_id) {
    $sql = "
        SELECT 
            p.id AS process_pk,
            p.process_id,
            d.name AS description_name,
            COALESCE(SUM(ABS(dcd.processed_amount)), 0) AS turnover_total,
            COALESCE(SUM(CASE WHEN dcd.processed_amount > 0 THEN dcd.processed_amount ELSE 0 END), 0) AS win_total,
            COALESCE(SUM(CASE WHEN dcd.processed_amount < 0 THEN ABS(dcd.processed_amount) ELSE 0 END), 0) AS lose_total
        FROM process p
        LEFT JOIN description d ON p.description_id = d.id
        LEFT JOIN data_captures dc ON dc.process_id = p.id
          AND dc.company_id = ?
          AND dc.capture_date BETWEEN ? AND ?
        LEFT JOIN data_capture_details dcd ON dcd.capture_id = dc.id
          AND dcd.company_id = ?
        WHERE p.company_id = ?
    ";
    $params = [$company_id, $date_from, $date_to, $company_id, $company_id];
    if ($process_id !== null && $process_id > 0) {
        $sql .= " AND p.id = ? ";
        $params[] = $process_id;
    }
    $sql .= " GROUP BY p.id, p.process_id, d.name ORDER BY p.process_id ASC ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 将原始行转为报表数据并计算合计
 */
function buildReportResult(array $rows, string $date_from, string $date_to) {
    $report_data = [];
    $total_turnover = '0.00000000';
    $total_win = '0.00000000';
    $total_lose = '0.00000000';

    foreach ($rows as $row) {
        $turnover = domainReportMoneyOut($row['turnover_total'] ?? '0');
        $win = domainReportMoneyOut($row['win_total'] ?? '0');
        $lose = domainReportMoneyOut($row['lose_total'] ?? '0');
        $winLose = domainReportMoneyOut(money_sub($win, $lose));

        $report_data[] = [
            'process_id' => (int)$row['process_pk'],
            'process' => $row['process_id'],
            'description' => $row['description_name'],
            'turnover' => $turnover,
            'win' => $win,
            'lose' => $lose,
            'win_lose' => $winLose
        ];

        $total_turnover = money_add($total_turnover, $turnover);
        $total_win = money_add($total_win, $win);
        $total_lose = money_add($total_lose, $lose);
    }

    return [
        'report_data' => $report_data,
        'totals' => [
            'turnover' => domainReportMoneyOut($total_turnover),
            'win' => domainReportMoneyOut($total_win),
            'lose' => domainReportMoneyOut($total_lose),
            'win_lose' => domainReportMoneyOut(money_sub($total_win, $total_lose))
        ],
        'date_from' => $date_from,
        'date_to' => $date_to
    ];
}

try {
    $action = isset($_GET['action']) ? trim($_GET['action']) : '';
    $company_id = getCompanyIdForRequest($pdo);

    if (!checkCompanyCategoryPermission($pdo, $company_id, 'Games')) {
        throw new Exception('Unauthorized permission category');
    }

    if ($action === 'processes') {
        $processes = fetchProcesses($pdo, $company_id);
        $formatted = formatProcesses($processes);
        echo json_encode([
            'success' => true,
            'message' => 'OK',
            'data' => $formatted
        ]);
        exit;
    }

    $date_from = isset($_GET['date_from']) ? trim($_GET['date_from']) : '';
    $date_to = isset($_GET['date_to']) ? trim($_GET['date_to']) : '';
    $process_id = isset($_GET['process_id']) ? (int)$_GET['process_id'] : null;

    if (empty($date_from) || empty($date_to)) {
        throw new Exception('开始日期和结束日期不能为空');
    }

    $date_from_obj = DateTime::createFromFormat('Y-m-d', $date_from);
    $date_to_obj = DateTime::createFromFormat('Y-m-d', $date_to);
    if (!$date_from_obj || !$date_to_obj) {
        throw new Exception('日期格式不正确，请使用 YYYY-MM-DD');
    }
    if ($date_from_obj > $date_to_obj) {
        throw new Exception('开始日期不能大于结束日期');
    }

    $rows = fetchDomainReportRows($pdo, $company_id, $date_from, $date_to, $process_id);
    $result = buildReportResult($rows, $date_from, $date_to);

    echo json_encode([
        'success' => true,
        'message' => 'OK',
        'data' => $result['report_data'],
        'totals' => $result['totals'],
        'date_from' => $result['date_from'],
        'date_to' => $result['date_to']
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    error_log('Domain Report API Error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => '数据库查询失败',
        'data' => null
    ]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null
    ]);
}