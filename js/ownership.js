document.addEventListener('DOMContentLoaded', () => {
    fetchCompanies();

    // External Partner (Login ID / Group ID): force uppercase as user types (value + display)
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el || !el.classList || !el.classList.contains('own-partner-input')) return;
        const upper = el.value.toUpperCase();
        if (el.value === upper) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = upper;
        if (start != null && end != null) {
            try {
                el.setSelectionRange(start, end);
            } catch (_) { /* ignore */ }
        }
    });

    // Close group dropdowns when clicking anywhere outside the button wrap.
    // Bubble phase (no capture) so the button's own stopPropagation works correctly.
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.own-group-btn-wrap')) {
            document.querySelectorAll('.own-group-panel.open')
                .forEach(p => p.classList.remove('open'));
        }
    });
});

let companiesData = [];     // currently-filtered list (what's visible)
let allCompaniesData = [];  // full unfiltered list (all companies)
let companyStates = {};
let currentlyExpandedId = null;
let allGroupIds = []; // unique group IDs extracted from allCompaniesData

let draggedRowIdx = null;
let draggedCompanyId = null;

// ── Multi-select state ────────────────────────────────────────────
const selectedCompanyIds = new Set(); // IDs of checked independent companies
let selectionMode = false;            // true = clicking a card selects it

// ── Group filter state ────────────────────────────────────────────
// null = show independent companies; string = show that group's companies
let activeGroupFilter = null;

// Template references (cached on first use)
const tpl = {
    card: () => document.getElementById('tpl-company-card'),
    row: () => document.getElementById('tpl-account-row')
};

// Helper: query inside a cloned template fragment by data-bind
function $(el, bind) {
    return el.querySelector(`[data-bind="${bind}"]`);
}

function isApiSuccess(res) {
    return res && (res.success === true || res.status === 'success');
}

function isApiConflict(res) {
    return res && res.status === 'conflict';
}

function getApiMessage(res, fallback = 'Server error') {
    if (!res) return fallback;
    if (typeof res.message === 'string' && res.message.trim() !== '') return res.message;
    if (typeof res.error === 'string' && res.error.trim() !== '') return res.error;
    return fallback;
}

function getApiData(res, fallback = []) {
    if (!res) return fallback;
    if (res.data !== undefined) return res.data;
    return fallback;
}

// ---------------------------------------------
// Data Fetching
// ---------------------------------------------

function fetchCompanies() {
    const container = document.getElementById('companyCardsContainer');
    container.textContent = '';
    const loaderWrap = document.createElement('div');
    loaderWrap.className = 'own-loader-container';
    loaderWrap.appendChild(document.createElement('div')).className = 'own-loader';
    container.appendChild(loaderWrap);

    // Always fetch the full unfiltered list — we filter client-side via the group bar
    // Use ownership API (includes allocated_percentage) with all=1 to bypass session filter
    fetch('api/ownership/get_companies_api.php?all=1')
        .then(r => r.json())
        .then(res => {
            if (!isApiSuccess(res)) {
                showToast(getApiMessage(res, 'Failed to load companies'), 'error');
                return;
            }
            allCompaniesData = getApiData(res, []);
            _rebuildGroupIds();
            _applyGroupFilter();   // sets companiesData then renders
            _renderGroupFilterBar();
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to fetch companies', 'error');
        });
}

// ---------------------------------------------
// Card Rendering (template-based)
// ---------------------------------------------

