<?php
require_once __DIR__ . '/session_check.php';
require_once __DIR__ . '/includes/deleted_log.php';
require_once __DIR__ . '/includes/deleted_log_display.php';
require_once __DIR__ . '/includes/deleted_log_entry_sources.php';
require_once __DIR__ . '/includes/deleted_log_page_scope.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$role = strtolower(trim((string) ($_SESSION['role'] ?? '')));
$userType = strtolower((string) ($_SESSION['user_type'] ?? ''));
$canAccess = in_array($role, ['admin', 'owner', 'manager', 'supervisor'], true)
    || $userType === 'owner';
if (!$canAccess) {
    header('Location: dashboard.php');
    exit;
}

$moduleMap = [
    'accounts' => 'Accounts',
    'transactions' => 'Transactions',
    'ownership' => 'Ownership',
    'data_capture' => 'Data Capture',
    'bankprocess' => 'Bank Process',
    'maintenance' => 'Maintenance',
];

$moduleToTables = [
    'accounts' => ['account', 'account_company', 'account_currency', 'account_link', 'currency'],
    'transactions' => ['transactions', 'transaction_entry'],
    'ownership' => ['company_ownership', 'group_ownership'],
    'data_capture' => ['data_captures', 'data_capture_details', 'submitted_processes'],
    'bankprocess' => ['bank_process', 'process'],
    'maintenance' => ['maintenance_marquee', 'data_capture_templates'],
];

function deleted_log_table_to_module(string $table, array $moduleToTables): string
{
    foreach ($moduleToTables as $key => $tables) {
        if (in_array($table, $tables, true)) {
            return $key;
        }
    }
    return '';
}

$scope = deleted_log_page_company_scope($pdo);
if ($scope['mode'] === 'none') {
    header('Location: dashboard.php');
    exit;
}

$scopeMode = $scope['mode'];
$companyScopeMulti = ($scopeMode === 'in');
$companyFilter = $companyScopeMulti ? '' : (string) ($scope['id'] ?? '');
$scopeCompanyIds = $companyScopeMulti ? $scope['ids'] : [(string) ($scope['id'] ?? '')];

$scopeHintText = '';
if ($scopeMode === 'all') {
    $scopeHintText = 'Admin / Owner：可查看<strong>全部公司</strong>的删除记录（与当前侧栏所选公司无关）。';
} elseif ($scopeMode === 'in') {
    $scopeHintText = '已合并显示您可访问公司、以及<strong>相同 GroupID</strong>下其他公司的删除记录（与当前侧栏选哪一家公司无关）。';
}

$where = [];
$params = [];
if ($scopeMode === 'one') {
    $where[] = 'd.`company_id` = ?';
    $params[] = $companyFilter;
} elseif ($scopeMode === 'in') {
    $phC = implode(',', array_fill(0, count($scopeCompanyIds), '?'));
    $where[] = 'd.`company_id` IN (' . $phC . ')';
    $params = array_merge($params, $scopeCompanyIds);
}

$filterUser = isset($_GET['user']) ? trim((string) $_GET['user']) : '';
$filterModule = isset($_GET['module']) ? trim((string) $_GET['module']) : '';
$filterEntry = isset($_GET['entry']) ? trim((string) $_GET['entry']) : '';
$entryTabDefs = deleted_log_entry_source_definitions();
if ($filterEntry !== '' && !array_key_exists($filterEntry, $entryTabDefs)) {
    $filterEntry = '';
}
$searchQ = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
$pageNum = isset($_GET['p']) ? max(1, (int) $_GET['p']) : 1;
$perPage = 20;
$offset = ($pageNum - 1) * $perPage;

if ($filterUser !== '') {
    $where[] = 'd.`user` = ?';
    $params[] = $filterUser;
}

if ($filterModule !== '' && isset($moduleToTables[$filterModule])) {
    $tbls = $moduleToTables[$filterModule];
    $in = implode(',', array_fill(0, count($tbls), '?'));
    $where[] = "d.`table_name` IN ($in)";
    $params = array_merge($params, $tbls);
}

