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

  const resumeModalEl = document.getElementById('resumeModal');
  let bsModal = null;
  if (resumeModalEl) {
    bsModal = new bootstrap.Modal(resumeModalEl);
  }

  document.addEventListener('click', function (e) {
    const viewResumeBtn = e.target.closest('.view-resume-btn');
    if (viewResumeBtn && bsModal) {
      const name = viewResumeBtn.getAttribute('data-name') || 'Applicant';
      const modalTitle = document.getElementById('resumeModalTitle');
      if (modalTitle) modalTitle.textContent = name + ' - Resume Preview';
      bsModal.show();
    }

    const toggleBtn = e.target.closest('.toggle-project-state-btn');
    if (toggleBtn) {
      const projItem = toggleBtn.closest('.p-3');
      const stateBadge = projItem ? projItem.querySelector('strong') : null;
      const stateDot = projItem ? projItem.querySelector('.bi-circle-fill') : null;

      if (stateBadge && stateDot) {
        if (stateBadge.textContent === 'Ongoing') {
          stateBadge.textContent = 'Done';
          stateBadge.className = 'text-success';
          stateDot.className = 'bi bi-circle-fill text-success fs-8';
        } else {
          stateBadge.textContent = 'Ongoing';
          stateBadge.className = 'text-warning';
          stateDot.className = 'bi bi-circle-fill text-warning fs-8';
        }
      }
    }
  });
});