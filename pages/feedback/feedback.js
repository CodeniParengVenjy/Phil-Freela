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

  function setupStarRating(boxId, labelId) {
    const box = document.getElementById(boxId);
    const label = document.getElementById(labelId);
    if (!box) return;

    const stars = box.querySelectorAll('.star-icon');
    let currentRating = 0;

    stars.forEach(function (star) {
      star.addEventListener('click', function () {
        currentRating = parseInt(star.getAttribute('data-value'));
        updateStars();
      });

      star.addEventListener('mouseover', function () {
        const val = parseInt(star.getAttribute('data-value'));
        stars.forEach(function (s, idx) {
          if (idx < val) {
            s.classList.remove('bi-star');
            s.classList.add('bi-star-fill');
          } else {
            s.classList.remove('bi-star-fill');
            s.classList.add('bi-star');
          }
        });
      });

      star.addEventListener('mouseleave', function () {
        updateStars();
      });
    });

    function updateStars() {
      stars.forEach(function (s, idx) {
        if (idx < currentRating) {
          s.classList.remove('bi-star');
          s.classList.add('bi-star-fill');
        } else {
          s.classList.remove('bi-star-fill');
          s.classList.add('bi-star');
        }
      });
      if (label) {
        label.textContent = currentRating ? currentRating + ' / 5 Stars Selected' : 'Select 1 to 5 stars';
      }
    }
  }

  setupStarRating('performanceStarBox', 'perfScoreText');
  setupStarRating('trustStarBox', 'trustScoreText');

  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const toastEl = document.getElementById('appToast');
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
      }

      setTimeout(function () {
        window.location.href = '../projects/index.html';
      }, 1500);
    });
  }
});