if ($filterEntry !== '') {
    $entryDef = deleted_log_entry_source_for_key($filterEntry);
    if ($entryDef !== null && !empty($entryDef['pages'])) {
        $pageList = $entryDef['pages'];
        $inPg = implode(',', array_fill(0, count($pageList), '?'));
        $where[] = 'd.`page` IN (' . $inPg . ')';
        $params = array_merge($params, $pageList);
    }
}

if ($searchQ !== '') {
    $where[] = '(d.`user` LIKE ? OR d.`page` LIKE ? OR d.`record_id` LIKE ? OR d.`ip_address` LIKE ? OR d.`table_name` LIKE ?)';
    $like = '%' . $searchQ . '%';
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
}

$whereSql = implode(' AND ', $where);

$rows = [];
$total = 0;
$userDistinct = [];

try {
    $countStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM `deleted_logs` d WHERE $whereSql"
    );
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $dataSql = "
        SELECT d.*, c.`company_id` AS company_code
        FROM `deleted_logs` d
        LEFT JOIN `company` c ON c.`id` = CAST(d.`company_id` AS UNSIGNED)
        WHERE $whereSql
        ORDER BY d.`created_at` DESC
        LIMIT " . (int) $perPage . " OFFSET " . (int) $offset;
    $dataStmt = $pdo->prepare($dataSql);
    $dataStmt->execute($params);
    $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

    $udSql = 'SELECT DISTINCT d.`user` FROM `deleted_logs` d WHERE ';
    if ($scopeMode === 'one') {
        $udSql .= 'd.`company_id` = ? AND ';
        $udParams = [$companyFilter];
    } elseif ($scopeMode === 'in') {
        $udPh = implode(',', array_fill(0, count($scopeCompanyIds), '?'));
        $udSql .= 'd.`company_id` IN (' . $udPh . ') AND ';
        $udParams = $scopeCompanyIds;
    } else {
        $udParams = [];
    }
    $udSql .= "d.`user` IS NOT NULL AND d.`user` <> '' ORDER BY d.`user` ASC";
    $ud = $pdo->prepare($udSql);
    $ud->execute($udParams);
    $userDistinct = $ud->fetchAll(PDO::FETCH_COLUMN) ?: [];
} catch (Throwable $e) {
    error_log('deleted-log page: ' . $e->getMessage());
}

$accountIdResolveMap = deleted_log_display_resolve_account_ids($pdo, $rows);

