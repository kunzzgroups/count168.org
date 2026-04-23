/**
 * ownership-group.js
 * Group Earnings tab – manages group-level ownership allocations.
 * Reuses showToast() + template patterns from ownership.js.
 */

// ── State ────────────────────────────────────────────────────
let geGroupsData = [];
let geGroupStates = {};   // { [groupId]: { accounts:[], rows:[] } }
let geCurrentlyExpandedId = null;

function geIsApiSuccess(res) {
    return res && (res.success === true || res.status === 'success');
}

function geIsApiConflict(res) {
    return res && res.status === 'conflict';
}

function geApiMessage(res, fallback = 'Server error') {
    if (!res) return fallback;
    if (typeof res.message === 'string' && res.message.trim() !== '') return res.message;
    if (typeof res.error === 'string' && res.error.trim() !== '') return res.error;
    return fallback;
}

function geApiData(res, fallback = []) {
    if (!res) return fallback;
    if (res.data !== undefined) return res.data;
    return fallback;
}

// ── Tab Switching (called from inline onclick) ───────────────
function switchOwnershipTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.own-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    // Update panels
    document.querySelectorAll('.own-tab-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    const activePanel = document.getElementById(`tab-${tabId}`);
    if (activePanel) activePanel.style.display = '';

    // Lazy-load Group Earnings on first switch
    if (tabId === 'group-earnings' && geGroupsData.length === 0) {
        fetchGroupEarnings();
    }
}

// ── Data Fetching ────────────────────────────────────────────

function fetchGroupEarnings() {
    const container = document.getElementById('groupEarningsContainer');
    container.textContent = '';
    const loaderWrap = document.createElement('div');
    loaderWrap.className = 'own-loader-container';
    loaderWrap.appendChild(document.createElement('div')).className = 'own-loader';
    container.appendChild(loaderWrap);

    fetch('api/ownership/get_group_earnings_api.php')
        .then(r => r.json())
        .then(res => {
            if (!geIsApiSuccess(res)) {
                showToast(geApiMessage(res, 'Failed to load groups'), 'error');
                return;
            }
            geGroupsData = geApiData(res, []);
            renderGroupCards();
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to fetch group earnings', 'error');
        });
}

// ── Card Rendering ───────────────────────────────────────────