function renderCompanyCards() {
    const container = document.getElementById('companyCardsContainer');
    container.innerHTML = '';

    // Filter switch removes old card nodes; keep expansion state in sync with DOM
    currentlyExpandedId = null;

    // Clear selection whenever cards re-render (data may have changed)
    selectedCompanyIds.clear();
    _updateBulkBar();

    if (companiesData.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'own-empty-state';
        empty.textContent = 'No companies found.';
        container.appendChild(empty);
        return;
    }

    companiesData.forEach(comp => {
        const alloc = parseFloat(comp.allocated_percentage) || 0;
        const remaining = Math.max(0, 100 - alloc);
        const id = comp.id;
        const groupId = comp.group_id || null;

        // Clone card template
        const frag = tpl.card().content.cloneNode(true);
        const card = frag.querySelector('.own-card');
        card.id = `card-${id}`;
        if (groupId) card.dataset.groupId = groupId;

        // Fill data bindings
        $(card, 'name').textContent = comp.name;

        const dateEl = $(card, 'date');
        if (dateEl) {
            if (comp.expiration_date) {
                const expStr = comp.expiration_date.split(' ')[0];
                const expDate = new Date(expStr);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

                // Color coding: expired = red, ≤30 days = amber, else = gray
                let cls = '';
                if (daysLeft < 0) cls = 'own-date-expired';
                else if (daysLeft <= 30) cls = 'own-date-warning';

                dateEl.innerHTML = `
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ${expStr}`;
                if (cls) dateEl.classList.add(cls);
            } else {
                dateEl.textContent = '';
            }
        }
        const pctEl = $(card, 'percent');
        pctEl.textContent = `${alloc}%`;
        pctEl.id = `header-percent-${id}`;

        const remEl = $(card, 'remaining');
        remEl.textContent = `${remaining}% Remaining`;
        remEl.id = `header-remain-${id}`;

        const barEl = $(card, 'bar');
        barEl.style.width = `${Math.min(alloc, 100)}%`;
        barEl.id = `header-bar-${id}`;

        // Body IDs
        $(card, 'body').id = `card-body-${id}`;
        $(card, 'loader').id = `loader-${id}`;
        $(card, 'editor').id = `editor-${id}`;
        $(card, 'rows-container').id = `rows-container-${id}`;
        $(card, 'partner-input').id = `partner-login-${id}`;
        $(card, 'warning').id = `warning-${id}`;
        $(card, 'warning-msg').id = `warning-msg-${id}`;
        $(card, 'footer-remain').id = `footer-remain-${id}`;
        $(card, 'confirm-btn').id = `confirm-btn-${id}`;

        // ── In selection mode: mark selectable cards ─────────────────
        // Independent cards selectable for grouping; grouped cards selectable for ungrouping
        if (allGroupIds.length > 0) {
            if (!groupId || activeGroupFilter !== null) {
                card.dataset.selectable = 'true';
            }
        }

        // ── Group management buttons in header-right ──────────────────
        const headerRight = card.querySelector('.own-card-header-right');
        if (headerRight && allGroupIds.length > 0) {
            if (!groupId) {
                // Feature 1: Independent company → "+ Group" button with dropdown
                const wrap = document.createElement('div');
                wrap.className = 'own-group-btn-wrap';

                const joinBtn = document.createElement('button');
                joinBtn.className = 'own-group-join-btn';
                joinBtn.textContent = '+ Group';
                joinBtn.title = 'Assign this company to a group';
                joinBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    // Toggle dropdown
                    const panel = wrap.querySelector('.own-group-panel');
                    // Close all other open panels first
                    document.querySelectorAll('.own-group-panel.open').forEach(p => {
                        if (p !== panel) p.classList.remove('open');
                    });
                    panel.classList.toggle('open');
                });

                const panel = document.createElement('div');
                panel.className = 'own-group-panel';

                allGroupIds.forEach(gid => {
                    const opt = document.createElement('div');
                    opt.className = 'own-group-option';
                    opt.textContent = gid;
                    opt.addEventListener('click', e => {
                        e.stopPropagation();
                        panel.classList.remove('open');
                        joinCompanyGroup(id, gid, comp.name);
                    });
                    panel.appendChild(opt);
                });

                wrap.appendChild(joinBtn);
                wrap.appendChild(panel);
                // Insert before the Manage button
                headerRight.insertBefore(wrap, headerRight.firstChild);
            } else {
                // Feature 2: Grouped company → "Ungroup" button
                const ungroupBtn = document.createElement('button');
                ungroupBtn.className = 'own-group-ungroup-btn';
                ungroupBtn.textContent = 'Ungroup';
                ungroupBtn.title = `Remove from group "${groupId}"`;
                ungroupBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    ungroupCompany(id, comp.name);
                });
                headerRight.insertBefore(ungroupBtn, headerRight.firstChild);

                // Show group badge INSIDE .own-company-name (flex row) — not after it
                const nameEl = $(card, 'name');
                const badge = document.createElement('span');
                badge.className = 'own-group-badge';
                badge.textContent = groupId;
                nameEl.appendChild(badge);
            }
        }
        // ──────────────────────────────────────────────────────────────

        // Bind actions via event delegation
        card.addEventListener('click', (e) => {
            // Selection mode: clicking anywhere on a selectable card toggles it
            if (selectionMode && card.dataset.selectable === 'true') {
                // Allow buttons inside (+ Group, Ungroup, Manage) to still work normally
                if (e.target.closest('button, .own-group-panel')) return;
                e.stopPropagation();
                const isSelected = selectedCompanyIds.has(id);
                if (isSelected) {
                    selectedCompanyIds.delete(id);
                    card.classList.remove('own-selected', 'own-ungroup-select');
                } else {
                    selectedCompanyIds.add(id);
                    card.classList.add('own-selected');
                    // Red tint for ungroup selection
                    if (activeGroupFilter !== null) card.classList.add('own-ungroup-select');
                }
                _updateBulkBar();
                return;
            }

            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            e.stopPropagation();
            switch (action) {
                case 'toggle': toggleCard(id, e); break;
                case 'add-row': addAccountRow(id); break;
                case 'cancel': cancelEdit(id); break;
                case 'confirm': confirmEdit(id); break;
                case 'link-partner': linkExternalPartner(id, e); break;
            }
        });

        container.appendChild(frag);
    });
}

