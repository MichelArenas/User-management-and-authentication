const crypto = require("crypto");

// --- Catálogos
const VALID_ROLES = ["ADMINISTRADOR", "MEDICO", "ENFERMERO", "PACIENTE"];
const VALID_STATUS = ["PENDING", "ACTIVE", "DEACTIVATED"];

// --- Normalizadores / validadores
function normalizeRole(v) {
  if (!v) return null;
  const up = String(v).trim().toUpperCase();
  return VALID_ROLES.includes(up) ? up : null;
}

function normalizeStatus(v) {
  const up = String(v || "PENDING").trim().toUpperCase();
  return VALID_STATUS.includes(up) ? up : "PENDING";
}

function isEmailValid(email) {
  const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
  return emailRegex.test(email);
}

function isPasswordStrong(pw) {
  return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(pw);
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.randomFillSync(new Uint32Array(12)))
    .map(n => alphabet[n % alphabet.length]).join("");
}

module.exports = {
  VALID_ROLES,
  VALID_STATUS,
  normalizeRole,
  normalizeStatus,
  isEmailValid,
  isPasswordStrong,
  generateTempPassword,
};
