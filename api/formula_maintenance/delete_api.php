<?php
/**
 * Formula Maintenance Delete API - 删除选中的 data_capture_templates 记录
 * 路径: api/formula_maintenance/delete_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../deleted_log/deleted_log.php';

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
 * 从 POST 请求中解析并验证 company_id
 */
function getCompanyIdFromInput(PDO $pdo, array $input) {
    $requested = isset($input['company_id']) ? trim($input['company_id']) : '';
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
 * 验证 template_ids 是否属于当前公司，返回有效 ID 列表
 */
function validateTemplateIds(PDO $pdo, array $template_ids, int $company_id) {
    if (empty($template_ids)) {
        return [];
    }
    $placeholders = str_repeat('?,', count($template_ids) - 1) . '?';
    $sql = "SELECT id FROM data_capture_templates WHERE id IN ($placeholders) AND company_id = ?";
    $params = array_merge($template_ids, [$company_id]);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        throw new Exception('无效的请求数据');
    }
    $company_id = getCompanyIdFromInput($pdo, $input);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('只支持 POST 请求');
    }
    if (!isset($input['template_ids']) || !is_array($input['template_ids'])) {
        throw new Exception('无效的请求数据');
    }
    $template_ids = array_values(array_filter(array_map('intval', $input['template_ids']), function ($id) {
        return $id > 0;
    }));
    if (empty($template_ids)) {
        throw new Exception('请选择要删除的记录');
    }

    $validIds = validateTemplateIds($pdo, $template_ids, $company_id);
    if (empty($validIds)) {
        throw new Exception('没有找到符合条件且属于当前公司的记录');
    }
    $invalidIds = array_diff($template_ids, $validIds);
    if (!empty($invalidIds)) {
        error_log("警告：尝试删除不属于当前公司的记录 ID: " . implode(', ', $invalidIds));
    }

    $pdo->beginTransaction();
    try {
        $pageTag = '/api/formula_maintenance/delete_api.php';
        $userTag = (string) ($_SESSION['login_id'] ?? $_SESSION['name'] ?? '');
        foreach ($validIds as $tid) {
            deletedLog($pdo, $userTag, $pageTag, 'data_capture_templates', (string) $tid);
        }

        $placeholders = str_repeat('?,', count($validIds) - 1) . '?';
        $deleteSql = "DELETE FROM data_capture_templates WHERE id IN ($placeholders)";
        $stmt = $pdo->prepare($deleteSql);
        $stmt->execute($validIds);
        $totalDeleted = $stmt->rowCount();
        $pdo->commit();
        jsonResponse(true, "已删除 {$totalDeleted} 条记录", ['deleted' => $totalDeleted]);
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    jsonResponse(false, $e->getMessage(), null, 400);
}