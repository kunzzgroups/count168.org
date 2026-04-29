<?php
require_once '../../session_check.php';
require_once '../../config.php';
require_once '../includes/money_decimal.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$current_user_id = $_SESSION['user_id'];
$current_user_role = $_SESSION['role'] ?? '';
// ?all=1 → bypass session group filter (used by ownership page's local group filter bar)
$fetchAll = isset($_GET['all']) && $_GET['all'] === '1';

try {
    // Check if the table exists first (to prevent fatals if SQL wasn't run)
    $tableExists = $pdo->query("SHOW TABLES LIKE 'company_ownership'")->rowCount() > 0;
    
    // Get companies available to this user
    require_once '../get_companies_helper.php';
    $companies = [];
    if ($current_user_role === 'owner') {
        // Use real_owner_id (permanent id) — owner_id can be swapped to another owner's id
        // when the user selects an external company (e.g. LOL selects JK's company TT).
        // Without this, we'd return JK's companies instead of LOL's.
        $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id);
        $fetched = getCompaniesByOwner($pdo, $owner_id, $fetchAll);
        foreach ($fetched as $c) {
            $companies[] = [
                'id'              => $c['id'],
                'name'            => $c['company_id'],
                'expiration_date' => $c['expiration_date'] ?? null,
                'group_id'        => $c['group_id'] ?? null,
            ];
        }
    } else {
        $fetched = getCompaniesByUser($pdo, $current_user_id, $fetchAll);
        foreach ($fetched as $c) {
            $companies[] = [
                'id'              => $c['id'],
                'name'            => $c['company_id'],
                'expiration_date' => $c['expiration_date'] ?? null,
                'group_id'        => $c['group_id'] ?? null,
            ];
        }
    }

    // Get total ownership assigned for each company
    if ($tableExists && count($companies) > 0) {
        $hasOwnerType = $pdo->query("SHOW COLUMNS FROM company_ownership LIKE 'owner_type'")->rowCount() > 0;
        
        $company_ids = array_column($companies, 'id');
        $in = str_repeat('?,', count($company_ids) - 1) . '?';
        
        if ($hasOwnerType) {
            $stmt = $pdo->prepare("
                SELECT company_id, SUM(percentage) as total_percent
                FROM company_ownership
                WHERE company_id IN ($in) AND owner_type != 'account'
                GROUP BY company_id
            ");
        } else {
            // If before migration, return 0 for safe fallback rather than accounts we want ignored
            $stmt = $pdo->prepare("
                SELECT company_id, SUM(percentage) as total_percent
                FROM company_ownership
                WHERE company_id IN ($in) AND 1=0
                GROUP BY company_id
            ");
        }
        $stmt->execute($company_ids);
        $totals = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Map totals to companies
        foreach ($companies as &$company) {
            $company['allocated_percentage'] = isset($totals[$company['id']]) ? money_out($totals[$company['id']], 2) : '0';
        }
    } else {
        foreach ($companies as &$company) {
            $company['allocated_percentage'] = '0';
        }
    }

    echo json_encode([
        'status' => 'success',
        'data' => $companies
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
