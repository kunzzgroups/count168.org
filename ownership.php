<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit();
}

// Do not cache
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$assetVer = function ($file) {
    $path = __DIR__ . '/' . $file;
    return file_exists($path) ? filemtime($path) : time();
};
?>
<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Ownership</title>
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <link rel="stylesheet" href="css/ownership.css?v=<?php echo $assetVer('css/ownership.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <link rel="stylesheet"
        href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>

<body>
    <?php include 'sidebar.php'; ?>

    <div class="own-container">
        <h1 class="own-page-title">Account Ownership</h1>
        <div class="own-separator-line"></div>

        <!-- ========== Tab Bar ========== -->
        <div class="own-tab-bar">
            <button class="own-tab-btn active" data-tab="account-ownership" onclick="switchOwnershipTab('account-ownership')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Account Ownership
            </button>
            <button class="own-tab-btn" data-tab="group-earnings" onclick="switchOwnershipTab('group-earnings')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
                Group Earnings
            </button>
        </div>

        <!-- ========== Tab Panel: Account Ownership ========== -->
        <div id="tab-account-ownership" class="own-tab-panel">
            <!-- Group Filter Bar + Select Mode Button (same row) -->
            <div id="own-group-filter-bar" class="own-group-filter-bar" style="display:none;">
                <span class="own-gfb-label">Group</span>
                <div class="own-gfb-buttons" id="own-gfb-buttons">
                    <!-- Injected by JS -->
                </div>
                <div class="own-gfb-spacer"></div>
                <button id="own-select-mode-btn" class="own-select-mode-btn" onclick="_toggleSelectionMode()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <path d="M14 17h7M17.5 14v7" />
                    </svg>
                    Select
                </button>
            </div>

            <!-- Companies will be injected here via JS -->
            <div id="companyCardsContainer">
                <!-- Loader -->
                <div class="own-loader-container">
                    <div class="own-loader"></div>
                </div>
            </div>
        </div>

        <!-- ========== Tab Panel: Group Earnings ========== -->
        <div id="tab-group-earnings" class="own-tab-panel" style="display:none;">
            <div id="groupEarningsContainer">
                <!-- Loader -->
                <div class="own-loader-container">
                    <div class="own-loader"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ========== HTML Templates ========== -->

    <!-- Company Card Template -->
    <template id="tpl-company-card">
        <div class="own-card">
            <div class="own-card-header" data-action="toggle">
                <div class="own-card-header-left">
                    <div class="own-company-name" data-bind="name"></div>
                    <div class="own-company-date" data-bind="date"></div>
                </div>
                <div class="own-card-header-middle">
                    <div class="own-allocation-info">
                        <span class="own-allocation-label">Total Allocation</span>
                        <span class="own-allocation-percentage" data-bind="percent"></span>
                        <span class="own-allocation-remaining" data-bind="remaining"></span>
                    </div>
                    <div class="own-progress-bar-container">
                        <div class="own-progress-bar-fill" data-bind="bar"></div>
                    </div>
                </div>
                <div class="own-card-header-right">
                    <button class="own-btn-outline" data-action="toggle">Manage</button>
                    <button class="own-icon-btn" data-action="toggle">
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7">
                            </path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="own-card-body" data-bind="body">
                <div class="own-loader-container" data-bind="loader">
                    <div class="own-loader"></div>
                </div>
                <div class="own-editor-hidden" data-bind="editor">
                    <div class="own-table-headers">
                        <div>Account</div>
                        <div>Ownership%</div>
                    </div>

                    <div data-bind="rows-container"></div>

                    <button class="own-btn-add-account" data-action="add-row">+ Add Account</button>

                    <div class="own-partner-section">
                        <div class="own-partner-info">
                            <div class="own-partner-title-row">
                                <span class="own-partner-title">External Partner</span>
                                <div class="own-partner-actions">
                                    <input type="text" class="own-partner-input" data-bind="partner-input"
                                        placeholder="Login ID/Group ID" autocomplete="off">
                                    <button class="own-partner-link-btn" data-action="link-partner">Link
                                        Partner</button>
                                </div>
                            </div>
                            <span class="own-partner-desc">Share this company's read-only dashboard visibility with
                                another independent owner.</span>
                        </div>
                    </div>

                    <div class="own-card-footer">
                        <div class="own-footer-left">
                            <div class="own-warning-badge" data-bind="warning" style="display: none;">
                                <span data-bind="warning-icon">⚠️</span>
                                <span data-bind="warning-msg">Total is less than 100%</span>
                            </div>
                            <span class="own-unallocated-text" data-bind="footer-remain">100% Unallocated</span>
                        </div>
                        <div class="own-footer-right">
                            <button class="own-footer-btn own-btn-cancel" data-action="cancel">Cancel</button>
                            <button class="own-footer-btn own-btn-confirm" data-bind="confirm-btn"
                                data-action="confirm">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </template>

    <!-- Account Row Template -->
    <template id="tpl-account-row">
        <div class="own-account-row">
            <div class="own-drag-handle">⋮⋮</div>
            <select class="own-account-select" data-bind="account-select"></select>

            <div class="own-ownership-input-group">
                <input type="text" class="own-percent-input" data-bind="percent-input">
                <div class="own-slider-container">
                    <input type="range" class="own-slider" data-bind="slider" min="0" max="100" step="1">
                    <div class="own-slider-labels">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>
            </div>

            <div class="own-row-actions">
                <!-- Read Only toggle: shown only for Partnership accounts -->
                <div class="own-read-only-badge" data-bind="read-only-badge">
                    <span class="own-read-only-text">Read Only</span>
                    <label class="own-ro-toggle">
                        <input type="checkbox" data-bind="read-only-check" checked>
                        <span class="own-ro-slider"></span>
                    </label>
                </div>
                <button class="own-btn-square own-btn-delete" title="Remove" data-action="delete">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd"
                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clip-rule="evenodd"></path>
                    </svg>
                </button>
            </div>
        </div>
    </template>

    <!-- Conflict Resolution Modal -->
    <template id="tpl-conflict-modal">
        <div class="own-modal-overlay">
            <div class="own-modal">
                <div class="own-modal-header">
                    <h3 class="own-modal-title">Multiple Matches Found</h3>
                </div>
                <div class="own-modal-body">
                    <p class="own-modal-desc">This ID is used by two different partners. Which one do you want to link?
                    </p>
                    <div class="own-modal-options">
                        <button class="own-btn-outline own-btn-conflict" data-action="choose-login">
                            Link as Login ID:<br><strong data-bind="login-name"></strong>
                        </button>
                        <button class="own-btn-outline own-btn-conflict" data-action="choose-group">
                            Join Group:<br><strong data-bind="group-name"></strong>
                        </button>
                    </div>
                </div>
                <div class="own-modal-footer">
                    <button class="own-footer-btn own-btn-cancel" data-action="cancel-conflict">Cancel</button>
                </div>
            </div>
        </div>
    </template>

    <!-- Toast Notification -->
    <div id="ownToast" class="own-toast">
        <div id="ownToastIcon"></div>
        <div id="ownToastMessage"></div>
    </div>
    <!-- Toast icon templates (hidden, cloned by JS) -->
    <template id="tpl-toast-success">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
        </svg>
    </template>
    <template id="tpl-toast-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--own-danger-red)" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
            </path>
        </svg>
    </template>

    <script>
        window._ownCurrentUserId = <?php echo json_encode($_SESSION['user_id'] ?? null); ?>;
        window._ownCurrentUserType = <?php echo json_encode($_SESSION['user_type'] ?? 'owner'); ?>;
    </script>
    <script src="js/ownership.js?v=<?php echo $assetVer('js/ownership.js'); ?>"></script>
    <script src="js/ownership-group.js?v=<?php echo $assetVer('js/ownership-group.js'); ?>"></script>
</body>

</html>

</html>