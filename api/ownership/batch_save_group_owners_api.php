<?php
/**
 * Group Earnings API — Batch save group ownership
 * POST body: { "group_id": "AP", "owners": [{ "account_id": "O_1", "percentage": 30, "read_only": 1 }] }
 */
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$inputData = json_decode(file_get_contents('php://input'), true);

$group_id = $inputData['group_id'] ?? null;
$owners   = $inputData['owners'] ?? [];

if (!$group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing group_id']);
    exit();
}

// Validate total percentage
$total_percentage = 0;
foreach ($owners as $owner) {
    if (!isset($owner['account_id']) || !isset($owner['percentage'])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid owner data format']);
        exit();
    }
    $pct = (float) $owner['percentage'];
    if ($pct < 0 || $pct > 100) {
        echo json_encode(['status' => 'error', 'message' => 'Percentage must be between 0 and 100']);
        exit();
    }
    $total_percentage += $pct;
}

if ($total_percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Total allocation exceeds 100%']);
    exit();
}

try {
    // Auto-create table if not exists
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS group_ownership (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(50) NOT NULL,
            owner_id INT NOT NULL,
            account_id INT NOT NULL,
            owner_type ENUM('owner','user','group') NOT NULL DEFAULT 'owner',
            percentage DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            partner_group_id VARCHAR(50) DEFAULT NULL,
            read_only TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    try { $pdo->exec("ALTER TABLE group_ownership MODIFY COLUMN owner_type ENUM('owner','user','group') NOT NULL DEFAULT 'owner'"); } catch (Exception $e) {}
    try { $pdo->exec("ALTER TABLE group_ownership DROP INDEX uq_group_account"); } catch (Exception $e) {}

    // Resolve effective owner id (admin sessions carry user.id, not owner.id)
    $sessionRole = strtolower($_SESSION['role'] ?? '');
    if ($sessionRole === 'owner') {
        $owner_id = (int)($_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $_SESSION['user_id']);
    } else {
        $stmtOwn = $pdo->prepare("SELECT DISTINCT owner_id FROM company WHERE UPPER(TRIM(group_id)) = UPPER(TRIM(?)) LIMIT 1");
        $stmtOwn->execute([$group_id]);
        $owner_id = (int) $stmtOwn->fetchColumn();
    }
    if ($owner_id <= 0) {
        echo json_encode(['status' => 'error', 'message' => 'Cannot determine the owner of this group']);
        exit();
    }

    $pdo->beginTransaction();

    // Preserve existing partner_group_id + read_only for owner-type rows
    $existingGroups = [];
    $existingReadOnly = [];
    $stmtGroups = $pdo->prepare("SELECT account_id, partner_group_id, COALESCE(read_only, 1) as read_only FROM group_ownership WHERE group_id = ? AND owner_type = 'owner'");
    $stmtGroups->execute([$group_id]);
    while ($row = $stmtGroups->fetch(PDO::FETCH_ASSOC)) {
        $existingGroups[$row['account_id']] = $row['partner_group_id'];
        $existingReadOnly[$row['account_id']] = (int) $row['read_only'];
    }

    // Preserve existing read_only for group-type rows (keyed by partner_group_id)
    $existingGroupReadOnly = [];
    $stmtGrp = $pdo->prepare("SELECT partner_group_id, COALESCE(read_only, 1) as read_only FROM group_ownership WHERE group_id = ? AND owner_type = 'group'");
    $stmtGrp->execute([$group_id]);
    while ($row = $stmtGrp->fetch(PDO::FETCH_ASSOC)) {
        $key = strtoupper(trim((string) $row['partner_group_id']));
        if ($key !== '') {
            $existingGroupReadOnly[$key] = (int) $row['read_only'];
        }
    }

    // Remove all existing rows for this group
    $stmt = $pdo->prepare("DELETE FROM group_ownership WHERE group_id = ?");
    $stmt->execute([$group_id]);

    // Insert new rows
    if (count($owners) > 0) {
        $insertStmt = $pdo->prepare("
            INSERT INTO group_ownership (group_id, owner_id, account_id, owner_type, percentage, partner_group_id, read_only)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($owners as $owner) {
            $raw_id = (string) $owner['account_id'];
            $owner_type = 'owner';
            $real_id = 0;
            $pgid = null;
            $roVal = isset($owner['read_only']) ? (int) $owner['read_only'] : 1;

            if (strpos($raw_id, 'G_') === 0) {
                // Self-group link: G_AP → owner_type='group', account_id=0, partner_group_id='AP'
                $owner_type = 'group';
                $real_id = 0;
                $pgid = substr($raw_id, 2);
                if (!isset($owner['read_only'])) {
                    $key = strtoupper(trim((string) $pgid));
                    if ($key !== '' && isset($existingGroupReadOnly[$key])) {
                        $roVal = $existingGroupReadOnly[$key];
                    }
                }
            } elseif (strpos($raw_id, 'O_') === 0) {
                $owner_type = 'owner';
                $real_id = (int) substr($raw_id, 2);
                if (isset($existingGroups[$real_id])) {
                    $pgid = $existingGroups[$real_id];
                    if (!isset($owner['read_only'])) {
                        $roVal = $existingReadOnly[$real_id] ?? 1;
                    }
                }
            } elseif (strpos($raw_id, 'U_') === 0) {
                $owner_type = 'user';
                $real_id = (int) substr($raw_id, 2);
            } else {
                // Legacy numeric id → assume owner
                $owner_type = 'owner';
                $real_id = (int) $raw_id;
            }

            $insertStmt->execute([$group_id, $owner_id, $real_id, $owner_type, (float) $owner['percentage'], $pgid, $roVal]);

            // Sync read_only to user table
            if ($owner_type === 'user') {
                $uStmt = $pdo->prepare("UPDATE user SET read_only = ? WHERE id = ?");
                $uStmt->execute([$roVal, $real_id]);
            }
        }
    }

    $pdo->commit();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Group ownership saved successfully'
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status'  => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
