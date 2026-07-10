<?php
/**
 * Transaction Type Account Search API
 * Returns account DB ids that have ever executed a given transaction type (all dates).
 * Used by Transaction Payment page right-side Search (type-based account list).
 *
 * Path: api/transactions/type_account_search_api.php
 */

session_start();
session_write_close();

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';
require_once __DIR__ . '/type_account_search_lib.php';
require_once __DIR__ . '/type_period_search_lib.php';

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('请先登录');
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

    $formType = isset($_GET['transaction_type']) ? strtoupper(trim((string) $_GET['transaction_type'])) : '';
    if ($formType === '') {
        throw new InvalidArgumentException('transaction_type 为必填项');
    }

    $accountIds = typePeriodSearchFetchEligibleAccountIds($pdo, $listScope, $formType);
    sort($accountIds, SORT_NUMERIC);

    api_success([
        'transaction_type' => $formType,
        'account_ids' => $accountIds,
        'account_count' => count($accountIds),
    ]);
} catch (InvalidArgumentException $e) {
    api_error($e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('type_account_search_api: ' . $e->getMessage());
    api_error($e->getMessage() ?: '搜索失败', 500);
}
