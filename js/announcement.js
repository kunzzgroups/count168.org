/* announcement.js - 从 announcement.php 提取，供公告与维护内容管理使用 */

// 頁面切換：Announcement / Maintenance
(function initPageTabs() {
    document.addEventListener('DOMContentLoaded', function () {
        var tabs = document.querySelectorAll('.page-tab');
        var panels = document.querySelectorAll('.page-panel');
        if (!tabs.length || !panels.length) return;

        function showPage(pageId) {
            tabs.forEach(function (tab) {
                if (tab.getAttribute('data-page') === pageId) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
            panels.forEach(function (panel) {
                if (panel.id === 'panel-' + pageId) {
                    panel.classList.remove('hidden');
                } else {
                    panel.classList.add('hidden');
                }
            });
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var page = this.getAttribute('data-page');
                if (page) showPage(page);
            });
        });
    });
})();

// 加载公告列表
async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements/announcement_list_api.php');
        const result = await response.json();

        const listContainer = document.getElementById('announcementList');

        if (result.success && result.data.length > 0) {
            listContainer.innerHTML = result.data.map(announcement => {
                const titleEscaped = escapeHtml(announcement.title);
                const contentEscaped = escapeHtml(announcement.content);
                const contentAttr = contentEscaped.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
                const titleAttr = titleEscaped.replace(/"/g, '&quot;');
                return `
                <div class="announcement-item">
                    <div class="announcement-item-header">
                        <h3 class="announcement-title">${titleEscaped}</h3>
                        <div>
                            <button class="announcement-edit-btn" data-announcement-id="${announcement.id}" data-announcement-title="${titleAttr}" data-announcement-content="${contentAttr}">
                                Edit
                            </button>
                            <button class="announcement-delete-btn" data-announcement-id="${announcement.id}">
                                Delete
                            </button>
                        </div>
                    </div>
                    <div class="announcement-content">${contentEscaped}</div>
                    <div class="announcement-meta">
                        <span>Created by: ${escapeHtml(announcement.created_by)}</span>
                        <span>Created at: ${escapeHtml(announcement.created_at)}</span>
                    </div>
                </div>
            `;
            }).join('');
        } else {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No announcements</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load announcements:', error);
        showNotification('Failed to load announcements: ' + error.message, 'error');
    }
}

// 列表事件：Delete/Edit 用 data 属性 + 委托，避免标题含引号时 onclick 断裂
function bindAnnouncementListActions() {
    const listContainer = document.getElementById('announcementList');
    if (!listContainer) return;
    listContainer.addEventListener('click', function (e) {
        const delBtn = e.target.closest('.announcement-delete-btn');
        if (delBtn) {
            const id = parseInt(delBtn.getAttribute('data-announcement-id'), 10);
            if (id) deleteAnnouncement(id);
            return;
        }
        const editBtn = e.target.closest('.announcement-edit-btn');
        if (editBtn) {
            const id = parseInt(editBtn.getAttribute('data-announcement-id'), 10);
            let title = editBtn.getAttribute('data-announcement-title') || '';
            let content = editBtn.getAttribute('data-announcement-content') || '';
            title = title.replace(/&quot;/g, '"');
            content = content.replace(/&quot;/g, '"').replace(/&#10;/g, '\n');
            if (id) openEditAnnouncementModal(id, title, content);
        }
    });
}

// Delete announcement（可只传 id，避免标题含 ' 时 confirm 断裂）
async function deleteAnnouncement(id, title) {
    const msg = title != null && title !== ''
        ? `Are you sure you want to delete announcement "${title}"? This action cannot be undone.`
        : 'Are you sure you want to delete this announcement? This action cannot be undone.';
    if (!confirm(msg)) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('id', id);

        const response = await fetch('/api/announcements/announcement_delete_api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Announcement deleted successfully', 'success');
            loadAnnouncements();
        } else {
            showNotification('Delete failed: ' + (result.message || result.error), 'error');
        }
    } catch (error) {
        console.error('Failed to delete announcement:', error);
        showNotification('Failed to delete announcement: ' + error.message, 'error');
    }
}