// ---------------------------------------------
// Card Toggle & Data Loading
// ---------------------------------------------

function toggleCard(companyId, event) {
    const card = document.getElementById(`card-${companyId}`);
    if (!card) return;
    const isExpanded = card.classList.contains('expanded');

    if (!isExpanded && currentlyExpandedId && currentlyExpandedId !== companyId) {
        cancelEdit(currentlyExpandedId, true);
    }

    if (isExpanded) {
        cancelEdit(companyId, true);
    } else {
        card.classList.add('expanded');
        currentlyExpandedId = companyId;
        loadCompanyData(companyId);
    }
}

function loadCompanyData(companyId) {
    const loader = document.getElementById(`loader-${companyId}`);
    const editor = document.getElementById(`editor-${companyId}`);
    if (!loader || !editor) return;
    loader.style.display = 'flex';
    editor.classList.add('own-editor-hidden');

    // Find the group_id for this company
    const compData = allCompaniesData.find(c => parseInt(c.id) === companyId);
    const compGroupId = compData ? (compData.group_id || '') : '';

    Promise.all([
        fetch(`api/ownership/get_available_accounts_api.php?company_id=${companyId}`).then(r => r.json()),
        fetch(`api/ownership/get_owners_api.php?company_id=${companyId}`).then(r => r.json())
    ]).then(([accountsRes, ownersRes]) => {
        // User may have changed group filter while requests were in flight
        const loaderEl = document.getElementById(`loader-${companyId}`);
        const editorEl = document.getElementById(`editor-${companyId}`);
        if (!loaderEl || !editorEl) return;
        loaderEl.style.display = 'none';
        editorEl.classList.remove('own-editor-hidden');

        const accounts = accountsRes.status === 'success' ? accountsRes.data : [];

        // If company has a group, add Group ID as a selectable entry (G_ prefix)
        // only when backend result does not already include it.
        if (compGroupId && !accounts.some(a => String(a.id) === `G_${compGroupId}`)) {
            accounts.push({
                id: `G_${compGroupId}`,
                account_name: `Group: ${compGroupId}`,
                name: `Group Equity`,
                role: 'GROUP',
                type: 'group',
                is_main_owner: 0
            });
        }

        // Final safeguard: dedupe options by id to avoid duplicate Group rows.
        const seenIds = new Set();
        const uniqueAccounts = accounts.filter(acc => {
            const key = String(acc.id || '');
            if (!key || seenIds.has(key)) return false;
            seenIds.add(key);
            return true;
        });

        companyStates[companyId] = {
            accounts: uniqueAccounts,
            rows: (ownersRes.status === 'success' ? ownersRes.data : []).map(o => ({
                account_id: o.account_id,
                percentage: parseFloat(o.percentage),
                role: o.role || '',
                user_raw_id: o.user_raw_id || null,
                ownership_id: o.ownership_id || null,
                is_external_partner: parseInt(o.is_external_partner) === 1,
                read_only: o.read_only !== null && o.read_only !== undefined ? parseInt(o.read_only) : 1
            }))
        };

        renderCardBodyRows(companyId);
    }).catch(err => {
        console.error(err);
        showToast('Error loading data', 'error');
        const loaderEl = document.getElementById(`loader-${companyId}`);
        if (loaderEl) loaderEl.style.display = 'none';
    });
}

function cancelEdit(companyId, forceCollapse = false) {
    const card = document.getElementById(`card-${companyId}`);
    if (card) card.classList.remove('expanded');
    if (currentlyExpandedId === companyId) currentlyExpandedId = null;

    const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
    if (compIdx >= 0) {
        updateCardHeaderDisplay(companyId, parseFloat(companiesData[compIdx].allocated_percentage) || 0);
    }
}

// ---------------------------------------------
// Row Rendering (template-based)
// ---------------------------------------------

function renderCardBodyRows(companyId) {
    const container = document.getElementById(`rows-container-${companyId}`);
    if (!container || !companyStates[companyId]) return;
    container.innerHTML = '';

    companyStates[companyId].rows.forEach((row, idx) => {
        container.appendChild(createRowElement(companyId, idx, row));
    });

    updateCalculations(companyId);
}

