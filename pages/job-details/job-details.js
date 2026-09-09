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

  const sendResumeForm = document.getElementById('sendResumeForm');
  if (sendResumeForm) {
    sendResumeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      
      const modalEl = document.getElementById('resumeUploadModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      const toastEl = document.getElementById('appToast');
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }

      setTimeout(function () {
        window.location.href = '../project-details/index.html?status=Started';
      }, 1500);
    });
  }
});