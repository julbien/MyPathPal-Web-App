// Helper functions for notifications
function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function getNotificationIcon(type) {
    switch (type) {
        case 'system':
            return 'fas fa-info-circle';
        case 'device_status':
            return 'fas fa-mobile-alt';
        case 'emergency':
            return 'fas fa-exclamation-triangle';
        default:
            return 'fas fa-bell';
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        const response = await fetch(`/api/user/notifications/${notificationId}/read`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            // Update UI immediately
            const notificationItem = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.classList.remove('unread');
                notificationItem.classList.add('read');
                const actionsDiv = notificationItem.querySelector('.notification-actions');
                if (actionsDiv) {
                    actionsDiv.remove();
                }
            }
            
            // Update badge count
            const notificationBadge = document.getElementById('notificationBadge');
            const currentCount = parseInt(notificationBadge.textContent) || 0;
            const newCount = currentCount - 1;
            
            if (newCount <= 0) {
                notificationBadge.style.display = 'none';
                const markAllReadBtn = document.getElementById('markAllReadBtn');
                if (markAllReadBtn) markAllReadBtn.style.display = 'none';
            } else {
                notificationBadge.textContent = newCount > 99 ? '99+' : newCount;
            }
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllNotificationsAsRead() {
    try {
        const response = await fetch('/api/user/notifications/mark-all-read', {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (response.ok) {
            // Update UI immediately
            const notificationItems = document.querySelectorAll('.notification-item.unread');
            notificationItems.forEach(item => {
                item.classList.remove('unread');
                item.classList.add('read');
            });
            
            // Hide badge and mark all read button
            const notificationBadge = document.getElementById('notificationBadge');
            const markAllReadBtn = document.getElementById('markAllReadBtn');
            notificationBadge.style.display = 'none';
            if (markAllReadBtn) markAllReadBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

// Removed modal-based view all functionality - now using dedicated HTML page

async function loadNotifications() {
    try {
        let notificationsUrl = '/api/user/notifications';
        if (window.location.pathname.startsWith('/admin')) {
            notificationsUrl = '/api/admin/notifications';
        }
        const notificationResponse = await fetch(notificationsUrl, { credentials: 'include' });
        if (notificationResponse.ok) {
            const notificationData = await notificationResponse.json();
            const notificationIcon = document.getElementById('notificationDropdown');
            const notificationBadge = document.getElementById('notificationBadge');
            const notificationsList = document.getElementById('notificationsList');
            const markAllReadBtn = document.getElementById('markAllReadBtn');
            
            if (notificationData.notifications && notificationData.notifications.length > 0) {
                notificationIcon.classList.add('has-notifications');
                
                // Count unread notifications
                const unreadCount = notificationData.notifications.filter(notif => !notif.is_read).length;
                
                // Update badge
                if (unreadCount > 0) {
                    notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    notificationBadge.style.display = 'flex';
                } else {
                    notificationBadge.style.display = 'none';
                }
                
                // Show/hide mark all read button (if present)
                if (markAllReadBtn) {
                    if (unreadCount > 0) {
                        markAllReadBtn.style.display = 'block';
                    } else {
                        markAllReadBtn.style.display = 'none';
                    }
                }
                
                // Show only 3 recent notifications
                const recentNotifications = notificationData.notifications.slice(0, 3);
                
                // Render notifications
                notificationsList.innerHTML = recentNotifications.map(notif => {
                    const isUnread = !notif.is_read;
                    const timeAgo = getTimeAgo(new Date(notif.created_at));
                    const iconClass = getNotificationIcon(notif.type);
                    
                    return `
                        <li class="notification-item ${isUnread ? 'unread' : 'read'}" data-notification-id="${notif.notification_id}">
                            <div class="notification-content">
                                <div class="notification-icon-wrapper ${notif.type}">
                                    <i class="${iconClass}"></i>
                                </div>
                                <div class="notification-text">
                                    <div class="notification-message">${notif.message}</div>
                                    <div class="notification-time">${timeAgo}</div>
                                </div>
                            </div>
                        </li>
                    `;
                }).join('');
                
                // Add event listener for mark all read button (if present)
                if (markAllReadBtn) {
                    markAllReadBtn.addEventListener('click', async () => {
                        await markAllNotificationsAsRead();
                    });
                }
                
            } else {
                notificationIcon.classList.remove('has-notifications');
                notificationBadge.style.display = 'none';
                if (markAllReadBtn) markAllReadBtn.style.display = 'none';
                notificationsList.innerHTML = `
                    <li class="text-center py-4">
                        <div class="text-muted">
                            <i class="fas fa-bell-slash mb-2 icon-2rem"></i>
                            <p class="mb-0">No notifications</p>
                            <small>You're all caught up!</small>
                        </div>
                    </li>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // CSRF token management for user actions in navbar
    let csrfToken = null;

    async function fetchCSRFToken() {
        try {
            const response = await fetch('/api/user/csrf-token', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) {
                csrfToken = data.token;
            } else {
                console.error('Failed to fetch CSRF token:', data.message);
            }
        } catch (error) {
            console.error('Error fetching CSRF token:', error);
        }
    }

    await fetchCSRFToken();
    async function updateUserInfo() {
        try {
            const response = await fetch('/api/user/profile', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    const userInfoElement = document.getElementById('userInfo');
                    if (userInfoElement) {
                        userInfoElement.textContent = data.user.username;
                    }

                    const profileUsernameInput = document.getElementById('profileUsernameInput');
                    const profileEmailInput = document.getElementById('profileEmailInput');
                    const profilePhone = document.getElementById('profilePhone');
                    const profilePassword = document.getElementById('profilePassword');

                    if (profileUsernameInput) profileUsernameInput.value = data.user.username || '';
                    if (profileEmailInput) profileEmailInput.value = data.user.email || '';
                    if (profilePhone) profilePhone.value = data.user.phone || '';
                    if (profilePassword) profilePassword.value = '********';
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    }

    await updateUserInfo();

    const editButtons = document.querySelectorAll('.edit-field');
    editButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const field = this.dataset.field;
            const input = this.previousElementSibling;
            const currentValue = input.value;
            
            input.readOnly = false;
            input.focus();
            
            this.innerHTML = '<i class="fas fa-save"></i>';
            this.classList.remove('edit-field');
            this.classList.add('save-field');

            if (field === 'password') {
                const toggleBtn = input.previousElementSibling;
                if (toggleBtn) {
                    toggleBtn.style.pointerEvents = 'auto';
                    toggleBtn.style.opacity = '1';
                }
            }
            
            const saveHandler = async () => {
                try {
                    const newValue = input.value;
                    if (newValue === currentValue) {
                        input.readOnly = true;
                        this.innerHTML = '<i class="fas fa-edit"></i>';
                        this.classList.remove('save-field');
                        this.classList.add('edit-field');
                        return;
                    }

                    if (field === 'email' && !newValue.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                        throw new Error('Please enter a valid email address');
                    }
                    if (field === 'phone' && !newValue.match(/^\d{11}$/)) {
                        throw new Error('Please enter a valid 11-digit phone number');
                    }

                    const confirmResult = await Swal.fire({
                        title: 'Confirm Update',
                        text: 'Are you sure you want to update your profile?',
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Yes, update it',
                        cancelButtonText: 'Cancel',
                        customClass: {
                            popup: 'swal2-popup-small',
                            title: 'swal2-title-small',
                            content: 'swal2-content-small',
                            confirmButton: 'swal2-confirm-button-small',
                            cancelButton: 'swal2-cancel-button-small'
                        }
                    });

                    if (!confirmResult.isConfirmed) {
                        input.value = currentValue;
                        input.readOnly = true;
                        this.innerHTML = '<i class="fas fa-edit"></i>';
                        this.classList.remove('save-field');
                        this.classList.add('edit-field');
                        return;
                    }

                    const response = await fetch('/api/user/profile', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify({
                            [field]: newValue
                        }),
                        credentials: 'include'
                    });

                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(data.message || 'Failed to update profile');
                    }

                    input.readOnly = true;
                    this.innerHTML = '<i class="fas fa-edit"></i>';
                    this.classList.remove('save-field');
                    this.classList.add('edit-field');

                    await Swal.fire({
                        title: 'Success!',
                        text: 'Profile updated successfully',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false,
                        customClass: {
                            popup: 'swal2-popup-small',
                            title: 'swal2-title-small',
                            content: 'swal2-content-small'
                        }
                    });

                    await updateUserInfo();
                } catch (error) {
                    console.error('Error updating profile:', error);
                    input.value = currentValue;
                    input.readOnly = true;
                    this.innerHTML = '<i class="fas fa-edit"></i>';
                    this.classList.remove('save-field');
                    this.classList.add('edit-field');

                    await Swal.fire({
                        title: 'Error!',
                        text: error.message || 'Failed to update profile',
                        icon: 'error',
                        confirmButtonColor: '#3085d6',
                        customClass: {
                            popup: 'swal2-popup-small',
                            title: 'swal2-title-small',
                            content: 'swal2-content-small',
                            confirmButton: 'swal2-confirm-button-small'
                        }
                    });
                }
            };

            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    saveHandler();
                }
            });

            input.addEventListener('blur', saveHandler);
        });
    });

    // Load notifications
    await loadNotifications();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const result = await Swal.fire({
                title: 'Logout Confirmation',
                text: 'Are you sure you want to logout?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, logout',
                cancelButtonText: 'Cancel',
                customClass: {
                    popup: 'swal2-popup-small',
                    title: 'swal2-title-small',
                    content: 'swal2-content-small',
                    confirmButton: 'swal2-confirm-button-small',
                    cancelButton: 'swal2-cancel-button-small'
                }
            });

            if (result.isConfirmed) {
                try {
                    logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Logging out...';
                    logoutBtn.disabled = true;

                    const response = await fetch('/api/auth/logout', {
                        method: 'POST',
                        credentials: 'include'
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        await Swal.fire({
                            title: 'Logged Out!',
                            text: 'You have been successfully logged out.',
                            icon: 'success',
                            timer: 1500,
                            showConfirmButton: false,
                            customClass: {
                                popup: 'swal2-popup-small',
                                title: 'swal2-title-small',
                                content: 'swal2-content-small'
                            }
                        });
                        window.location.href = '/';
                    } else {
                        await Swal.fire({
                            title: 'Error!',
                            text: 'Logout failed. Please try again.',
                            icon: 'error',
                            confirmButtonColor: '#3085d6',
                            customClass: {
                                popup: 'swal2-popup-small',
                                title: 'swal2-title-small',
                                content: 'swal2-content-small',
                                confirmButton: 'swal2-confirm-button-small'
                            }
                        });
                        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt me-2"></i>Logout';
                        logoutBtn.disabled = false;
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    await Swal.fire({
                        title: 'Error!',
                        text: 'Something went wrong. Please try again.',
                        icon: 'error',
                        confirmButtonColor: '#3085d6',
                        customClass: {
                            popup: 'swal2-popup-small',
                            title: 'swal2-title-small',
                            content: 'swal2-content-small',
                            confirmButton: 'swal2-confirm-button-small'
                        }
                    });
                    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt me-2"></i>Logout';
                    logoutBtn.disabled = false;
                }
            }
        });
    }

    const savePasswordBtn = document.getElementById('savePasswordBtn');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordReq = document.getElementById('passwordReq');
    const passwordMatchMsg = document.getElementById('passwordMatchMsg');

    const passwordRequirements = {
        length: password => password.length >= 8,
        uppercase: password => /[A-Z]/.test(password),
        lowercase: password => /[a-z]/.test(password),
        number: password => /[0-9]/.test(password),
        special: password => /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    function updatePasswordRequirementColor() {
        const pw = newPasswordInput.value;
        const isValid = Object.keys(passwordRequirements).every(req => passwordRequirements[req](pw));
        if (isValid) {
            passwordReq.classList.add('valid');
            newPasswordInput.classList.remove('is-invalid');
            newPasswordInput.classList.add('is-valid');
        } else {
            passwordReq.classList.remove('valid');
            newPasswordInput.classList.remove('is-valid');
            newPasswordInput.classList.add('is-invalid');
        }
    }

    function updateConfirmPasswordValidation() {
        const pw = newPasswordInput.value;
        const confirmPw = confirmPasswordInput.value;
        const isMatch = pw === confirmPw && confirmPw.length > 0;

        confirmPasswordInput.classList.remove('is-valid', 'is-invalid');
        if (confirmPw.length > 0) {
            confirmPasswordInput.classList.add(isMatch ? 'is-valid' : 'is-invalid');
        }

        if (confirmPw.length === 0) {
            passwordMatchMsg.textContent = '';
            passwordMatchMsg.className = 'password-match-message';
        } else if (isMatch) {
            passwordMatchMsg.textContent = 'Passwords match.';
            passwordMatchMsg.className = 'password-match-message match';
        } else {
            passwordMatchMsg.textContent = 'Passwords do not match.';
            passwordMatchMsg.className = 'password-match-message nomatch';
        }
    }

    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            updatePasswordRequirementColor();
            if (confirmPasswordInput.value) {
                updateConfirmPasswordValidation();
            }
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', updateConfirmPasswordValidation);
    }

    if (savePasswordBtn && changePasswordForm) {
        savePasswordBtn.addEventListener('click', async function() {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            try {
                if (!currentPassword || !newPassword || !confirmPassword) {
                    if (!currentPassword) document.getElementById('currentPassword').classList.add('is-invalid');
                    if (!newPassword) newPasswordInput.classList.add('is-invalid');
                    if (!confirmPassword) confirmPasswordInput.classList.add('is-invalid');
                    return;
                }

                const isPasswordValid = Object.keys(passwordRequirements).every(req => passwordRequirements[req](newPassword));
                if (!isPasswordValid) {
                    newPasswordInput.classList.add('is-invalid');
                    newPasswordInput.focus();
                    return;
                }

                if (newPassword !== confirmPassword) {
                    confirmPasswordInput.classList.add('is-invalid');
                    confirmPasswordInput.focus();
                    return;
                }

                const verifyResponse = await fetch('/api/user/verify-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({
                        currentPassword
                    }),
                    credentials: 'include'
                });

                const verifyData = await verifyResponse.json();
                if (!verifyData.success) {
                    document.getElementById('currentPassword').classList.add('is-invalid');
                    return;
                }

                const confirmResult = await Swal.fire({
                    title: 'Confirm Password Change',
                    text: 'Are you sure you want to change your password?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, change it',
                    cancelButtonText: 'Cancel',
                    customClass: {
                        popup: 'swal2-popup-small',
                        title: 'swal2-title-small',
                        content: 'swal2-content-small',
                        confirmButton: 'swal2-confirm-button-small',
                        cancelButton: 'swal2-cancel-button-small'
                    }
                });

                if (!confirmResult.isConfirmed) {
                    return;
                }

                const response = await fetch('/api/user/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    }),
                    credentials: 'include'
                });

                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.message || 'Failed to change password');
                }

                await Swal.fire({
                    title: 'Success!',
                    text: 'Password changed successfully',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'swal2-popup-small',
                        title: 'swal2-title-small',
                        content: 'swal2-content-small'
                    }
                });

                const modal = bootstrap.Modal.getInstance(document.getElementById('passwordModal'));
                modal.hide();
                changePasswordForm.reset();
                document.getElementById('currentPassword').classList.remove('is-invalid');
                newPasswordInput.classList.remove('is-invalid');
                confirmPasswordInput.classList.remove('is-invalid');

            } catch (error) {
                console.error('Error changing password:', error);
                await Swal.fire({
                    title: 'Error!',
                    text: error.message || 'Failed to change password',
                    icon: 'error',
                    confirmButtonColor: '#3085d6',
                    customClass: {
                        popup: 'swal2-popup-small',
                        title: 'swal2-title-small',
                        content: 'swal2-content-small',
                        confirmButton: 'swal2-confirm-button-small'
                    }
                });
            }
        });
    }
}); 