function createRowElement(companyId, idx, rowData) {
    const frag = tpl.row().content.cloneNode(true);
    const div = frag.querySelector('.own-account-row');
    div.dataset.index = idx;
    // Mark group entry rows for CSS styling
    if (String(rowData.account_id).startsWith('G_')) {
        div.dataset.groupEntry = 'true';
    }

    // Populate account select
    const select = $(div, 'account-select');
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- SELECT ACCOUNT --';
    select.appendChild(defaultOpt);

    companyStates[companyId].accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        const mainStr = parseInt(acc.is_main_owner) === 1 ? ' - Main' : '';
        // Group-type rows (self-group link) already read "Group: AP" in account_name.
        // Skip the redundant "(Group Equity)" suffix for those.
        const typeStr = String(acc.type || '').toLowerCase();
        opt.textContent = typeStr === 'group'
            ? `${acc.account_name}${mainStr}`
            : `${acc.account_name} (${acc.name})${mainStr}`;
        if (acc.id == rowData.account_id) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', () => updateRowData(companyId, idx, 'account_id', select.value));

    // Percentage input
    const input = $(div, 'percent-input');
    input.value = `${rowData.percentage}%`;
    input.id = `input-${companyId}-${idx}`;
    input.addEventListener('change', () => updateSliderFromInput(companyId, idx, input.value));

    // Slider
    const slider = $(div, 'slider');
    slider.value = rowData.percentage;
    slider.id = `slider-${companyId}-${idx}`;
    slider.addEventListener('input', () => updateInputFromSlider(companyId, idx, slider.value));

    // Action buttons (via event delegation — only delete now)
    div.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        switch (action) {
            case 'delete': removeRow(companyId, idx); break;
        }
    });

    // Read Only toggle: show for Partnership users OR External Partners
    const badge = $(div, 'read-only-badge');
    const roCheck = $(div, 'read-only-check');

    const isPartnership = (rowData.role || '').toLowerCase() === 'partnership';
    const showToggle = isPartnership || rowData.is_external_partner;

    if (badge && roCheck) {
        badge.style.display = 'flex';
        badge.style.visibility = showToggle ? 'visible' : 'hidden';

        if (showToggle) {
            roCheck.checked = rowData.read_only === 1;

            roCheck.addEventListener('change', () => {
                companyStates[companyId].rows[idx].read_only = roCheck.checked ? 1 : 0;
                // Immediate API call removed, this will be saved on confirm
            });
        }
    }

    // Initialize slider gradient
    requestAnimationFrame(() => applySliderBackground(slider));

    // Drag and drop logic
    const dragHandle = div.querySelector('.own-drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('mousedown', () => div.setAttribute('draggable', 'true'));
        dragHandle.addEventListener('mouseup', () => div.removeAttribute('draggable'));
        dragHandle.addEventListener('mouseleave', () => div.removeAttribute('draggable'));
    }

    div.addEventListener('dragstart', (e) => {
        draggedRowIdx = idx;
        draggedCompanyId = companyId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
        setTimeout(() => div.classList.add('own-dragging'), 0);
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedCompanyId !== companyId || draggedRowIdx === idx) return;

        const bounding = div.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        if (e.clientY > offset) {
            div.style.borderBottom = '2px solid var(--own-primary-blue)';
            div.style.borderTop = '';
            div.style.transform = 'translateY(-2px)';
        } else {
            div.style.borderTop = '2px solid var(--own-primary-blue)';
            div.style.borderBottom = '';
            div.style.transform = 'translateY(2px)';
        }
    });

    div.addEventListener('dragleave', () => {
        div.style.borderTop = '';
        div.style.borderBottom = '';
        div.style.transform = '';
    });

    div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.style.borderTop = '';
        div.style.borderBottom = '';
        div.style.transform = '';

        if (draggedCompanyId !== companyId || draggedRowIdx === null) return;
        if (draggedRowIdx === idx) return;

        const bounding = div.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        const insertAfter = e.clientY > offset;

        const rows = companyStates[companyId].rows;
        const [movedRow] = rows.splice(draggedRowIdx, 1);

        let newIdx = idx;
        if (draggedRowIdx < idx) {
            newIdx = insertAfter ? idx : idx - 1;
        } else {
            newIdx = insertAfter ? idx + 1 : idx;
        }

        rows.splice(newIdx, 0, movedRow);
        renderCardBodyRows(companyId);
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('own-dragging');
        div.removeAttribute('draggable');
        draggedRowIdx = null;
        draggedCompanyId = null;

        const allRows = document.querySelectorAll(`#rows-container-${companyId} .own-account-row`);
        allRows.forEach(r => {
            r.style.borderTop = '';
            r.style.borderBottom = '';
            r.style.transform = '';
        });
    });

    return frag;
}

