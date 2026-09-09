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

  const dropzoneBox = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');
  const dropzoneText = document.getElementById('dropzoneText');
  const filePreviewBadge = document.getElementById('filePreviewBadge');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const submitProjectForm = document.getElementById('submitProjectForm');

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (fileNameDisplay) fileNameDisplay.textContent = file.name + ' (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB)';
        if (filePreviewBadge) filePreviewBadge.classList.remove('d-none');
        if (dropzoneText) dropzoneText.textContent = 'Selected: ' + file.name;
      }
    });
  }

  if (dropzoneBox) {
    ['dragenter', 'dragover'].forEach(function (eventName) {
      dropzoneBox.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzoneBox.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(function (eventName) {
      dropzoneBox.addEventListener(eventName, function (e) {
        e.preventDefault();
        dropzoneBox.classList.remove('dragover');
      }, false);
    });

    dropzoneBox.addEventListener('drop', function (e) {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0 && fileInput) {
        fileInput.files = files;
        const file = files[0];
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        if (filePreviewBadge) filePreviewBadge.classList.remove('d-none');
        if (dropzoneText) dropzoneText.textContent = 'Selected: ' + file.name;
      }
    });
  }

  if (submitProjectForm) {
    submitProjectForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const toastEl = document.getElementById('appToast');
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }

      setTimeout(function () {
        window.location.href = '../project-details/index.html?status=Done';
      }, 1500);
    });
  }
});