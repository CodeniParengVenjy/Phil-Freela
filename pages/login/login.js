const authCard = document.getElementById("authCard");
const authForm = document.getElementById("authForm");
const submitBtn = document.getElementById("submitBtn");
const authMessage = document.getElementById("authMessage");
const modeButtons = document.querySelectorAll(".mode-btn");
const signupOnlyFields = document.querySelectorAll(".signup-only");
const passwordToggleButtons = document.querySelectorAll(".password-toggle");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");

const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const genderInput = document.getElementById("gender");

const appRoot = `${window.location.protocol === "file:" ? "http://localhost" : window.location.origin}/Capstone%20System%202026`;

let authMode = "signin";

const redirectAfterAuth = {
  signin: `${appRoot}/pages/dashboard/index.html`,
  signup: `${appRoot}/pages/dashboard/index.html`
};

const endpoints = {
  signin: `${appRoot}/pages/login/api/login.php`,
  signup: `${appRoot}/pages/login/api/register.php`
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const setMessage = (message, type = "") => {
  authMessage.textContent = message;
  authMessage.classList.remove("error", "success");
  if (type) {
    authMessage.classList.add(type);
  }
};

const setMode = (mode) => {
  authMode = mode;
  const isSignup = mode === "signup";

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  signupOnlyFields.forEach((field) => {
    field.classList.toggle("is-hidden", !isSignup);
  });

  fullNameInput.required = isSignup;
  usernameInput.required = isSignup;
  confirmPasswordInput.required = isSignup;
  genderInput.required = isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
  submitBtn.textContent = isSignup ? "Create Account" : "Sign In";
  forgotPasswordLink.classList.toggle("is-hidden", isSignup);
  setMessage("");
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

const handleAuthSuccess = (mode, result) => {
  const target = redirectAfterAuth[mode];
  const baseMessage = result.message || "Success.";

  if (target) {
    setMessage(baseMessage, "success");
    setTimeout(() => {
      window.location.href = target;
    }, 900);
    return;
  }

  setMessage(`${baseMessage} You are now logged in.`, "success");
};

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

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

emailInput.addEventListener("input", () => {
  if (emailInput.value && !emailPattern.test(emailInput.value.trim())) {
    emailInput.setCustomValidity("Use a valid email format like name@example.com.");
    return;
  }

  emailInput.setCustomValidity("");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const normalizedEmail = emailInput.value.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    setMessage("Use a valid email format like name@example.com.", "error");
    emailInput.focus();
    return;
  }

  if (authMode === "signup" && fullNameInput.value.trim().length > 100) {
    setMessage("Full Name must not exceed 100 characters.", "error");
    fullNameInput.focus();
    return;
  }

  if (authMode === "signup" && passwordInput.value !== confirmPasswordInput.value) {
    setMessage("Passwords do not match.", "error");
    return;
  }

  if (authMode === "signup") {
    const strengthMessage = getPasswordStrengthMessage(passwordInput.value);
    if (strengthMessage) {
      setMessage(strengthMessage, "error");
      passwordInput.focus();
      return;
    }
  }

  if (authMode === "signup" && !["male", "female"].includes(genderInput.value)) {
    setMessage("Please choose Male or Female.", "error");
    return;
  }

  submitBtn.disabled = true;
  setMessage(authMode === "signup" ? "Creating account..." : "Signing in...");

  try {
    const payload = {
      email: normalizedEmail,
      password: passwordInput.value,
      keepLogin: document.getElementById("keepLogin").checked
    };

    if (authMode === "signup") {
      payload.fullName = fullNameInput.value.trim();
      payload.username = usernameInput.value.trim();
      payload.gender = genderInput.value;
    }

    const result = await postJson(endpoints[authMode], payload);
    handleAuthSuccess(authMode, result);
  } catch (error) {
    setMessage(error.message, "error");

    if (/already exists/i.test(error.message)) {
      alert("Account already exists. Please use a different email or username.");
    } else if (/invalid credentials/i.test(error.message)) {
      alert("Invalid credentials. Please check your email and password.");
    }
  } finally {
    submitBtn.disabled = false;
  }
});

authCard.addEventListener("mousemove", (event) => {
  const rect = authCard.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const mx = (x / rect.width - 0.5) * 2;
  const my = (y / rect.height - 0.5) * 2;
  authCard.style.transform = `perspective(1000px) rotateX(${my * -2.6}deg) rotateY(${mx * 2.6}deg)`;
});

authCard.addEventListener("mouseleave", () => {
  authCard.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
});

setMode("signin");