// ---------------------------------------------
// Row Data Operations
// ---------------------------------------------

function addAccountRow(companyId) {
    companyStates[companyId].rows.push({ account_id: '', percentage: 0, role: '', user_raw_id: null, read_only: 1 });
    renderCardBodyRows(companyId);
}

function removeRow(companyId, idx) {
    companyStates[companyId].rows.splice(idx, 1);
    renderCardBodyRows(companyId);
}

function updateRowData(companyId, idx, field, value) {
    companyStates[companyId].rows[idx][field] = value;
    if (field === 'percentage') updateCalculations(companyId);
    if (field === 'account_id') {
        // Sync role / user info from accounts list so toggle can detect Partnership
        const acc = companyStates[companyId].accounts.find(a => a.id === value);
        if (acc) {
            companyStates[companyId].rows[idx].role = (acc.role || '').toLowerCase();
            const isUser = String(value).startsWith('U_');
            companyStates[companyId].rows[idx].user_raw_id = isUser ? parseInt(value.replace('U_', '')) : null;
            companyStates[companyId].rows[idx].read_only = 1; // default read-only for new Partnership row
        } else {
            companyStates[companyId].rows[idx].role = '';
            companyStates[companyId].rows[idx].user_raw_id = null;
        }
        renderCardBodyRows(companyId);
    }
}


// ---------------------------------------------
// Slider & Input Sync
// ---------------------------------------------

