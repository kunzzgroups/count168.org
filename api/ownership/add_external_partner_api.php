<?php
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
require_once '../../config.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);
$company_id = intval($data['company_id'] ?? 0);
$login_or_group_id = trim($data['login_id'] ?? '');
$force_type = trim($data['force_type'] ?? '');

if (!$company_id || !$login_or_group_id) {
    echo json_encode(['status' => 'error', 'message' => 'Valid Company ID and Login ID/Group ID are required']);
    exit();
}

try {
    $pdo->exec("ALTER TABLE company_ownership ADD COLUMN partner_group_id VARCHAR(50) DEFAULT NULL");
} catch (Exception $e) {}

try {
    // Fetch native owner first
    $stmtCheckNative = $pdo->prepare("SELECT owner_id FROM company WHERE id = ?");
    $stmtCheckNative->execute([$company_id]);
    $nativeOwner = $stmtCheckNative->fetchColumn();

    // 1. Check for Login ID (owner_code) match (excluding native owner)
    $partnerByLogin = null;
    if ($force_type === '' || $force_type === 'login') {
        $stmtLogin = $pdo->prepare("SELECT id, name, owner_code FROM owner WHERE UPPER(owner_code) = UPPER(?) AND id != ? AND status = 'active'");
        $stmtLogin->execute([$login_or_group_id, $nativeOwner]);
        $partnerByLogin = $stmtLogin->fetch(PDO::FETCH_ASSOC);
    }

    // 2. Check for Group ID match (excluding native owner)
    $partnerByGroup = null;
    if ($force_type === '' || $force_type === 'group') {
        $stmtGrp = $pdo->prepare("
            SELECT o.id, o.name, c.group_id 
            FROM company c
            JOIN owner o ON c.owner_id = o.id
            WHERE UPPER(c.group_id) = UPPER(?) AND o.id != ? AND o.status = 'active'
            LIMIT 1
        ");
        $stmtGrp->execute([$login_or_group_id, $nativeOwner]);
        $partnerByGroup = $stmtGrp->fetch(PDO::FETCH_ASSOC);
    }

    $partner = null;
    $matched_by_group = null;

    if ($partnerByLogin && $partnerByGroup) {
        // Collision: Match found in both Login ID and Group ID. 
        // We prompt the user so they can decide whether to just share (Login) or formally join the group.
        echo json_encode([
            'status' => 'conflict', 
            'message' => 'Multiple matches found.',
            'data' => [
                'login_partner' => $partnerByLogin['name'] . ' (' . $partnerByLogin['owner_code'] . ')',
                'group_partner' => $partnerByGroup['name'] . ' (Group: ' . $partnerByGroup['group_id'] . ')'
            ]
        ]);
        exit();
    } elseif ($partnerByGroup) {
        $partner = $partnerByGroup;
        $matched_by_group = strtoupper($login_or_group_id);
    } elseif ($partnerByLogin) {
        $partner = $partnerByLogin;
    }

    if (!$partner) {
        echo json_encode(['status' => 'error', 'message' => 'Owner account or Group ID not found or inactive']);
        exit();
    }

    $partnerId = $partner['id'];

    // Note: Self-linking check is now handled implicitly since we exclude nativeOwner in queries,
    // but we can keep it as a fallback.
    if ($nativeOwner == $partnerId) {
        echo json_encode(['status' => 'error', 'message' => 'This account is already the main owner of the company']);
        exit();
    }

    // 2. Check if already linked
    $stmtLink = $pdo->prepare("SELECT id FROM company_ownership WHERE company_id = ? AND owner_type = 'owner' AND account_id = ?");
    $stmtLink->execute([$company_id, $partnerId]);
    if ($stmtLink->fetch()) {
        echo json_encode(['status' => 'error', 'message' => 'Partner is already linked to this company']);
        exit();
    }

    // 3. Link by inserting a 0% entry into company_ownership
    // If matched by Group ID, we set the partner_group_id so the partner sees it under this group,
    // while the original owner's dashboard remains completely unaffected.
    $stmtInsert = $pdo->prepare("INSERT INTO company_ownership (company_id, owner_type, account_id, percentage, partner_group_id) VALUES (?, 'owner', ?, 0, ?)");
    $stmtInsert->execute([$company_id, $partnerId, $matched_by_group]);

    echo json_encode([
        'status' => 'success',
        'message' => "Partner '{$partner['name']}' linked successfully"
    ]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'Database error']);
}
?>
