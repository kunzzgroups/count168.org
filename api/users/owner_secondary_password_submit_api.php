<?php
declare(strict_types=1);

/**
 * Owner 二级密码校验（JSON）。逻辑与 owner_secondary_password.php POST 一致。
 * POST: secondary_password, 可选 api_token（64 hex，用于合并 api_auth_tokens 快照）
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../session_check.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'owner') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Forbidden']);
    exit;
}

$secondary_password = trim((string) ($_POST['secondary_password'] ?? ''));
$posted_token = trim((string) ($_POST['api_token'] ?? ''));

if ($secondary_password === '') {
    echo json_encode(['status' => 'error', 'message' => 'Please enter secondary password']);
    exit;
}
if (!preg_match('/^\d{6}$/', $secondary_password)) {
    echo json_encode(['status' => 'error', 'message' => 'Secondary password must be exactly 6 digits']);
    exit;
}

try {
    $owner_id = (int) $_SESSION['user_id'];
    $stmt = $pdo->prepare('SELECT secondary_password FROM owner WHERE id = ?');
    $stmt->execute([$owner_id]);
    $owner = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($owner && !empty($owner['secondary_password'])) {
        if (!password_verify($secondary_password, $owner['secondary_password'])) {
            echo json_encode(['status' => 'error', 'message' => 'Secondary password is incorrect']);
            exit;
        }
    }

    $_SESSION['secondary_password_verified'] = true;

    if ($posted_token !== '' && strlen($posted_token) === 64 && ctype_xdigit($posted_token)) {
        require_once __DIR__ . '/../../includes/api_auth_token.php';
        api_auth_merge_token_session($pdo, $posted_token, [
            'secondary_password_verified' => true,
        ]);
    }

    echo json_encode(['status' => 'success', 'redirect' => 'dashboard.php']);
} catch (PDOException $e) {
    error_log('owner_secondary_password_submit_api: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'An error occurred. Please try again.']);
}
