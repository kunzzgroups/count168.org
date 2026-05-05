<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $token = trim((string) (getenv('HOSTINGER_API_TOKEN') ?: ''));
    if ($token === '') {
        throw new RuntimeException('HOSTINGER_API_TOKEN is empty. Fill secret_config.php first.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL extension is required.');
    }

    $url = 'https://api.hostinger.com/api/billing/v1/subscriptions';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ],
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

    $accounts = [];
    $stack = [$data];
    while (!empty($stack)) {
        $item = array_pop($stack);
        if (is_array($item)) {
            if (isset($item['account']) && (is_string($item['account']) || is_int($item['account']))) {
                $accounts[] = (string) $item['account'];
            }
            foreach ($item as $v) {
                if (is_array($v)) {
                    $stack[] = $v;
                }
            }
        }
    }
    $accounts = array_values(array_unique(array_filter($accounts, static function ($v) {
        return trim((string) $v) !== '';
    })));

    echo json_encode([
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'candidate_accounts' => $accounts,
        'tip' => 'Pick one account ID and set HOSTINGER_ACCOUNT_ID in secret_config.php',
        'response' => $data,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}