function renderGroupCards() {
    const container = document.getElementById('groupEarningsContainer');
    container.innerHTML = '';

    if (geGroupsData.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'own-empty-state';
        empty.textContent = 'No groups found. Assign companies to groups in the Account Ownership tab first.';
        container.appendChild(empty);
        return;
    }

    geGroupsData.forEach(grp => {
        const gid = grp.group_id;
        const alloc = parseFloat(grp.allocated_percentage) || 0;
        const remaining = Math.max(0, 100 - alloc);

        // Build card from scratch (no HTML template — keeps it self-contained)
        const card = document.createElement('div');
        card.className = 'own-card ge-card';
        card.id = `ge-card-${gid}`;

        // ── Header ─────────────────────────────
        const header = document.createElement('div');
        header.className = 'own-card-header';
        header.style.cursor = 'pointer';
        header.dataset.action = 'toggle';

        // Build company list with per-company group equity
        const companyLabels = grp.companies.map(c => {
            const eq = parseFloat(c.group_equity) || 0;
            return eq > 0 ? `${c.name} (${eq}%)` : c.name;
        }).join(', ');

        header.innerHTML = `
            <div class="own-card-header-left">
                <div class="own-company-name">${gid}</div>
            </div>
            <div class="own-card-header-middle">
                <div class="own-allocation-info">
                    <span class="own-allocation-label">Total Allocation</span>
                    <span class="own-allocation-percentage" id="ge-header-percent-${gid}">${alloc}%</span>
                    <span class="own-allocation-remaining" id="ge-header-remain-${gid}">${remaining}% Remaining</span>
                </div>
                <div class="own-progress-bar-container">
                    <div class="own-progress-bar-fill" id="ge-header-bar-${gid}" style="width:${Math.min(alloc, 100)}%"></div>
                </div>
            </div>
            <div class="own-card-header-right">
                <button class="own-btn-outline" data-action="toggle">Manage</button>
                <button class="own-icon-btn" data-action="toggle">
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
            </div>
        `;

        // ── Body ───────────────────────────────
        const body = document.createElement('div');
        body.className = 'own-card-body';
        body.id = `ge-card-body-${gid}`;
        body.innerHTML = `
            <div class="own-loader-container" id="ge-loader-${gid}">
                <div class="own-loader"></div>
            </div>
            <div class="own-editor-hidden" id="ge-editor-${gid}">
                <div class="own-table-headers">
                    <div>Account</div>
                    <div>Ownership%</div>
                </div>
                <div id="ge-rows-container-${gid}"></div>
                <button class="own-btn-add-account" data-action="add-row">+ Add Account</button>
                <div class="own-partner-section">
                    <div class="own-partner-info">
                        <div class="own-partner-title-row">
                            <span class="own-partner-title">External Partner</span>
                            <div class="own-partner-actions">
                                <input type="text" class="own-partner-input" id="ge-partner-login-${gid}"
                                    placeholder="Login ID/Group ID" autocomplete="off" autocapitalize="characters">
                                <button class="own-partner-link-btn" data-action="link-partner">Link Partner</button>
                            </div>
                        </div>
                        <span class="own-partner-desc">Share this group's read-only dashboard visibility with another independent owner.</span>
                    </div>
                </div>
                <div class="own-card-footer">
                    <div class="own-footer-left">
                        <div class="own-warning-badge" id="ge-warning-${gid}" style="display:none;">
                            <span id="ge-warning-icon-${gid}">⚠️</span>
                            <span id="ge-warning-msg-${gid}">Total is less than 100%</span>
                        </div>
                        <span class="own-unallocated-text" id="ge-footer-remain-${gid}">100% Unallocated</span>
                    </div>
                    <div class="own-footer-right">
                        <button class="own-footer-btn own-btn-cancel" data-action="cancel">Cancel</button>
                        <button class="own-footer-btn own-btn-confirm" id="ge-confirm-btn-${gid}" data-action="confirm">Confirm</button>
                    </div>
                </div>
            </div>
        `;

        card.appendChild(header);
        card.appendChild(body);

        // ── Event Delegation ───────────────────
        card.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            e.stopPropagation();
            switch (action) {
                case 'toggle':     geToggleCard(gid); break;
                case 'add-row':    geAddAccountRow(gid); break;
                case 'cancel':     geCancelEdit(gid); break;
                case 'confirm':    geConfirmEdit(gid); break;
                case 'link-partner': geLinkExternalPartner(gid, e); break;
            }
        });

        container.appendChild(card);
    });
}

// ── Card Toggle & Data Loading ───────────────────────────────

function geToggleCard(groupId) {
    const card = document.getElementById(`ge-card-${groupId}`);
    const isExpanded = card.classList.contains('expanded');

    if (!isExpanded && geCurrentlyExpandedId && geCurrentlyExpandedId !== groupId) {
        geCancelEdit(geCurrentlyExpandedId, true);
    }

    if (isExpanded) {
        geCancelEdit(groupId, true);
    } else {
        card.classList.add('expanded');
        geCurrentlyExpandedId = groupId;
        geLoadGroupData(groupId);
    }
}

function geLoadGroupData(groupId) {
    const loader = document.getElementById(`ge-loader-${groupId}`);
    const editor = document.getElementById(`ge-editor-${groupId}`);
    loader.style.display = 'flex';
    editor.classList.add('own-editor-hidden');

    // Fetch available accounts by group_id (single API call) + existing group ownership rows
    Promise.all([
        fetch(`api/ownership/get_group_available_accounts_api.php?group_id=${encodeURIComponent(groupId)}`).then(r => r.json()),
        fetch(`api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(groupId)}`).then(r => r.json())
    ]).then(([accountsRes, ownersRes]) => {
        loader.style.display = 'none';
        editor.classList.remove('own-editor-hidden');

        const accounts = (accountsRes.status === 'success') ? accountsRes.data : [];

        geGroupStates[groupId] = {
            accounts: accounts,
            rows: (ownersRes.status === 'success' ? ownersRes.data : []).map(o => ({
                account_id: o.composite_id || o.account_id,
                percentage: parseFloat(o.percentage),
                role: o.role || '',
                user_raw_id: o.user_raw_id || null,
                ownership_id: o.ownership_id || null,
                is_external_partner: parseInt(o.is_external_partner) === 1,
                read_only: o.read_only !== null && o.read_only !== undefined ? parseInt(o.read_only) : 1
            }))
        };

        geRenderCardBodyRows(groupId);
    }).catch(err => {
        console.error(err);
        showToast('Error loading group data', 'error');
        loader.style.display = 'none';
    });
}

