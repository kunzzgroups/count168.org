<?php
/**
 * Helper file to share company query logic between API and inline PHP pages
 * Prevents code duplication and ensures consistent filtering.
 */

if (!function_exists('getCompaniesByUser')) {
    function getCompaniesByUser(PDO $pdo, int $userId, bool $fetchAll = false): array {
        if ($fetchAll) {
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.group_id, c.expiration_date
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != ''
                ORDER BY c.company_id ASC
            ");
            $stmt->execute([$userId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $session_company_id = $_SESSION['company_id'] ?? null;
            $native_group  = null;
            if ($session_company_id) {
                $stmtGrp = $pdo->prepare("SELECT group_id FROM company WHERE id = ? LIMIT 1");
                $stmtGrp->execute([$session_company_id]);
                $grpRow = $stmtGrp->fetch(PDO::FETCH_ASSOC);
                if ($grpRow) {
                    $native_group  = $grpRow['group_id'] ?: null;
                }
            }

            $params = [];
            $whereParts = [];

            if ($native_group !== null && trim($native_group) !== '') {
                $whereParts[] = "(LOWER(c.group_id) = LOWER(?))";
                $params[] = trim($native_group);
            } else {
                $whereParts[] = "(c.group_id IS NULL OR c.group_id = '')";
            }

            $whereSQL = implode(" OR ", $whereParts);
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.group_id, c.expiration_date
                FROM company c
                INNER JOIN user_company_map ucm ON c.id = ucm.company_id
                WHERE ucm.user_id = ? AND c.company_id != '' AND ($whereSQL)
                ORDER BY c.company_id ASC
            ");
            array_unshift($params, $userId);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}

if (!function_exists('getCompaniesByOwner')) {
    function getCompaniesByOwner(PDO $pdo, int $ownerId, bool $fetchAll): array {
        if ($fetchAll) {
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE (c.owner_id = ? OR (co.account_id = ? AND co.percentage > 0)) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ");
            $stmt->execute([$ownerId, $ownerId, $ownerId, $ownerId]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $session_company_id = $_SESSION['company_id'] ?? null;
            $partner_group = null;
            $native_group  = null;
            if ($session_company_id) {
                $stmtGrp = $pdo->prepare("
                    SELECT co.partner_group_id, c.group_id
                    FROM company c
                    LEFT JOIN company_ownership co
                        ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                    WHERE c.id = ?
                    LIMIT 1
                ");
                $stmtGrp->execute([$ownerId, $session_company_id]);
                $grpRow = $stmtGrp->fetch(PDO::FETCH_ASSOC);
                if ($grpRow) {
                    $partner_group = $grpRow['partner_group_id'] ?: null;
                    $native_group  = $grpRow['group_id']         ?: null;
                }
            }

            $params = [];
            $whereParts = [];

            if ($partner_group !== null && trim($partner_group) !== '') {
                $whereParts[] = "(c.owner_id != ? AND co.account_id = ? AND LOWER(co.partner_group_id) = LOWER(?) AND co.percentage > 0)";
                $params = array_merge($params, [$ownerId, $ownerId, trim($partner_group)]);
            } elseif ($native_group !== null && trim($native_group) !== '') {
                $whereParts[] = "(c.owner_id = ? AND LOWER(c.group_id) = LOWER(?))";
                $params = array_merge($params, [$ownerId, trim($native_group)]);
            } else {
                $whereParts[] = "(
                    (c.owner_id = ? AND (c.group_id IS NULL OR c.group_id = ''))
                    OR 
                    (c.owner_id != ? AND co.account_id = ? AND co.percentage > 0 AND (
                        co.partner_group_id = '' 
                        OR (co.partner_group_id IS NULL AND (c.group_id IS NULL OR c.group_id = ''))
                    ))
                )";
                $params = array_merge($params, [$ownerId, $ownerId, $ownerId]);
            }

            $whereSQL = implode(" OR ", $whereParts);
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.id, c.company_id, c.expiration_date,
                       COALESCE(co.partner_group_id, c.group_id) as group_id,
                       IF(c.owner_id = ?, 0, 1) as is_external
                FROM company c
                LEFT JOIN company_ownership co ON c.id = co.company_id AND co.owner_type = 'owner' AND co.account_id = ?
                WHERE ($whereSQL) AND c.company_id != ''
                ORDER BY is_external ASC, c.company_id ASC
            ");
            array_unshift($params, $ownerId, $ownerId);  // prepend for IF(c.owner_id) and LEFT JOIN condition
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }
}
