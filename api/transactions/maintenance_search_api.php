<?php
/**
 * Transaction Maintenance Search API
 * 按日期/Process 查询交易记录（维护页使用）
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

/**
 * 统一 Rate 显示：最多 8 位小数，不补尾零（与 Data Summary / Payment History 一致）
 */
function formatRateForDisplay($rate): ?string
{
    if ($rate === null || $rate === '') {
        return null;
    }
    $rounded = round((float)$rate, 8);
    $text = rtrim(rtrim(number_format($rounded, 8, '.', ''), '0'), '.');
    return $text === '' ? '0' : $text;
}

/**
 * Id_Product 列：与 Transaction History 里 Data Capture 行的 Product 规则一致（history_api.php 678-712），
 * 优先 id_product_sub/main + description，再兜底 id_product、columns_value（与 Summary 行内容来源一致）。
 */
function formatMaintenanceIdProductLikeDataSummary(array $row): string
{
    $idSub = trim((string)($row['id_product_sub'] ?? ''));
    $idMain = trim((string)($row['id_product_main'] ?? ''));
    $idCol = trim((string)($row['id_product'] ?? ''));
    $descSub = isset($row['description_sub']) ? trim((string)$row['description_sub']) : '';
    $descMain = isset($row['description_main']) ? trim((string)$row['description_main']) : '';
    $productType = isset($row['product_type']) ? strtolower(trim((string)$row['product_type'])) : '';

    $product = '';
    $productDescription = null;

    if ($productType === 'sub' && $idSub !== '') {
        $product = $idSub;
        if ($descSub !== '') {
            $productDescription = $descSub;
        }
    } elseif ($idMain !== '') {
        $product = $idMain;
        if ($descMain !== '') {
            $productDescription = $descMain;
        }
    } else {
        $product = $idSub !== '' ? $idSub : ($idMain !== '' ? $idMain : '');
        if ($product === '') {
            $product = $idCol !== '' ? $idCol : 'Data Capture';
        }
        if ($idSub !== '' && $descSub !== '') {
            $productDescription = $descSub;
        } elseif ($descMain !== '') {
            $productDescription = $descMain;
        }
    }

    if ($productDescription !== null && $productDescription !== '') {
        $wrapped = '(' . $productDescription . ')';
        if (stripos($product, $wrapped) === false) {
            $product = $product . ' ' . $wrapped;
        }
    }

    $product = trim($product);
    if ($product === '' || $product === 'Data Capture') {
        if ($idCol !== '') {
            return $idCol;
        }
        $cv = trim((string)($row['columns_value'] ?? ''));
        if ($cv !== '') {
            return $cv;
        }
        return '-';
    }
    return $product;
}

/**
 * 运行时兜底：确保 data_capture_details.rate 至少支持 8 位小数。
 * 避免 Maintenance 页面读取到提交时已被 4 位精度截断的 rate。
 */
function ensureMaintenanceRatePrecision(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM data_capture_details LIKE 'rate'");
        $column = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$column) {
            return;
        }

        $type = strtolower((string)($column['Type'] ?? ''));
        $needsUpgrade = false;
        if (preg_match('/decimal\(\s*\d+\s*,\s*(\d+)\s*\)/i', $type, $matches)) {
            $scale = (int)$matches[1];
            $needsUpgrade = $scale < 8;
        } elseif ($type !== '' && strpos($type, 'decimal') !== 0) {
            $needsUpgrade = true;
        }

        if ($needsUpgrade) {
            $pdo->exec("ALTER TABLE data_capture_details MODIFY COLUMN rate DECIMAL(20,8) NULL");
        }
    } catch (Exception $e) {
        error_log('maintenance_search rate precision ensure warning: ' . $e->getMessage());
    }
}