function updateInputFromSlider(companyId, idx, value) {
    const pct = parseFloat(value) || 0;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function updateSliderFromInput(companyId, idx, value) {
    let pct = parseFloat(value.replace('%', ''));
    if (isNaN(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));

    document.getElementById(`slider-${companyId}-${idx}`).value = pct;
    document.getElementById(`input-${companyId}-${idx}`).value = `${pct}%`;
    applySliderBackground(document.getElementById(`slider-${companyId}-${idx}`));
    companyStates[companyId].rows[idx].percentage = pct;
    updateCalculations(companyId);
}

function tweakPercentage(companyId, idx, delta) {
    const newPct = Math.max(0, Math.min(100, companyStates[companyId].rows[idx].percentage + delta));
    document.getElementById(`slider-${companyId}-${idx}`).value = newPct;
    updateInputFromSlider(companyId, idx, newPct);
}

function applySliderBackground(slider) {
    if (!slider) return;
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--own-primary-blue) ${pct}%, var(--own-gray-border) ${pct}%)`;
}

// ---------------------------------------------
// Calculations & Display Updates
// ---------------------------------------------

function updateCalculations(companyId) {
    const total = companyStates[companyId].rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
    updateCardHeaderDisplay(companyId, total);

    const remaining = 100 - total;
    const footerRm = document.getElementById(`footer-remain-${companyId}`);
    const warningBadge = document.getElementById(`warning-${companyId}`);
    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);

    if (total > 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge own-warning-error';
        warningBadge.children[0].textContent = '❌';
        warningBadge.children[1].textContent = 'Total exceeds 100%!';
        if (footerRm) footerRm.textContent = `${Math.abs(remaining).toFixed(2)}% Over Allocated`;
        confirmBtn.disabled = true;
    } else if (total < 100) {
        warningBadge.style.display = 'flex';
        warningBadge.className = 'own-warning-badge';
        warningBadge.children[0].textContent = '⚠️';
        warningBadge.children[1].textContent = 'Total is less than 100%';
        if (footerRm) footerRm.textContent = `${remaining.toFixed(2)}% Unallocated`;
        confirmBtn.disabled = false;
    } else {
        warningBadge.style.display = 'none';
        if (footerRm) footerRm.textContent = 'Fully Allocated';
        confirmBtn.disabled = false;
    }
}

function updateCardHeaderDisplay(companyId, total) {
    const remainEl = document.getElementById(`header-remain-${companyId}`);
    const pctEl = document.getElementById(`header-percent-${companyId}`);
    const barEl = document.getElementById(`header-bar-${companyId}`);

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

// ---------------------------------------------
// Save / Confirm
// ---------------------------------------------

function confirmEdit(companyId) {
    const rows = companyStates[companyId].rows;
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
        company_id: companyId,
        owners: rows.map(r => ({
            account_id: r.account_id,
            percentage: parseFloat(r.percentage),
            read_only: r.read_only
        }))
    };

    const confirmBtn = document.getElementById(`confirm-btn-${companyId}`);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    fetch('api/ownership/batch_save_owners_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(res => {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
            if (isApiSuccess(res)) {
                showToast(getApiMessage(res, 'Saved successfully'), 'success');
                const compIdx = companiesData.findIndex(c => parseInt(c.id) === companyId);
                if (compIdx >= 0) companiesData[compIdx].allocated_percentage = total;
                cancelEdit(companyId, true);
            } else {
                showToast(getApiMessage(res, 'Save failed'), 'error');
            }
        })
        .catch(err => {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
            console.error(err);
            showToast('Server error', 'error');
        });
}

// ---------------------------------------------
// Toast
// ---------------------------------------------

let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('ownToast');
    toast.className = 'own-toast own-show ' + (type === 'success' ? 'own-success' : 'own-error');
    document.getElementById('ownToastMessage').textContent = message;

    const iconEl = document.getElementById('ownToastIcon');
    iconEl.textContent = '';
    const tplId = type === 'success' ? 'tpl-toast-success' : 'tpl-toast-error';
    iconEl.appendChild(document.getElementById(tplId).content.cloneNode(true));

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.className = 'own-toast'; }, 3000);
}

// ---------------------------------------------
// Bulk Action Bar (multi-select)
// ---------------------------------------------

/** Render / update the floating bulk-action bar based on current selection. */
function _updateBulkBar() {
    let bar = document.getElementById('own-bulk-bar');

    if (selectedCompanyIds.size === 0) {
        if (bar) bar.classList.remove('own-bulk-bar-visible');
        return;
    }

    const isGroupView = activeGroupFilter !== null;

    // Remove existing bar to rebuild with correct layout for context
    if (bar) bar.remove();

    bar = document.createElement('div');
    bar.id = 'own-bulk-bar';
    bar.className = 'own-bulk-bar' + (isGroupView ? ' own-bulk-bar-ungroup' : '');

    if (isGroupView) {
        // ── Group view: show Ungroup button ──────────────────
        bar.innerHTML = `
            <div class="own-bulk-bar-left">
                <span class="own-bulk-count" id="own-bulk-count"></span>
                <span class="own-bulk-label">selected</span>
            </div>
            <div class="own-bulk-bar-right">
                <button class="own-bulk-ungroup-btn" id="own-bulk-ungroup-btn">Ungroup</button>
                <button class="own-bulk-cancel-btn" id="own-bulk-cancel-btn">✕ Cancel</button>
            </div>
        `;
        document.body.appendChild(bar);
        document.getElementById('own-bulk-ungroup-btn').addEventListener('click', _bulkUngroupCompanies);
    } else {
        // ── Independent view: show group select + Join ───────
        bar.innerHTML = `
            <div class="own-bulk-bar-left">
                <span class="own-bulk-count" id="own-bulk-count"></span>
                <span class="own-bulk-label">selected</span>
            </div>
            <div class="own-bulk-bar-right">
                <div class="own-bulk-group-wrap">
                    <select class="own-bulk-group-select" id="own-bulk-group-select">
                        <option value="">-- Select Group --</option>
                    </select>
                </div>
                <button class="own-bulk-join-btn" id="own-bulk-join-btn">Join Group</button>
                <button class="own-bulk-cancel-btn" id="own-bulk-cancel-btn">✕ Cancel</button>
            </div>
        `;
        document.body.appendChild(bar);
        document.getElementById('own-bulk-join-btn').addEventListener('click', _bulkJoinGroup);

        // Rebuild group options
        const sel = document.getElementById('own-bulk-group-select');
        allGroupIds.forEach(gid => {
            const opt = document.createElement('option');
            opt.value = gid;
            opt.textContent = gid;
            sel.appendChild(opt);
        });
    }

    document.getElementById('own-bulk-cancel-btn').addEventListener('click', _clearSelection);
    document.getElementById('own-bulk-count').textContent = selectedCompanyIds.size;
    bar.classList.add('own-bulk-bar-visible');
}

/** Clear all selections, deselect card highlights, and exit selection mode. */
function _clearSelection() {
    selectedCompanyIds.clear();
    document.querySelectorAll('.own-card.own-selected').forEach(card => {
        card.classList.remove('own-selected');
    });
    _updateBulkBar();
    // Also exit selection mode when Cancel is pressed from the bulk bar
    if (selectionMode) _exitSelectionMode();
}

/** Enter selection mode: cursor changes on selectable cards, button becomes "Cancel". */
function _toggleSelectionMode() {
    if (selectionMode) {
        _exitSelectionMode();
    } else {
        selectionMode = true;
        document.querySelectorAll('.own-card[data-selectable="true"]').forEach(c => {
            c.classList.add('own-selection-mode');
        });
        const btn = document.getElementById('own-select-mode-btn');
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg> Cancel`;
        }
    }
}

