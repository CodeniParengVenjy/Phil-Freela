const setupForm = document.getElementById('setupForm');
const submitBtn = document.getElementById('submitBtn');
const setupMessage = document.getElementById('setupMessage');

const appRoot = (window.location.protocol === 'file:' ? 'http://localhost' : window.location.origin) + '/Capstone%20System%202026';
const setupEndpoint = appRoot + '/pages/admin/api/setup.php';

const setMessage = (message, type = '') => {
  setupMessage.textContent = message;
  setupMessage.classList.remove('error', 'success');
  if (type) setupMessage.classList.add(type);
};

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  setMessage('Creating admin account...');

  try {
    const response = await fetch(setupEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: document.getElementById('fullName').value.trim(),
        username: document.getElementById('username').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setMessage(data.message || 'Setup failed.', 'error');
      submitBtn.disabled = false;
      return;
    }

    setMessage('Admin account created! Redirecting to sign in...', 'success');
    setTimeout(() => {
      window.location.href = '../login/index.html';
    }, 1200);
  } catch (err) {
    setMessage('Network error. Please try again.', 'error');
    submitBtn.disabled = false;
  }
});
