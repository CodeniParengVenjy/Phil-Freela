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

  const createServiceForm = document.getElementById('createServiceForm');
  const publishedServicesings = document.getElementById('publishedServicesings');

  if (createServiceForm && publishedServicesings) {
    createServiceForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const title = document.getElementById('serviceTitleInput')?.value || 'New Service';
      const categorySelect = document.getElementById('serviceCategorySelect');
      const categoryText = categorySelect && categorySelect.selectedIndex >= 0 ? categorySelect.options[categorySelect.selectedIndex].text : 'Service';

      const newCard = document.createElement('div');
      newCard.className = 'p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 animate-pop';
      newCard.innerHTML = `
        <h6 class="text-white fw-bold mb-1">${title}</h6>
        <span class="badge bg-orange text-white fs-8 mb-2">${categoryText}</span>
        <p class="text-secondary fs-8 mb-0">Starting at ₱2,500 • Published Just Now</p>
      `;

      publishedServicesings.prepend(newCard);
      createServiceForm.reset();

      const toastEl = document.getElementById('appToast');
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }
    });
  }
});