/* ──────────────────────────────────────
   PhilFreela Dashboard – Interactive JS Engine
   ────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  
  // App Elements
  const sidebarToggle = document.getElementById('sidebarToggle');
  const welcomeTitle = document.getElementById('welcomeTitle');
  const userNavName = document.getElementById('userNavName');
  const userNavAvatar = document.getElementById('userNavAvatar');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const signOutLink = document.getElementById('signOutLink');
  
  const appRoot = (window.location.protocol === 'file:' ? 'http://localhost' : window.location.origin) + '/Capstone%20System%202026';
  const sessionEndpoint = appRoot + '/pages/login/api/session.php';
  const logoutEndpoint = appRoot + '/pages/login/api/logout.php';
  const loginPageUrl = appRoot + '/pages/login/index.html';

  // 1. Toast Notification Helper
  window.showToast = function (message) {
    const toastEl = document.getElementById('appToast');
    const toastMsg = document.getElementById('toastMessage');
    if (toastEl && toastMsg) {
      toastMsg.textContent = message;
      const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
      toast.show();
    }
  };

  // 2. View Switcher Engine
  window.switchView = function (targetViewId) {
    const allViews = document.querySelectorAll('.dashboard-view');
    const allPillBtns = document.querySelectorAll('.sidebar-pill-btn');

    let targetFound = false;

    allViews.forEach(function (view) {
      if (view.id === 'view-' + targetViewId) {
        view.classList.add('active-view');
        targetFound = true;
      } else {
        view.classList.remove('active-view');
      }
    });

    if (!targetFound && allViews.length) {
      document.getElementById('view-profile')?.classList.add('active-view');
    }

    allPillBtns.forEach(function (btn) {
      if (btn.getAttribute('data-target') === targetViewId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Close mobile sidebar on navigation
    document.body.classList.remove('sidebar-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Bind View Switcher Buttons
  document.addEventListener('click', function (e) {
    const switchBtn = e.target.closest('.switch-view-btn');
    if (switchBtn) {
      e.preventDefault();
      const target = switchBtn.getAttribute('data-target');
      if (target) {
        switchView(target);
      }
    }
  });

  // Handle URL Query Params for deep-linking (e.g. ?tab=services)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab');
  if (initialTab) {
    switchView(initialTab);
  }

  // 3. Sidebar Toggle (Mobile & Desktop Collapse)
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      if (window.innerWidth < 992) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
      }
    });
  }

  // 4. Session Validation
  const fetchSession = async function () {
    try {
      const response = await fetch(sessionEndpoint, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) return;
      const data = await response.json();

      if (!data || !data.authenticated) {
        window.location.href = loginPageUrl;
        return;
      }

      const name = data.full_name || data.username || 'User';
      if (welcomeTitle) welcomeTitle.textContent = 'Welcome, ' + name;
      if (userNavName) userNavName.textContent = name;
      if (profileDisplayName) profileDisplayName.textContent = name;
      if (userNavAvatar) userNavAvatar.textContent = name.charAt(0).toUpperCase();
    } catch (err) {
      // Network/session check failed; require login again to be safe
      window.location.href = loginPageUrl;
    }
  };
  fetchSession();

  // Sign out handler
  if (signOutLink) {
    signOutLink.addEventListener('click', async function (e) {
      e.preventDefault();
      try {
        await fetch(logoutEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {}
      window.location.href = loginPageUrl;
    });
  }

  // 5. Open Chat Trigger
  document.addEventListener('click', function (e) {
    const openChatBtn = e.target.closest('.open-chat-btn');
    if (openChatBtn) {
      e.preventDefault();
      const recipient = openChatBtn.getAttribute('data-recipient') || 'Juan Cruz';
      const activeNameEl = document.getElementById('chatActiveName');
      if (activeNameEl) activeNameEl.textContent = recipient;
      switchView('chat');
      showToast('Opened conversation with ' + recipient);
    }
  });

  // 6. Interactive Chat Messaging Stream
  const chatInputForm = document.getElementById('chatInputForm');
  const chatMessageInput = document.getElementById('chatMessageInput');
  const chatMessagesStream = document.getElementById('chatMessagesStream');

  if (chatInputForm && chatMessageInput && chatMessagesStream) {
    chatInputForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const msgText = chatMessageInput.value.trim();
      if (!msgText) return;

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Append Outgoing Bubble
      const outBubble = document.createElement('div');
      outBubble.className = 'chat-bubble outgoing align-self-end p-3 rounded-4 max-w-500 bg-orange text-white';
      outBubble.innerHTML = `
        <div class="d-flex align-items-center justify-content-end gap-2 mb-1">
          <small class="fs-8 text-white-50">${timeStr}</small>
        </div>
        <p class="mb-0 fs-7">${msgText}</p>
      `;
      chatMessagesStream.appendChild(outBubble);
      chatMessageInput.value = '';
      chatMessagesStream.scrollTop = chatMessagesStream.scrollHeight;

      // Simulated Recipient Automated Reply
      setTimeout(function () {
        const inBubble = document.createElement('div');
        inBubble.className = 'chat-bubble incoming align-self-start p-3 rounded-4 max-w-500 bg-secondary bg-opacity-25 text-white';
        const recipientName = document.getElementById('chatActiveName')?.textContent || 'Client';
        inBubble.innerHTML = `
          <div class="d-flex align-items-center gap-2 mb-1">
            <strong class="fs-8 text-orange">${recipientName}</strong>
            <small class="fs-8 text-secondary">Just now</small>
          </div>
          <p class="mb-0 fs-7">Got your message! Let's proceed with the project parameters.</p>
        `;
        chatMessagesStream.appendChild(inBubble);
        chatMessagesStream.scrollTop = chatMessagesStream.scrollHeight;
      }, 1200);
    });
  }

  // 7. Interactive Create Service Form
  const createServiceForm = document.getElementById('createServiceForm');
  const publishedServicesings = document.getElementById('publishedServicesings');

  if (createServiceForm && publishedServicesings) {
    createServiceForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const title = document.getElementById('serviceTitleInput')?.value || 'New Service';
      const categorySelect = document.getElementById('serviceCategorySelect');
      const categoryText = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : 'Service';

      const newCard = document.createElement('div');
      newCard.className = 'p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 animate-pop';
      newCard.innerHTML = `
        <h6 class="text-white fw-bold mb-1">${title}</h6>
        <span class="badge bg-orange text-white fs-8 mb-2">${categoryText}</span>
        <p class="text-secondary fs-8 mb-0">Starting at ₱2,500 • Published Just Now</p>
      `;

      publishedServicesings.prepend(newCard);
      createServiceForm.reset();
      showToast('Your new service "' + title + '" is live!');
    });
  }

  // 8. Interactive Skill Adder
  const addSkillBtn = document.getElementById('addSkillBtn');
  const skillsTagContainer = document.getElementById('skillsTagContainer');

  if (addSkillBtn && skillsTagContainer) {
    addSkillBtn.addEventListener('click', function () {
      const newSkill = prompt('Enter a new skill (e.g., Motion Graphics, Photoshop, React):');
      if (newSkill && newSkill.trim()) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-orange text-white px-3 py-2 rounded-pill fs-7 animate-pop';
        badge.textContent = newSkill.trim();
        skillsTagContainer.appendChild(badge);
        showToast('Skill "' + newSkill.trim() + '" added to profile!');
      }
    });
  }

  // 9. Interactive Project State Toggle (Mockup 9)
  document.addEventListener('click', function (e) {
    const toggleBtn = e.target.closest('.toggle-project-state-btn');
    if (toggleBtn) {
      const projItem = toggleBtn.closest('.job-item-card, .p-3');
      const stateBadge = projItem ? projItem.querySelector('strong') : null;
      const stateDot = projItem ? projItem.querySelector('.bi-circle-fill') : null;

      if (stateBadge && stateDot) {
        if (stateBadge.textContent === 'Ongoing') {
          stateBadge.textContent = 'Done';
          stateBadge.className = 'text-success';
          stateDot.className = 'bi bi-circle-fill text-success fs-8';
          showToast('Project status updated to Done 🟢');
        } else {
          stateBadge.textContent = 'Ongoing';
          stateBadge.className = 'text-warning';
          stateDot.className = 'bi bi-circle-fill text-warning fs-8';
          showToast('Project status updated to Ongoing 🟡');
        }
      }
    }
  });

  // 10. Portfolio & Resume Image Preview Modal
  const previewModalEl = document.getElementById('previewModal');
  let bsModal = null;
  if (previewModalEl) {
    bsModal = new bootstrap.Modal(previewModalEl);
  }

  document.addEventListener('click', function (e) {
    const viewPortBtn = e.target.closest('.view-portfolio-img');
    if (viewPortBtn && bsModal) {
      const imgSrc = viewPortBtn.getAttribute('data-img') || '../../images/Freelancers.png';
      const modalImg = document.getElementById('modalPreviewImg');
      const modalTitle = document.getElementById('previewModalTitle');
      if (modalImg) modalImg.src = imgSrc;
      if (modalTitle) modalTitle.textContent = 'Portfolio Piece Preview';
      bsModal.show();
    }

    const viewResumeBtn = e.target.closest('.view-resume-btn');
    if (viewResumeBtn && bsModal) {
      const name = viewResumeBtn.getAttribute('data-name') || 'Applicant';
      const modalImg = document.getElementById('modalPreviewImg');
      const modalTitle = document.getElementById('previewModalTitle');
      if (modalImg) modalImg.src = '../../images/Client.png';
      if (modalTitle) modalTitle.textContent = name + ' - Resume Preview';
      bsModal.show();
    }
  });

  // 11. Live Search Filters for Jobs & Inbox
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

  // 12. Settings Form Save Handler
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const newName = document.getElementById('settingsDisplayName')?.value || 'User';
      if (welcomeTitle) welcomeTitle.textContent = 'Welcome, ' + newName;
      if (userNavName) userNavName.textContent = newName;
      if (profileDisplayName) profileDisplayName.textContent = newName;
      showToast('Settings saved successfully!');
    });
  }

});
