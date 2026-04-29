<?php
/**
 * Group Earnings API — Get ownership rows for a specific group
 * GET ?group_id=AP
 */
require_once '../../session_check.php';
require_once '../../config.php';
require_once '../includes/money_decimal.php';

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
    // Check if group_ownership table exists
    $tableExists = $pdo->query("SHOW TABLES LIKE 'group_ownership'")->rowCount() > 0;
    if (!$tableExists) {
        echo json_encode(['status' => 'success', 'data' => []]);
        exit();
    }

    // Fetch ownership rows for this group, joining owner/user tables for display.
    // owner_type = 'group' represents a self-group link (another of the same owner's
    // groups pooled into this one). composite_id uses G_<partner_group_id>.
    $stmt = $pdo->prepare("
        SELECT go.id as ownership_id,
               go.percentage,
               go.owner_type,
               go.account_id,
               CASE
                   WHEN go.owner_type = 'group' THEN CONCAT('G_', go.partner_group_id)
                   WHEN go.owner_type = 'user'  THEN CONCAT('U_', go.account_id)
                   ELSE                              CONCAT('O_', go.account_id)
               END as composite_id,
               CASE
                   WHEN go.owner_type = 'group' THEN CONCAT('Group: ', go.partner_group_id)
                   ELSE COALESCE(go.partner_group_id, o.owner_code, u.login_id)
               END as account_name,
               CASE
                   WHEN go.owner_type = 'group' THEN 'Group Equity'
                   ELSE COALESCE(o.name, u.name)
               END as name,
               CASE
                   WHEN go.owner_type = 'group' THEN 'GROUP'
                   WHEN go.owner_type = 'user'  THEN u.role
                   WHEN go.owner_type = 'owner' THEN 'OWNER'
               END as role,
               go.partner_group_id,
               CASE WHEN go.owner_type = 'user' THEN go.account_id ELSE NULL END as user_raw_id,
               go.read_only,
               CASE
                   WHEN go.owner_type = 'owner' AND go.account_id != go.owner_id THEN 1
                   ELSE 0
               END as is_external_partner
        FROM group_ownership go
        LEFT JOIN owner o ON go.account_id = o.id AND go.owner_type = 'owner'
        LEFT JOIN user u ON go.account_id = u.id AND go.owner_type = 'user'
        WHERE go.group_id = ?
        ORDER BY go.percentage DESC
    ");

    $stmt->execute([$group_id]);
    $owners = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($owners as &$owner) {
        $owner['percentage'] = money_out($owner['percentage'], 2);
    }

    echo json_encode([
        'status' => 'success',
        'data'   => $owners
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'status'  => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
