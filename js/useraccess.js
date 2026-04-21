/**
 * useraccess.php - User Access page logic
 */
let templatePermissions = [];
        
        function showAlert(message, type = 'success') {
            const container = document.getElementById('notificationContainer');
            
            // Check existing notification count, keep a maximum of 2
            const existingNotifications = container.querySelectorAll('.notification');
            if (existingNotifications.length >= 2) {
                const oldestNotification = existingNotifications[0];
                oldestNotification.classList.remove('show');
                setTimeout(() => {
                    if (oldestNotification.parentNode) {
                        oldestNotification.remove();
                    }
                }, 300);
            }
            
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
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

        function loadTemplatePermissions() {
            const select = document.getElementById('templateUser');
            const selectedOption = select.options[select.selectedIndex];
            const permissionsDisplay = document.getElementById('permissionsDisplay');
            
            if (selectedOption.value) {
                const permissionsJson = selectedOption.getAttribute('data-permissions');
                const accountPermissionsJson = selectedOption.getAttribute('data-account-permissions');
                const processPermissionsJson = selectedOption.getAttribute('data-process-permissions');
                
                try {
                    // Safely parse permission data
                    templatePermissions = [];
                    if (permissionsJson && permissionsJson !== 'null' && permissionsJson !== '') {
                        templatePermissions = JSON.parse(permissionsJson) || [];
                    }
                    displayPermissions(templatePermissions);
                    
                    // Load account permissions
                    let accountPermissions = [];
                    if (accountPermissionsJson && accountPermissionsJson !== 'null' && accountPermissionsJson !== '') {
                        accountPermissions = JSON.parse(accountPermissionsJson) || [];
                    }
                    loadTemplateAccountPermissions(accountPermissions);
                    
                    // Load process permissions
                    let processPermissions = [];
                    if (processPermissionsJson && processPermissionsJson !== 'null' && processPermissionsJson !== '') {
                        processPermissions = JSON.parse(processPermissionsJson) || [];
                    }
                    loadTemplateProcessPermissions(processPermissions);
                    
                } catch (e) {
                    console.error('Error parsing permissions:', e);
                    console.error('Permissions JSON:', permissionsJson);
                    console.error('Account Permissions JSON:', accountPermissionsJson);
                    console.error('Process Permissions JSON:', processPermissionsJson);
                    
                    templatePermissions = [];
                    permissionsDisplay.innerHTML = '<span class="no-permissions">Error loading permissions: ' + e.message + '</span>';
                }
            } else {
                templatePermissions = [];
                permissionsDisplay.innerHTML = '<span class="no-permissions">Select a template user to view their permissions</span>';
                clearAllAccounts();
                clearAllProcesses();
            }
            
            updateButtonState();
        }

        function displayPermissions(permissions) {
            const permissionsDisplay = document.getElementById('permissionsDisplay');
            
            // Safety check: ensure element exists
            if (!permissionsDisplay) {
                console.error('permissionsDisplay element not found');
                return;
            }
            
            if (permissions && permissions.length > 0) {
                const permissionLabels = {
                    'home': 'Home',
                    'admin': 'Admin',
                    'account': 'Account',
                    'process': 'Process',
                    'datacapture': 'Data Capture',
                    'payment': 'Transaction Payment',
                    'report': 'Report',
                    'maintenance': 'Maintenance'
                };
                
                const badges = permissions.map(perm => 
                    `<span class="permission-badge">${permissionLabels[perm] || perm}</span>`
                ).join('');
                
                permissionsDisplay.innerHTML = badges;
            } else {
                permissionsDisplay.innerHTML = '<span class="no-permissions">No permissions assigned</span>';
            }
        }

        function hideTemplateUserFromList(templateUserId) {
            const userItems = document.querySelectorAll('.user-item');
            userItems.forEach(item => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (checkbox.value === templateUserId) {
                    item.style.display = 'none';
                    checkbox.checked = false;
                } else {
                    item.style.display = 'flex';
                }
            });
            updateSelectedCount();
        }

        function showAllUsersInList() {
            const userItems = document.querySelectorAll('.user-item');
            userItems.forEach(item => {
                item.style.display = 'flex';
            });
        }

        function updateSelectedCount() {
            const selectedCheckboxes = document.querySelectorAll('#affectedUsersList input[type="checkbox"]:checked');
            const count = selectedCheckboxes.length;
            const countDisplay = document.getElementById('selectedCount');
            
            // Safety check: ensure element exists
            if (!countDisplay) {
                console.error('selectedCount element not found');
                return;
            }
            
            if (count === 0) {
                countDisplay.textContent = 'No users selected';
            } else if (count === 1) {
                countDisplay.textContent = '1 user selected';
            } else {
                countDisplay.textContent = `${count} users selected`;
            }
            
            updateButtonState();
        }

        function updateButtonState() {
            const sourceTemplate = document.getElementById('sourceTemplate').checked;
            const updateBtn = document.getElementById('updateBtn');
            
            let hasValidSource = false;
            
            if (sourceTemplate) {
                const templateUser = document.getElementById('templateUser').value;
                hasValidSource = templateUser;
            } else {
                hasValidSource = true; // Always valid in manual mode
            }
            
            const hasSelectedUsers = selectedUsers && selectedUsers.length > 0;
            
            if (hasValidSource && hasSelectedUsers) {
                updateBtn.disabled = false;
            } else {
                updateBtn.disabled = true;
            }
        }

        // Show custom confirmation modal
        function showConfirmModal(message, onConfirm) {
            document.getElementById('confirmMessage').textContent = message;
            const modal = document.getElementById('confirmModal');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            
            // Bind confirm button click event
            document.getElementById('confirmUpdateBtn').onclick = function() {
                closeConfirmModal();
                onConfirm();
            };
        }

        // Close confirmation modal
        function closeConfirmModal() {
            document.getElementById('confirmModal').style.display = 'none';
            document.body.style.overflow = '';
        }

        function updatePermissions() {
            const sourceInfo = getCurrentSourceInfo();
            const currentPermissions = getCurrentPermissions();
            
            if (sourceInfo.type === 'template' && !sourceInfo.id) {
                showAlert('Please select a template user', 'danger');
                return;
            }
            
            if (selectedUsers.length === 0) {
                showAlert('Please select at least one user to update', 'danger');
                return;
            }
            
            const affectedUserIds = selectedUsers.map(user => user.id);
            const sourceDescription = sourceInfo.type === 'template' 
                ? `template user "${sourceInfo.name}"` 
                : `manual selection (${sourceInfo.count} permissions)`;
            
            const confirmMessage = `Are you sure you want to copy permissions from ${sourceDescription} to ${selectedUsers.length} selected user(s)?`;

            showConfirmModal(confirmMessage, function() {
                // Move all code after original confirm here
                // Send update request
                fetch('api/useraccess/useraccess_api.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'copy_permissions',
                        template_user_id: sourceInfo.type === 'template' ? sourceInfo.id : null,
                        affected_user_ids: affectedUserIds,
                        permissions: currentPermissions,
                        source_type: sourceInfo.type,
                        account_permissions: selectedAccounts,
                        process_permissions: selectedProcesses
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        showAlert(`Successfully updated permissions for ${affectedUserIds.length} user(s)!`);
                        resetForm();
                    } else {
                        showAlert(data.message || 'Failed to update permissions', 'danger');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    if (error.message.includes('HTTP error') || error.message.includes('JSON')) {
                        showAlert('An error occurred while updating permissions', 'danger');
                    }
                });
            });
        }

        window.onclick = function() {}

        function resetForm() {
            document.getElementById('templateUser').value = '';
            document.getElementById('permissionsDisplay').innerHTML = '<span class="no-permissions">Select a template user to view their permissions</span>';
            
            // Reset selected users
            selectedUsers = [];
            updateSelectedUsersDisplay();
            
            // Reset selection in modal
            document.querySelectorAll('#modalUserList input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            
            templatePermissions = [];
            updateButtonState();

            // Reset account selection
            selectedAccounts = [];
            document.querySelectorAll('#accountGrid input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            // Reset account selection
            clearAllAccounts(); // Use new clear function
            document.getElementById('accountSearchInput').value = '';
            filterAccounts();
            
            // Reset process selection
            selectedProcesses = [];
            document.querySelectorAll('#processGrid input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            clearAllProcesses();
        }

        let selectedUsers = [];

        function openUserSelectionModal() {
            // Hide template user's selected user
            const templateUserId = document.getElementById('templateUser').value;
            const modalItems = document.querySelectorAll('.modal-user-item');
            
            modalItems.forEach(item => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (templateUserId && checkbox.value === templateUserId) {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'flex';
                }
            });
            
            document.getElementById('userSelectionModal').style.display = 'flex';
        }

        function closeUserSelectionModal() {
            document.getElementById('userSelectionModal').style.display = 'none';
            document.getElementById('userSearchInput').value = '';
            filterUsers();
        }

        function filterUsers() {
            const searchTerm = document.getElementById('userSearchInput').value.toLowerCase();
            const userItems = document.querySelectorAll('.modal-user-item');
            
            userItems.forEach(item => {
                const searchText = item.getAttribute('data-search');
                
                if (searchText.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        function updateModalSelection() {
            // This function can be used to update selection status in real-time if needed
        }

        function confirmUserSelection() {
            const selectedCheckboxes = document.querySelectorAll('#modalUserList input[type="checkbox"]:checked');
            selectedUsers = []; // Reset array
            
            selectedCheckboxes.forEach(checkbox => {
                selectedUsers.push({
                    id: checkbox.value,
                    name: checkbox.getAttribute('data-name'),
                    login_id: checkbox.getAttribute('data-login')
                });
            });
            
            console.log('Selected users after confirmation:', selectedUsers); // For debugging
            
            updateSelectedUsersDisplay();
            closeUserSelectionModal();
            updateButtonState(); // Ensure this function is called
        }

        function updateSelectedUsersDisplay() {
            const countDisplay = document.getElementById('selectedCount');
            const selectedUsersText = document.getElementById('selectedUsersText');
            
            // Safety check: ensure element exists
            if (!countDisplay) {
                console.error('selectedCount element not found');
                return;
            }
            if (!selectedUsersText) {
                console.error('selectedUsersText element not found');
                return;
            }
            
            if (selectedUsers.length === 0) {
                countDisplay.textContent = 'No users selected';
                selectedUsersText.textContent = 'Click to select users';
            } else {
                countDisplay.textContent = `${selectedUsers.length} user(s) selected`;
                
                if (selectedUsers.length === 1) {
                    selectedUsersText.textContent = `${selectedUsers[0].name} (${selectedUsers[0].login_id})`;
                } else if (selectedUsers.length <= 3) {
                    selectedUsersText.textContent = selectedUsers.map(u => u.name).join(', ');
                } else {
                    selectedUsersText.textContent = `${selectedUsers.length} users selected`;
                }
            }
        }

        let manualPermissions = [];

        function togglePermissionSource() {
            const sourceTemplate = document.getElementById('sourceTemplate').checked;
            const templateUserGroup = document.getElementById('templateUserGroup');
            const manualPermissionGroup = document.getElementById('manualPermissionGroup');
            
            if (sourceTemplate) {
                templateUserGroup.style.display = 'block';
                manualPermissionGroup.style.display = 'none';
                manualPermissions = [];
                document.querySelectorAll('.checkbox-item input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
                loadTemplatePermissions();
            } else {
                templateUserGroup.style.display = 'none';
                manualPermissionGroup.style.display = 'block';
                document.getElementById('templateUser').value = '';
                templatePermissions = [];
                displayPermissions(manualPermissions);
            }
            
            updateButtonState();
        }

        function updateManualPermissions() {
            const checkedPermissions = document.querySelectorAll('.checkbox-item input[type="checkbox"]:checked');
            manualPermissions = Array.from(checkedPermissions).map(cb => cb.value);
            
            displayPermissions(manualPermissions);
            updateButtonState();
        }

        function getCurrentPermissions() {
            const sourceTemplate = document.getElementById('sourceTemplate').checked;
            return sourceTemplate ? templatePermissions : manualPermissions;
        }

        function getCurrentSourceInfo() {
            const sourceTemplate = document.getElementById('sourceTemplate').checked;
            
            if (sourceTemplate) {
                const templateUser = document.getElementById('templateUser');
                const selectedOption = templateUser.options[templateUser.selectedIndex];
                return {
                    type: 'template',
                    name: selectedOption ? selectedOption.text.split(' (')[0] : '',
                    id: templateUser.value
                };
            } else {
                return {
                    type: 'manual',
                    name: 'Manual Selection',
                    count: manualPermissions.length
                };
            }
        }

        let selectedAccounts = [];
        let selectedProcesses = [];

        function filterAccounts() {
            const searchTerm = document.getElementById('accountSearchInput').value.toLowerCase();
            const accountItems = document.querySelectorAll('.account-item-compact');
            
            accountItems.forEach(item => {
                const searchText = item.getAttribute('data-search');
                if (searchText.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        function updateAccountSelection() {
            const selectedCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"]:checked');
            selectedAccounts = [];
            
            selectedCheckboxes.forEach(checkbox => {
                selectedAccounts.push({
                    id: checkbox.value,
                    account_id: checkbox.getAttribute('data-account-id')
                });
            });
            
            updateSelectedAccountCount();
        }

        function updateSelectedAccountCount() {
            const countDisplay = document.getElementById('selectedAccountCount');
            
            // Safety check: if element does not exist, silently return (do not show error)
            if (!countDisplay) {
                return;
            }
            
            if (selectedAccounts.length === 0) {
                countDisplay.textContent = 'No accounts selected';
            } else if (selectedAccounts.length === 1) {
                countDisplay.textContent = `1 account selected: ${selectedAccounts[0].account_id}`;
            } else if (selectedAccounts.length <= 5) {
                const accountIds = selectedAccounts.map(acc => acc.account_id).join(', ');
                countDisplay.textContent = `${selectedAccounts.length} accounts selected: ${accountIds}`;
            } else {
                countDisplay.textContent = `${selectedAccounts.length} accounts selected`;
            }
        }

        function selectAllAccounts() {
            const visibleCheckboxes = document.querySelectorAll('#accountGrid .account-item-compact:not([style*="none"]) input[type="checkbox"]');
            
            visibleCheckboxes.forEach(checkbox => {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                }
            });
            
            updateAccountSelection();
        }

        function clearAllAccounts() {
            const allCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"]');
            
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            
            selectedAccounts = [];
            updateSelectedAccountCount();
        }

        // Process selection functions
        function updateProcessSelection() {
            const selectedCheckboxes = document.querySelectorAll('#processGrid input[type="checkbox"]:checked');
            selectedProcesses = [];
            
            selectedCheckboxes.forEach(checkbox => {
                selectedProcesses.push({
                    id: checkbox.value,
                    process_id: checkbox.getAttribute('data-process-name'),
                    process_description: checkbox.getAttribute('data-process-description')
                });
            });
            
            updateSelectedProcessCount();
        }

        function updateSelectedProcessCount() {
            const countDisplay = document.getElementById('selectedProcessCount');
            
            // Safety check: if element does not exist, silently return (do not show error)
            if (!countDisplay) {
                return;
            }
            
            if (selectedProcesses.length === 0) {
                countDisplay.textContent = 'No processes selected';
            } else if (selectedProcesses.length === 1) {
                countDisplay.textContent = `1 process selected: ${selectedProcesses[0].process_id}`;
            } else if (selectedProcesses.length <= 5) {
                const processNames = selectedProcesses.map(proc => proc.process_id).join(', ');
                countDisplay.textContent = `${selectedProcesses.length} processes selected: ${processNames}`;
            } else {
                countDisplay.textContent = `${selectedProcesses.length} processes selected`;
            }
        }

        function selectAllProcesses() {
            const visibleCheckboxes = document.querySelectorAll('#processGrid .account-item-compact:not([style*="none"]) input[type="checkbox"]');
            
            visibleCheckboxes.forEach(checkbox => {
                if (!checkbox.checked) {
                    checkbox.checked = true;
                }
            });
            
            updateProcessSelection();
        }

        function clearAllProcesses() {
            const allCheckboxes = document.querySelectorAll('#processGrid input[type="checkbox"]');
            
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            
            selectedProcesses = [];
            updateSelectedProcessCount();
        }

        // Template permission loading functions
        function loadTemplateAccountPermissions(accountPermissions) {
            // Clear all account selections first
            clearAllAccounts();
            
            if (accountPermissions && accountPermissions.length > 0) {
                accountPermissions.forEach(perm => {
                    const checkbox = document.querySelector(`#account_${perm.id}`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
                updateAccountSelection();
            }
        }

        function loadTemplateProcessPermissions(processPermissions) {
            // Clear all process selections first
            clearAllProcesses();
            
            if (processPermissions && processPermissions.length > 0) {
                processPermissions.forEach(perm => {
                    const checkbox = document.querySelector(`#process_${perm.id}`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
                updateProcessSelection();
            }
        }