function geCancelEdit(groupId, forceCollapse = false) {
    const card = document.getElementById(`ge-card-${groupId}`);
    if (card) card.classList.remove('expanded');
    if (geCurrentlyExpandedId === groupId) geCurrentlyExpandedId = null;

    const grpIdx = geGroupsData.findIndex(g => g.group_id === groupId);
    if (grpIdx >= 0) {
        geUpdateCardHeaderDisplay(groupId, parseFloat(geGroupsData[grpIdx].allocated_percentage) || 0);
    }
}

// ── Row Rendering ────────────────────────────────────────────

function geRenderCardBodyRows(groupId) {
    const container = document.getElementById(`ge-rows-container-${groupId}`);
    container.innerHTML = '';

    geGroupStates[groupId].rows.forEach((row, idx) => {
        container.appendChild(geCreateRowElement(groupId, idx, row));
    });

    geUpdateCalculations(groupId);
}

function geCreateRowElement(groupId, idx, rowData) {
    const div = document.createElement('div');
    div.className = 'own-account-row';
    div.dataset.index = idx;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'own-drag-handle';
    dragHandle.textContent = '⋮⋮';
    div.appendChild(dragHandle);

    // Account select
    const select = document.createElement('select');
    select.className = 'own-account-select';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- SELECT ACCOUNT --';
    select.appendChild(defaultOpt);

    geGroupStates[groupId].accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        const mainStr = parseInt(acc.is_main_owner) === 1 ? ' - Main' : '';
        opt.textContent = `${acc.account_name} (${acc.name})${mainStr}`;
        if (acc.id == rowData.account_id) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => geUpdateRowData(groupId, idx, 'account_id', select.value));
    div.appendChild(select);

    // Ownership input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'own-ownership-input-group';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'own-percent-input';
    input.value = `${rowData.percentage}%`;
    input.id = `ge-input-${groupId}-${idx}`;
    input.addEventListener('change', () => geUpdateSliderFromInput(groupId, idx, input.value));

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'own-slider-container';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'own-slider';
    slider.id = `ge-slider-${groupId}-${idx}`;
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = rowData.percentage;
    slider.addEventListener('input', () => geUpdateInputFromSlider(groupId, idx, slider.value));

    const labels = document.createElement('div');
    labels.className = 'own-slider-labels';
    labels.innerHTML = '<span>0%</span><span>50%</span><span>100%</span>';

    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(labels);
    inputGroup.appendChild(input);
    inputGroup.appendChild(sliderContainer);
    div.appendChild(inputGroup);

    // Row actions
    const rowActions = document.createElement('div');
    rowActions.className = 'own-row-actions';

    // Read Only toggle
    const isPartnership = (rowData.role || '').toLowerCase() === 'partnership';
    const showToggle = isPartnership || rowData.is_external_partner;

    const badge = document.createElement('div');
    badge.className = 'own-read-only-badge';
    badge.style.display = 'flex';
    badge.style.visibility = showToggle ? 'visible' : 'hidden';

    const roText = document.createElement('span');
    roText.className = 'own-read-only-text';
    roText.textContent = 'Read Only';
    badge.appendChild(roText);

    const roLabel = document.createElement('label');
    roLabel.className = 'own-ro-toggle';
    const roCheck = document.createElement('input');
    roCheck.type = 'checkbox';
    roCheck.checked = rowData.read_only === 1;
    if (showToggle) {
        roCheck.addEventListener('change', () => {
            geGroupStates[groupId].rows[idx].read_only = roCheck.checked ? 1 : 0;
        });
    }
    const roSlider = document.createElement('span');
    roSlider.className = 'own-ro-slider';
    roLabel.appendChild(roCheck);
    roLabel.appendChild(roSlider);
    badge.appendChild(roLabel);
    rowActions.appendChild(badge);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'own-btn-square own-btn-delete';
    deleteBtn.title = 'Remove';
    deleteBtn.innerHTML = `
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clip-rule="evenodd"></path>
        </svg>
    `;
    deleteBtn.addEventListener('click', () => geRemoveRow(groupId, idx));
    rowActions.appendChild(deleteBtn);
    div.appendChild(rowActions);

    // Initialize slider gradient
    requestAnimationFrame(() => geApplySliderBackground(slider));

    return div;
}

