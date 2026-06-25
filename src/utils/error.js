/**
 * error.js — Standardized error handling (v5.3.1)
 *
 * Parton: "Teknik acidan kusursuz olalim"
 * Tum tool'lar bu helper'i kullanir:
 *   - Standart error format
 *   - Retry stratejisi
 *   - User-friendly messages
 *   - Error codes
 */

// checkMacPermission below uses os.platform() — was relying on a global
// `os` from another module's load order.
const os = require('os');

class ToolError extends Error {
  constructor(message, code = "TOOL_ERROR", details = {}) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Standard error codes
 */
const ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",           // Dosya/kaynak yok
  PERMISSION: "PERMISSION_DENIED",  // macOS izin yok
  INVALID_INPUT: "INVALID_INPUT",   // Kullanici yanlis input
  NETWORK: "NETWORK_ERROR",         // API/connection hatasi
  TIMEOUT: "TIMEOUT",               // Sure asimi
  RATE_LIMIT: "RATE_LIMITED",       // API rate limit
  AUTH: "AUTH_FAILED",              // API key gecersiz
  PARTIAL: "PARTIAL_SUCCESS",       // Kismen basarili
  INTERNAL: "INTERNAL_ERROR",       // Bug/mimari sorun
};

/**
 * User-friendly error messages
 */
const FRIENDLY_MESSAGES = {
  NOT_FOUND: {
    file: "Dosya bulunamadi. Yolu kontrol edin.",
    dir: "Klasor bulunamadi.",
    app: "Uygulama bulunamadi. Mac'te kurulu mu?",
    command: "Komut bulunamadi. PATH'te mi?",
  },
  PERMISSION: {
    calendar: "Takvim erisim izni yok.\n\nIzin vermek icin:\n1. System Preferences → Security & Privacy → Privacy → Automation\n2. natureco (veya Terminal) → Calendar → ON",
    reminders: "Hatirlatici izni yok. System Preferences → Security → Automation → Reminders → ON",
    notes: "Notes erisim izni yok. System Preferences → Security → Automation → Notes → ON",
    notifications: "Bildirim izni kapali. System Preferences → Notifications → natureco → ON",
    microphone: "Mikrofon izni yok. System Preferences → Security → Microphone → ON",
  },
};

/**
 * Standart error response wrapper
 */
function errorResponse(message, code = ERROR_CODES.INTERNAL, details = {}) {
  return {
    success: false,
    error: message,
    code,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Standart success response
 */
function successResponse(data, message = null) {
  return {
    success: true,
    ...data,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute with retry — network errors icin otomatik tekrar
 */
async function executeWithRetry(fn, options = {}) {
  const { maxRetries = 2, retryDelayMs = 1000, retryOn = ["NETWORK_ERROR", "TIMEOUT"] } = options;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const isRetryable = retryOn.some(code =>
        e.message?.includes(code) ||
        e.code === code ||
        (e.name === "AbortError")
      );
      if (!isRetryable || attempt === maxRetries) {
        throw e;
      }
      await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * macOS permission check
 */
async function checkMacPermission(appName) {
  if (os.platform() !== "darwin") return true;
  const { spawn } = require("child_process");
  return new Promise((resolve) => {
    const proc = spawn("osascript", ["-e", `tell application "System Events" to return name of every process`]);
    let stdout = "";
    proc.stdout.on("data", d => stdout += d);
    proc.on("close", (code) => {
      // System Events calisabiliyorsa, genel Automation izni var
      // Spesifik app icin test zor — genelde user'a "izin ver" diyoruz
      resolve(code === 0);
    });
    proc.on("error", () => resolve(false));
  });
}

module.exports = {
  ToolError,
  ERROR_CODES,
  FRIENDLY_MESSAGES,
  errorResponse,
  successResponse,
  executeWithRetry,
  checkMacPermission,
};