/**
 * macos_screenshot - macOS native screenshot (v5.2.0)
 *
 * Playwright'a gerek kalmadan screencapture komutu ile
 * ekran goruntusu alir. Sonra base64 olarak doner.
 */

const { spawn } = require("child_process");
const os = require("os");
const { classifyMacAutomationError } = require('../utils/macos-permissions');
const fs = require("fs");
const path = require("path");

const IS_MAC = os.platform() === "darwin";

async function captureScreen({ outputPath = null, region = "full" } = {}) {
  if (!IS_MAC) return { success: false, error: "Sadece macOS" };

  const tmpFile = outputPath || path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
  return new Promise((resolve) => {
    // screencapture -x: ses yok, -t png: png format
    const proc = spawn("screencapture", ["-x", "-t", "png", tmpFile]);
    let stderr = '';
    proc.stderr?.on('data', chunk => { stderr += chunk; });
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpFile)) {
        const buffer = fs.readFileSync(tmpFile);
        const stats = fs.statSync(tmpFile);
        resolve({
          success: true,
          path: tmpFile,
          size: stats.size,
          mime: "image/png",
          base64: buffer.toString("base64"),
          message: `Screenshot kaydedildi: ${tmpFile}`,
        });
      } else {
        resolve({ success: false, ...classifyMacAutomationError(stderr || `screencapture exit ${code}`) });
      }
    });
    proc.on("error", (e) => resolve({ success: false, error: e.message }));
  });
}

async function captureWindow({ windowTitle = null, outputPath = null } = {}) {
  if (!IS_MAC) return { success: false, error: "Sadece macOS" };

  const tmpFile = outputPath || path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
  return new Promise((resolve) => {
    // screencapture -l <windowId> veya -w (interaktif, fare ile pencere seç)
    const args = ["-x", "-t", "png", "-o"]; // -o: shadow yok
    if (windowTitle) args.push("-l", String(windowTitle));
    args.push(tmpFile);

    const proc = spawn("screencapture", args);
    let stderr = '';
    proc.stderr?.on('data', chunk => { stderr += chunk; });
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpFile)) {
        const buffer = fs.readFileSync(tmpFile);
        const stats = fs.statSync(tmpFile);
        resolve({
          success: true,
          path: tmpFile,
          size: stats.size,
          mime: "image/png",
          base64: buffer.toString("base64"),
        });
      } else {
        resolve({ success: false, ...classifyMacAutomationError(stderr || `screencapture exit ${code}`) });
      }
    });
    proc.on("error", (e) => resolve({ success: false, error: e.message }));
  });
}

module.exports = {
  name: "macos_screenshot",
  description: "macOS native ekran goruntusu al (Playwright gerekmez). screencapture komutunu kullanir.",
  inputSchema: {
    type: "object",
    properties: {
      outputPath: { type: "string", description: "Kayit yolu (default: /tmp/screenshot-<ts>.png)" },
      region: { type: "string", description: "full/window (default: full)", enum: ["full", "window"] },
      windowTitle: { type: "string", description: "Pencere basligi (sadece region=window)" },
    },
  },
  async execute(params) {
    if (params.region === "window") return captureWindow(params);
    return captureScreen(params);
  },
};
