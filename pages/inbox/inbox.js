document.addEventListener('DOMContentLoaded', function () {
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      if (window.innerWidth < 992) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
      }
    });
  }

  const inboxSearchInput = document.getElementById('inboxSearchInput');
  if (inboxSearchInput) {
    inboxSearchInput.addEventListener('input', function () {
      const query = inboxSearchInput.value.toLowerCase();
      document.querySelectorAll('#inboxListContainer .inbox-item-row').forEach(function (row) {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? 'flex' : 'none';
      });
    });
  }
});