<?php
/**
 * Short-lived SSE ticket for Transaction Payment realtime subscribe.
 * Path: api/transactions/realtime_ticket_api.php
 */

session_start();
session_write_close();

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/transaction_scope.php';
require_once __DIR__ . '/../includes/ledger_realtime.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('请先登录', 401);
        exit;
    }

    if (!$pdo instanceof PDO) {
        api_error('Database connection failed', 503);
        exit;
    }

    $cfg = tx_ledger_realtime_config();
    if (!$cfg['enabled']) {
        api_success([
            'enabled' => false,
            'ticket' => null,
            'channels' => [],
            'sse_path' => '/realtime/sse',
            'expires_at' => null,
        ], 'Realtime disabled');
        exit;
    }

    $scopeParams = $_GET;
    $viewGroupForAccess = dcNormalizeGroupId(
        $scopeParams['view_group'] ?? $scopeParams['group_id'] ?? ''
    );

    $listScope = tx_resolve_transaction_list_scope($pdo, $scopeParams);
    $permCompanyId = tx_permission_company_id_for_scope($pdo, $listScope);
    if ($permCompanyId <= 0 && ($listScope['mode'] ?? '') !== 'group') {
        throw new Exception('缺少公司或集团信息');
    }
    if ($permCompanyId > 0) {
        dcAssertUserCanAccessCompany(
            $pdo,
            $permCompanyId,
            $viewGroupForAccess !== '' ? $viewGroupForAccess : null
        );
    }

    $channels = tx_ledger_realtime_channels_from_scope($listScope);
    if ($channels === []) {
        api_success([
            'enabled' => false,
            'ticket' => null,
            'channels' => [],
            'sse_path' => '/realtime/sse',
            'expires_at' => null,
        ], 'No realtime channels for scope');
        exit;
    }

    $expiresAt = time() + 120;
    $payload = [
        'exp' => $expiresAt,
        'channels' => $channels,
        'uid' => (int) ($_SESSION['user_id'] ?? 0),
        'ut' => (string) ($_SESSION['user_type'] ?? 'user'),
    ];
    $ticket = tx_ledger_realtime_sign_ticket($payload, $cfg['secret']);

    api_success([
        'enabled' => true,
        'ticket' => $ticket,
        'channels' => $channels,
        'sse_path' => '/realtime/sse',
        'expires_at' => $expiresAt,
    ]);
} catch (InvalidArgumentException $e) {
    api_error($e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('realtime_ticket_api: ' . $e->getMessage());
    api_error($e->getMessage() ?: 'Failed to issue realtime ticket', 500);
}
