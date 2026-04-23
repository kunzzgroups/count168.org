<?php
// 统一的 PDO 连接入口，复用现有 config.php 中的 $pdo
// 使用方式：$pdo = get_db();

require_once __DIR__ . '/config.php';

/**
 * 获取全局 PDO 连接（已配置好 ERRMODE 和时区）
 * @return PDO
 */
function get_db(): PDO {
    global $pdo;
    if (!($pdo instanceof PDO)) {
        // 兜底：如未初始化则抛错，避免静默失败
        throw new RuntimeException('数据库连接未初始化');
    }
    return $pdo;
}

/**
 * 输出标准 JSON 响应
 */
function json_response(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 读取 JSON 请求体
 */
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * 安全读取字符串参数
 */
function str_param(array $src, string $key, ?string $default = null): ?string {
    if (!isset($src[$key])) return $default;
    $val = trim((string)$src[$key]);
    return $val === '' ? $default : $val;
}

/**
 * 安全读取浮点参数（保留两位）
 */
function num_param(array $src, string $key, float $default = 0.0): float {
    if (!isset($src[$key])) return $default;
    $n = (float)$src[$key];
    return round($n, 2);
}

/**
 * 安全读取整型参数
 */
function int_param(array $src, string $key, int $default = 0): int {
    if (!isset($src[$key])) return $default;
    return (int)$src[$key];
}

?>


