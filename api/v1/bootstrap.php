<?php
declare(strict_types=1);

/**
 * mysqli 连接、JSON 响应与登录令牌（HMAC）工具。
 * 勿输出 HTML。
 */

function respond_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function api_token_secret(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $fromEnv = getenv('COUNT168_API_TOKEN_SECRET');
    if (is_string($fromEnv) && $fromEnv !== '') {
        $cached = $fromEnv;
        return $cached;
    }
    $local = __DIR__ . '/token_secret.local.php';
    if (is_file($local)) {
        /** @var mixed $secret */
        $secret = require $local;
        if (is_string($secret) && $secret !== '') {
            $cached = $secret;
            return $cached;
        }
    }
    // 开发兜底：上线请务必设置环境变量或 token_secret.local.php
    $cached = hash('sha256', 'count168-dev-token-fallback');
    return $cached;
}

function b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $str): string|false
{
    $padded = strtr($str, '-_', '+/');
    $padLen = strlen($padded) % 4;
    if ($padLen > 0) {
        $padded .= str_repeat('=', 4 - $padLen);
    }
    return base64_decode($padded, true);
}

/**
 * @param array<string, mixed> $claims
 */
function api_token_create(array $claims): string
{
    $claims['exp'] = time() + 7 * 86400;
    $payload = b64url_encode(json_encode($claims, JSON_UNESCAPED_UNICODE) ?: '{}');
    $sig = b64url_encode(hash_hmac('sha256', $payload, api_token_secret(), true));
    return $payload . '.' . $sig;
}

/**
 * @return array<string, mixed>|null
 */
function api_token_verify(?string $token): ?array
{
    if ($token === null || $token === '') {
        return null;
    }
    $token = trim($token);
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }
    [$payload, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', $payload, api_token_secret(), true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $json = b64url_decode($payload);
    if ($json === false) {
        return null;
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return null;
    }
    if (!isset($data['exp']) || (int) $data['exp'] < time()) {
        return null;
    }
    return $data;
}

function mysqli_bootstrap(): mysqli
{
    $configPath = __DIR__ . '/../../config.php';
    if (!is_file($configPath)) {
        respond_json(500, [
            'success' => false,
            'error' => '服务器未配置数据库',
            'error_code' => 'SERVER_DB_CONFIG_MISSING',
        ]);
    }
    require_once $configPath;

    global $host, $dbname, $dbuser, $dbpass;
    if (!isset($host, $dbname, $dbuser, $dbpass)) {
        respond_json(500, [
            'success' => false,
            'error' => '数据库配置不完整',
            'error_code' => 'SERVER_DB_SETTINGS_INCOMPLETE',
        ]);
    }

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    try {
        $mysqli = new mysqli($host, $dbuser, $dbpass, $dbname);
    } catch (Throwable $e) {
        error_log('mysqli connect: ' . $e->getMessage());
        respond_json(500, [
            'success' => false,
            'error' => '数据库连接失败',
            'error_code' => 'SERVER_DB_CONNECT_FAILED',
        ]);
    }

    $mysqli->set_charset('utf8mb4');
    $mysqli->query("SET time_zone = '+08:00'");
    return $mysqli;
}

function is_company_expired_or_unset(?string $expirationDate, ?string $companyCode): bool
{
    if (strtoupper(trim((string) $companyCode)) === 'C168') {
        return false;
    }
    if ($expirationDate === null || trim((string) $expirationDate) === '') {
        return true;
    }
    $expTs = strtotime((string) $expirationDate);
    if ($expTs === false) {
        return true;
    }
    return $expTs < strtotime(date('Y-m-d'));
}
