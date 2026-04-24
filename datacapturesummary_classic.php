<?php
/**
 * Data Capture Summary 经典全页（侧栏 + `js/datacapturesummary.js`）。
 * 默认入口 `datacapturesummary.php` 会 302 到 React `/datacapturesummary`；SPA 顶栏「经典版」可指向本页。
 */
require_once 'session_check.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        header('Location: datacapturesummary_classic.php?success=1');
        exit;
    } catch (Exception $e) {
        error_log('Data capture summary error: ' . $e->getMessage());
        header('Location: datacapturesummary_classic.php?error=1');
        exit;
    }
}

$company_id = $_SESSION['company_id'] ?? null;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <title>Data Capture Summary</title>
    <link rel="stylesheet" href="css/sidebar.css">
    <link rel="stylesheet" href="css/datacapturesummary.css?v=<?php echo time(); ?>">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <script>
        function navigateToDataCaptureFresh() {
            window.isNavigatingAwayByBackOrSubmit = true;
            try {
                localStorage.removeItem('capturedTableData');
                localStorage.removeItem('capturedProcessData');
                localStorage.removeItem('capturedDataCaptureType');
                localStorage.removeItem('capturedFormatPreviewHtml');
                localStorage.removeItem('captured655PreviewHtml');
                localStorage.removeItem('capturedTableRateValues');
                localStorage.removeItem('capturedTableFormulaSourceForRefresh');
                localStorage.removeItem('capturedCaptureId');
            } catch (e) {}
            var dcSpa = (typeof window.EAZYCOUNT_SPA_DATACAPTURE === 'string' && window.EAZYCOUNT_SPA_DATACAPTURE) ? window.EAZYCOUNT_SPA_DATACAPTURE : 'datacapture.php';
            if (window.top !== window.self) {
                window.top.location.assign(dcSpa);
            } else {
                window.location.href = dcSpa;
            }
        }

        document.addEventListener('DOMContentLoaded', function () {
            try {
                var dcSection = document.getElementById('sidebar-datacapture-section');
                if (!dcSection) return;
                var dcTitle = dcSection.querySelector('.informationmenu-section-title');
                if (!dcTitle) return;
                dcTitle.onclick = function (e) {
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                    navigateToDataCaptureFresh();
                };
            } catch (err) {
                console.error('Failed to bind sidebar Data Capture click on summary page:', err);
            }
        });
    </script>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="container">
        <h1>Data Capture Summary</h1>

        <div id="loadingState" class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading data...</p>
        </div>

        <div class="summary-action-buttons" id="actionButtons" style="display: none;">
            <div style="flex: 1;"></div>
            <div class="batch-controls-group">
                <label for="rateInput" class="batch-label">Rate</label>
                <input type="text" id="rateInput" class="batch-input" placeholder="e.g. *3 or /3" />
                <button class="btn-update-all" id="rateSelectAllBtn" onclick="toggleAllRate(this)">Select All</button>
                <button class="btn-update-all" id="topSubmitBtn" onclick="submitRateValues()">Submit</button>
            </div>
            <div style="flex: 1;"></div>
            <button class="summary-btn summary-btn-delete" id="summaryDeleteSelectedBtn" onclick="deleteSelectedRows()" title="Delete selected rows" disabled>Delete</button>
        </div>

        <div class="summary-table-container" id="summaryTableContainer" style="display: none;">
            <div class="process-info-container" id="processInfoContainer" style="display: none;">
                <div class="process-info-row">
                    <div class="process-info-item">
                        <span class="process-info-label">Date:</span>
                        <span class="process-info-value" id="processInfoDate">-</span>
                    </div>
                    <div class="process-info-item">
                        <span class="process-info-label">Process:</span>
                        <span class="process-info-value" id="processInfoProcess">-</span>
                    </div>
                    <div class="process-info-item">
                        <span class="process-info-label">Description:</span>
                        <span class="process-info-value" id="processInfoDescription">-</span>
                    </div>
                    <div class="process-info-item">
                        <span class="process-info-label">Currency:</span>
                        <span class="process-info-value" id="processInfoCurrency">-</span>
                    </div>
                    <div class="process-info-item">
                        <span class="process-info-label">Remark:</span>
                        <span class="process-info-value" id="processInfoRemark">-</span>
                    </div>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="summary-table" id="summaryTable">
                    <thead>
                        <tr>
                            <th class="id-product-header">Id Product</th>
                            <th>Account</th>
                            <th></th>
                            <th>Currency</th>
                            <th>Formula</th>
                            <th>Source</th>
                            <th>Rate</th>
                            <th>Rate Value</th>
                            <th>Processed Amount</th>
                            <th>Skip</th>
                            <th>Delete</th>
                        </tr>
                    </thead>
                    <tbody id="summaryTableBody">
                    </tbody>
                    <tfoot>
                        <tr id="summaryTotalRow">
                            <td colspan="8" class="summary-total-label"></td>
                            <td id="summaryTotalAmount">0.00</td>
                            <td></td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <div class="summary-submit-container" id="summarySubmitContainer" style="display: none;">
            <button type="button" class="btn btn-submit" id="summarySubmitBtn" onclick="submitSummaryData()">Submit</button>
            <button type="button" class="btn btn-cancel" onclick="goBackToDataCapture()" style="margin-left: 10px;">Back</button>
            <button type="button" class="btn btn-refresh" onclick="refreshPage()" title="Refresh page">
                <img src="images/refresh.svg" alt="Refresh" style="width: clamp(23px, 1.8vw, 35px); height: clamp(23px, 1.8vw, 35px);" />
            </button>
        </div>

    </div>

    <div id="notificationPopup" class="notification-popup" style="display: none;">
        <div class="notification-header">
            <span class="notification-title" id="notificationTitle">Notification</span>
            <button class="notification-close" onclick="hideNotification()">&times;</button>
        </div>
        <div class="notification-message" id="notificationMessage">Message</div>
    </div>

    <div id="confirmDeleteModal" class="summary-modal" style="display: none;">
        <div class="summary-confirm-modal-content">
            <div class="summary-confirm-icon-container">
                <svg class="summary-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <h2 class="summary-confirm-title">Confirm Delete</h2>
            <p id="confirmDeleteMessage" class="summary-confirm-message">This action cannot be undone.</p>
            <div class="summary-confirm-actions">
                <button type="button" class="summary-btn summary-btn-cancel confirm-cancel" onclick="closeConfirmDeleteModal()">Cancel</button>
                <button type="button" class="summary-btn summary-btn-delete confirm-delete" onclick="confirmDelete()">Delete</button>
            </div>
        </div>
    </div>

    <div id="addModal" class="account-modal" style="display: none;">
        <div class="account-modal-content">
            <div class="account-modal-header">
                <h2>Add Account</h2>
                <span class="account-close" onclick="closeAddModal()">&times;</span>
            </div>
            <div class="account-modal-body">
                <form id="addAccountForm" class="account-form">
                    <div class="account-form-columns">
                        <div class="account-form-column">
                            <h3 class="account-section-header">Personal Information</h3>
                            <div class="account-form-group">
                                <label for="add_account_id">Account ID *</label>
                                <input type="text" id="add_account_id" name="account_id" required>
                            </div>
                            <div class="account-form-group">
                                <label for="add_name">Name *</label>
                                <input type="text" id="add_name" name="name" required>
                            </div>
                            <div class="account-form-group">
                                <label for="add_role">Role *</label>
                                <select id="add_role" name="role" required>
                                    <option value="">Select Role</option>
                                </select>
                            </div>
                            <div class="account-form-group">
                                <label for="add_password">Password *</label>
                                <input type="password" id="add_password" name="password" required autocomplete="new-password">
                            </div>
                        </div>

                        <div class="account-form-column">
                            <h3 class="account-section-header">Payment</h3>
                            <div class="account-form-group">
                            </div>
                            <div class="account-form-group">
                                <label>Payment Alert</label>
                                <div class="account-radio-group">
                                    <label class="account-radio-label">
                                        <input type="radio" name="add_payment_alert" value="1">
                                        Yes
                                    </label>
                                    <label class="account-radio-label">
                                        <input type="radio" name="add_payment_alert" value="0" checked>
                                        No
                                    </label>
                                </div>
                            </div>
                            <div class="account-form-row" id="add_alert_fields" style="display: none;">
                                <div class="account-form-group">
                                    <label for="add_alert_type">Alert Type</label>
                                    <select id="add_alert_type" name="alert_type">
                                        <option value="">Select Type</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <?php for ($i = 1; $i <= 31; $i++): ?>
                                            <option value="<?php echo $i; ?>"><?php echo $i; ?> Days</option>
                                        <?php endfor; ?>
                                    </select>
                                </div>
                                <div class="account-form-group">
                                    <label for="add_alert_start_date">Start Date</label>
                                    <input type="date" id="add_alert_start_date" name="alert_start_date">
                                </div>
                            </div>
                            <div class="account-form-group" id="add_alert_amount_row" style="display: none;">
                                <label for="add_alert_amount">Alert (Amount)</label>
                                <input type="number" id="add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount (auto-converted to negative)">
                            </div>
                            <div class="account-form-group">
                                <label for="add_remark">Remark</label>
                                <textarea id="add_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="account-form-section">
                        <div class="account-advance-section">
                            <h3>Advanced Account</h3>

                            <div class="account-other-currency">
                                <label>Other Currency:</label>

                                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                    <input type="text" id="addCurrencyInput" placeholder="Enter new currency code (e.g., EUR, JPY, GBP)" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                    <button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInput('add'); return false;">Create Currency</button>
                                </div>

                            <div class="account-currency-list" id="addCurrencyList">
                                </div>
                            </div>

                            <div class="account-other-currency" style="margin-top: 20px;">
                                <label>Company:</label>

                                <div class="account-currency-list" id="addCompanyList">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="account-form-actions">
                        <button type="submit" class="account-btn account-btn-save">Add Account</button>
                        <button type="button" class="account-btn account-btn-cancel" onclick="closeAddModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
        window.DATACAPTURESUMMARY_COMPANY_ID = <?php echo json_encode($company_id); ?>;
    </script>
    <?php
    $assetVer = function ($file) {
        $path = __DIR__ . '/' . $file;
        return file_exists($path) ? filemtime($path) : time();
    };
    ?>
    <script src="js/datacapturesummary.js?v=<?php echo $assetVer('js/datacapturesummary.js'); ?>"></script>

</body>
</html>
