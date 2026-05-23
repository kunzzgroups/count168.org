<?php

$host = 'localhost';

// 主库（系统默认连接）
$primary_dbname = 'u857194726_c168_org';
$primary_dbuser = 'u857194726_c168_org';
$primary_dbpass = 'Kunzz_c168_org';

// 多库连接映射：按需继续添加
// key 必须是完整数据库名（建议小写）
$db_connections = [
    'u857194726_c168_org' => ['user' => 'u857194726_c168_org', 'pass' => 'Kunzz_c168_org'],
    'u857194726_a' => ['user' => 'u857194726_a', 'pass' => 'Kunzz_c168_org'],
    'u857194726_b' => ['user' => 'u857194726_b', 'pass' => 'Kunzz_c168_org'],
];

// 兼容旧代码中直接使用 $dbname/$dbuser/$dbpass 的场景
$dbname = $primary_dbname;
$dbuser = $primary_dbuser;
$dbpass = $primary_dbpass;

function getDbConnectionConfig(?string $databaseName = null): array
{
    global $host, $primary_dbname, $primary_dbuser, $primary_dbpass, $db_connections;

    $normalized = strtolower(trim((string) ($databaseName ?? '')));
    if ($normalized !== '' && isset($db_connections[$normalized])) {
        return [
            'host' => $host,
            'dbname' => $normalized,
            'dbuser' => $db_connections[$normalized]['user'],
            'dbpass' => $db_connections[$normalized]['pass'],
        ];
    }

    return [
        'host' => $host,
        'dbname' => $primary_dbname,
        'dbuser' => $primary_dbuser,
        'dbpass' => $primary_dbpass,
    ];
}

function createPdoForDatabase(?string $databaseName = null): PDO
{
    $cfg = getDbConnectionConfig($databaseName);
    $pdo = new PDO(
        "mysql:host={$cfg['host']};dbname={$cfg['dbname']};charset=utf8mb4",
        $cfg['dbuser'],
        $cfg['dbpass']
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET time_zone = '+08:00'");
    return $pdo;
}

function createServerPdoForDatabase(?string $databaseName = null): PDO
{
    $cfg = getDbConnectionConfig($databaseName);
    $pdo = new PDO(
        "mysql:host={$cfg['host']};charset=utf8mb4",
        $cfg['dbuser'],
        $cfg['dbpass']
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET time_zone = '+08:00'");
    return $pdo;
}

/**
 * Create a Hostinger database via official API.
 *
 * Usage:
 *   $res = hostingerCreateDatabase('YOUR_ACCOUNT_ID', 'u857194726_test');
 */
function hostingerCreateDatabase(string $account, string $databaseName, ?string $apiToken = null, array $extraPayload = []): array
{
    $account = trim($account);
    $databaseName = trim($databaseName);
    $apiToken = trim((string) ($apiToken ?? getenv('HOSTINGER_API_TOKEN') ?: ''));

    if ($account === '') {
        throw new InvalidArgumentException('Hostinger account is required');
    }
    if ($databaseName === '') {
        throw new InvalidArgumentException('Database name is required');
    }
    if (!preg_match('/^[A-Za-z0-9_]+$/', $databaseName)) {
        throw new InvalidArgumentException('Database name may only contain letters, numbers, and underscore');
    }
    if ($apiToken === '') {
        throw new InvalidArgumentException('Hostinger API token is required (set HOSTINGER_API_TOKEN or pass as 3rd argument)');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL extension is required for Hostinger API calls');
    }

    $url = 'https://api.hostinger.com/api/hapi/v1/accounts/' . rawurlencode($account) . '/databases';
    $requestPayload = ['name' => $databaseName];
    foreach (['user', 'password', 'vhost'] as $key) {
        if (isset($extraPayload[$key])) {
            $val = trim((string) $extraPayload[$key]);
            if ($val !== '') {
                $requestPayload[$key] = $val;
            }
        }
    }
    $payload = json_encode($requestPayload, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('Failed to encode Hostinger API payload');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiToken,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 30,
    ]);

    $responseBody = curl_exec($ch);
    if ($responseBody === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Hostinger API request failed: ' . $err);
    }

    $httpCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $decoded = json_decode($responseBody, true);
    return [
        'ok' => $httpCode >= 200 && $httpCode < 300,
        'status' => $httpCode,
        'data' => is_array($decoded) ? $decoded : $responseBody,
    ];
}

// 设置PHP时区为马来西亚时间
date_default_timezone_set('Asia/Kuala_Lumpur');

// 全局禁用任何 PHP 接口和表单页面的浏览器缓存 (防止各模块出现显示同步遗漏问题)
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

try {
    $pdo = createPdoForDatabase($primary_dbname);
} catch(PDOException $e) {
    // 抛出异常而不是直接 die，让调用者可以处理
    throw new PDOException("数据库连接失败: " . $e->getMessage());
}

// SMTP 发信（必填才能发到 Gmail）：填好后重置密码邮件走 SMTP，否则用 mail() 易失败
// Gmail 步骤：1) 开启两步验证 2) 申请应用专用密码 https://myaccount.google.com/apppasswords 3) 下面填好
$smtp_host = 'smtp.gmail.com';
$smtp_port = 465;
$smtp_user = 'maxjk77777@gmail.com';           // 你的 Gmail，如 yourname@gmail.com
$smtp_pass = 'icwe kjwy otmg pjkw';           // 上一步生成的应用专用密码（16 位）
$smtp_from_email = '';     // 留空则用 smtp_user
$smtp_from_name = 'EazyCount';
?>
