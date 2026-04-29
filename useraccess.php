<?php
// Use unified session check
require_once 'session_check.php';

// Get company_id (session_check.php ensures user is logged in)

$company_id = $_SESSION['company_id'];

// Get users data - filter current company through user_company_map association table
try {
    $stmt = $pdo->prepare("
        SELECT 
            DISTINCT u.id,
            u.login_id,
            u.name,
            u.email,
            u.role,
            u.permissions,
            u.account_permissions,
            u.process_permissions
        FROM user u
        INNER JOIN user_company_map ucm ON u.id = ucm.user_id
        WHERE ucm.company_id = ?
        ORDER BY u.name ASC
    ");
    $stmt->execute([$company_id]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch(PDOException $e) {
    die("Query failed: " . $e->getMessage());
}

// Get accounts data - filter current company through account_company association table
try {
    $accountStmt = $pdo->prepare("
        SELECT 
            a.id, 
            a.account_id, 
            a.name, 
            a.status
        FROM account a
        INNER JOIN account_company ac ON ac.account_id = a.id
        WHERE ac.company_id = ?
        ORDER BY a.account_id ASC
    ");
    $accountStmt->execute([$company_id]);
    $accounts = $accountStmt->fetchAll(PDO::FETCH_ASSOC);
} catch(PDOException $e) {
    die("Account query failed: " . $e->getMessage());
}

// Get processes data - filter by same company_id
try {
    require_once 'permissions.php';
    
    $baseSql = "SELECT 
        p.id,
        p.process_id,
        d.name AS description,
        p.status
        FROM process p
        LEFT JOIN description d ON p.description_id = d.id
        WHERE p.status = 'active' AND p.company_id = ?";
    
    // Apply permission filtering
    list($sql, $params) = filterProcessesByPermissions($pdo, $baseSql, [$company_id]);
    $sql .= " ORDER BY p.process_id ASC";
    
    $processStmt = $pdo->prepare($sql);
    $processStmt->execute($params);
    $processes = $processStmt->fetchAll(PDO::FETCH_ASSOC);
} catch(PDOException $e) {
    die("Process query failed: " . $e->getMessage());
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <title>User Access Management</title>
    <link rel="stylesheet" href="css/sidebar.css">
    <link rel="stylesheet" href="css/useraccess.css?v=<?php echo time(); ?>">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
        <h1>User Access</h1>

        <div class="actions-buttons" style="margin-bottom: 0px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <button class="btn-back" onclick="window.location.href='userlist.php'">Back</button>
            </div>
        </div>

        <div class="separator-line"></div>
        
        <div class="content-wrapper">
        <!-- Left Panel -->
        <div class="left-panel">
            <div class="form-section"> 
                <!-- Permission Source Selection -->
                <div class="form-group">
                    <div class="source-selection">
                        <input type="radio" id="sourceTemplate" name="permissionSource" value="template" onchange="togglePermissionSource()" checked>
                        <label for="sourceTemplate" class="radio-label">Copy from User</label>
                            
                        <input type="radio" id="sourceManual" name="permissionSource" value="manual" onchange="togglePermissionSource()">
                        <label for="sourceManual" class="radio-label">Select Permissions Manually</label>
                    </div>
                </div>

                <!-- Template User Selection -->
                <div class="form-group" id="templateUserGroup">
                    <label for="templateUser">User</label>
                    <select id="templateUser" onchange="loadTemplatePermissions()">
                        <option value="">-- Select a user --</option>
                        <?php foreach($users as $user): ?>
                        <option value="<?php echo $user['id']; ?>" 
                                data-permissions='<?php echo htmlspecialchars($user['permissions'] ?? '[]'); ?>'
                                data-account-permissions='<?php echo htmlspecialchars($user['account_permissions'] ?? '[]'); ?>'
                                data-process-permissions='<?php echo htmlspecialchars($user['process_permissions'] ?? '[]'); ?>'>
                            <?php echo htmlspecialchars($user['name']); ?> 
                            (<?php echo htmlspecialchars($user['login_id']); ?>) - 
                            <?php echo htmlspecialchars($user['role']); ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Manual Permission Selection - moved here -->
                <div class="form-group" id="manualPermissionGroup" style="display: none;">
                    <label>Select permissions:</label>
                    <div class="permission-checkboxes">
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_home" value="home" onchange="updateManualPermissions()">
                            <label for="perm_home">Home</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_admin" value="admin" onchange="updateManualPermissions()">
                            <label for="perm_admin">Admin</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_account" value="account" onchange="updateManualPermissions()">
                            <label for="perm_account">Account</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_ownership" value="ownership" onchange="updateManualPermissions()">
                            <label for="perm_ownership">Ownership</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_process" value="process" onchange="updateManualPermissions()">
                            <label for="perm_process">Process</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_datacapture" value="datacapture" onchange="updateManualPermissions()">
                            <label for="perm_datacapture">Data Capture</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_payment" value="payment" onchange="updateManualPermissions()">
                            <label for="perm_payment">Transaction Payment</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_report" value="report" onchange="updateManualPermissions()">
                            <label for="perm_report">Report</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="perm_maintenance" value="maintenance" onchange="updateManualPermissions()">
                            <label for="perm_maintenance">Maintenance</label>
                        </div>
                    </div>
                </div>

                <!-- Affected Users Section -->
                <div class="form-group">
                    <label>Affected Users</label>
                    <button class="user-select-btn" onclick="openUserSelectionModal()">
                        <span id="selectedUsersText">Click to select users</span>
                    </button>
                    <div class="selected-count" id="selectedCount">
                        No users selected
                    </div>
                </div>

                <!-- Permissions Preview -->
                <div class="permissions-preview">
                    <div id="permissionsDisplay" class="no-permissions">
                        View permissions
                    </div>
                </div>
            </div>
        </div> <!-- left-panel correctly closed -->

        <!-- Right Panel -->
        <div class="right-panel">
            <div class="form-section">
                <div class="form-group">
                    <label>Account</label>
                    <div class="account-grid" id="accountGrid">
                    <?php 
                    $colCount = 0;
                    foreach($accounts as $account): 
                        if ($colCount % 5 == 0) {
                            if ($colCount > 0) echo '</div>'; // Close previous row
                            echo '<div class="account-row">';
                        }
                    ?>
                        <div class="account-item-compact" data-search="<?php echo strtolower($account['account_id']); ?>">
                            <input type="checkbox" 
                                id="account_<?php echo $account['id']; ?>" 
                                value="<?php echo $account['id']; ?>"
                                data-account-id="<?php echo htmlspecialchars($account['account_id']); ?>"
                                onchange="updateAccountSelection()">
                            <label for="account_<?php echo $account['id']; ?>" class="account-label">
                                <?php echo htmlspecialchars($account['account_id']); ?>
                            </label>
                        </div>
                    <?php 
                        $colCount++;
                        endforeach;
                        if ($colCount > 0) echo '</div>'; // Close last row
                    ?>
                </div>
                    <div class="account-control-buttons" style="text-align: center;">
                        <button type="button" class="btn-account-control" onclick="selectAllAccounts()">Select All</button>
                        <button type="button" class="btn-clearall" onclick="clearAllAccounts()">Clear All</button>
                    </div>
                </div>
                
                <!-- Process Permissions Section -->
                <div class="form-group" style="margin-top: clamp(10px, 1.04vw, 20px);">
                    <label>Process</label>
                    <div class="account-grid" id="processGrid">
                    <?php 
                    $colCount = 0;
                    foreach($processes as $process): 
                        if ($colCount % 5 == 0) {
                            if ($colCount > 0) echo '</div>'; // Close previous row
                            echo '<div class="account-row">';
                        }
                    ?>
                        <div class="account-item-compact" data-search="<?php echo strtolower($process['process_id'] . ' ' . $process['description']); ?>">
                            <input type="checkbox" 
                                id="process_<?php echo $process['id']; ?>" 
                                value="<?php echo $process['id']; ?>"
                                data-process-name="<?php echo htmlspecialchars($process['process_id']); ?>"
                                data-process-description="<?php echo htmlspecialchars($process['description']); ?>"
                                onchange="updateProcessSelection()">
                            <label for="process_<?php echo $process['id']; ?>" class="account-label">
                                <?php echo htmlspecialchars($process['process_id'] . ' - ' . $process['description']); ?>
                            </label>
                        </div>
                    <?php 
                        $colCount++;
                        endforeach;
                        if ($colCount > 0) echo '</div>'; // Close last row
                    ?>
                </div>
                    <div class="account-control-buttons" style="text-align: center;">
                        <button type="button" class="btn-account-control" onclick="selectAllProcesses()">Select All</button>
                        <button type="button" class="btn-clearall" onclick="clearAllProcesses()">Clear All</button>
                    </div>
                </div>
            </div>
        </div>
    </div> <!-- content-wrapper closed -->

    <!-- Action buttons outside content-wrapper, centered -->
    <div class="action-buttons">
        <button class="btn btn-update" id="updateBtn" onclick="updatePermissions()" disabled>
            Update
        </button>
        <button class="btn btn-cancel" onclick="resetForm()">
            Cancel
        </button>
    </div>

    <!-- Custom Confirmation Modal -->
    <div id="confirmModal" class="modal">
        <div class="confirm-modal-content">
            <div class="confirm-icon-container">
                <svg class="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <h2 class="confirm-title">Confirm Update</h2>
            <p id="confirmMessage" class="confirm-message"></p>
            <div class="confirm-actions">
                <button type="button" class="btn btn-cancel confirm-cancel" onclick="closeConfirmModal()">Cancel</button>
                <button type="button" class="btn btn-update confirm-update" id="confirmUpdateBtn">Update</button>
            </div>
        </div>
    </div>

    <!-- User Selection Modal -->
    <div id="userSelectionModal" class="modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Select Users</h3>
                <span class="close" onclick="closeUserSelectionModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="search-box">
                    <input type="text" id="userSearchInput" placeholder="Search users" onkeyup="filterUsers()">
                </div>
                <div class="modal-user-grid" id="modalUserList">
                    <?php 
                    $colCount = 0;
                    foreach($users as $user): 
                        if ($colCount % 5 == 0) {
                            if ($colCount > 0) echo '</div>'; // Close previous row
                            echo '<div class="modal-user-row">';
                        }
                    ?>
                        <div class="modal-user-item" data-search="<?php echo strtolower($user['name'] . ' ' . $user['login_id']); ?>">
                            <input type="checkbox" 
                                id="modal_user_<?php echo $user['id']; ?>" 
                                value="<?php echo $user['id']; ?>"
                                data-name="<?php echo htmlspecialchars($user['name']); ?>"
                                data-login="<?php echo htmlspecialchars($user['login_id']); ?>"
                                onchange="updateModalSelection()">
                            <div class="modal-user-info">
                                <div class="modal-user-name">
                                    <?php echo htmlspecialchars($user['login_id']); ?>
                                </div>
                            </div>
                        </div>
                    <?php 
                        $colCount++;
                    endforeach;
                    if ($colCount > 0) echo '</div>'; // Close last row
                    ?>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-update" onclick="confirmUserSelection()">Confirm</button>
                <button class="btn btn-cancel" onclick="closeUserSelectionModal()">Cancel</button>
            </div>
        </div>
    </div>

    <div id="notificationContainer" class="notification-container"></div>

    <script src="js/useraccess.js?v=<?php echo time(); ?>"></script>

</body>
</html>