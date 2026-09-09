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

  const addSkillBtn = document.getElementById('addSkillBtn');
  const skillsTagContainer = document.getElementById('skillsTagContainer');

  if (addSkillBtn && skillsTagContainer) {
    addSkillBtn.addEventListener('click', function () {
      const newSkill = prompt('Enter a new skill:');
      if (newSkill && newSkill.trim()) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-warning text-dark px-3 py-2 rounded-pill fs-7 animate-pop';
        badge.textContent = newSkill.trim();
        skillsTagContainer.appendChild(badge);
      }
    });
  }
});