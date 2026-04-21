<?php
/**
 * Formula Maintenance Update API - 更新 data_capture_templates
 * 路径: api/formula_maintenance/update_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/formula_fields_helper.php';

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode(array_merge(
        ['success' => (bool) $success, 'message' => $message],
        $data !== null ? ['data' => $data] : ['data' => null]
    ), JSON_UNESCAPED_UNICODE);
}

/**
 * 从 JSON 请求体中解析并验证 company_id
 */
function getCompanyIdFromInput(PDO $pdo, array $input) {
    $requested = isset($input['company_id']) ? trim((string)$input['company_id']) : '';
    if ($requested !== '') {
        $requested = (int)$requested;
        $userRole = isset($_SESSION['role']) ? strtolower($_SESSION['role']) : '';
        if ($userRole === 'owner') {
            $owner_id = $_SESSION['owner_id'] ?? $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT id FROM company WHERE id = ? AND owner_id = ?");
            $stmt->execute([$requested, $owner_id]);
            if ($stmt->fetchColumn()) {
                return $requested;
            }
            throw new Exception('无权访问该公司');
        }
        if (!isset($_SESSION['company_id']) || (int)$_SESSION['company_id'] !== $requested) {
            throw new Exception('无权访问该公司');
        }
        return (int)$_SESSION['company_id'];
    }
    if (!isset($_SESSION['company_id'])) {
        throw new Exception('用户未登录或缺少公司信息');
    }
    return (int)$_SESSION['company_id'];
}

/**
 * 验证模板是否属于当前公司（使用 process 表）
 */
