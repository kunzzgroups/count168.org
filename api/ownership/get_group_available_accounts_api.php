<?php
/**
 * Group Earnings API — Get available accounts for a group
 * GET ?group_id=IG
 * 
 * Returns all owners/users from all companies belonging to this group,
 * so the "+ Add Account" dropdown in Group Earnings has the full list.
 */
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$group_id = $_GET['group_id'] ?? null;

if (!$group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

try {
    // 1. Find all company IDs that belong to this group
    $stmtCompanies = $pdo->prepare("
        SELECT id FROM company 
        WHERE UPPER(group_id) = UPPER(?) AND company_id != ''
    ");
    $stmtCompanies->execute([$group_id]);
    $companyIds = $stmtCompanies->fetchAll(PDO::FETCH_COLUMN);

    $accountMap = []; // keyed by composite id to deduplicate

    if (!empty($companyIds)) {
        $in = str_repeat('?,', count($companyIds) - 1) . '?';

        // 2. Get all owners from these companies (native owners)
        $stmtOwners = $pdo->prepare("
            SELECT DISTINCT CONCAT('O_', o.id) as id,
                   o.owner_code as account_name,
                   o.name,
                   'OWNER' as role,
                   'owner' as type,
                   CASE WHEN c.owner_id = o.id THEN 1 ELSE 0 END as is_main_owner
            FROM owner o
            INNER JOIN company c ON c.owner_id = o.id
            WHERE c.id IN ($in) AND LOWER(o.status) = 'active'
        ");
        $stmtOwners->execute($companyIds);
        foreach ($stmtOwners->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $accountMap[$row['id']] = $row;
        }

        // 3. Get owners linked via company_ownership (external partners in these companies)
        $stmtLinked = $pdo->prepare("
            SELECT DISTINCT CONCAT('O_', o.id) as id,
                   COALESCE(co.partner_group_id, o.owner_code) as account_name,
                   o.name,
                   'OWNER' as role,
                   'owner' as type,
                   0 as is_main_owner
            FROM company_ownership co
            INNER JOIN owner o ON co.account_id = o.id AND co.owner_type = 'owner'
            WHERE co.company_id IN ($in) AND LOWER(o.status) = 'active'
        ");
        $stmtLinked->execute($companyIds);
        foreach ($stmtLinked->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!isset($accountMap[$row['id']])) {
                $accountMap[$row['id']] = $row;
            }
        }

        // 4. Get partnership users mapped to these companies
        $stmtUsers = $pdo->prepare("
            SELECT DISTINCT CONCAT('U_', u.id) as id,
                   u.login_id as account_name,
                   u.name,
                   'PARTNERSHIP' as role,
                   'user' as type,
                   0 as is_main_owner
            FROM user u
            INNER JOIN user_company_map ucm ON u.id = ucm.user_id
            WHERE ucm.company_id IN ($in) 
              AND LOWER(u.role) = 'partnership' 
              AND LOWER(u.status) = 'active'
        ");
        $stmtUsers->execute($companyIds);
        foreach ($stmtUsers->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!isset($accountMap[$row['id']])) {
                $accountMap[$row['id']] = $row;
            }
        }
    }

    // Sort by account_name
    $combined = array_values($accountMap);
    usort($combined, function ($a, $b) {
        return strcmp($a['account_name'], $b['account_name']);
    });

    echo json_encode([
        'status' => 'success',
        'data'   => $combined
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'status'  => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