/** Exit selection mode cleanly. */
function _exitSelectionMode() {
    selectionMode = false;
    selectedCompanyIds.clear();
    document.querySelectorAll('.own-card').forEach(c => {
        c.classList.remove('own-selection-mode', 'own-selected', 'own-ungroup-select');
    });
    _updateBulkBar();
    const btn = document.getElementById('own-select-mode-btn');
    if (btn) {
        btn.classList.remove('active');
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17.5 14v7"/></svg> Select`;
    }
}

/** Batch-assign all selected companies to the chosen group. */
function _bulkJoinGroup() {
    const groupId = document.getElementById('own-bulk-group-select').value;
    if (!groupId) {
        showToast('Please select a group first', 'error');
        return;
    }

    const ids = [...selectedCompanyIds];
    if (ids.length === 0) return;

    const btn = document.getElementById('own-bulk-join-btn');
    btn.disabled = true;
    btn.textContent = 'Joining...';

    const requests = ids.map(companyId =>
        fetch('api/ownership/update_company_group_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: companyId, group_id: groupId })
        }).then(r => r.json())
    );

    Promise.all(requests)
        .then(results => {
            const failed = results.filter(r => !isApiSuccess(r));
            if (failed.length === 0) {
                showToast(`${ids.length} compan${ids.length > 1 ? 'ies' : 'y'} joined group "${groupId}"`, 'success');
            } else {
                showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, 'error');
            }
            _clearSelection();
            fetchCompanies();
        })
        .catch(err => {
            console.error(err);
            showToast('Server error during batch join', 'error');
            btn.disabled = false;
            btn.textContent = 'Join Group';
        });
}

/** Batch-ungroup all selected companies from their current group. */
function _bulkUngroupCompanies() {
    const ids = [...selectedCompanyIds];
    if (ids.length === 0) return;

    const btn = document.getElementById('own-bulk-ungroup-btn');
    btn.disabled = true;
    btn.textContent = 'Ungrouping...';

    const requests = ids.map(companyId =>
        fetch('api/ownership/update_company_group_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: companyId, group_id: null })
        }).then(r => r.json())
    );

    Promise.all(requests)
        .then(results => {
            const failed = results.filter(r => !isApiSuccess(r));
            if (failed.length === 0) {
                showToast(`${ids.length} compan${ids.length > 1 ? 'ies' : 'y'} removed from group`, 'success');
            } else {
                showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, 'error');
            }
            _clearSelection();
            fetchCompanies();
        })
        .catch(err => {
            console.error(err);
            showToast('Server error during batch ungroup', 'error');
            btn.disabled = false;
            btn.textContent = 'Ungroup';
        });
}

// ---------------------------------------------
// Group Management (Join / Ungroup)
// ---------------------------------------------

/** Recalculates allGroupIds from the full (unfiltered) company list. */
function _rebuildGroupIds() {
    allGroupIds = [...new Set(
        allCompaniesData
            .map(c => c.group_id)
            .filter(g => g && g.trim() !== '')
    )].sort();
}

/**
 * Applies the activeGroupFilter to allCompaniesData, sets companiesData,
 * then triggers a card render.
 *  activeGroupFilter === null  → show independent companies (no group_id)
 *  activeGroupFilter === 'G1'  → show companies in group G1
 */
function _applyGroupFilter() {
    if (activeGroupFilter === null) {
        // Independent: companies with no group
        companiesData = allCompaniesData.filter(c => !c.group_id || c.group_id.trim() === '');

        // If no independent companies exist, automatically fall back to first group
        // so the page doesn't look "stuck" with an empty list.
        if (companiesData.length === 0 && allGroupIds.length > 0) {
            activeGroupFilter = allGroupIds[0];
            companiesData = allCompaniesData.filter(c =>
                c.group_id && c.group_id.toLowerCase() === activeGroupFilter.toLowerCase()
            );
        }
    } else {
        companiesData = allCompaniesData.filter(c =>
            c.group_id && c.group_id.toLowerCase() === activeGroupFilter.toLowerCase()
        );
    }

    // Keep filter button active state in sync for auto-fallback case
    document.querySelectorAll('.own-gfb-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === (activeGroupFilter ?? ''));
    });

    renderCompanyCards();
}

/**
 * Builds/refreshes the Group filter bar.
 * Shows pill buttons for each group ID only (Independent is the implicit default).
 */
