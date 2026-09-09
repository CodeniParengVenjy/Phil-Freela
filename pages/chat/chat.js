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

  // Parse query parameter recipient (e.g. ?recipient=Juan%20Cruz)
  const urlParams = new URLSearchParams(window.location.search);
  const recipient = urlParams.get('recipient');
  if (recipient) {
    const activeNameEl = document.getElementById('chatActiveName');
    const b1 = document.getElementById('bubbleSenderName');
    const b2 = document.getElementById('bubbleSenderName2');
    if (activeNameEl) activeNameEl.textContent = recipient;
    if (b1) b1.textContent = recipient;
    if (b2) b2.textContent = recipient;
  }

  const chatInputForm = document.getElementById('chatInputForm');
  const chatMessageInput = document.getElementById('chatMessageInput');
  const chatMessagesStream = document.getElementById('chatMessagesStream');

  if (chatInputForm && chatMessageInput && chatMessagesStream) {
    chatInputForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const msgText = chatMessageInput.value.trim();
      if (!msgText) return;

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

      setTimeout(function () {
        const inBubble = document.createElement('div');
        inBubble.className = 'chat-bubble incoming align-self-start p-3 rounded-4 max-w-500 bg-secondary bg-opacity-25 text-white';
        const recipientName = document.getElementById('chatActiveName')?.textContent || 'Client';
        inBubble.innerHTML = `
          <div class="d-flex align-items-center gap-2 mb-1">
            <strong class="fs-8 text-orange">${recipientName}</strong>
            <small class="fs-8 text-secondary">Just now</small>
          </div>
          <p class="mb-0 fs-7">Thanks for your response! Let's get started on the terms.</p>
        `;
        chatMessagesStream.appendChild(inBubble);
        chatMessagesStream.scrollTop = chatMessagesStream.scrollHeight;
      }, 1200);
    });
  }
});