<?php
header('Content-Type: application/json');
require_once 'config.php';

try {
    // 获取所有角色
    $stmt = $pdo->query("SELECT id, code FROM role ORDER BY id ASC");
    $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // 返回JSON响应
    echo json_encode([
        'success' => true,
        'data' => $roles
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => '数据库错误: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => '系统错误: ' . $e->getMessage()
    ]);
}
?>
