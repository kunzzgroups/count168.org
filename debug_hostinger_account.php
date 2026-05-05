<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $token = trim((string) (getenv('HOSTINGER_API_TOKEN') ?: ''));
    $account = trim((string) (getenv('HOSTINGER_ACCOUNT_ID') ?: ''));
    $dbName = trim((string) ($_GET['db'] ?? ''));
    if ($dbName === '') {
        $dbName = 'u857194726_debug_' . date('His');
    }

    if ($token === '') {
        throw new RuntimeException('HOSTINGER_API_TOKEN is empty. Fill secret_config.php first.');
    }
    if ($account === '') {
        throw new RuntimeException('HOSTINGER_ACCOUNT_ID is empty. Fill secret_config.php first.');
    }
    if (!preg_match('/^[A-Za-z0-9_]+$/', $dbName)) {
        throw new RuntimeException('Invalid db name. Use letters, numbers, underscore only.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL extension is required.');
    }

    $url = 'https://api.hostinger.com/api/hapi/v1/accounts/' . rawurlencode($account) . '/databases';
    $ch = curl_init($url);
    $payload = json_encode(['name' => $dbName], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('Failed to encode request payload.');
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 30,
    ]);

    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Request failed: ' . $err);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        echo json_encode([
            'ok' => false,
            'status' => $status,
            'message' => 'Non-JSON response',
            'raw' => $raw,
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    echo json_encode([
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'account' => $account,
        'database' => $dbName,
        'tip' => 'If ok=true, token+account_id are correct for create database.',
        'response' => $data,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}

