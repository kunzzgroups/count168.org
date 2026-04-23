<?php
declare(strict_types=1);

/**
 * Opaque API tokens: store a JSON snapshot of session auth fields; validate via Authorization: Bearer.
 */

if (!defined('API_AUTH_SESSION_KEYS')) {
    define('API_AUTH_SESSION_KEYS', [
        'user_id',
        'login_id',
        'name',
        'role',
        'user_type',
        'company_id',
        'company_code',
        'account_id',
        'owner_id',
        'real_owner_id',
        'owner_code',
        'read_only',
        'member_login_account_id',
        'secondary_password_verified',
        'is_external_view',
        'last_activity',
    ]);
}

function api_auth_ensure_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS api_auth_tokens (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(64) NOT NULL UNIQUE,
            session_json MEDIUMTEXT NOT NULL,
            last_activity INT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_last_activity (last_activity)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $done = true;
}

function api_auth_collect_session_payload(): array
{
    $out = [];
    foreach (API_AUTH_SESSION_KEYS as $k) {
        if (array_key_exists($k, $_SESSION)) {
            $out[$k] = $_SESSION[$k];
        }
    }
    return $out;
}

function api_auth_apply_payload_to_session(array $payload): void
{
    foreach (API_AUTH_SESSION_KEYS as $k) {
        if (array_key_exists($k, $payload)) {
            $_SESSION[$k] = $payload[$k];
        }
    }
}

function api_auth_create_token(PDO $pdo): string
{
    api_auth_ensure_table($pdo);
    $plain = bin2hex(random_bytes(32));
    $payload = api_auth_collect_session_payload();
    $now = time();
    $payload['last_activity'] = $now;
    $_SESSION['last_activity'] = $now;
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare(
        'INSERT INTO api_auth_tokens (token, session_json, last_activity) VALUES (?, ?, ?)'
    );
    $stmt->execute([$plain, $json, $now]);
    return $plain;
}

function api_auth_get_bearer_token(): ?string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) {
        return $m[1];
    }
    $h = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) {
        return $m[1];
    }
    return null;
}

function api_auth_bearer_header_present(): bool
{
    $t = api_auth_get_bearer_token();
    return $t !== null && $t !== '';
}

/**
 * When session has no user yet, treat ?api_token= (64-char hex opaque token) like Authorization: Bearer
 * for the next api_auth_try_load_bearer() call. Skips if a Bearer token is already present.
 */
function api_auth_inject_query_token_as_bearer_if_needed(): void
{
    if (isset($_SESSION['user_id'])) {
        return;
    }
    $qToken = isset($_GET['api_token']) ? trim((string) $_GET['api_token']) : '';
    if ($qToken === '' || strlen($qToken) !== 64 || !ctype_xdigit($qToken)) {
        return;
    }
    if (api_auth_bearer_header_present()) {
        return;
    }
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $qToken;
}

/**
 * @return 'none'|'ok'|'invalid'
 */
function api_auth_try_load_bearer(PDO $pdo): string
{
    $plain = api_auth_get_bearer_token();
    if ($plain === null || $plain === '') {
        return 'none';
    }
    if (strlen($plain) !== 64 || !ctype_xdigit($plain)) {
        return 'invalid';
    }
    $timeout = defined('SESSION_TIMEOUT') ? (int) constant('SESSION_TIMEOUT') : 3600;
    api_auth_ensure_table($pdo);
    $stmt = $pdo->prepare(
        'SELECT id, session_json, last_activity FROM api_auth_tokens WHERE token = ? LIMIT 1'
    );
    $stmt->execute([$plain]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return 'invalid';
    }
    $last = (int) $row['last_activity'];
    if ((time() - $last) > $timeout) {
        $del = $pdo->prepare('DELETE FROM api_auth_tokens WHERE id = ?');
        $del->execute([(int) $row['id']]);
        return 'invalid';
    }
    $payload = json_decode((string) $row['session_json'], true);
    if (!is_array($payload)) {
        return 'invalid';
    }
    $now = time();
    $upd = $pdo->prepare('UPDATE api_auth_tokens SET last_activity = ? WHERE id = ?');
    $upd->execute([$now, (int) $row['id']]);
    $payload['last_activity'] = $now;

    $_SESSION = [];
    api_auth_apply_payload_to_session($payload);
    $_SESSION['last_activity'] = $now;

    $GLOBALS['__api_auth_token_plain'] = $plain;
    $GLOBALS['__api_auth_token_row_id'] = (int) $row['id'];

    return 'ok';
}

function api_auth_persist_current_session(PDO $pdo): void
{
    if (empty($GLOBALS['__api_auth_token_plain'])) {
        return;
    }
    $plain = (string) $GLOBALS['__api_auth_token_plain'];
    $payload = api_auth_collect_session_payload();
    $now = time();
    $payload['last_activity'] = $now;
    $_SESSION['last_activity'] = $now;
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare(
        'UPDATE api_auth_tokens SET session_json = ?, last_activity = ? WHERE token = ?'
    );
    $stmt->execute([$json, $now, $plain]);
}

/**
 * Merge keys into stored token payload (e.g. after secondary password on PHP page).
 */
function api_auth_merge_token_session(PDO $pdo, string $plainToken, array $merge): bool
{
    if (strlen($plainToken) !== 64 || !ctype_xdigit($plainToken)) {
        return false;
    }
    api_auth_ensure_table($pdo);
    $stmt = $pdo->prepare('SELECT session_json FROM api_auth_tokens WHERE token = ? LIMIT 1');
    $stmt->execute([$plainToken]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return false;
    }
    $payload = json_decode((string) $row['session_json'], true);
    if (!is_array($payload)) {
        return false;
    }
    foreach ($merge as $k => $v) {
        $payload[$k] = $v;
    }
    $now = time();
    $payload['last_activity'] = $now;
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $upd = $pdo->prepare(
        'UPDATE api_auth_tokens SET session_json = ?, last_activity = ? WHERE token = ?'
    );
    $upd->execute([$json, $now, $plainToken]);
    return true;
}
