document.addEventListener('DOMContentLoaded', function () {
  const adminName = document.getElementById('adminName');
  const signOutBtn = document.getElementById('signOutBtn');
  const usersTableBody = document.getElementById('usersTableBody');
  const navButtons = document.querySelectorAll('.admin-nav-btn');

  const appRoot = (window.location.protocol === 'file:' ? 'http://localhost' : window.location.origin) + '/Capstone%20System%202026';
  const sessionEndpoint = appRoot + '/pages/admin/api/session.php';
  const logoutEndpoint = appRoot + '/pages/admin/api/logout.php';
  const usersEndpoint = appRoot + '/pages/admin/api/users.php';
  const loginPageUrl = appRoot + '/pages/admin/login/index.html';

  // View switcher
  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      navButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.admin-view').forEach(function (view) {
        view.classList.toggle('active-view', view.id === 'view-' + btn.dataset.target);
      });
    });
  });

  const escapeHtml = function (value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };

  const loadUsers = async function () {
    try {
      const response = await fetch(usersEndpoint, { credentials: 'include' });
      const data = await response.json();

      if (!response.ok || !data.success) {
        usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-white-50 py-4">Failed to load users.</td></tr>';
        return;
      }

      if (!data.users.length) {
        usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-white-50 py-4">No users found.</td></tr>';
        return;
      }

      usersTableBody.innerHTML = data.users.map(function (user) {
        return '<tr data-id="' + user.id + '">' +
          '<td>' + escapeHtml(user.full_name) + '</td>' +
          '<td>' + escapeHtml(user.username) + '</td>' +
          '<td>' + escapeHtml(user.email) + '</td>' +
          '<td>' + escapeHtml(user.created_at) + '</td>' +
          '<td class="text-end"><button class="btn btn-outline-danger btn-sm delete-user-btn"><i class="bi bi-trash"></i> Remove</button></td>' +
          '</tr>';
      }).join('');
    } catch (err) {
      usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-white-50 py-4">Network error while loading users.</td></tr>';
    }
  };

  usersTableBody.addEventListener('click', async function (e) {
    const btn = e.target.closest('.delete-user-btn');
    if (!btn) return;

    const row = btn.closest('tr');
    const userId = row.dataset.id;
    if (!confirm('Remove this user account? This cannot be undone.')) return;

    try {
      const response = await fetch(usersEndpoint, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        row.remove();
      } else {
        alert(data.message || 'Failed to remove user.');
      }
    } catch (err) {
      alert('Network error while removing user.');
    }
  });

  signOutBtn.addEventListener('click', async function () {
    try {
      await fetch(logoutEndpoint, { method: 'POST', credentials: 'include' });
    } catch (err) {}
    window.location.href = loginPageUrl;
  });

  const fetchSession = async function () {
    try {
      const response = await fetch(sessionEndpoint, { credentials: 'include' });
      const data = await response.json();

      if (!response.ok || !data || !data.authenticated) {
        window.location.href = loginPageUrl;
        return;
      }

      adminName.textContent = data.fullName || data.username || 'Admin';
      loadUsers();
    } catch (err) {
      window.location.href = loginPageUrl;
    }
  };

  fetchSession();
});
