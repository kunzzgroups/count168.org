<?php
/**
 * 删除货币 API（规范化版）
 * 路径：api/accounts/delete_currency_api.php
 * 统一响应格式：{ success: bool, message: string, data: mixed }
 */
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method', 'data' => null]);
    exit;
}

function jsonResponse(bool $success, string $message, $data = null): void {
    $out = ['success' => $success, 'message' => $message, 'data' => $data];
    if (!$success) {
        $out['error'] = $message;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
}

// ---------- 数据层：表/列检查 ----------
function tableExists(PDO $pdo, string $tableName): bool {
    $stmt = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($tableName));
    return $stmt->rowCount() > 0;
}

function columnExists(PDO $pdo, string $table, string $column): bool {
    $safeTable = str_replace(['`', ';', ' '], '', $table);
    $stmt = $pdo->query("SHOW COLUMNS FROM `" . $safeTable . "` LIKE " . $pdo->quote($column));
    return $stmt !== false && $stmt->rowCount() > 0;
}

// ---------- 数据层：货币 ----------
function getCurrencyByIdAndCompany(PDO $pdo, int $currencyId, int $companyId): ?array {
    $stmt = $pdo->prepare("SELECT code FROM currency WHERE id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function deleteCurrency(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("DELETE FROM currency WHERE id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    return $stmt->rowCount();
}

// ---------- 数据层：使用量统计 ----------
function countAccountCurrencyUsageWithCompany(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT ac.account_id)
        FROM account_currency ac
        INNER JOIN account_company acc ON ac.account_id = acc.account_id
        WHERE ac.currency_id = ? AND acc.company_id = ?
    ");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countAccountCurrencyUsageWithoutCompany(PDO $pdo, int $currencyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(DISTINCT account_id) FROM account_currency WHERE currency_id = ?");
    $stmt->execute([$currencyId]);
    return (int)$stmt->fetchColumn();
}

