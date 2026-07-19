<?php
/**
 * Maintenance mode toggle API (IT allowlist only).
 *
 * GET  : return current maintenance mode state
 * POST : action=enable|disable
 */

session_start();
session_write_close();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/maintenance_gate.php';

function maintenance_mode_json_response(bool $success, string $message, $data = null, ?int $httpCode = null): void
{
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode(
        [
            'success' => $success,
            'message' => $message,
            'data' => $data,
        ],
        JSON_UNESCAPED_UNICODE
    );
}

function maintenance_mode_require_it(PDO $pdo): void
{
    if (!isset($_SESSION['user_id'])) {
        maintenance_mode_json_response(false, 'User not logged in', null, 401);
        exit;
    }

    $loginId = (string) ($_SESSION['login_id'] ?? '');
    if (!maintenance_gate_is_active_user_login($pdo, $loginId)) {
        maintenance_mode_json_response(false, 'No permission to manage maintenance mode', null, 403);
        exit;
    }
}

function maintenance_mode_load_state(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT maintenance_mode_enabled, maintenance_message_id, updated_by, updated_at
         FROM system_runtime_flags
         WHERE id = 1
         LIMIT 1"
    );
    $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
    if (!$row) {
        return [
            'enabled' => false,
            'maintenance_message_id' => null,
            'updated_by' => null,
            'updated_at' => null,
            'message_preview' => '',
        ];
    }

    $messageId = isset($row['maintenance_message_id']) ? (int) $row['maintenance_message_id'] : 0;
    $preview = '';
    if ($messageId > 0) {
        $msgStmt = $pdo->prepare(
            "SELECT prefix, content
             FROM maintenance_marquee
             WHERE id = ?
             LIMIT 1"
        );
        $msgStmt->execute([$messageId]);
        $msg = $msgStmt->fetch(PDO::FETCH_ASSOC);
        if ($msg) {
            $prefix = trim((string) ($msg['prefix'] ?? ''));
            $content = trim((string) ($msg['content'] ?? ''));
            $preview = trim($prefix . ' ' . trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        }
    }

    return [
        'enabled' => ((int) ($row['maintenance_mode_enabled'] ?? 0)) === 1,
        'maintenance_message_id' => $messageId > 0 ? $messageId : null,
        'updated_by' => $row['updated_by'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'message_preview' => $preview,
    ];
}

function maintenance_mode_resolve_latest_message_id(PDO $pdo): int
{
    $stmt = $pdo->query(
        "SELECT id
         FROM maintenance_marquee
         WHERE company_code = 'C168' AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1"
    );
    $id = $stmt ? (int) $stmt->fetchColumn() : 0;
    return $id > 0 ? $id : 0;
}

function maintenance_mode_is_valid_active_message(PDO $pdo, int $messageId): bool
{
    if ($messageId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM maintenance_marquee
         WHERE id = ?
           AND company_code = 'C168'
           AND status = 'active'
         LIMIT 1"
    );
    $stmt->execute([$messageId]);
    return (bool) $stmt->fetchColumn();
}

function maintenance_mode_upsert(PDO $pdo, int $enabled, ?int $messageId, string $updatedBy): void
{
    $stmt = $pdo->prepare(
        "INSERT INTO system_runtime_flags (
            id, maintenance_mode_enabled, maintenance_message_id, updated_by, updated_at
         ) VALUES (
            1, ?, ?, ?, NOW()
         )
         ON DUPLICATE KEY UPDATE
            maintenance_mode_enabled = VALUES(maintenance_mode_enabled),
            maintenance_message_id = VALUES(maintenance_message_id),
            updated_by = VALUES(updated_by),
            updated_at = VALUES(updated_at)"
    );
    $stmt->execute([$enabled, $messageId, $updatedBy]);
}

function maintenance_mode_invalidate_non_it_remember_tokens(PDO $pdo): void
{
    // Cannot kill in-memory PHP sessions across all workers instantly,
    // but clearing remember tokens prevents silent re-login and enforces logout on next heartbeat/request.
    $pdo->exec(
        "UPDATE user
         SET remember_token = NULL,
             remember_token_expires = NULL
         WHERE UPPER(TRIM(login_id)) NOT IN ('IT_JK', 'IT_JS', 'IT_MS')"
    );
}

if (!($pdo instanceof PDO)) {
    maintenance_mode_json_response(false, 'Database unavailable', null, 503);
    exit;
}

try {
    maintenance_mode_require_it($pdo);

    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        maintenance_mode_json_response(true, 'success', maintenance_mode_load_state($pdo));
        exit;
    }

    if ($method !== 'POST') {
        maintenance_mode_json_response(false, 'Method not allowed', null, 405);
        exit;
    }

    $action = strtolower(trim((string) ($_POST['action'] ?? '')));
    $updatedBy = (string) ($_SESSION['login_id'] ?? $_SESSION['name'] ?? 'IT');

    if ($action === 'enable') {
        $messageId = isset($_POST['maintenance_id']) ? (int) $_POST['maintenance_id'] : 0;
        if ($messageId <= 0) {
            $messageId = maintenance_mode_resolve_latest_message_id($pdo);
        }
        if ($messageId <= 0 || !maintenance_mode_is_valid_active_message($pdo, $messageId)) {
            maintenance_mode_json_response(false, 'No active maintenance content found. Please publish maintenance content first.', null, 400);
            exit;
        }
        maintenance_mode_upsert($pdo, 1, $messageId, $updatedBy);
        maintenance_mode_invalidate_non_it_remember_tokens($pdo);
        maintenance_mode_json_response(true, 'Maintenance mode enabled', maintenance_mode_load_state($pdo));
        exit;
    }

    if ($action === 'disable') {
        maintenance_mode_upsert($pdo, 0, null, $updatedBy);
        maintenance_mode_json_response(true, 'Maintenance mode disabled', maintenance_mode_load_state($pdo));
        exit;
    }

    maintenance_mode_json_response(false, 'Invalid action', null, 400);
} catch (PDOException $e) {
    maintenance_mode_json_response(false, 'Database error: ' . $e->getMessage(), null, 500);
} catch (Throwable $e) {
    maintenance_mode_json_response(false, $e->getMessage(), null, 400);
}