// Submit form - 公告创建
function initAnnouncementForm() {
    document.getElementById('announcementForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const title = document.getElementById('title').value.trim();
        const content = document.getElementById('content').value.trim();

        if (!title || !content) {
            showNotification('Please fill in both title and content', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('content', content);

            const response = await fetch('/api/announcements/announcement_create_api.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Announcement published successfully', 'success');
                document.getElementById('announcementForm').reset();
                loadAnnouncements();
            } else {
                showNotification('Publish failed: ' + (result.message || result.error), 'error');
            }
        } catch (error) {
            console.error('Failed to publish announcement:', error);
            showNotification('Failed to publish announcement: ' + error.message, 'error');
        }
    });
}

// 显示通知
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== Announcement Edit Functions ==========

// Open edit announcement modal（供 HTML onclick 调用）
function openEditAnnouncementModal(id, title, content) {
    document.getElementById('editAnnouncementId').value = id;
    const titleDecoded = title.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const contentDecoded = content.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\\n/g, '\n');
    document.getElementById('editAnnouncementTitle').value = titleDecoded;
    document.getElementById('editAnnouncementContent').value = contentDecoded;
    document.getElementById('editAnnouncementModal').style.display = 'block';
}

// Close edit announcement modal（供 HTML onclick 调用）
function closeEditAnnouncementModal() {
    document.getElementById('editAnnouncementModal').style.display = 'none';
    document.getElementById('editAnnouncementForm').reset();
}

// Submit edit announcement form
function initEditAnnouncementForm() {
    document.getElementById('editAnnouncementForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const id = document.getElementById('editAnnouncementId').value;
        const title = document.getElementById('editAnnouncementTitle').value.trim();
        const content = document.getElementById('editAnnouncementContent').value.trim();

        if (!title || !content) {
            showNotification('Please fill in both title and content', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('id', id);
            formData.append('title', title);
            formData.append('content', content);

            const response = await fetch('/api/announcements/announcement_update_api.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Announcement updated successfully', 'success');
                closeEditAnnouncementModal();
                loadAnnouncements();
            } else {
                showNotification('Update failed: ' + (result.message || result.error), 'error');
            }
        } catch (error) {
            console.error('Failed to update announcement:', error);
            showNotification('Failed to update announcement: ' + error.message, 'error');
        }
    });
}

// Close modal when clicking outside
function initModalClickOutside() {
    window.onclick = function(event) {
        const editAnnouncementModal = document.getElementById('editAnnouncementModal');
        const editMaintenanceModal = document.getElementById('editMaintenanceModal');
        if (event.target === editAnnouncementModal) {
            closeEditAnnouncementModal();
        }
        if (event.target === editMaintenanceModal) {
            closeEditMaintenanceModal();
        }
    };
}

// ========== Maintenance Content Functions ==========

