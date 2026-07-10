<?php
/**
 * Transaction Type Search API — one grid row per approved transaction (all history).
 * Path: api/transactions/type_transaction_search_api.php
 */

session_start();
session_write_close();

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';
require_once __DIR__ . '/type_transaction_search_lib.php';

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

    $currencyFilters = [];
    if (isset($_GET['currency']) && trim((string) $_GET['currency']) !== '') {
        foreach (explode(',', (string) $_GET['currency']) as $code) {
            $code = strtoupper(trim($code));
            if ($code !== '') {
                $currencyFilters[$code] = true;
            }
        }
        $currencyFilters = array_keys($currencyFilters);
    }

    $rows = typeTxSearchFetchTransactions($pdo, $listScope, $formType, $currencyFilters);
    $payload = typeTxSearchBuildPayload($rows);

    api_success(array_merge($payload, [
        'transaction_type' => $formType,
        'transaction_count' => count($rows),
    ]));
} catch (InvalidArgumentException $e) {
    api_error($e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('type_transaction_search_api: ' . $e->getMessage());
    api_error($e->getMessage() ?: '搜索失败', 500);
}
