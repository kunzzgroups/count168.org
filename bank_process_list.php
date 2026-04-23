<?php

if (!function_exists('renderBankProcessToolbarAction')) {
    function renderBankProcessToolbarAction()
    {
        ?>
        <!-- Accounting Due (Bank only): opens large modal like Add Process -->
        <div class="process-accounting-inbox-wrap" id="processAccountingInboxWrap" style="display: none;">
            <button type="button" class="process-accounting-inbox-btn process-accounting-inbox-main"
                id="processAccountingInboxBtn">
                <svg class="process-accounting-inbox-icon" viewBox="0 0 24 24" fill="currentColor"
                    aria-hidden="true">
                    <path
                        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                Accounting Due
                <span class="process-accounting-inbox-badge" id="processAccountingInboxCount">0</span>
            </button>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessFilterControls')) {
    function renderBankProcessFilterControls($showOfficialChecked, $showEInvoiceChecked, $showBlockChecked)
    {
        ?>
        <div id="process-list-bank-only-filters" class="process-list-bank-only-filters"
            style="display: none; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="checkbox-section">
                <input type="checkbox" id="showOfficial" name="showOfficial" <?php echo $showOfficialChecked ? 'checked' : ''; ?>>
                <label for="showOfficial">Show Official</label>
            </div>
            <div class="checkbox-section">
                <input type="checkbox" id="showEInvoice" name="showEInvoice" <?php echo $showEInvoiceChecked ? 'checked' : ''; ?>>
                <label for="showEInvoice">Show E-Invoice</label>
            </div>
            <div class="checkbox-section">
                <input type="checkbox" id="showBlock" name="showBlock" <?php echo $showBlockChecked ? 'checked' : ''; ?>>
                <label for="showBlock">Show Block</label>
            </div>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessTableHeaders')) {
    function renderBankProcessTableHeaders()
    {
        ?>
        <div class="header-item bank-header" style="display: none;">No</div>
        <div class="header-item bank-header" style="display: none;">Supplier</div>
        <div class="header-item bank-header" style="display: none;">Country (Currency)</div>
        <div class="header-item bank-header" style="display: none;">Bank</div>
        <div class="header-item bank-header" style="display: none;">Types</div>
        <div class="header-item bank-header" style="display: none;">Card Owner</div>
        <div class="header-item bank-header" style="display: none;">Contract</div>
        <div class="header-item bank-header" style="display: none;">Insurance</div>
        <div class="header-item bank-header" style="display: none;">Customer</div>
        <div class="header-item bank-header" style="display: none;">Cost</div>
        <div class="header-item bank-header" style="display: none;">Price</div>
        <div class="header-item bank-header" style="display: none;">Profit</div>
        <div class="header-item bank-header" style="display: none;">Status</div>
        <div class="header-item bank-header" style="display: none;">Date</div>
        <div class="header-item bank-header bank-action-header" style="display: none;">Action
            <input type="checkbox" title="Select all" class="header-action-checkbox"
                style="margin-left: 10px; cursor: pointer;">
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessTableWrapper')) {
    function renderBankProcessTableWrapper()
    {
        ?>
        <div id="bankTableWrapper" class="bank-table-wrapper" style="display: none;">
            <table id="bankTable" class="bank-data-table">
                <thead>
                    <tr id="bankTableHeadRow"></tr>
                </thead>
                <tbody id="bankTableBody"></tbody>
            </table>
        </div>
        <?php
    }
}

if (!function_exists('renderBankProcessModals')) {
    function renderBankProcessModals()
    {
        ?>
        <div id="processAccountingDueModal" class="modal" style="display: none;">
            <div class="modal-content accounting-due-modal-content">
                <div class="modal-header">
                    <h2>
                        Accounting Due
                        <span class="process-accounting-inbox-badge" id="processAccountingInboxCountModal">0</span>
                    </h2>
                    <div class="modal-header-actions">
                        <span class="close" onclick="closeAccountingDueModal()">&times;</span>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="process-accounting-inbox-table-wrap">
                        <table class="process-accounting-inbox-table">
                            <thead>
                                <tr>
                                    <th style="width:36px;"><input type="checkbox" id="processAccountingInboxSelectAll" title="Select all" class="process-accounting-inbox-cb"></th>
                                    <th>No</th>
                                    <th>Start Date</th>
                                    <th>Card Owner</th>
                                    <th>Bank</th>
                                    <th>Contract</th>
                                    <th style="width:80px;">Delete <input type="checkbox" id="processAccountingInboxDeleteSelectAll" title="Select all for delete" class="process-accounting-inbox-delete-cb"></th>
                                </tr>
                            </thead>
                            <tbody id="processAccountingInboxTbody"></tbody>
                        </table>
                    </div>
                    <div class="process-accounting-inbox-actions">
                        <button type="button" class="btn btn-primary" id="processAccountingInboxPostBtn" disabled>Transaction</button>
                        <button type="button" class="btn btn-delete" id="processAccountingInboxDeleteBtn" onclick="deleteAccountingInboxSelected()" disabled>Delete</button>
                        <button type="button" class="btn btn-cancel" onclick="closeAccountingDueModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
        <!-- Add/Edit Process Popup Modal for Bank Category（与 Add 同格式，Edit 时预填并显示 Update） -->
        <div id="addBankModal" class="modal bank-modal" style="display: none;">
            <div class="modal-content bank-modal-content">
                <div class="modal-header">
                    <h2 id="bankModalTitle">Add Process</h2>
                    <span class="close" onclick="closeAddBankModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="addBankProcessForm" class="process-form bank-form">
                        <input type="hidden" id="bank_edit_id" name="id" value="">
                        <div class="bank-form-fields-scroll">
                        <div class="bank-form-row">
                            <div class="bank-form-cell bank-form-cell-left">
                                <h3 class="bank-section-title">Bank Information</h3>
                                <div class="form-row bank-row-two-cols">
                                    <div class="form-group">
                                        <label for="bank_country">Country (Currency)</label>
                                        <div class="select-with-add">
                                            <select id="bank_country" name="country" class="bank-select" required>
                                                <option value="">Select Country</option>
                                            </select>
                                            <button type="button" class="bank-add-btn" onclick="showAddCountryModal()"
                                                title="Add New Country">+</button>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_bank">Bank</label>
                                        <div class="select-with-add">
                                            <select id="bank_bank" name="bank" class="bank-select" required>
                                                <option value="">Select Bank</option>
                                            </select>
                                            <button type="button" class="bank-add-btn" onclick="showAddBankModal()"
                                                title="Add New Bank">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="bank-form-cell bank-form-cell-right">
                                <h3 class="bank-section-title">Detail</h3>
                                <div class="form-row bank-row-two-cols">
                                    <div class="form-group">
                                        <label for="bank_card_merchant">Supplier</label>
                                        <div class="account-select-with-buttons">
                                            <div class="custom-select-wrapper">
                                                <button type="button" class="custom-select-button" id="bank_card_merchant"
                                                    data-placeholder="Select Account" name="card_merchant">Select
                                                    Account</button>
                                                <div class="custom-select-dropdown" id="bank_card_merchant_dropdown">
                                                    <div class="custom-select-search">
                                                        <input type="text" placeholder="Search account..."
                                                            autocomplete="off">
                                                    </div>
                                                    <div class="custom-select-options"></div>
                                                </div>
                                            </div>
                                            <button type="button" class="bank-add-btn"
                                                onclick="bankAccountPlusClick('bank_card_merchant')"
                                                title="Add New Account">+</button>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_cost">Buy Price</label>
                                        <input type="text" id="bank_cost" name="cost" placeholder="Enter amount"
                                            class="bank-input" inputmode="decimal" autocomplete="off" required>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="bank-form-row">
                            <div class="bank-form-cell bank-form-cell-left">
                                <div class="form-row bank-row-two-cols bank-row-type-name">
                                    <div class="form-group">
                                        <label for="bank_type">Type</label>
                                        <select id="bank_type" name="type" class="bank-select" required>
                                            <option value="">Select Type</option>
                                            <option value="PERSONAL">PERSONAL</option>
                                            <option value="ENTERPRISE">ENTERPRISE</option>
                                            <option value="BUSINESS">BUSINESS</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_name">Card Owner</label>
                                        <input type="text" id="bank_name" name="name" placeholder="Enter Card Owner"
                                            class="bank-input" oninput="this.value=this.value.toUpperCase()" required>
                                    </div>
                                </div>
                            </div>
                            <div class="bank-form-cell bank-form-cell-right">
                                <div class="form-row bank-row-two-cols">
                                    <div class="form-group">
                                        <label for="bank_customer">Customer</label>
                                        <div class="account-select-with-buttons">
                                            <div class="custom-select-wrapper">
                                                <button type="button" class="custom-select-button" id="bank_customer"
                                                    data-placeholder="Select Account" name="customer">Select
                                                    Account</button>
                                                <div class="custom-select-dropdown" id="bank_customer_dropdown">
                                                    <div class="custom-select-search">
                                                        <input type="text" placeholder="Search account..."
                                                            autocomplete="off">
                                                    </div>
                                                    <div class="custom-select-options"></div>
                                                </div>
                                            </div>
                                            <button type="button" class="bank-add-btn"
                                                onclick="bankAccountPlusClick('bank_customer')"
                                                title="Add New Account">+</button>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_price">Sell Price</label>
                                        <input type="text" id="bank_price" name="price" placeholder="Enter amount"
                                            class="bank-input" inputmode="decimal" autocomplete="off" required>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="bank-form-row">
                            <div class="bank-form-cell bank-form-cell-left">
                                <div class="form-row bank-day-start-row">
                                    <div class="form-group bank-day-start-input-wrap">
                                        <label for="bank_day_start">Day start</label>
                                        <input type="date" id="bank_day_start" name="day_start" class="bank-input">
                                    </div>
                                    <div class="form-group bank-day-end-input-wrap">
                                        <label for="bank_day_end">Day end</label>
                                        <input type="date" id="bank_day_end" name="day_end" class="bank-input">
                                    </div>
                                </div>
                            </div>
                            <div class="bank-form-cell bank-form-cell-right">
                                <div class="form-row bank-row-two-cols">
                                    <div class="form-group">
                                        <label for="bank_profit_account">Company</label>
                                        <div class="account-select-with-buttons">
                                            <div class="custom-select-wrapper">
                                                <button type="button" class="custom-select-button" id="bank_profit_account"
                                                    data-placeholder="Select Account" name="profit_account">Select
                                                    Account</button>
                                                <div class="custom-select-dropdown" id="bank_profit_account_dropdown">
                                                    <div class="custom-select-search">
                                                        <input type="text" placeholder="Search account..."
                                                            autocomplete="off">
                                                    </div>
                                                    <div class="custom-select-options"></div>
                                                </div>
                                            </div>
                                            <button type="button" class="bank-add-btn"
                                                onclick="bankAccountPlusClick('bank_profit_account')"
                                                title="Add New Account">+</button>
                                        </div>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_profit">Profit</label>
                                        <input type="number" id="bank_profit" name="profit" placeholder="Auto calculated"
                                            class="bank-input" readonly style="background-color: #f5f5f5;">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="bank-form-row bank-form-row-last">
                            <div class="bank-form-cell bank-form-cell-left">
                                <div class="form-group bank-day-start-frequency-wrap" style="margin-bottom: 20px;">
                                    <label for="bank_day_start_frequency">Frequency</label>
                                    <select id="bank_day_start_frequency" name="day_start_frequency"
                                        class="bank-input bank-select">
                                        <option value="1st_of_every_month">1st of Every Month</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>
                                <input type="hidden" id="bank_profit_sharing" name="profit_sharing">
                                <div class="bank-profit-sharing-container form-group">
                                    <div class="bank-profit-sharing-header">
                                        <h3>Selected Profit Sharing</h3>
                                        <button type="button" class="bank-add-btn"
                                            onclick="showAddProfitSharingModal()"
                                            title="Add Profit Sharing">+</button>
                                    </div>
                                    <div class="bank-profit-sharing-list" id="selectedProfitSharingList">
                                        <div class="no-profit-sharing">
                                            <p>No profit sharing selected</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="bank-form-cell bank-form-cell-right">
                                <div class="form-row bank-row-two-cols">
                                    <div class="form-group">
                                        <label for="bank_contract">Contract</label>
                                        <select id="bank_contract" name="contract" class="bank-select" required>
                                            <option value="">Select Contract</option>
                                            <option value="1 MONTH">1 MONTH</option>
                                            <option value="2 MONTHS">2 MONTHS</option>
                                            <option value="3 MONTHS">3 MONTHS</option>
                                            <option value="6 MONTHS">6 MONTHS</option>
                                            <option value="1+1">1+1 MONTH</option>
                                            <option value="1+2">1+2 MONTHS</option>
                                            <option value="1+3">1+3 MONTHS</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label for="bank_insurance">Insurance</label>
                                        <input type="text" id="bank_insurance" name="insurance" placeholder="Enter amount"
                                            class="bank-input" inputmode="decimal" autocomplete="off">
                                    </div>
                                </div>
                                <div class="form-group bank-remark-wrap" style="margin-top: 12px;">
                                    <input type="hidden" id="bank_sop" name="sop" value="">
                                    <input type="hidden" id="bank_remark" name="remark" value="">
                                    <div class="bank-remark-actions">
                                        <button type="button" id="bank_sop_btn" class="btn btn-save"
                                            onclick="openProcessNoteModal('sop')">SOP</button>
                                        <button type="button" id="bank_remark_btn" class="btn btn-save"
                                            onclick="openProcessNoteModal('remark')">Remark</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div><!-- /.bank-form-fields-scroll -->

                        <div class="form-actions bank-actions">
                            <button type="submit" class="btn btn-save" id="bankSubmitBtn" disabled>Add Process</button>
                            <button type="button" class="btn btn-cancel" onclick="closeAddBankModal()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        
        <!-- SOP Modal：记录事项（与当前 Add/Edit Process 关联），固定尺寸与底部按钮 -->
        <div id="sopModal" class="modal bank-modal sop-modal" style="display: none;">
            <div class="modal-content sop-modal-content">
                <div class="modal-header">
                    <h2 id="processNoteModalTitle">Process Notes</h2>
                    <span class="close" onclick="closeSopModal()">&times;</span>
                </div>
                <div class="modal-body sop-modal-body">
                    <textarea id="sop_content" placeholder="Enter notes for this process..."
                        class="bank-input sop-modal-textarea"></textarea>
                    <div class="form-actions bank-actions sop-modal-actions">
                        <button type="button" class="btn btn-save" onclick="saveProcessNoteAndClose()">Save</button>
                        <button type="button" class="btn btn-cancel" onclick="closeSopModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
        <!-- Add Account Modal (same structure as datacapturesummary - for Card Merchant/Customer + button) -->
        <div id="addAccountModal" class="account-modal" style="display: none;">
            <div class="account-modal-content">
                <div class="account-modal-header">
                    <h2>Add Account</h2>
                    <span class="account-close" onclick="closeAddAccountModal()">&times;</span>
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
                                    <input type="password" id="add_password" name="password" required>
                                </div>
                            </div>
                            <div class="account-form-column">
                                <h3 class="account-section-header">Payment</h3>
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
                                    <input type="number" id="add_alert_amount" name="alert_amount" step="0.01"
                                        placeholder="Enter amount (auto-converted to negative)">
                                </div>
                                <div class="account-form-group">
                                    <label for="add_remark">Remark</label>
                                    <textarea id="add_remark" name="remark" rows="1"
                                        style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="account-form-section">
                            <div class="account-advance-section">
                                <h3>Advanced Account</h3>
                                <div class="account-other-currency">
                                    <label>Other Currency:</label>
                                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                        <input type="text" id="addCurrencyInput"
                                            placeholder="Enter new currency code (e.g., USD)"
                                            style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                        <button type="button" class="account-btn-add-currency"
                                            onclick="addCurrencyFromInputBank('add'); return false;">Create
                                            Currency</button>
                                    </div>
                                    <div class="account-currency-list" id="addCurrencyList"></div>
                                </div>
                                <div class="account-other-currency" style="margin-top: 20px;">
                                    <label>Company:</label>
                                    <div class="account-currency-list" id="addCompanyList"></div>
                                </div>
                            </div>
                        </div>
                        <div class="account-form-actions">
                            <button type="submit" class="account-btn account-btn-save">Add Account</button>
                            <button type="button" class="account-btn account-btn-cancel"
                                onclick="closeAddAccountModal()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Edit Account Modal (same as account-list.php - for + button when account selected) -->
        <div id="editAccountModal" class="account-modal" style="display: none;">
            <div class="account-modal-content">
                <div class="account-modal-header">
                    <h2>Edit Account</h2>
                    <span class="account-close" onclick="closeEditAccountModalFromBank()">&times;</span>
                </div>
                <div class="account-modal-body">
                    <form id="editAccountForm" class="account-form">
                        <input type="hidden" id="edit_account_id" name="id">
                        <div class="account-form-columns">
                            <div class="account-form-column">
                                <h3 class="account-section-header">Personal Information</h3>
                                <div class="account-form-group">
                                    <label for="edit_account_id_field">Account ID *</label>
                                    <input type="text" id="edit_account_id_field" name="account_id" readonly>
                                </div>
                                <div class="account-form-group">
                                    <label for="edit_name">Name *</label>
                                    <input type="text" id="edit_name" name="name" required>
                                </div>
                                <div class="account-form-group">
                                    <label for="edit_role">Role *</label>
                                    <select id="edit_role" name="role" required>
                                        <option value="">Select Role</option>
                                    </select>
                                </div>
                                <div class="account-form-group">
                                    <label for="edit_password">Password *</label>
                                    <input type="password" id="edit_password" name="password" required>
                                </div>
                            </div>
                            <div class="account-form-column">
                                <h3 class="account-section-header">Payment</h3>
                                <div class="account-form-group"></div>
                                <div class="account-form-group">
                                    <label>Payment Alert</label>
                                    <div class="account-radio-group">
                                        <label class="account-radio-label">
                                            <input type="radio" name="payment_alert" value="1">
                                            Yes
                                        </label>
                                        <label class="account-radio-label">
                                            <input type="radio" name="payment_alert" value="0">
                                            No
                                        </label>
                                    </div>
                                </div>
                                <div class="account-form-row" id="edit_alert_fields" style="display: none;">
                                    <div class="account-form-group">
                                        <label for="edit_alert_type">Alert Type</label>
                                        <select id="edit_alert_type" name="alert_type">
                                            <option value="">Select Type</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                            <?php for ($i = 1; $i <= 31; $i++): ?>
                                                <option value="<?php echo $i; ?>"><?php echo $i; ?> Days</option>
                                            <?php endfor; ?>
                                        </select>
                                    </div>
                                    <div class="account-form-group">
                                        <label for="edit_alert_start_date">Start Date</label>
                                        <input type="date" id="edit_alert_start_date" name="alert_start_date">
                                    </div>
                                </div>
                                <div class="account-form-group" id="edit_alert_amount_row" style="display: none;">
                                    <label for="edit_alert_amount">Alert (Amount)</label>
                                    <input type="number" id="edit_alert_amount" name="alert_amount" step="0.01"
                                        placeholder="Enter amount (auto-converted to negative)">
                                </div>
                                <div class="account-form-group">
                                    <label for="edit_remark">Remark</label>
                                    <textarea id="edit_remark" name="remark" rows="1"
                                        style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea>
                                </div>
                            </div>
                        </div>
                        <div class="account-form-section">
                            <div class="account-advance-section">
                                <h3>Advanced Account</h3>
                                <div class="account-other-currency">
                                    <label>Other Currency:</label>
                                    <div style="display: flex; gap: 8px;">
                                        <input type="text" id="editCurrencyInput"
                                            placeholder="Enter new currency code (e.g., USD)"
                                            style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                        <button type="button" class="account-btn-add-currency"
                                            onclick="addCurrencyFromInputBank('edit'); return false;">Create
                                            Currency</button>
                                    </div>
                                    <div class="account-currency-list" id="editCurrencyList"></div>
                                </div>
                                <div class="account-other-currency" style="margin-top: 20px;">
                                    <label>Company:</label>
                                    <div class="account-currency-list" id="editCompanyList"></div>
                                </div>
                            </div>
                        </div>
                        <div class="account-form-actions">
                            <button type="submit" class="account-btn account-btn-save">Update Account</button>
                            <button type="button" class="account-btn account-btn-cancel"
                                onclick="closeEditAccountModalFromBank()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <!-- Profit Sharing Modal (account select + amount input) -->
        <div id="profitSharingModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 628px;">
                <div class="modal-header">
                    <h2>Add Profit Sharing</h2>
                    <span class="close" onclick="closeProfitSharingModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="profitSharingForm" class="bank-form" style="display: block;">
                        <div id="profitSharingRowsContainer">
                            <div class="form-row bank-row-two-cols profit-sharing-row">
                                <div class="form-group">
                                    <label for="profit_sharing_account_btn">Account</label>
                                    <input type="hidden" id="profit_sharing_account_id" class="profit-sharing-account-id"
                                        name="account_id" value="">
                                    <div class="account-select-with-buttons">
                                        <div class="custom-select-wrapper">
                                            <button type="button" class="custom-select-button profit-sharing-account-btn"
                                                id="profit_sharing_account_btn" data-placeholder="Select Account">Select
                                                Account</button>
                                            <div class="custom-select-dropdown" id="profit_sharing_account_dropdown">
                                                <div class="custom-select-search">
                                                    <input type="text" placeholder="Search account..." autocomplete="off">
                                                </div>
                                                <div class="custom-select-options"></div>
                                            </div>
                                        </div>
                                        <button type="button" class="bank-add-btn"
                                            onclick="profitSharingAccountPlusClick('profit_sharing_account_btn', 'profit_sharing_account_id')"
                                            title="Add New Account">+</button>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="profit_sharing_amount">Amount</label>
                                    <input type="number" id="profit_sharing_amount" name="amount"
                                        class="bank-input profit-sharing-amount" placeholder="Enter amount" step="0.01"
                                        min="0">
                                </div>
                                <div class="form-group profit-sharing-delete-cell profit-sharing-first-row-spacer"
                                    aria-hidden="true"></div>
                            </div>
                        </div>
                        <div class="profit-sharing-add-row-wrap" style="margin-top: 10px;">
                            <button type="button" class="bank-add-btn" id="profitSharingAddRowBtn"
                                title="Add another Account &amp; Amount">+</button>
                        </div>
                        <div class="form-actions bank-actions" style="margin-top: 16px;">
                            <button type="submit" class="btn btn-save">Add</button>
                            <button type="button" class="btn btn-cancel" onclick="closeProfitSharingModal()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Country Selection Modal (layout: left = Add/Available, right = Selected) -->
        <div id="countrySelectionModal" class="modal" style="display: none;">
            <div class="modal-content country-selection-modal">
                <div class="modal-header">
                    <h2>Select or Add Country</h2>
                    <span class="close" onclick="closeCountrySelectionModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="country-selection-container">
                        <div class="available-countries-section">
                            <div class="add-country-bar">
                                <h3>Add New Country</h3>
                                <form id="addCountryForm" class="add-country-form">
                                    <div class="add-country-input-group">
                                        <input type="text" id="new_country_name" name="country_name"
                                            placeholder="Enter new country name..."
                                            oninput="this.value=this.value.toUpperCase()">
                                        <button type="submit" class="btn btn-save">Add</button>
                                    </div>
                                </form>
                            </div>
                            <h3>Available Countries</h3>
                            <div class="country-search">
                                <input type="text" id="countrySearch" placeholder="Search countries..."
                                    onkeyup="filterCountries()" oninput="this.value=this.value.toUpperCase()">
                            </div>
                            <div class="country-list" id="existingCountries"></div>
                        </div>
                        <div class="selected-countries-section">
                            <h3>Selected Countries</h3>
                            <div class="selected-countries-list" id="selectedCountriesInModal"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-save" id="confirmCountriesBtn"
                            onclick="confirmCountries()">Confirm</button>
                        <button type="button" class="btn btn-cancel" onclick="closeCountrySelectionModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bank Selection Modal (layout: left = Add/Available, right = Selected) -->
        <div id="bankSelectionModal" class="modal" style="display: none;">
            <div class="modal-content bank-selection-modal">
                <div class="modal-header">
                    <h2>Select or Add Bank</h2>
                    <span class="close" onclick="closeBankSelectionModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="bank-selection-container">
                        <div class="available-banks-section">
                            <div class="add-bank-bar">
                                <h3>Add New Bank</h3>
                                <form id="addBankForm" class="add-bank-form">
                                    <div class="add-bank-input-group">
                                        <input type="text" id="new_bank_name" name="bank_name"
                                            placeholder="Enter new bank name..."
                                            oninput="this.value=this.value.toUpperCase()">
                                        <button type="submit" class="btn btn-save">Add</button>
                                    </div>
                                </form>
                            </div>
                            <h3>Available Banks</h3>
                            <div class="bank-search">
                                <input type="text" id="bankSearch" placeholder="Search banks..." onkeyup="filterBanks()"
                                    oninput="this.value=this.value.toUpperCase()">
                            </div>
                            <div class="bank-list" id="existingBanks"></div>
                        </div>
                        <div class="selected-banks-section">
                            <h3>Selected Banks</h3>
                            <div class="selected-banks-list" id="selectedBanksInModal"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-save" id="confirmBanksBtn"
                            onclick="confirmBanks()">Confirm</button>
                        <button type="button" class="btn btn-cancel" onclick="closeBankSelectionModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Confirm Switch to Inactive Modal (Bank Process) -->
        <div id="confirmInactiveModal" class="process-modal" style="display: none;">
            <div class="process-confirm-modal-content">
                <div class="process-confirm-icon-container">
                    <svg class="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M10 9v2m0 4h.01M14 9v2m0 4h.01M5 9h14a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4a1 1 0 011-1z" />
                    </svg>
                </div>
                <h2 class="process-confirm-title">Switch to Inactive</h2>
                <p id="confirmInactiveMessage" class="process-confirm-message">Confirm switching this Bank Process to
                    Inactive?</p>
                <div class="process-confirm-actions">
                    <button type="button" class="process-btn process-btn-cancel confirm-cancel"
                        onclick="closeConfirmInactiveModal()">Cancel</button>
                    <button type="button" class="process-btn process-btn-inactive confirm-inactive" id="confirmInactiveBtn"
                        onclick="confirmInactive()">Inactive</button>
                </div>
            </div>
        </div>

        <!-- Confirm Remove from Accounting Due Modal -->
        <div id="confirmAccountingDueDeleteModal" class="process-modal" style="display: none;">
            <div class="process-confirm-modal-content">
                <div class="process-confirm-icon-container">
                    <svg class="process-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 class="process-confirm-title">Remove from Accounting Due</h2>
                <p id="confirmAccountingDueDeleteMessage" class="process-confirm-message">Selected rows will be removed from
                    Accounting Due. Process data will not change.</p>
                <div class="process-confirm-actions">
                    <button type="button" class="process-btn process-btn-cancel confirm-cancel"
                        onclick="closeConfirmAccountingDueDeleteModal()">Cancel</button>
                    <button type="button" class="process-btn process-btn-delete confirm-delete"
                        id="confirmAccountingDueDeleteBtn" onclick="confirmAccountingDueDelete()">Delete</button>
                </div>
            </div>
        </div>

        <!-- Confirm Resend to Accounting Due (replaces browser confirm) -->
        <div id="confirmBankResendModal" class="process-modal process-modal--bank-resend" style="display: none;">
            <div class="process-confirm-modal-content bank-resend-modal-content">
                <div class="bank-resend-modal-hero">
                    <div class="process-confirm-icon-container bank-resend-modal-icon-wrap">
                        <svg class="process-confirm-icon process-confirm-icon--resend" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3v5h5" />
                        </svg>
                    </div>
                    <h2 class="process-confirm-title bank-resend-modal-title">Resend to Accounting Due</h2>
                    <p id="confirmBankResendMessage" class="process-confirm-message bank-resend-modal-message"></p>
                </div>
                <div id="confirmBankResendScheduleFields" class="bank-resend-schedule-card">
                    <div class="bank-resend-schedule-card__head">
                        <span class="bank-resend-schedule-card__label">Billing schedule</span>
                        <p class="bank-resend-schedule-card__hint">These values apply only to this Resend (which month to reopen). They are not saved to the process record; Edit Process keeps its own billing until you click Update Process.</p>
                    </div>
                    <div class="bank-resend-schedule-grid">
                        <div class="bank-resend-field">
                            <label class="bank-resend-field__label" for="bank_resend_day_start">Day start</label>
                            <input type="date" id="bank_resend_day_start" class="bank-resend-control" autocomplete="off">
                            <div id="bankResendDayStartInlineError" class="bank-resend-inline-alert" hidden></div>
                        </div>
                        <div class="bank-resend-field">
                            <label class="bank-resend-field__label" for="bank_resend_day_end">Day end</label>
                            <input type="date" id="bank_resend_day_end" class="bank-resend-control" autocomplete="off">
                        </div>
                        <div class="bank-resend-field bank-resend-field--full">
                            <label class="bank-resend-field__label" for="bank_resend_frequency">Frequency</label>
                            <select id="bank_resend_frequency" class="bank-resend-control bank-resend-control--select">
                                <option value="1st_of_every_month">1st of Every Month</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="process-confirm-actions bank-resend-modal-actions">
                    <button type="button" class="process-btn process-btn-cancel confirm-cancel confirm-bank-resend-cancel"
                        onclick="closeConfirmBankResendModal()">Cancel</button>
                    <button type="button" class="process-btn process-btn-resend confirm-bank-resend-confirm" id="confirmBankResendBtn"
                        onclick="confirmBankResendFromModal()">Resend</button>
                </div>
            </div>
        </div>
        <?php
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    require __DIR__ . '/processlist.php';
}