const loginForm = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const loginMessage = document.getElementById('loginMessage');

const appRoot = (window.location.protocol === 'file:' ? 'http://localhost' : window.location.origin) + '/Capstone%20System%202026';
const loginEndpoint = appRoot + '/pages/admin/api/login.php';
const dashboardUrl = appRoot + '/pages/admin/dashboard/index.html';

const setMessage = (message, type = '') => {
  loginMessage.textContent = message;
  loginMessage.classList.remove('error', 'success');
  if (type) loginMessage.classList.add(type);
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  setMessage('Signing in...');

  try {
    const response = await fetch(loginEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setMessage(data.message || 'Invalid credentials.', 'error');
      submitBtn.disabled = false;
      return;
    }

    setMessage('Signed in! Redirecting...', 'success');
    window.location.href = dashboardUrl;
  } catch (err) {
    setMessage('Network error. Please try again.', 'error');
    submitBtn.disabled = false;
  }
});