// ── Row Data Operations ──────────────────────────────────────

function geAddAccountRow(groupId) {
    geGroupStates[groupId].rows.push({
        account_id: '', percentage: 0, role: '', user_raw_id: null, read_only: 1
    });
    geRenderCardBodyRows(groupId);
}

function geRemoveRow(groupId, idx) {
    geGroupStates[groupId].rows.splice(idx, 1);
    geRenderCardBodyRows(groupId);
}

function geUpdateRowData(groupId, idx, field, value) {
    geGroupStates[groupId].rows[idx][field] = value;
    if (field === 'percentage') geUpdateCalculations(groupId);
    if (field === 'account_id') {
        const acc = geGroupStates[groupId].accounts.find(a => a.id === value);
        if (acc) {
            geGroupStates[groupId].rows[idx].role = (acc.role || '').toLowerCase();
            const isUser = String(value).startsWith('U_');
            geGroupStates[groupId].rows[idx].user_raw_id = isUser ? parseInt(value.replace('U_', '')) : null;
            geGroupStates[groupId].rows[idx].read_only = 1;
        } else {
            geGroupStates[groupId].rows[idx].role = '';
            geGroupStates[groupId].rows[idx].user_raw_id = null;
        }
        geRenderCardBodyRows(groupId);
    }
}

// ── Slider & Input Sync ──────────────────────────────────────

function geUpdateInputFromSlider(groupId, idx, value) {
    const pct = parseFloat(value) || 0;
    document.getElementById(`ge-input-${groupId}-${idx}`).value = `${pct}%`;
    geApplySliderBackground(document.getElementById(`ge-slider-${groupId}-${idx}`));
    geGroupStates[groupId].rows[idx].percentage = pct;
    geUpdateCalculations(groupId);
}

function geUpdateSliderFromInput(groupId, idx, value) {
    let pct = parseFloat(value.replace('%', ''));
    if (isNaN(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));

    document.getElementById(`ge-slider-${groupId}-${idx}`).value = pct;
    document.getElementById(`ge-input-${groupId}-${idx}`).value = `${pct}%`;
    geApplySliderBackground(document.getElementById(`ge-slider-${groupId}-${idx}`));
    geGroupStates[groupId].rows[idx].percentage = pct;
    geUpdateCalculations(groupId);
}

