const forgotForm = document.getElementById("forgotForm");
const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
const forgotEmailInput = document.getElementById("forgotEmail");
const forgotPasswordInput = document.getElementById("forgotPassword");
const forgotConfirmPasswordInput = document.getElementById("forgotConfirmPassword");
const authMessage = document.getElementById("authMessage");
const passwordToggleButtons = document.querySelectorAll(".password-toggle");

const appRoot = `${window.location.protocol === "file:" ? "http://localhost" : window.location.origin}/Capstone%20System%202026`;
const forgotEndpoint = `${appRoot}/pages/login/api/forgot-password.php`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const setMessage = (message, type = "") => {
  authMessage.textContent = message;
  authMessage.classList.remove("error", "success");
  if (type) {
    authMessage.classList.add(type);
  }
};

const getPasswordStrengthMessage = (password) => {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least 1 uppercase letter.";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must contain at least 1 lowercase letter.";
  }

  if (!/\d/.test(password)) {
    return "Password must contain at least 1 number.";
  }

  return "";
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
};

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.target;
    const targetInput = document.getElementById(targetId);
    if (!targetInput) {
      return;
    }

    const shouldShow = targetInput.type === "password";
    targetInput.type = shouldShow ? "text" : "password";
    button.textContent = shouldShow ? "Hide" : "Show";
    button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(shouldShow));
  });
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = forgotEmailInput.value.trim().toLowerCase();
  const newPassword = forgotPasswordInput.value;
  const confirmPassword = forgotConfirmPasswordInput.value;

  if (!emailPattern.test(email)) {
    setMessage("Use a valid email format like name@example.com.", "error");
    forgotEmailInput.focus();
    return;
  }

  const strengthMessage = getPasswordStrengthMessage(newPassword);
  if (strengthMessage) {
    setMessage(strengthMessage, "error");
    forgotPasswordInput.focus();
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage("New passwords do not match.", "error");
    forgotConfirmPasswordInput.focus();
    return;
  }

  forgotSubmitBtn.disabled = true;
  setMessage("Updating password...");

  try {
    const result = await postJson(forgotEndpoint, {
      email,
      newPassword,
      confirmPassword
    });

    setMessage(result.message || "Password updated successfully.", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 900);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    forgotSubmitBtn.disabled = false;
  }
});