function _renderGroupFilterBar() {
    const bar = document.getElementById('own-group-filter-bar');
    const btnContainer = document.getElementById('own-gfb-buttons');
    if (!bar || !btnContainer) return;

    // Only show the bar if there is at least one group
    if (allGroupIds.length === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';

    btnContainer.innerHTML = '';

    // One button per group ID — no "Independent" button
    allGroupIds.forEach(gid => {
        const btn = document.createElement('button');
        btn.className = 'own-gfb-btn' + (activeGroupFilter === gid ? ' active' : '');
        btn.dataset.group = gid;

        // Count companies in this group
        const count = allCompaniesData.filter(c =>
            c.group_id && c.group_id.toLowerCase() === gid.toLowerCase()
        ).length;

        btn.innerHTML = `${gid}<span class="own-gfb-count">${count}</span>`;
        btn.addEventListener('click', () => _selectGroupFilter(gid));
        btnContainer.appendChild(btn);
    });

    // Select button: visible for both independent and group views
    const selectBtn = document.getElementById('own-select-mode-btn');
    if (selectBtn) selectBtn.style.display = '';
}

/** Sets the active group filter. Clicking the already-active group toggles it off (→ independent view). */
function _selectGroupFilter(groupId) {
    // Toggle: clicking an active group returns to independent (null)
    activeGroupFilter = (activeGroupFilter === groupId) ? null : groupId;
    // Update button active states
    document.querySelectorAll('.own-gfb-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === (activeGroupFilter ?? ''));
    });
    // Select button is always visible when groups exist
    _clearSelection();   // also exits selection mode if active
    _applyGroupFilter();
}

function joinCompanyGroup(companyId, groupId, companyName) {
    fetch('api/ownership/update_company_group_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, group_id: groupId })
    })
        .then(res => res.json())
        .then(res => {
            if (isApiSuccess(res)) {
                showToast(`"${companyName}" joined group "${groupId}"`, 'success');
                // Re-fetch from server so the list immediately reflects the new group context
                fetchCompanies();
            } else {
                showToast(getApiMessage(res, 'Join group failed'), 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Server error', 'error');
        });
}

function ungroupCompany(companyId, companyName) {
    fetch('api/ownership/update_company_group_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, group_id: null })
    })
        .then(res => res.json())
        .then(res => {
            if (isApiSuccess(res)) {
                showToast(`"${companyName}" removed from group`, 'success');
                // Re-fetch from server so the list immediately reflects the new group context
                fetchCompanies();
            } else {
                showToast(getApiMessage(res, 'Ungroup failed'), 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Server error', 'error');
        });
}

function linkExternalPartner(companyId, event, forceType = '') {
    const loginIdInput = document.getElementById(`partner-login-${companyId}`);
    const loginId = loginIdInput.value.trim().toUpperCase();
    if (!loginId) { showToast('Please enter a Login ID/Group ID', 'error'); return; }

    const btn = event.target.closest('[data-action="link-partner"]');
    btn.disabled = true;
    btn.textContent = 'Linking...';

    fetch('api/ownership/add_external_partner_api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, login_id: loginId, force_type: forceType })
    })
        .then(res => res.json())
        .then(res => {
            btn.disabled = false;
            btn.textContent = 'Link Partner';
            if (isApiSuccess(res)) {
                showToast(getApiMessage(res, 'Partner linked successfully'), 'success');
                loginIdInput.value = '';
                cancelEdit(companyId, true);
                setTimeout(() => toggleCard(companyId, null), 300);
            } else if (isApiConflict(res)) {
                showConflictModal(companyId, event, getApiData(res, {}));
            } else {
                showToast(getApiMessage(res, 'Link partner failed'), 'error');
            }
        })
        .catch(err => {
            btn.disabled = false;
            btn.textContent = 'Link Partner';
            console.error(err);
            showToast('Server error', 'error');
        });
}

// ---------------------------------------------
// Conflict Modal
// ---------------------------------------------

function showConflictModal(companyId, event, data) {
    const tpl = document.getElementById('tpl-conflict-modal');
    if (!tpl) return;

    const clone = tpl.content.cloneNode(true);
    const overlay = clone.querySelector('.own-modal-overlay');

    // Populate data
    clone.querySelector('[data-bind="login-name"]').textContent = data.login_partner;
    clone.querySelector('[data-bind="group-name"]').textContent = data.group_partner;

    // Attach events
    clone.querySelector('[data-action="choose-login"]').addEventListener('click', () => {
        closeModal();
        linkExternalPartner(companyId, event, 'login');
    });

    clone.querySelector('[data-action="choose-group"]').addEventListener('click', () => {
        closeModal();
        linkExternalPartner(companyId, event, 'group');
    });

    clone.querySelector('[data-action="cancel-conflict"]').addEventListener('click', closeModal);

    function closeModal() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    document.body.appendChild(overlay);
}