try {
    // 确保 Rate 精度 schema 已升级
    ensureMaintenanceRatePrecision($pdo);

    // 确定 company_id（支持 owner 指定，多公司切换）
    $company_id = null;
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
            $company_id = $requestedCompanyId;
        } else {
            if (!isset($_SESSION['company_id'])) {
                throw new Exception('缺少公司信息');
            }
            if ($requestedCompanyId !== (int)$_SESSION['company_id']) {
                throw new Exception('无权访问该公司');
            }
            $company_id = $requestedCompanyId;
        }
    } else {
        if (!isset($_SESSION['company_id'])) {
            throw new Exception('缺少公司信息');
        }
        $company_id = (int)$_SESSION['company_id'];
    }
    
    // 参数
    $date_from = $_GET['date_from'] ?? null;
    $date_to   = $_GET['date_to']   ?? null;
    $process   = isset($_GET['process']) && $_GET['process'] !== '' ? trim((string)$_GET['process']) : null; // process.process_id（如 SPORT）或 "SPORT (SPORT)" 或 process 表 id（数字）
    $category  = trim($_GET['category'] ?? $_GET['permission'] ?? ''); // Games|Bank|Loan|Rate|Money，按 category 只显示该部分数据

    // 统一 process 为 process_id（代码）：前端可能传 "SPORT (SPORT)" 或数字 id
    if ($process !== null && $process !== '') {
        if (preg_match('/^\d+$/', $process)) {
            $stmt = $pdo->prepare("SELECT process_id FROM process WHERE id = ? AND company_id = ? LIMIT 1");
            $stmt->execute([(int)$process, $company_id]);
            $res = $stmt->fetchColumn();
            $process = $res !== false ? (string)$res : null;
        } else {
            if (strpos($process, '(') !== false) {
                $process = trim(explode('(', $process)[0]);
            }
            if ($process === '') {
                $process = null;
            }
        }
    }

    if (!$date_from || !$date_to) {
        throw new Exception('日期范围是必填项');
    }

    $date_from_db = date('Y-m-d', strtotime(str_replace('/', '-', $date_from)));
    $date_to_db   = date('Y-m-d', strtotime(str_replace('/', '-', $date_to)));

    $catUpper = strtoupper($category);
    $is_bank_category = ($catUpper === 'BANK');
    $is_loan_rate_money = in_array($catUpper, ['LOAN', 'RATE', 'MONEY'], true);

    // 默认不在 Maintenance - Transaction 中显示已删除的交易记录；
    // 仅当显式传入 include_deleted=1 时，才附加 transactions_deleted / data_captures_deleted 的历史记录
    $includeDeleted = isset($_GET['include_deleted']) && $_GET['include_deleted'] === '1';

    if ($is_loan_rate_money) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }

    $has_source_bank_col = false;
    try {
        $colStmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_id'");
        $has_source_bank_col = $colStmt && $colStmt->rowCount() > 0;
    } catch (PDOException $e) { /* ignore */ }

    $formatted = [];
    $no = 1;

    // ========== 1. 查询 Transaction 数据 ==========
    // 当指定了 Process 时，不查 Transaction（transactions 表无 process 关联），只由下方 Data Capture 按 process 过滤
    if (empty($process)) {
    $where = [];
    $params = [];

    // company 过滤（transactions）
    $where[] = "t.company_id = ?";
    $params[] = $company_id;

    $where[] = "t.transaction_date BETWEEN ? AND ?";
    $params[] = $date_from_db;
    $params[] = $date_to_db;

    if ($category !== '') {
        if ($is_bank_category) {
            if ($has_source_bank_col) {
                $where[] = "t.source_bank_process_id IS NOT NULL AND t.source_bank_process_id != 0";
            } else {
                $where[] = "1 = 0";
            }
        } else {
            if ($has_source_bank_col) {
                $where[] = "(t.source_bank_process_id IS NULL OR t.source_bank_process_id = 0)";
            }
        }
    }

    // Payment / Receive / Contra / Claim / Rate / Clear / 手动 Profit(WIN/LOSE) 等
    // 都通过 Transaction Payment / Payment Maintenance 页面维护，
    // 不在 Maintenance - Transaction 中显示，避免重复。
    $where[] = "t.transaction_type NOT IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'RATE', 'CLEAR', 'WIN', 'LOSE')";

    $whereSql = 'WHERE ' . implode(' AND ', $where);

    // 主查询（未删除）
    $sql = "
        SELECT
            t.id AS transaction_id,
            NULL AS process_id,
            a.account_id,
            fa.account_id AS from_account,
            t.description,
            COALESCE(t.sms, '') AS remark,
            COALESCE(c.code, '') AS currency_code,
            COALESCE(t.amount, 0) AS amount,
            t.transaction_date AS transaction_date,
            DATE_FORMAT(t.created_at, '%d/%m/%Y %H:%i:%s') AS dts_created,
            COALESCE(u.login_id, o.owner_code) AS created_by,
            0 AS is_deleted,
            NULL AS deleted_by,
            NULL AS dts_deleted,
            'transaction' AS data_type
        FROM transactions t
        INNER JOIN account a ON t.account_id = a.id
        LEFT JOIN account fa ON t.from_account_id = fa.id
        LEFT JOIN currency c ON t.currency_id = c.id
        LEFT JOIN user u ON t.created_by = u.id
        LEFT JOIN owner o ON t.created_by_owner = o.id
        $whereSql
        ORDER BY t.transaction_date DESC, t.created_at DESC
    ";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($rows as $row) {
        $amt = $row['amount'] ?? 0;
        $crVal = null;
        $drVal = null;
        if (is_numeric($amt)) {
            if ($amt > 0) {
                $crVal = $amt;
            } elseif ($amt < 0) {
                $drVal = abs($amt);
            } else {
                $crVal = 0;
            }
        }

        $formatted[] = [
            'no' => $no++,
            'transaction_id' => $row['transaction_id'],
            'capture_id' => null,
            'capture_detail_id' => null,
            'process' => $row['process_id'] ?? '-',
            'process_id' => $row['process_id'] ?? null,
            'id_product' => '-',
            'account' => $row['account_id'] ?? '-',
            'from_account' => $row['from_account'] ?? '-',
            'description' => $row['description'] ?? '-',
            'remark' => $row['remark'] ?? '-',
            'source' => null,
            'percent' => null,
            'currency' => $row['currency_code'] ?: '-',
            'rate' => null,
            'cr' => $crVal,
            'dr' => $drVal,
            'transaction_date' => $row['transaction_date'] ?? null,
            'dts_created' => $row['dts_created'] ?? '',
            'created_by' => $row['created_by'] ?? '-',
            'is_deleted' => 0,
            'deleted_by' => null,
            'dts_deleted' => null,
            'data_type' => 'transaction'
        ];
    }
    } // end if (empty($process)) — 指定 Process 时不返回未关联 process 的 Transaction

    // ========== 2. 查询 Data Capture 数据（Bank category 不包含 Data Capture，仅 Transaction）==========
    if (!$is_bank_category) {
    try {
        $captureWhere = [];
        $captureParams = [];

        $captureWhere[] = "dc.company_id = ?";
        $captureParams[] = $company_id;

        $captureWhere[] = "dcd.company_id = ?";
        $captureParams[] = $company_id;

        $captureWhere[] = "dc.capture_date BETWEEN ? AND ?";
        $captureParams[] = $date_from_db;
        $captureParams[] = $date_to_db;

        // Process 过滤（如果指定）
        if ($process) {
            $captureWhere[] = "p.process_id = ?";
            $captureParams[] = $process;
        }

        $captureWhereSql = 'WHERE ' . implode(' AND ', $captureWhere);
        
        $captureSql = "
            SELECT
                dcd.id AS capture_detail_id,
                dc.id AS capture_id,
                p.process_id,
                a.account_id,
                NULL AS from_account,
                COALESCE(d.name, dcd.description_main, dcd.description_sub, dcd.columns_value, 'Data Capture') AS description,
                COALESCE(dc.remark, '') AS remark,
                c.code AS currency_code,
                dcd.processed_amount AS amount,
                dc.capture_date AS transaction_date,
                DATE_FORMAT(dc.created_at, '%d/%m/%Y %H:%i:%s') AS dts_created,
                COALESCE(u.login_id, o.owner_code) AS created_by,
                0 AS is_deleted,
                NULL AS deleted_by,
                NULL AS dts_deleted,
                dcd.source_value,
                dcd.source_percent,
                dcd.rate,
                dcd.id_product,
                dcd.id_product_main,
                dcd.id_product_sub,
                dcd.product_type,
                dcd.description_main,
                dcd.description_sub,
                dcd.columns_value
            FROM data_capture_details dcd
            INNER JOIN data_captures dc ON dcd.capture_id = dc.id
            INNER JOIN process p ON dc.process_id = p.id
            INNER JOIN account a ON dcd.account_id = a.id
            INNER JOIN currency c ON dcd.currency_id = c.id
            LEFT JOIN description d ON p.description_id = d.id
            LEFT JOIN user u ON dc.user_type = 'user' AND dc.created_by = u.id
            LEFT JOIN owner o ON dc.user_type = 'owner' AND dc.created_by = o.id
            $captureWhereSql
            ORDER BY dc.capture_date DESC, dc.created_at DESC, dcd.id DESC
        ";
        
        $captureStmt = $pdo->prepare($captureSql);
        $captureStmt->execute($captureParams);
        $captureRows = $captureStmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($captureRows as $row) {
            $amt = $row['amount'] ?? 0;
            $crVal = null;
            $drVal = null;
            if (is_numeric($amt)) {
                if ($amt > 0) {
                    $crVal = $amt;
                } elseif ($amt < 0) {
                    $drVal = abs($amt);
                } else {
                    // amount === 0: 仍显示该笔 Data Capture 记录，Cr 显示 0.00
                    $crVal = 0;
                }
            }
            
            $rateDisplay = formatRateForDisplay($row['rate'] ?? null);
            $idProductDisplay = formatMaintenanceIdProductLikeDataSummary($row);
            
            $formatted[] = [
                'no' => $no++,
                'transaction_id' => null,
                'capture_id' => $row['capture_id'],
                'capture_detail_id' => $row['capture_detail_id'] ?? null,
                'process' => $row['process_id'] ?? '-',
                'process_id' => $row['process_id'] ?? null,
                'id_product' => $idProductDisplay,
                'account' => $row['account_id'] ?? '-',
                'from_account' => null,
                'description' => $row['description'] ?? '-',
                'remark' => $row['remark'] ?? '-',
                'source' => $row['source_value'] ?? null,
                'percent' => (isset($row['source_percent']) && $row['source_percent'] !== '')
                    ? (string)$row['source_percent']
                    : null,
                'currency' => $row['currency_code'] ?: '-',
                'rate' => $rateDisplay,
                'cr' => $crVal,
                'dr' => $drVal,
                'transaction_date' => $row['transaction_date'] ?? null,
                'dts_created' => $row['dts_created'] ?? '',
                'created_by' => $row['created_by'] ?? '-',
                'is_deleted' => 0,
                'deleted_by' => null,
                'dts_deleted' => null,
                'data_type' => 'datacapture'
            ];
        }
    } catch (Exception $e) {
        error_log('查询 Data Capture 数据失败: ' . $e->getMessage());
    }
    }
    // ========== 3. 查询已删除的 Transaction 记录（transactions_deleted，可选；指定 Process 时不查）==========
    // 为了避免在 Maintenance - Transaction 页面看到已在 Payment Maintenance 中删除的历史记录，
    // 默认不返回这些已删除记录；仅当 include_deleted=1 且未指定 process 时才附加。
    if ($includeDeleted && empty($process)) {
    try {
        $check = $pdo->query("SHOW TABLES LIKE 'transactions_deleted'");
        if ($check->rowCount() > 0) {
            $delWhere = "td.company_id = ? AND td.transaction_date BETWEEN ? AND ?";
            $delParams = [$company_id, $date_from_db, $date_to_db];
            $hasTdSourceBank = false;
            try {
                $tdCol = $pdo->query("SHOW COLUMNS FROM transactions_deleted LIKE 'source_bank_process_id'");
                $hasTdSourceBank = $tdCol && $tdCol->rowCount() > 0;
            } catch (PDOException $e) { /* ignore */ }
            if ($category !== '') {
                if ($is_bank_category) {
                    if ($hasTdSourceBank) {
                        $delWhere .= " AND td.source_bank_process_id IS NOT NULL AND td.source_bank_process_id != 0";
                    } else {
                        $delWhere .= " AND 1 = 0";
                    }
                } else {
                    if ($hasTdSourceBank) {
                        $delWhere .= " AND (td.source_bank_process_id IS NULL OR td.source_bank_process_id = 0)";
                    }
                }
            }
            // 同样排除 Payment / Receive / Contra / Claim / Rate / Clear / WIN / LOSE 的已删除记录
            $delWhere .= " AND td.transaction_type NOT IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'RATE', 'CLEAR', 'WIN', 'LOSE')";
            $deletedSql = "
                SELECT
                    td.transaction_id,
                    NULL AS process_id,
                    a.account_id,
                    fa.account_id AS from_account,
                    td.description,
                    COALESCE(td.sms, '') AS remark,
                    COALESCE(c.code, '') AS currency_code,
                    COALESCE(td.amount, 0) AS amount,
                    td.transaction_date AS transaction_date,
                    DATE_FORMAT(td.created_at, '%d/%m/%Y %H:%i:%s') AS dts_created,
                    COALESCE(u.login_id, o.owner_code) AS created_by,
                    COALESCE(du.login_id, do.owner_code) AS deleted_by,
                    DATE_FORMAT(td.deleted_at, '%d/%m/%Y %H:%i:%s') AS dts_deleted,
                    'transaction' AS data_type
                FROM transactions_deleted td
                INNER JOIN account a ON td.account_id = a.id
                LEFT JOIN account fa ON td.from_account_id = fa.id
                LEFT JOIN currency c ON td.currency_id = c.id
                LEFT JOIN user u ON td.created_by = u.id
                LEFT JOIN owner o ON td.created_by_owner = o.id
                LEFT JOIN user du ON td.deleted_by_user_id = du.id
                LEFT JOIN owner do ON td.deleted_by_owner_id = do.id
                WHERE $delWhere
                ORDER BY td.transaction_date DESC, td.created_at DESC
            ";
            $delStmt = $pdo->prepare($deletedSql);
            $delStmt->execute($delParams);
            $deletedRows = $delStmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($deletedRows as $row) {
                $amt = $row['amount'] ?? 0;
                $crVal = null;
                $drVal = null;
                if (is_numeric($amt)) {
                    if ($amt > 0) {
                        $crVal = $amt;
                    } elseif ($amt < 0) {
                        $drVal = abs($amt);
                    } else {
                        $crVal = 0;
                    }
                }

                $formatted[] = [
                    'no' => $no++,
                    'transaction_id' => $row['transaction_id'],
                    'capture_id' => null,
                    'capture_detail_id' => null,
                    'process' => $row['process_id'] ?? ($process ?: '-'),
                    'process_id' => $row['process_id'] ?? null,
                    'id_product' => '-',
                    'account' => $row['account_id'] ?? '-',
                    'from_account' => $row['from_account'] ?? '-',
                    'description' => $row['description'] ?? '-',
                    'remark' => $row['remark'] ?? '-',
                    'source' => null,
                    'percent' => null,
                    'currency' => $row['currency_code'] ?: '-',
                    'rate' => null,
                    'cr' => $crVal,
                    'dr' => $drVal,
                    'transaction_date' => $row['transaction_date'] ?? null,
                    'dts_created' => $row['dts_created'] ?? '',
                    'created_by' => $row['created_by'] ?? '-',
                    'is_deleted' => 1,
                    'deleted_by' => $row['deleted_by'] ?? null,
                    'dts_deleted' => $row['dts_deleted'] ?? null,
                    'data_type' => 'transaction'
                ];
            }
        }
    } catch (Exception $e) {
        error_log('查询已删除交易失败: ' . $e->getMessage());
    }
    } // end if (empty($process)) — 指定 Process 时不返回已删除的 Transaction

    // ========== 4. 查询已删除的 Data Capture 记录（data_captures_deleted，可选；Bank category 不包含）==========
    // 同样仅在 include_deleted=1 时返回已删除的 Data Capture 记录
    if ($includeDeleted && !$is_bank_category) {
    try {
        $check = $pdo->query("SHOW TABLES LIKE 'data_captures_deleted'");
        if ($check->rowCount() > 0) {
            $deletedCaptureWhere = [];
            $deletedCaptureParams = [];
            
            $deletedCaptureWhere[] = "dcd.company_id = ?";
            $deletedCaptureParams[] = $company_id;
            
            $deletedCaptureWhere[] = "dcd.capture_date BETWEEN ? AND ?";
            $deletedCaptureParams[] = $date_from_db;
            $deletedCaptureParams[] = $date_to_db;
            
            // Process 过滤（如果指定）
            if ($process) {
                $deletedCaptureWhere[] = "p.process_id = ?";
                $deletedCaptureParams[] = $process;
            }
            
            $deletedCaptureWhereSql = 'WHERE ' . implode(' AND ', $deletedCaptureWhere);
            
            $deletedCaptureSql = "
                SELECT
                    dcd.id AS capture_detail_id,
                    dcd.capture_id,
                    p.process_id,
                    a.account_id,
                    COALESCE(d.name, dcd.description_main, dcd.description_sub, dcd.columns_value, 'Data Capture') AS description,
                    COALESCE(dcd.remark, '') AS remark,
                    c.code AS currency_code,
                    dcd.processed_amount AS amount,
                    dcd.capture_date AS transaction_date,
                    DATE_FORMAT(dcd.created_at, '%d/%m/%Y %H:%i:%s') AS dts_created,
                    COALESCE(u.login_id, o.owner_code) AS created_by,
                    COALESCE(du.login_id, do.owner_code) AS deleted_by,
                    DATE_FORMAT(dcd.deleted_at, '%d/%m/%Y %H:%i:%s') AS dts_deleted,
                    dcd.source_value,
                    dcd.source_percent,
                    dcd.rate,
                    dcd.id_product,
                    dcd.id_product_main,
                    dcd.id_product_sub,
                    dcd.product_type,
                    dcd.description_main,
                    dcd.description_sub,
                    dcd.columns_value
                FROM data_captures_deleted dcd
                INNER JOIN process p ON dcd.process_id = p.id
                INNER JOIN account a ON dcd.account_id = a.id
                INNER JOIN currency c ON dcd.currency_id = c.id
                LEFT JOIN description d ON p.description_id = d.id
                LEFT JOIN user u ON dcd.user_type = 'user' AND dcd.created_by = u.id
                LEFT JOIN owner o ON dcd.user_type = 'owner' AND dcd.created_by = o.id
                LEFT JOIN user du ON dcd.deleted_by_user_id = du.id
                LEFT JOIN owner do ON dcd.deleted_by_owner_id = do.id
                $deletedCaptureWhereSql
                ORDER BY dcd.capture_date DESC, dcd.created_at DESC, dcd.id DESC
            ";
            
            $deletedCaptureStmt = $pdo->prepare($deletedCaptureSql);
            $deletedCaptureStmt->execute($deletedCaptureParams);
            $deletedCaptureRows = $deletedCaptureStmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($deletedCaptureRows as $row) {
                $amt = $row['amount'] ?? 0;
                $crVal = null;
                $drVal = null;
                if (is_numeric($amt)) {
                    if ($amt > 0) {
                        $crVal = $amt;
                    } elseif ($amt < 0) {
                        $drVal = abs($amt);
                    } else {
                        $crVal = 0;
                    }
                }
                
                $rateDisplay = formatRateForDisplay($row['rate'] ?? null);
                $idProductDelDisplay = formatMaintenanceIdProductLikeDataSummary($row);
                
                $formatted[] = [
                    'no' => $no++,
                    'transaction_id' => null,
                    'capture_id' => $row['capture_id'],
                    'capture_detail_id' => $row['capture_detail_id'] ?? null,
                    'process' => $row['process_id'] ?? '-',
                    'process_id' => $row['process_id'] ?? null,
                    'id_product' => $idProductDelDisplay,
                    'account' => $row['account_id'] ?? '-',
                    'from_account' => null,
                    'description' => $row['description'] ?? '-',
                    'remark' => $row['remark'] ?? '-',
                    'source' => $row['source_value'] ?? null,
                    'percent' => (isset($row['source_percent']) && $row['source_percent'] !== '')
                        ? (string)$row['source_percent']
                        : null,
                    'currency' => $row['currency_code'] ?: '-',
                    'rate' => $rateDisplay,
                    'cr' => $crVal,
                    'dr' => $drVal,
                    'transaction_date' => $row['transaction_date'] ?? null,
                    'dts_created' => $row['dts_created'] ?? '',
                    'created_by' => $row['created_by'] ?? '-',
                    'is_deleted' => 1,
                    'deleted_by' => $row['deleted_by'] ?? null,
                    'dts_deleted' => $row['dts_deleted'] ?? null,
                    'data_type' => 'datacapture'
                ];
            }
        }
    } catch (Exception $e) {
        error_log('查询已删除 Data Capture 失败: ' . $e->getMessage());
    }
    }
    // ========== 5. 按日期排序合并后的数据 ==========
    usort($formatted, function($a, $b) {
        // 1) 按 transaction_date 降序（YYYY-MM-DD）
        $dateA = $a['transaction_date'] ?? '';
        $dateB = $b['transaction_date'] ?? '';
        if ($dateA !== $dateB) {
            return strcmp($dateB, $dateA);
        }

        // 2) 按 dts_created 的真实时间降序（避免 dd/mm/yyyy 字符串比较误差）
        $createdA = DateTime::createFromFormat('d/m/Y H:i:s', (string)($a['dts_created'] ?? ''));
        $createdB = DateTime::createFromFormat('d/m/Y H:i:s', (string)($b['dts_created'] ?? ''));
        $tsA = $createdA ? $createdA->getTimestamp() : 0;
        $tsB = $createdB ? $createdB->getTimestamp() : 0;
        if ($tsA !== $tsB) {
            return $tsB <=> $tsA;
        }

        // 3) 同一时间戳下：Data Capture 先按 capture_id 分组，保证 Main/Sub 不被打散
        $captureA = (int)($a['capture_id'] ?? 0);
        $captureB = (int)($b['capture_id'] ?? 0);
        if ($captureA !== $captureB) {
            return $captureB <=> $captureA;
        }

        // 4) 同一 capture 内按 detail id（原明细顺序）排序，确保同组紧邻
        $detailA = (int)($a['capture_detail_id'] ?? 0);
        $detailB = (int)($b['capture_detail_id'] ?? 0);
        if ($detailA !== $detailB) {
            return $detailB <=> $detailA;
        }

        // 5) 最后兜底：按 transaction_id 降序，确保排序稳定
        $txnA = (int)($a['transaction_id'] ?? 0);
        $txnB = (int)($b['transaction_id'] ?? 0);
        if ($txnA !== $txnB) {
            return $txnB <=> $txnA;
        }
        return 0;
    });
    
    // 重新编号
    foreach ($formatted as $index => &$result) {
        $result['no'] = $index + 1;
    }
    unset($result);

    // 返回
    echo json_encode([
        'success' => true,
        'data' => $formatted
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '数据库错误: ' . $e->getMessage(),
        'data' => null,
        'error' => '数据库错误: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
