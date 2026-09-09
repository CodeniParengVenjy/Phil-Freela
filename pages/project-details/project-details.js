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

  const btnStatusStarted = document.getElementById('btnStatusStarted');
  const btnStatusDone = document.getElementById('btnStatusDone');
  const statusBadgeDisplay = document.getElementById('statusBadgeDisplay');
  const deliverableVideoSection = document.getElementById('deliverableVideoSection');

  function setProjectStatus(status) {
    if (status === 'Done') {
      if (btnStatusDone) btnStatusDone.classList.add('active-tab');
      if (btnStatusStarted) btnStatusStarted.classList.remove('active-tab');
      if (statusBadgeDisplay) {
        statusBadgeDisplay.textContent = 'Done';
        statusBadgeDisplay.className = 'badge bg-success text-white px-3 py-2 rounded-pill fw-bold fs-7';
      }
      if (deliverableVideoSection) deliverableVideoSection.style.display = 'block';
    } else {
      if (btnStatusStarted) btnStatusStarted.classList.add('active-tab');
      if (btnStatusDone) btnStatusDone.classList.remove('active-tab');
      if (statusBadgeDisplay) {
        statusBadgeDisplay.textContent = 'Started';
        statusBadgeDisplay.className = 'badge bg-warning text-dark px-3 py-2 rounded-pill fw-bold fs-7';
      }
      if (deliverableVideoSection) deliverableVideoSection.style.display = 'block';
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const statusParam = urlParams.get('status');
  setProjectStatus(statusParam || 'Done');

  if (btnStatusStarted) {
    btnStatusStarted.addEventListener('click', function () {
      setProjectStatus('Started');
    });
  }

  if (btnStatusDone) {
    btnStatusDone.addEventListener('click', function () {
      setProjectStatus('Done');
    });
  }

  // Simulated Video Play Action
  const playVideoBtn = document.getElementById('playVideoBtn');
  const videoProgressBar = document.getElementById('videoProgressBar');
  let isPlaying = false;
  let interval = null;

  if (playVideoBtn) {
    playVideoBtn.addEventListener('click', function () {
      isPlaying = !isPlaying;
      if (isPlaying) {
        playVideoBtn.innerHTML = '<i class="bi bi-pause-fill fs-1"></i>';
        let progress = 35;
        interval = setInterval(function () {
          progress = (progress + 2) % 100;
          if (videoProgressBar) videoProgressBar.style.width = progress + '%';
        }, 300);
      } else {
        playVideoBtn.innerHTML = '<i class="bi bi-play-fill fs-1"></i>';
        if (interval) clearInterval(interval);
      }
    });
  }
});