$totalPages = max(1, (int) ceil($total / $perPage));
if ($pageNum > $totalPages) {
    $pageNum = $totalPages;
}

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};
$sidebarCompanyIdJs = trim((string) ($_SESSION['company_id'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deleted Log - EazyCount</title>
    <link rel="icon" type="image/png" href="/images/count_logo.png">
    <link href="https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo $assetVer('css/accountCSS.css'); ?>">
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/deleted-log.css?v=<?php echo $assetVer('css/deleted-log.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body class="account-page">
    <div class="container">
        <div class="content">
            <h1 class="account-page-title">Deleted Log</h1>
            <div class="deleted-log-separator-line"></div>
            <?php if ($scopeHintText !== '') : ?>
            <p class="deleted-log-scope-hint"><?php echo $scopeHintText; ?></p>
            <?php endif; ?>


            <nav class="deleted-log-entry-tabs" aria-label="Delete entry source">
                <?php
                $navBase = $_GET;
                foreach ($entryTabDefs as $tabKey => $tabMeta) :
                    $nq = $navBase;
                    if ($tabKey === '') {
                        unset($nq['entry']);
                    } else {
                        $nq['entry'] = $tabKey;
                    }
                    $nq['p'] = 1;
                    $tabHref = 'deleted-log.php?' . http_build_query($nq);
                    $isActive = ($filterEntry === $tabKey);
                    ?>
                    <a class="deleted-log-entry-tab<?php echo $isActive ? ' is-active' : ''; ?>"
                       href="<?php echo htmlspecialchars($tabHref, ENT_QUOTES, 'UTF-8'); ?>"
                       title="<?php echo htmlspecialchars($tabMeta['hint'] ?? '', ENT_QUOTES, 'UTF-8'); ?>">
                        <?php echo htmlspecialchars($tabMeta['label'], ENT_QUOTES, 'UTF-8'); ?>
                    </a>
                <?php endforeach; ?>
            </nav>

<form class="deleted-log-toolbar" method="get" action="deleted-log.php">
    <?php if ($filterEntry !== '') : ?>
        <input type="hidden" name="entry" value="<?php echo htmlspecialchars($filterEntry, ENT_QUOTES, 'UTF-8'); ?>">
    <?php endif; ?>
    <div>
        <label for="f-user">User</label>
        <select name="user" id="f-user">
            <option value="">All</option>
            <?php foreach ($userDistinct as $u): ?>
                <option value="<?php echo htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); ?>" <?php echo $filterUser === (string) $u ? 'selected' : ''; ?>>
                    <?php echo htmlspecialchars((string) $u, ENT_QUOTES, 'UTF-8'); ?>
                </option>
            <?php endforeach; ?>
        </select>
    </div>
    <div>
        <label for="f-module">Module</label>
        <select name="module" id="f-module">
            <option value="">All</option>
            <?php foreach ($moduleMap as $key => $label): ?>
                <option value="<?php echo htmlspecialchars($key, ENT_QUOTES, 'UTF-8'); ?>" <?php echo $filterModule === $key ? 'selected' : ''; ?>>
                    <?php echo htmlspecialchars($label, ENT_QUOTES, 'UTF-8'); ?>
                </option>
            <?php endforeach; ?>
        </select>
    </div>
    <div>
        <label for="f-q">Search</label>
        <input type="search" name="q" id="f-q" placeholder="User, page, Acc ID, IP…" value="<?php echo htmlspecialchars($searchQ, ENT_QUOTES, 'UTF-8'); ?>">
    </div>
    <button type="submit" class="account-btn account-btn-add">Apply</button>
</form>

<div class="account-table-wrapper">
    <div class="deleted-log-table-header">
        <div>Time</div>
        <div>User</div>
        <div>Company</div>
        <div>Acc ID</div>
        <div>What happened</div>
        <div>IP</div>
        <div>Detail</div>
        <div>Restore</div>
    </div>
    <?php foreach ($rows as $r): ?>
        <?php
        $tbl = (string) ($r['table_name'] ?? '');
        $created = $r['created_at'] ?? '';
        $act = strtoupper((string) ($r['action_type'] ?? ''));
        $canRestoreRow = ($act !== 'RESTORE');
        $payload = $r['deleted_data'] ?? '';
        $decodedPayload = deleted_log_display_decode_payload($payload);
        if (is_array($payload)) {
            $jsonPretty = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        } else {
            $jsonPretty = is_array($decodedPayload)
                ? json_encode($decodedPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
                : (string) $payload;
        }
        $companyShow = $r['company_code'] ?? ($r['company_id'] ?? '');
        $accShow = deleted_log_display_acc_id($tbl, $decodedPayload, $accountIdResolveMap);
        $summary = deleted_log_display_summary($tbl, (string) ($r['page'] ?? ''), $decodedPayload, $accShow);
        if ($act === 'RESTORE') {
            $summary = '已从日志还原 · ' . $summary;
        } elseif ($act !== '' && $act !== 'DELETE') {
            $summary = $act . ' · ' . $summary;
        }
        ?>
        <div class="deleted-log-card" data-log-id="<?php echo (int) ($r['id'] ?? 0); ?>">
            <div><?php echo htmlspecialchars((string) $created, ENT_QUOTES, 'UTF-8'); ?></div>
            <div><?php echo htmlspecialchars((string) ($r['user'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></div>
            <div><?php echo htmlspecialchars((string) $companyShow, ENT_QUOTES, 'UTF-8'); ?></div>
            <div><?php echo htmlspecialchars($accShow, ENT_QUOTES, 'UTF-8'); ?></div>
            <div class="deleted-log-summary-cell" title="<?php echo htmlspecialchars($summary, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($summary, ENT_QUOTES, 'UTF-8'); ?></div>
            <div><?php echo htmlspecialchars((string) ($r['ip_address'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></div>
            <div class="deleted-log-cell-actions">
                <button type="button" class="deleted-log-btn deleted-log-btn--primary js-deleted-view" data-json="<?php echo htmlspecialchars($jsonPretty, ENT_QUOTES, 'UTF-8'); ?>">View</button>
            </div>
            <div class="deleted-log-cell-actions">
                <?php if ($canRestoreRow): ?>
                    <button type="button" class="deleted-log-btn deleted-log-btn--danger js-deleted-restore" data-id="<?php echo (int) ($r['id'] ?? 0); ?>">Restore</button>
                <?php else: ?>
                    <span style="color:#94a3b8;">—</span>
                <?php endif; ?>
            </div>
        </div>
    <?php endforeach; ?>
    <?php if (count($rows) === 0): ?>
        <div class="deleted-log-card" style="grid-template-columns:1fr;border:none;">
            <div style="padding:16px;color:#64748b;">No records.</div>
        </div>
    <?php endif; ?>
</div>

<div class="account-pagination-container" style="margin-top:16px;">
    <?php
    $qs = $_GET;
    $qs['p'] = max(1, $pageNum - 1);
    $prevUrl = 'deleted-log.php?' . http_build_query($qs);
    $qs['p'] = min($totalPages, $pageNum + 1);
    $nextUrl = 'deleted-log.php?' . http_build_query($qs);
    ?>
    <button type="button" class="account-pagination-btn" <?php echo $pageNum <= 1 ? 'disabled' : ''; ?> onclick="location.href='<?php echo htmlspecialchars($prevUrl, ENT_QUOTES, 'UTF-8'); ?>'">◀</button>
    <span class="account-pagination-info"><?php echo (int) $pageNum; ?> / <?php echo (int) $totalPages; ?> (<?php echo (int) $total; ?>)</span>
    <button type="button" class="account-pagination-btn" <?php echo $pageNum >= $totalPages ? 'disabled' : ''; ?> onclick="location.href='<?php echo htmlspecialchars($nextUrl, ENT_QUOTES, 'UTF-8'); ?>'">▶</button>
</div>

<div id="deletedLogJsonOverlay" class="deleted-log-json-modal-overlay" aria-hidden="true">
    <div class="deleted-log-json-modal" role="dialog" aria-modal="true" aria-labelledby="deletedLogJsonTitle">
        <header>
            <strong id="deletedLogJsonTitle">Deleted data (JSON)</strong>
            <button type="button" class="deleted-log-btn js-deleted-modal-close" aria-label="Close">Close</button>
        </header>
        <pre id="deletedLogJsonPre"></pre>
    </div>
</div>

<script>
(function () {
    var overlay = document.getElementById('deletedLogJsonOverlay');
    var pre = document.getElementById('deletedLogJsonPre');
    document.querySelectorAll('.js-deleted-view').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var t = btn.getAttribute('data-json') || '';
            pre.textContent = t;
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');
        });
    });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        }
    });
    document.querySelectorAll('.js-deleted-modal-close').forEach(function (b) {
        b.addEventListener('click', function () {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        });
    });

    document.querySelectorAll('.js-deleted-restore').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-id'), 10);
            if (!id || !window.confirm('Restore this record from the log?')) return;
            fetch('api/restore_api.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ log_id: id })
            }).then(function (r) { return r.json(); }).then(function (j) {
                if (j && j.success) {
                    var d = j.data || {};
                    var lc = d.log_company_id != null ? String(d.log_company_id) : '';
                    var sid = <?php echo json_encode($sidebarCompanyIdJs, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
                    if (lc !== '' && String(sid) !== lc) {
                        alert('数据已写回数据库。若要在账号列表等页面查看，请先在侧栏切换到该删除记录所属公司（内部 company id: ' + lc + '）。');
                    }
                    location.reload();
                } else {
                    alert((j && (j.message || j.error)) ? (j.message || j.error) : 'Restore failed');
                }
            }).catch(function () {
                alert('Restore failed');
            });
        });
    });
})();
</script>

        </div>
    </div>
</body>
</html>