// 加载维护内容列表
async function loadMaintenanceContent() {
    try {
        const response = await fetch('/api/maintenance/list_api.php');
        const result = await response.json();

        const listContainer = document.getElementById('maintenanceList');
        const formWarning = document.getElementById('maintenanceFormWarning');
        const contentTextarea = document.getElementById('maintenanceContent');
        const submitBtn = document.getElementById('maintenanceSubmitBtn');

        if (result.success && result.data.length > 0) {
            listContainer.innerHTML = result.data.map(maintenance => {
                const contentEscaped = escapeHtml(maintenance.content);
                const contentForJs = contentEscaped.replace(/'/g, "&#39;").replace(/"/g, "&quot;").replace(/\n/g, "\\n");
                return `
                <div class="maintenance-item">
                    <div class="maintenance-item-header">
                        <div style="flex: 1;"></div>
                        <div>
                            <button class="maintenance-edit-btn" onclick="openEditMaintenanceModal(${maintenance.id}, '${contentForJs}')">
                                Edit
                            </button>
                            <button class="maintenance-delete-btn" onclick="deleteMaintenanceContent(${maintenance.id})">
                                Delete
                            </button>
                        </div>
                    </div>
                    <div class="maintenance-content">${contentEscaped}</div>
                    <div class="announcement-meta">
                        <span>Created by: ${escapeHtml(maintenance.created_by)}</span>
                        <span>Created at: ${escapeHtml(maintenance.created_at)}</span>
                    </div>
                </div>
            `;
            }).join('');

            formWarning.style.display = 'block';
            contentTextarea.disabled = true;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
            submitBtn.style.cursor = 'not-allowed';
        } else {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No maintenance content</p>
                </div>
            `;

            formWarning.style.display = 'none';
            contentTextarea.disabled = false;
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
    } catch (error) {
        console.error('Failed to load maintenance content:', error);
        showNotification('Failed to load maintenance content: ' + error.message, 'error');
    }
}

// Delete maintenance content
async function deleteMaintenanceContent(id) {
    if (!confirm(`Are you sure you want to delete this maintenance content? This action cannot be undone.`)) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('id', id);

        const response = await fetch('/api/maintenance/delete_api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Maintenance content deleted successfully', 'success');
            loadMaintenanceContent();
        } else {
            showNotification('Delete failed: ' + (result.message || result.error), 'error');
        }
    } catch (error) {
        console.error('Failed to delete maintenance content:', error);
        showNotification('Failed to delete maintenance content: ' + error.message, 'error');
    }
}

// Submit maintenance form
function initMaintenanceForm() {
    document.getElementById('maintenanceForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const content = document.getElementById('maintenanceContent').value.trim();

        if (!content) {
            showNotification('Please fill in the content', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('content', content);

            const response = await fetch('/api/maintenance/create_api.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Maintenance content published successfully', 'success');
                document.getElementById('maintenanceForm').reset();
                loadMaintenanceContent();
            } else {
                showNotification('Publish failed: ' + (result.message || result.error), 'error');
            }
        } catch (error) {
            console.error('Failed to publish maintenance content:', error);
            showNotification('Failed to publish maintenance content: ' + error.message, 'error');
        }
    });
}

// ========== Maintenance Edit Functions ==========

// Open edit maintenance modal（供 HTML onclick 调用）
function openEditMaintenanceModal(id, content) {
    document.getElementById('editMaintenanceId').value = id;
    const contentDecoded = content.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\\n/g, '\n');
    document.getElementById('editMaintenanceContent').value = contentDecoded;
    document.getElementById('editMaintenanceModal').style.display = 'block';
}

// Close edit maintenance modal（供 HTML onclick 调用）
function closeEditMaintenanceModal() {
    document.getElementById('editMaintenanceModal').style.display = 'none';
    document.getElementById('editMaintenanceForm').reset();
}

// Submit edit maintenance form
function initEditMaintenanceForm() {
    document.getElementById('editMaintenanceForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const id = document.getElementById('editMaintenanceId').value;
        const content = document.getElementById('editMaintenanceContent').value.trim();

        if (!content) {
            showNotification('Please fill in the content', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('id', id);
            formData.append('content', content);

            const response = await fetch('/api/maintenance/update_api.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Maintenance content updated successfully', 'success');
                closeEditMaintenanceModal();
                loadMaintenanceContent();
            } else {
                showNotification('Update failed: ' + (result.message || result.error), 'error');
            }
        } catch (error) {
            console.error('Failed to update maintenance content:', error);
            showNotification('Failed to update maintenance content: ' + error.message, 'error');
        }
    });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    bindAnnouncementListActions();
    initAnnouncementForm();
    initEditAnnouncementForm();
    initModalClickOutside();
    initMaintenanceForm();
    initEditMaintenanceForm();
    loadAnnouncements();
    loadMaintenanceContent();
});