function geApplySliderBackground(slider) {
    if (!slider) return;
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--own-primary-blue) ${pct}%, var(--own-gray-border) ${pct}%)`;
}

// ── Calculations & Display ───────────────────────────────────

function geUpdateCalculations(groupId) {
    const total = geGroupStates[groupId].rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
    geUpdateCardHeaderDisplay(groupId, total);

    const remaining = 100 - total;
    const footerRm = document.getElementById(`ge-footer-remain-${groupId}`);
    const warningBadge = document.getElementById(`ge-warning-${groupId}`);
    const confirmBtn = document.getElementById(`ge-confirm-btn-${groupId}`);

    if (total > 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge own-warning-error';
        document.getElementById(`ge-warning-icon-${groupId}`).textContent = '❌';
        document.getElementById(`ge-warning-msg-${groupId}`).textContent = 'Total exceeds 100%!';
        if (footerRm) footerRm.textContent = `${Math.abs(remaining).toFixed(2)}% Over Allocated`;
        confirmBtn.disabled = true;
    } else if (total < 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        document.getElementById(`ge-warning-icon-${groupId}`).textContent = '⚠️';
        document.getElementById(`ge-warning-msg-${groupId}`).textContent = 'Total is less than 100%';
        if (footerRm) footerRm.textContent = `${remaining.toFixed(2)}% Unallocated`;
        confirmBtn.disabled = false;
    } else {
        warningBadge.style.display = 'none';
        if (footerRm) footerRm.textContent = 'Fully Allocated';
        confirmBtn.disabled = false;
    }
}

function geUpdateCardHeaderDisplay(groupId, total) {
    const remainEl = document.getElementById(`ge-header-remain-${groupId}`);
    const pctEl = document.getElementById(`ge-header-percent-${groupId}`);
    const barEl = document.getElementById(`ge-header-bar-${groupId}`);

    if (pctEl) pctEl.textContent = `${total}%`;

    if (remainEl) {
        if (total > 100) {
            remainEl.textContent = 'Over limit!';
            remainEl.classList.add('own-over-limit');
            if (barEl) barEl.classList.add('own-bar-danger');
        } else {
            remainEl.textContent = `${(100 - total).toFixed(2)}% Remaining`;
            remainEl.classList.remove('own-over-limit');
            if (barEl) barEl.classList.remove('own-bar-danger');
        }
    }
    if (barEl) barEl.style.width = `${Math.min(total, 100)}%`;
}

// ── Save / Confirm ───────────────────────────────────────────

function geConfirmEdit(groupId) {
    const rows = geGroupStates[groupId].rows;
    let total = 0;
    let hasError = false;

    rows.forEach(r => {
        if (!r.account_id) {
            hasError = true;
            showToast('Please select an account for all rows.', 'error');
        }
        total += parseFloat(r.percentage);
    });

    if (total > 100) { showToast('Total percentage exceeds 100%', 'error'); return; }
    if (hasError) return;

    const accIds = rows.map(r => r.account_id);
    if (accIds.some((item, idx) => accIds.indexOf(item) !== idx)) {
        showToast('Duplicate accounts detected. Please combine them.', 'error');
        return;
    }

    const payload = {
        group_id: groupId,
        owners: rows.map(r => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage),
            read_only: r.read_only
        }))
    };

    const confirmBtn = document.getElementById(`ge-confirm-btn-${groupId}`);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    fetch('api/ownership/batch_save_group_owners_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(res => {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
            if (geIsApiSuccess(res)) {
                showToast(geApiMessage(res, 'Group ownership saved successfully'), 'success');
                const grpIdx = geGroupsData.findIndex(g => g.group_id === groupId);
                if (grpIdx >= 0) geGroupsData[grpIdx].allocated_percentage = total;
                geCancelEdit(groupId, true);
            } else {
                showToast(geApiMessage(res, 'Save failed'), 'error');
            }
        })
        .catch(err => {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
            console.error(err);
            showToast('Server error', 'error');
        });
}

// ── External Partner ─────────────────────────────────────────

function geLinkExternalPartner(groupId, event, forceType = '') {
    const loginIdInput = document.getElementById(`ge-partner-login-${groupId}`);
    const loginId = loginIdInput.value.trim().toUpperCase();
    if (!loginId) { showToast('Please enter a Login ID/Group ID', 'error'); return; }

    const btn = event.target.closest('[data-action="link-partner"]');
    btn.disabled = true;
    btn.textContent = 'Linking...';

    fetch('api/ownership/add_group_external_partner_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, login_id: loginId, force_type: forceType })
    })
        .then(res => res.json())
        .then(res => {
            btn.disabled = false;
            btn.textContent = 'Link Partner';
            if (geIsApiSuccess(res)) {
                showToast(geApiMessage(res, 'Partner linked successfully'), 'success');
                loginIdInput.value = '';
                geCancelEdit(groupId, true);
                setTimeout(() => geToggleCard(groupId), 300);
            } else if (geIsApiConflict(res)) {
                // Simplified conflict handling — just show the error
                showToast('Multiple matches found. Please specify login or group ID more precisely.', 'error');
            } else {
                showToast(geApiMessage(res, 'Link partner failed'), 'error');
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.textContent = 'Link Partner';
            console.error(err);
            showToast('Server error', 'error');
        });
}