function countAccountUsageLegacyByCode(PDO $pdo, string $currencyCode, int $companyId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT a.id)
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.currency = ? AND ac.company_id = ?
    ");
    $stmt->execute([$currencyCode, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countAccountUsageLegacyByCodeAndCompanyId(PDO $pdo, string $currencyCode, int $companyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM account WHERE currency = ? AND company_id = ?");
    $stmt->execute([$currencyCode, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countDataCaptureDetailsUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM data_capture_details WHERE currency_id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countDataCapturesUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM data_captures WHERE currency_id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countTransactionsCurrencyUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE currency_id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countTransactionsRateUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM transactions_rate tr
        INNER JOIN transactions t ON tr.transaction_id = t.id
        WHERE (tr.rate_from_currency_id = ? OR tr.rate_to_currency_id = ?) AND t.company_id = ?
    ");
    $stmt->execute([$currencyId, $currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countTransactionsRateDetailsUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM transactions_rate_details trd
        INNER JOIN transactions_rate tr ON trd.rate_group_id = tr.rate_group_id
        INNER JOIN transactions t ON tr.transaction_id = t.id
        WHERE trd.currency_id = ? AND t.company_id = ?
    ");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countDataCaptureTemplatesUsage(PDO $pdo, int $currencyId, int $companyId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM data_capture_templates WHERE currency_id = ? AND company_id = ?");
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

function countDataCaptureTemplatesUsageViaProcess(PDO $pdo, int $currencyId, int $companyId, bool $processIdIsInt): int {
    if ($processIdIsInt) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM data_capture_templates dct
            INNER JOIN process p ON dct.process_id = p.id
            WHERE dct.currency_id = ? AND p.company_id = ?
        ");
    } else {
        $stmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM data_capture_templates dct
            INNER JOIN process p ON CAST(dct.process_id AS CHAR) = CAST(p.process_id AS CHAR)
            WHERE dct.currency_id = ? AND p.company_id = ?
        ");
    }
    $stmt->execute([$currencyId, $companyId]);
    return (int)$stmt->fetchColumn();
}

/**
 * 收集货币在各表中的使用情况，返回 [usageMessages, debugInfo]
 */
function collectCurrencyUsage(PDO $pdo, int $currencyId, int $companyId, string $currencyCode): array {
    $usageMessages = [];
    $debugInfo = [];

    $hasAccountCurrency = tableExists($pdo, 'account_currency');
    if ($hasAccountCurrency) {
        $hasAccountCompany = tableExists($pdo, 'account_company');
        if ($hasAccountCompany) {
            $n = countAccountCurrencyUsageWithCompany($pdo, $currencyId, $companyId);
            $debugInfo[] = "account_currency (with company check): $n";
            if ($n > 0) $usageMessages[] = "$n account(s)";
        } else {
            $n = countAccountCurrencyUsageWithoutCompany($pdo, $currencyId);
            $debugInfo[] = "account_currency (without company check): $n";
            if ($n > 0) $usageMessages[] = "$n account(s)";
        }
    } else {
        try {
            if (tableExists($pdo, 'account_company')) {
                $n = countAccountUsageLegacyByCode($pdo, $currencyCode, $companyId);
                if ($n > 0) $usageMessages[] = "$n account(s)";
            } elseif (columnExists($pdo, 'account', 'currency')) {
                if (columnExists($pdo, 'account', 'company_id')) {
                    $n = countAccountUsageLegacyByCodeAndCompanyId($pdo, $currencyCode, $companyId);
                    if ($n > 0) $usageMessages[] = "$n account(s)";
                }
            }
        } catch (PDOException $e) { /* ignore */ }
    }

    try {
        if (tableExists($pdo, 'data_capture_details')) {
            $n = countDataCaptureDetailsUsage($pdo, $currencyId, $companyId);
            if ($n > 0) $usageMessages[] = "$n data capture detail(s)";
        }
    } catch (PDOException $e) { /* ignore */ }

    try {
        if (tableExists($pdo, 'data_captures')) {
            $n = countDataCapturesUsage($pdo, $currencyId, $companyId);
            if ($n > 0) $usageMessages[] = "$n data capture(s)";
        }
    } catch (PDOException $e) { /* ignore */ }

    try {
        if (columnExists($pdo, 'transactions', 'currency_id')) {
            $n = countTransactionsCurrencyUsage($pdo, $currencyId, $companyId);
            if ($n > 0) $usageMessages[] = "$n transaction(s)";
        }
    } catch (PDOException $e) { /* ignore */ }

    try {
        if (tableExists($pdo, 'transactions_rate')) {
            $n = countTransactionsRateUsage($pdo, $currencyId, $companyId);
            if ($n > 0) $usageMessages[] = "$n rate transaction(s)";
        }
    } catch (PDOException $e) { /* ignore */ }

    try {
        if (tableExists($pdo, 'transactions_rate_details') && columnExists($pdo, 'transactions_rate_details', 'currency_id')) {
            $n = countTransactionsRateDetailsUsage($pdo, $currencyId, $companyId);
            if ($n > 0) $usageMessages[] = "$n rate transaction detail(s)";
        }
    } catch (PDOException $e) { /* ignore */ }

    try {
        if (tableExists($pdo, 'data_capture_templates') && columnExists($pdo, 'data_capture_templates', 'currency_id')) {
            if (columnExists($pdo, 'data_capture_templates', 'company_id')) {
                $n = countDataCaptureTemplatesUsage($pdo, $currencyId, $companyId);
                if ($n > 0) $usageMessages[] = "$n data capture template(s)";
            } else {
                $col = $pdo->query("SHOW COLUMNS FROM data_capture_templates WHERE Field = 'process_id'")->fetch(PDO::FETCH_ASSOC);
                $isInt = isset($col['Type']) && stripos($col['Type'], 'int') !== false;
                $n = countDataCaptureTemplatesUsageViaProcess($pdo, $currencyId, $companyId, $isInt);
                if ($n > 0) $usageMessages[] = "$n data capture template(s)";
            }
        }
    } catch (PDOException $e) { /* ignore */ }

    return [$usageMessages, $debugInfo];
}

// ---------- 主逻辑 ----------
try {
    if (!isset($_SESSION['company_id'])) {
        jsonResponse(false, '用户未登录或缺少公司信息', null);
        exit;
    }
    $company_id = (int)$_SESSION['company_id'];

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        jsonResponse(false, 'Invalid JSON input: ' . json_last_error_msg(), null);
        exit;
    }
    if (!isset($input['id']) || empty($input['id'])) {
        jsonResponse(false, 'Currency ID is required', null);
        exit;
    }

    $currencyId = (int)$input['id'];
    $forceDelete = isset($input['force']) && $input['force'] === true;

    $currency = getCurrencyByIdAndCompany($pdo, $currencyId, $company_id);
    if (!$currency) {
        jsonResponse(false, 'Currency not found or access denied', null);
        exit;
    }

    list($usageMessages, $debugInfo) = collectCurrencyUsage($pdo, $currencyId, $company_id, $currency['code']);

    if ($forceDelete) {
        $usageMessages = array_filter($usageMessages, function ($msg) {
            return strpos($msg, 'account(s)') === false;
        });
    }

    if (!empty($usageMessages)) {
        $errorMsg = 'Cannot delete currency that is being used by: ' . implode(', ', $usageMessages);
        if (!empty($debugInfo)) {
            $errorMsg .= ' [Debug: ' . implode(', ', $debugInfo) . ']';
        }
        jsonResponse(false, $errorMsg, null);
        exit;
    }

    $deleted = deleteCurrency($pdo, $currencyId, $company_id);
    if ($deleted === 0) {
        $stillExists = getCurrencyByIdAndCompany($pdo, $currencyId, $company_id);
        if (!$stillExists) {
            jsonResponse(false, 'Currency not found or does not belong to current company', null);
        } else {
            jsonResponse(false, 'Failed to delete currency. Please check database constraints or permissions.', null);
        }
        exit;
    }

    jsonResponse(true, 'Currency deleted successfully', null);

} catch (PDOException $e) {
    error_log("DeleteCurrencyAPI - PDO: " . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Database error: ' . $e->getMessage(), null);
} catch (Exception $e) {
    error_log("DeleteCurrencyAPI - Exception: " . $e->getMessage());
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (Error $e) {
    error_log("DeleteCurrencyAPI - Fatal: " . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Fatal error: ' . $e->getMessage(), null);
}