function validateTemplateBelongsToCompany(PDO $pdo, int $templateId, int $companyId) {
    $stmt = $pdo->prepare("
        SELECT dct.id
        FROM data_capture_templates dct
        INNER JOIN process p ON dct.process_id = p.id
        WHERE dct.id = ? AND p.company_id = ?
    ");
    $stmt->execute([$templateId, $companyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new Exception('模板不存在或不属于当前公司');
    }
}

/**
 * 获取账户 display 值（account_company 表）
 */
function getAccountDisplay(PDO $pdo, int $accountId, int $companyId) {
    $stmt = $pdo->prepare("
        SELECT a.account_id, a.name
        FROM account a
        INNER JOIN account_company ac ON a.id = ac.account_id
        WHERE a.id = ? AND ac.company_id = ?
    ");
    $stmt->execute([$accountId, $companyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new Exception('Account 不存在或不属于当前公司');
    }
    return $row['account_id'];
}

/**
 * 获取模板的 process 及产品信息，用于同步
 */
function getTemplateProcessInfo(PDO $pdo, int $templateId) {
    $stmt = $pdo->prepare("
        SELECT process_id, id_product, product_type, formula_variant,
               source_percent, enable_source_percent, enable_input_method,
               currency_id, currency_display
        FROM data_capture_templates
        WHERE id = ?
    ");
    $stmt->execute([$templateId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * 更新主模板记录（可选同步 source_percent / enable_source_percent）
 */
function updateTemplate(PDO $pdo, int $templateId, int $accountId, string $accountDisplay,
    string $sourceColumns, string $sourceDisplay, string $inputMethod, string $formulaBase, string $description,
    $sourcePercent = null, $enableSourcePercent = null) {
    if ($sourcePercent !== null && $enableSourcePercent !== null) {
        $sql = "UPDATE data_capture_templates
            SET account_id = :account_id,
                account_display = :account_display,
                source_columns = :source_columns,
                columns_display = :columns_display,
                input_method = :input_method,
                formula_display = :formula_display,
                formula_operators = :formula_operators,
                source_percent = :source_percent,
                enable_source_percent = :enable_source_percent,
                description = :description,
                updated_at = NOW()
            WHERE id = :id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':account_id' => $accountId,
            ':account_display' => $accountDisplay,
            ':source_columns' => $sourceColumns,
            ':columns_display' => $sourceDisplay,
            ':input_method' => $inputMethod ?: null,
            ':formula_display' => $formulaBase,
            ':formula_operators' => $formulaBase,
            ':source_percent' => (string) $sourcePercent,
            ':enable_source_percent' => (int) $enableSourcePercent,
            ':description' => $description,
            ':id' => $templateId
        ]);
        return;
    }
    $sql = "UPDATE data_capture_templates
            SET account_id = :account_id,
                account_display = :account_display,
                source_columns = :source_columns,
                columns_display = :columns_display,
                input_method = :input_method,
                formula_display = :formula_display,
                formula_operators = :formula_operators,
                description = :description,
                updated_at = NOW()
            WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':account_id' => $accountId,
        ':account_display' => $accountDisplay,
        ':source_columns' => $sourceColumns,
        ':columns_display' => $sourceDisplay,
        ':input_method' => $inputMethod ?: null,
        ':formula_display' => $formulaBase,
        ':formula_operators' => $formulaBase,
        ':description' => $description,
        ':id' => $templateId
    ]);
}

/**
 * 获取所有 sync_source_process_id 指向给定源 process 的 process 记录
 */
function getSyncedProcesses(PDO $pdo, int $sourceProcessId, int $companyId) {
    $stmt = $pdo->prepare("
        SELECT id, process_id
        FROM process
        WHERE sync_source_process_id = ? AND company_id = ?
    ");
    $stmt->execute([$sourceProcessId, $companyId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 在目标 process 中查找匹配的 template 并更新
 */
function syncFormulaToTargetTemplates(PDO $pdo, int $companyId, array $templateInfo,
    int $accountId, string $accountDisplay, string $sourceColumns, string $sourceDisplay,
    string $inputMethod, string $formulaBase, string $description,
    $sourcePercent = null, $enableSourcePercent = null) {
    $syncedProcesses = getSyncedProcesses($pdo, (int)$templateInfo['process_id'], $companyId);
    if (empty($syncedProcesses)) {
        return;
    }
    $findStmt = $pdo->prepare("
        SELECT id FROM data_capture_templates
        WHERE process_id = ?
          AND company_id = ?
          AND id_product = ?
          AND account_id = ?
          AND product_type = ?
          AND formula_variant = ?
        LIMIT 1
    ");
    if ($sourcePercent !== null && $enableSourcePercent !== null) {
        $updateStmt = $pdo->prepare("
        UPDATE data_capture_templates SET
            account_id = ?,
            account_display = ?,
            source_columns = ?,
            columns_display = ?,
            input_method = ?,
            formula_display = ?,
            formula_operators = ?,
            source_percent = ?,
            enable_source_percent = ?,
            description = ?,
            updated_at = NOW()
        WHERE id = ?
    ");
    } else {
        $updateStmt = $pdo->prepare("
        UPDATE data_capture_templates SET
            account_id = ?,
            account_display = ?,
            source_columns = ?,
            columns_display = ?,
            input_method = ?,
            formula_display = ?,
            formula_operators = ?,
            description = ?,
            updated_at = NOW()
        WHERE id = ?
    ");
    }
    foreach ($syncedProcesses as $proc) {
        $targetProcessId = $proc['id'];
        $findStmt->execute([
            $targetProcessId,
            $companyId,
            $templateInfo['id_product'],
            $accountId,
            $templateInfo['product_type'],
            $templateInfo['formula_variant']
        ]);
        $target = $findStmt->fetch(PDO::FETCH_ASSOC);
        if ($target) {
            if ($sourcePercent !== null && $enableSourcePercent !== null) {
                $updateStmt->execute([
                    $accountId,
                    $accountDisplay,
                    $sourceColumns,
                    $sourceDisplay,
                    $inputMethod ?: null,
                    $formulaBase,
                    $formulaBase,
                    (string) $sourcePercent,
                    (int) $enableSourcePercent,
                    $description,
                    $target['id']
                ]);
            } else {
                $updateStmt->execute([
                    $accountId,
                    $accountDisplay,
                    $sourceColumns,
                    $sourceDisplay,
                    $inputMethod ?: null,
                    $formulaBase,
                    $formulaBase,
                    $description,
                    $target['id']
                ]);
            }
        }
    }
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('只支持 POST 请求');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        throw new Exception('无效的请求数据');
    }

    $companyId = getCompanyIdFromInput($pdo, $input);
    $templateId = isset($input['template_id']) ? (int)$input['template_id'] : 0;
    $accountId = isset($input['account_id']) ? (int)$input['account_id'] : 0;
    $sourceColumns = isset($input['source_columns']) ? trim($input['source_columns']) : '';
    $sourceDisplay = isset($input['source_display']) ? trim($input['source_display']) : $sourceColumns;
    $inputMethod = isset($input['input_method']) ? trim($input['input_method']) : '';
    $formulaRaw = isset($input['formula']) ? trim($input['formula']) : '';
    $description = isset($input['description']) ? trim($input['description']) : '';

    if ($templateId <= 0) {
        throw new Exception('Template ID 是必填项');
    }
    if ($accountId <= 0) {
        throw new Exception('Account 是必填项');
    }

    validateTemplateBelongsToCompany($pdo, $templateId, $companyId);
    $accountDisplay = getAccountDisplay($pdo, $accountId, $companyId);
    $templateInfo = getTemplateProcessInfo($pdo, $templateId);
    $sourceProcessId = $templateInfo ? (int)$templateInfo['process_id'] : null;

    $parsed = parseMaintenanceFormulaInput($formulaRaw);
    $formulaBase = $parsed['base'];
    $sp = $parsed['source_percent'];
    $en = $parsed['enable_source_percent'];

    $pdo->beginTransaction();
    try {
        if ($sp !== null && $en !== null) {
            updateTemplate($pdo, $templateId, $accountId, $accountDisplay, $sourceColumns, $sourceDisplay, $inputMethod, $formulaBase, $description, $sp, $en);
        } else {
            updateTemplate($pdo, $templateId, $accountId, $accountDisplay, $sourceColumns, $sourceDisplay, $inputMethod, $formulaBase, $description);
        }
        if ($sourceProcessId && $templateInfo) {
            syncFormulaToTargetTemplates($pdo, $companyId, $templateInfo, $accountId, $accountDisplay, $sourceColumns, $sourceDisplay, $inputMethod, $formulaBase, $description, $sp, $en);
        }
        $pdo->commit();
        $respData = [
            'formula_display_paren' => buildFormulaDisplayParenFromParts($formulaBase, $sp !== null ? $sp : '', $sp !== null ? $en : 0),
            'formula_edit' => buildFormulaEditFromParts($formulaBase, $sp !== null ? $sp : '', $sp !== null ? $en : 0),
        ];
        jsonResponse(true, '更新成功', $respData);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
} catch (PDOException $e) {
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 400);
}