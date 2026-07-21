/**
 * notes_add - Apple Notes'a not ekle (v4.9.1)
 */

const { execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

const CREATE_NOTE_SCRIPT = `
on run argv
  set noteTitle to item 1 of argv
  set noteContent to item 2 of argv
  set folderName to item 3 of argv
  tell application "Notes"
    if folderName is not "" then
      set targetFolder to folder folderName
      set newNote to make new note at targetFolder with properties {name:noteTitle, body:noteContent}
    else
      set newNote to make new note with properties {name:noteTitle, body:noteContent}
    end if
    save
    return name of newNote
  end tell
end run
`;

function runAppleScript(script, args = []) {
  return execFileSync("osascript", ["-", ...args], { input: script, timeout: 10000 }).toString().trim();
}

async function notesAdd(params) {
  if (!IS_MAC) return { success: false, error: "Notes sadece macOS'ta" };
  const { title, content, folder = null } = params;
  if (!title || !content) return { success: false, error: "title ve content gerekli" };

  try {
    const name = await runAppleScript(CREATE_NOTE_SCRIPT, [title, content, folder || ""]);
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
