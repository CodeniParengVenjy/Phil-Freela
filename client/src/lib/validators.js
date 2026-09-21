export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getPasswordStrengthMessage(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least 1 uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least 1 lowercase letter.";
  if (!/\d/.test(password)) return "Password must contain at least 1 number.";
  return "";
}
