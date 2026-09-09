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

  const jobSearchInput = document.getElementById('jobSearchInput');
  if (jobSearchInput) {
    jobSearchInput.addEventListener('input', function () {
      const query = jobSearchInput.value.toLowerCase();
      document.querySelectorAll('#jobListContainer .job-item-card').forEach(function (card) {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
      });
    });
  }
});