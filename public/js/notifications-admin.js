let allNotifications = [];
let filteredNotifications = [];
let currentPage = 1;
const itemsPerPage = 10;
let csrfToken = null;

async function fetchCSRFToken() {
    try {
        const res = await fetch('/api/admin/csrf-token', { method: 'GET', credentials: 'include' });
        const data = await res.json();
        if (data && data.success) csrfToken = data.token;
    } catch (e) { console.error('Error fetching CSRF token:', e); }
}

async function loadNotifications() {
    try {
        const response = await fetch('/api/admin/notifications?limit=100', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load notifications');
        const data = await response.json();
        allNotifications = data.notifications || [];
        filteredNotifications = [...allNotifications];
        displayNotifications();
        updatePagination();
        renderNavbarDropdown(allNotifications);
    } catch (error) {
        console.error('Error loading notifications:', error);
        document.getElementById('notificationsTableBody').innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    <div class="text-muted">
                        <i class="fas fa-exclamation-triangle mb-2 table-empty-icon"></i>
                        <p class="mb-0">Error loading notifications</p>
                        <small>Please try refreshing the page</small>
                    </div>
                </td>
            </tr>
        `;
    }
}

function displayNotifications() {
    const tbody = document.getElementById('notificationsTableBody');
    if (filteredNotifications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    <div class="text-muted">
                        <i class="fas fa-bell-slash mb-2 table-empty-icon"></i>
                        <p class="mb-0">No notifications found</p>
                        <small>You're all caught up!</small>
                    </div>
                </td>
            </tr>
        `; return;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageNotifications = filteredNotifications.slice(startIndex, endIndex);
    tbody.innerHTML = pageNotifications.map(notif => {
        const isUnread = !notif.is_read;
        const createdDate = new Date(notif.created_at);
        const dateStr = createdDate.toLocaleDateString();
        const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const iconClass = notifGetNotificationIcon(notif.type);
        const typeLabel = getTypeLabel(notif.type);
        return `
            <tr class="${isUnread ? 'table-primary' : ''}" data-notification-id="${notif.notification_id}">
                <td><input type="checkbox" class="form-check-input notification-checkbox" value="${notif.notification_id}"></td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="notification-icon-wrapper ${notif.type} me-2"><i class="${iconClass}"></i></div>
                        <span class="badge bg-secondary">${typeLabel}</span>
                    </div>
                </td>
                <td><div class="notification-message">${notif.message}</div></td>
                <td><small class="text-muted">${dateStr}</small></td>
                <td><small class="text-muted">${timeStr}</small></td>
            </tr>
        `;
    }).join('');
    document.querySelectorAll('.notification-checkbox').forEach(cb => {
        cb.addEventListener('change', () => { updateSelectAllCheckbox(); updateMarkSelectedButtonState(); });
    });
}

function notifGetNotificationIcon(type) {
    switch (type) {
        case 'admin': return 'fas fa-user-shield';
        case 'system': return 'fas fa-info-circle';
        default: return 'fas fa-bell';
    }
}

function getTypeLabel(type) {
    switch (type) {
        case 'admin': return 'Admin';
        case 'system': return 'System';
        default: return 'General';
    }
}

function filterNotifications() {
    const searchTerm = document.getElementById('notificationSearchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    filteredNotifications = allNotifications.filter(notif => {
        const matchesSearch = notif.message.toLowerCase().includes(searchTerm);
        const matchesType = !typeFilter || notif.type === typeFilter;
        const matchesStatus = !statusFilter || (statusFilter === 'unread' && !notif.is_read) || (statusFilter === 'read' && notif.is_read);
        return matchesSearch && matchesType && matchesStatus;
    });
    currentPage = 1; displayNotifications(); updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }
    let html = '';
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a></li>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a></li>`;
    pagination.innerHTML = html;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
    if (page >= 1 && page <= totalPages) { currentPage = page; displayNotifications(); updatePagination(); }
}

async function markAllNotificationsAsRead() {
    try {
        const btn = document.getElementById('markAllReadBtn'); const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...'; btn.disabled = true;
        const res = await fetch('/api/admin/notifications/mark-all-read', { method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, credentials: 'include' });
        if (!res.ok) throw new Error('Failed to mark all read');
        allNotifications.forEach(n => { n.is_read = true; });
        filterNotifications();
        btn.innerHTML = '<i class="fas fa-check"></i> Marked All Read'; setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 2000);
    } catch (e) {
        console.error('Error marking all read:', e);
        const btn = document.getElementById('markAllReadBtn'); btn.innerHTML = '<i class="fas fa-check"></i> Mark All Read'; btn.disabled = false;
    }
}

function updateSelectAllCheckbox() {
    const cbs = document.querySelectorAll('.notification-checkbox');
    const checked = document.querySelectorAll('.notification-checkbox:checked');
    const allCb = document.getElementById('selectAllCheckbox');
    allCb.checked = cbs.length > 0 && cbs.length === checked.length;
    allCb.indeterminate = checked.length > 0 && checked.length < cbs.length;
}

function updateMarkSelectedButtonState() {
    const checked = document.querySelectorAll('.notification-checkbox:checked');
    const btn = document.getElementById('markSelectedReadBtn'); if (!btn) return; btn.disabled = checked.length === 0;
}

document.getElementById('selectAllCheckbox').addEventListener('change', function() {
    document.querySelectorAll('.notification-checkbox').forEach(cb => { cb.checked = this.checked; });
    updateMarkSelectedButtonState();
});

document.getElementById('notificationSearchInput').addEventListener('input', filterNotifications);
document.getElementById('typeFilter').addEventListener('change', filterNotifications);
document.getElementById('statusFilter').addEventListener('change', filterNotifications);
document.getElementById('markAllReadBtn').addEventListener('click', markAllNotificationsAsRead);
document.getElementById('markSelectedReadBtn').addEventListener('click', async function() {
    const ids = Array.from(document.querySelectorAll('.notification-checkbox:checked')).map(cb => cb.value);
    if (ids.length === 0) return;
    try {
        for (const id of ids) {
            await fetch(`/api/admin/notifications/${id}/read`, { method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, credentials: 'include' });
            const n = allNotifications.find(n => String(n.notification_id) === String(id)); if (n) n.is_read = true;
        }
        filterNotifications();
    } catch (e) { console.error('Error marking selected:', e); }
});

document.addEventListener('DOMContentLoaded', async function() { await fetchCSRFToken(); await loadNotifications(); });

function renderNavbarDropdown(notifications) {
    try {
        const notificationIcon = document.getElementById('notificationDropdown');
        const notificationBadge = document.getElementById('notificationBadge');
        const notificationsList = document.getElementById('notificationsList');
        const markAllReadBtn = document.getElementById('markAllReadBtn');

        const unread = notifications.filter(n => !n.is_read).length;
        if (unread > 0) {
            if (notificationIcon) notificationIcon.classList.add('has-notifications');
            if (notificationBadge) { notificationBadge.textContent = unread > 99 ? '99+' : unread; notificationBadge.style.display = 'flex'; }
        } else {
            if (notificationIcon) notificationIcon.classList.remove('has-notifications');
            if (notificationBadge) notificationBadge.style.display = 'none';
        }

        if (notificationsList) {
            const recent = notifications.slice(0, 3);
            notificationsList.innerHTML = recent.map(notif => {
                const isUnread = !notif.is_read;
                const timeAgo = (new Date(notif.created_at)).toLocaleString();
                const iconClass = notifGetNotificationIcon(notif.type);
                return `
                    <li class="notification-item ${isUnread ? 'unread' : 'read'}" data-notification-id="${notif.notification_id}">
                        <div class="notification-content">
                            <div class="notification-icon-wrapper ${notif.type}"><i class="${iconClass}"></i></div>
                            <div class="notification-text">
                                <div class="notification-message">${notif.message}</div>
                                <div class="notification-time">${timeAgo}</div>
                            </div>
                        </div>
                    </li>`;
            }).join('');

            notificationsList.querySelectorAll('.notification-item.unread').forEach(el => {
                el.addEventListener('click', async () => {
                    const id = el.getAttribute('data-notification-id');
                    if (!id) return;
                    try {
                        await fetch(`/api/admin/notifications/${id}/read`, { method: 'PUT', headers: { 'X-CSRF-Token': csrfToken }, credentials: 'include' });
                        const n = allNotifications.find(n => String(n.notification_id) === String(id));
                        if (n) n.is_read = true;
                        renderNavbarDropdown(allNotifications);
                    } catch (e) { console.error('Admin: mark one failed', e); }
                });
            });
        }

        if (markAllReadBtn) {
            markAllReadBtn.style.display = unread > 0 ? 'block' : 'none';
            markAllReadBtn.onclick = async () => {
                await markAllNotificationsAsRead();
                renderNavbarDropdown(allNotifications);
            };
        }
    } catch (e) { console.error('Admin: render navbar dropdown failed', e); }
}


