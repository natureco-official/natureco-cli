/**
 * notes_add - Apple Notes'a not ekle (v4.9.1)
 */

const { spawn } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", ["-e", script]);
    let out = ""; let err = "";
    proc.stdout.on("data", d => out += d);
    proc.stderr.on("data", d => err += d);
    proc.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim())));
  });
}

async function notesAdd(params) {
  if (!IS_MAC) return { success: false, error: "Notes sadece macOS'ta" };
  const { title, content, folder = null } = params;
  if (!title || !content) return { success: false, error: "title ve content gerekli" };

  const folderScript = folder ? `folder "${folder}"` : "default folder";

  const script = `
    tell application "Notes"
      set targetFolder to ${folderScript}
      set newNote to make new note at targetFolder with properties {name:"${title.replace(/"/g, "'")}", body:"${content.replace(/"/g, "'").replace(/\n/g, "\\n")}"}
      save
      return name of newNote
    end tell
  `;

  try {
    const name = await runAppleScript(script);
    return { success: true, noteName: name, title, message: `Not eklendi: "${title}"` };
  } catch (e) {
    if (e.message.includes("-1743") || e.message.includes("not authorized")) {
      return { success: false, error: "Notes erisim izni yok. System Preferences -> Security -> Automation -> Notes -> ON" };
    }
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "notes_add",
  description: "Apple Notes'a yeni not ekle.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Not basligi" },
      content: { type: "string", description: "Not icerigi" },
      folder: { type: "string", description: "Klasor adi (default: default folder)" },
    },
    required: ["title", "content"],
  },
  async execute(params) {
    return await notesAdd(params);
  },
};