/**
 * natureco code v5 — Claude Code alternatif (v5.0)
 *
 * TUI engine + 47 tool + auto tool selection ile modern code agent.
 * v2.23'ün code.js'inin yerini alir.
 *
 * Ozellikler:
 * - TUI welcome card (round border, status pill)
 * - 47 tool otomatik yuklu (OpenAI function calling)
 * - Multi-turn tool execution (max 10 iter)
 * - Auto-context: dosya/klasor tarama (proje baglami)
 * - Token tracking
 * - Approval prompt (write_file, bash, dangerous komutlar)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const chalk = require("chalk");
const tui = require("../utils/tui");
const { getConfig } = require("../utils/config");
const { loadToolDefinitions, executeTool } = require("../utils/tools");

const IS_MAC = os.platform() === "darwin";
const MAX_ITERATIONS = 10;

function isMiniMax(url) {
  return url && (url.includes("minimax.io") || url.includes("minimaxi.com"));
}

async function apiRequest(url, key, body) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    const isMM = isMiniMax(url);
    const endpoint = isMM
      ? url.replace(/\/+$/, "") + "/v1/text/chatcompletion_v2"
      : url.replace(/\/+$/, "") + "/chat/completions";
    const data = JSON.stringify(body);
    const req = https.request(endpoint, {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      timeout: 60000,
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("Parse hatasi")); }
        } else reject(new Error("HTTP " + res.statusCode + ": " + body.slice(0, 200)));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy() && reject(new Error("Timeout")));
    req.write(data);
    req.end();
  });
}

async function sendMessageWithTools(providerUrl, providerKey, model, messages, toolDefs) {
  const isMM = isMiniMax(providerUrl);
  const tools = toolDefs.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const body = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 4096,
    stream: false,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const res = await apiRequest(providerUrl, providerKey, body);
  return res.choices?.[0]?.message || {};
}

function confirm(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow("\n  ⚠ " + prompt + " "), ans => {
      rl.close();
      resolve(!ans || ans.toLowerCase().startsWith("y"));
    });
  });
}

/**
 * v5.6.21: Risk seviyesi tespiti - sadece riskli işlemlerde onay iste
 * @param {string} tool - tool adı
 * @param {object} args - tool parametreleri
 * @returns {{requiresApproval: boolean, reason: string, level: string}}
 */
function assessRisk(tool, args) {
  const argsStr = JSON.stringify(args || {});

  // ============================================================
  // YÜKSEK RİSK - Mutlaka onay iste
  // ============================================================

  // bash / shell_command: Tehlikeli komutlar
  if (tool === "bash" || tool === "shell_command") {
    const cmd = (args.command || args.cmd || "").toLowerCase();

    // Dosya/klasör silme
    if (/\brm\s+(-[rf]+\s+)*/.test(cmd) || /rmdir/.test(cmd)) {
      return { requiresApproval: true, level: "high", reason: `Dosya silme komutu: ${args.command}` };
    }
    if (cmd.includes("sudo ") || cmd.includes("doas ")) {
      return { requiresApproval: true, level: "high", reason: `Yetki yükseltme: ${args.command}` };
    }
    if (cmd.includes("dd if=") || cmd.includes("mkfs") || cmd.includes("fdisk")) {
      return { requiresApproval: true, level: "high", reason: `Disk işlemi: ${args.command}` };
    }
    if (cmd.match(/^\s*mv\s+.*\/(?:\.|\.\.)/)) {
      return { requiresApproval: true, level: "medium", reason: `Üzerine yazma riski: ${args.command}` };
    }
    // chmod 777 veya chown -R
    if (/chmod\s+(-[rR]+\s+)*777/.test(cmd) || /chown\s+-R/.test(cmd)) {
      return { requiresApproval: true, level: "medium", reason: `İzin değişikliği: ${args.command}` };
    }
    // git push --force
    if (/git\s+push.*--force/.test(cmd) || /git\s+push.*-f\s/.test(cmd)) {
      return { requiresApproval: true, level: "high", reason: `Zorla push: ${args.command}` };
    }
    // git reset --hard
    if (/git\s+reset\s+--hard/.test(cmd)) {
      return { requiresApproval: true, level: "high", reason: `Hard reset: ${args.command}` };
    }
    // Üretim/kök dizin
    if (cmd.includes("/etc/") || cmd.includes("/usr/") || cmd.includes("/var/") || cmd.includes("/System/")) {
      return { requiresApproval: true, level: "high", reason: `Sistem dizinine erişim: ${args.command}` };
    }
    // curl/wget internet download
    if (/curl.*\|\s*(bash|sh)/.test(cmd) || /wget.*\|\s*(bash|sh)/.test(cmd)) {
      return { requiresApproval: true, level: "high", reason: `İnternet üzerinden script çalıştırma: ${args.command}` };
    }
    // mac_app_quit veya killall
    if (cmd.includes("killall") || cmd.includes("pkill") || cmd.includes("kill -9")) {
      return { requiresApproval: true, level: "high", reason: `Süreç sonlandırma: ${args.command}` };
    }
    // .natureco veya önemli dosyalara dokunma
    if (cmd.includes(".natureco") && (cmd.includes("rm") || cmd.includes("mv"))) {
      return { requiresApproval: true, level: "high", reason: `NatureCo dizininde tehlikeli işlem: ${args.command}` };
    }
  }

  // ============================================================
  // ORTA RİSK - Onay iste (bilgilendir)
  // ============================================================

  // mac_app_quit - uygulama kapatma
  if (tool === "mac_app_quit") {
    return { requiresApproval: true, level: "medium", reason: `Uygulama kapatma: ${args.app || args.name || "?"}` };
  }

  // write_file / edit_file - kritik yollara yazma
  if (tool === "write_file" || tool === "edit_file") {
    const path = (args.path || args.file || "").toLowerCase();
    // Hassas dosyalar
    if (path.includes(".env") || path.includes("credentials") || path.includes("secret")) {
      return { requiresApproval: true, level: "high", reason: `Hassas dosya: ${args.path}` };
    }
    if (path.includes("/etc/") || path.includes("/usr/") || path.includes("~/.ssh/")) {
      return { requiresApproval: true, level: "high", reason: `Sistem dosyası: ${args.path}` };
    }
    if (path.includes(".natureco/config.json") || path.includes(".natureco/soul/")) {
      return { requiresApproval: true, level: "medium", reason: `NatureCo config dosyası: ${args.path}` };
    }
  }

  // ============================================================
  // GÜVENLİ - Onay isteme
  // ============================================================

  // Normal tool'lar (read_file, list_dir, grep_search, vs.)
  return { requiresApproval: false, level: "low", reason: "" };
}


/**
 * v5.6.21: Tool call sonucunu güvenli yazdir - yol/size gizle
 * Sadece status, success/error ve kisaltilmis onizleme gosterir
 */
function printToolCallSafe(name, args, result) {
  console.log("  " + tui.styled("🔧 Tool: " + name, { color: tui.PALETTE.accent, bold: true }));
  // Args'dan sadece ana bilgiyi goster
  const argsShort = summarizeArgs(name, args);
  if (argsShort) {
    console.log(tui.styled("     Args: " + argsShort, { color: tui.PALETTE.muted }));
  }
  // Result'tan sadece status goster, yol/size gizle
  if (!result) return;
  if (result.error) {
    console.log(tui.styled("     ✗ Hata: " + result.error.slice(0, 100), { color: tui.PALETTE.danger }));
  } else {
    const success = result.success !== false;
    const resultStr = typeof result.result === "string"
      ? result.result.slice(0, 200)
      : JSON.stringify(result.result || {}).slice(0, 200);
    // Yol/size gizle
    const cleanResult = resultStr
      .replace(/\/?Users\/[^"\\\s]+/g, "~")
      .replace(/\/?home\/[^"\\\s]+/g, "~")
      .replace(/"\w:\\\[^"\\\s]*/g, "...")
      .replace(/"size":\d+/g, "")
      .replace(/"path":"[^"]*"/g, "")
      .replace(/"fileCount":\d+/g, "");
    const statusIcon = success ? "✓" : "✗";
    const statusColor = success ? tui.PALETTE.success : tui.PALETTE.danger;
    console.log(tui.styled(`     ${statusIcon} Sonuç: ${cleanResult.trim()}`, { color: statusColor }));
  }
}

/**
 * Tool args'dan ana bilgiyi özetle
 */
function summarizeArgs(name, args) {
  if (!args || Object.keys(args).length === 0) return null;
  // Path varsa ~ olarak kisalt
  if (args.path) {
    const shortPath = (args.path || "")
      .replace(/\/Users\/[^\/]+/g, "~")
      .replace(/\/home\/[^\/]+/g, "~")
      .replace(/^[A-Z]:\\Users\\[^\\]+/, "~");
    return JSON.stringify({...args, path: shortPath}).slice(0, 120);
  }
  if (args.command) {
    return JSON.stringify({command: args.command.slice(0, 80)}).slice(0, 120);
  }
  return JSON.stringify(args).slice(0, 120);
}

function printToolCall(name, args, result) {
  const argsStr = JSON.stringify(args).slice(0, 100);
  console.log("\n  " + tui.styled("  🔧 Tool: " + name, { color: tui.PALETTE.accent, bold: true }));
  console.log("  " + tui.styled("     Args: " + argsStr, { color: tui.PALETTE.muted }));
  if (result) {
    if (result.error) {
      console.log("  " + tui.styled("     ✗ Hata: " + result.error.slice(0, 200), { color: tui.PALETTE.danger }));
    } else if (result.success !== false) {
      const out = typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
      console.log("  " + tui.styled("     ✓ Sonuç: " + out, { color: tui.PALETTE.success }));
    }
  }
}

function scanProject(cwd) {
  try {
    const files = fs.readdirSync(cwd, { withFileTypes: true });
    const summary = {
      totalFiles: 0,
      dirs: [],
      configFiles: [],
      readme: null,
    };
    for (const f of files) {
      if (f.name.startsWith(".") || f.name === "node_modules") continue;
      if (f.isDirectory()) summary.dirs.push(f.name);
      else {
        summary.totalFiles++;
        if (f.name === "package.json" || f.name === "Cargo.toml" || f.name === "go.mod" || f.name.endsWith(".lock")) {
          summary.configFiles.push(f.name);
        }
        if (f.name.toLowerCase() === "readme.md") summary.readme = f.name;
      }
    }
    return summary;
  } catch {
    return null;
  }
}

async function codeV5(targetPath) {
  const config = getConfig();
  if (!config.providerUrl || !config.providerApiKey) {
    console.log(tui.C.red("\n  ❌ Provider ayarlı değil. Önce: natureco setup\n"));
    return;
  }

  const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const projectCtx = scanProject(cwd);
  const toolDefs = loadToolDefinitions();

  // Header / Welcome
  console.log("");
  console.log(tui.styled("  ╭" + "─".repeat(58) + "╮", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + "  ⚡ " + tui.styled("NatureCo Code Agent v5", { color: tui.PALETTE.primary, bold: true }) + tui.C.muted("    Claude Code alternative") + "".padEnd(8) + tui.styled(" │", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted("  Proje:  ") + tui.styled(cwd.padEnd(47), { color: tui.PALETTE.text }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted("  Model:  ") + tui.styled((config.providerModel || "—").padEnd(47), { color: tui.PALETTE.text }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  │", { color: tui.PALETTE.primary }) + tui.C.muted("  Tools:  ") + tui.styled(String(toolDefs.length).padEnd(47), { color: tui.PALETTE.success, bold: true }) + tui.styled(" │", { color: tui.PALETTE.primary }));
  console.log(tui.styled("  ╰" + "─".repeat(58) + "╯", { color: tui.PALETTE.primary }));

  // Project context
  if (projectCtx) {
    console.log("\n  " + tui.C.muted("📂 Proje bağlamı:"));
    if (projectCtx.readme) console.log("    " + tui.C.muted("• README: ") + tui.C.text(projectCtx.readme));
    if (projectCtx.configFiles.length) {
      console.log("    " + tui.C.muted("• Config: ") + tui.C.text(projectCtx.configFiles.join(", ")));
    }
    if (projectCtx.dirs.length) {
      console.log("    " + tui.C.muted("• Klasörler: ") + tui.C.text(projectCtx.dirs.slice(0, 8).join(", ")));
    }
    console.log("    " + tui.C.muted("• Toplam dosya: ") + tui.C.text(String(projectCtx.totalFiles)));
  }

  console.log("\n  " + tui.C.muted("Komutlar:"));
  console.log("    " + tui.C.amber("/summary") + tui.C.muted(" — Oturum özeti"));
  console.log("    " + tui.C.amber("/done") + tui.C.muted("    — Özet + çıkış"));
  console.log("    " + tui.C.amber("Ctrl+C") + tui.C.muted("  — Çıkış"));
  console.log("");

  // System prompt
  const systemPrompt = [
    "Sen NatureCo Code Agent v5'sin — Claude Code alternatifi bir terminal AI asistanısın.",
    "47 tool'un var: dosya okuma/yazma, bash, Python, web search, macOS native, image generation, TTS, vs.",
    "Kullanıcının isteğini analiz et, uygun tool'ları kullan, sonuçları özetle.",
    "Türkçe cevap ver.",
    "Kullanıcıdan onay almadan dosya yazma veya tehlikeli komut çalıştırma.",
  ].join(" ");

  let messages = [{ role: "system", content: systemPrompt }];
  let totalIn = 0, totalOut = 0;
  let filesChanged = 0, commandsRun = 0;
  const startTime = Date.now();

  // Input loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("\n  " + tui.styled("You  ", { color: tui.PALETTE.primary, bold: true }));

  const ask = () => {
    rl.question("", async (input) => {
      input = input.trim();
      if (!input) { process.stdout.write("  " + tui.styled("You  ", { color: tui.PALETTE.primary, bold: true })); return ask(); }
      if (input === "/summary") {
        printSummary(filesChanged, commandsRun, messages.length - 1, startTime);
        // v5.6.22: /summary sadece gosterir, cikmaz
        process.stdout.write("\n  " + tui.styled("You  ", { color: tui.PALETTE.primary, bold: true }));
        return ask();
      }
      if (input === "/done" || input === "exit" || input === "quit") {
        // v5.6.22: /done cikinca summary goster
        printSummary(filesChanged, commandsRun, messages.length - 1, startTime);
        rl.close();
        return;
      }

      messages.push({ role: "user", content: input });
      process.stdout.write("\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));

      // Multi-turn tool loop
      let iter = 0;
      while (iter < MAX_ITERATIONS) {
        iter++;
        try {
          const reply = await sendMessageWithTools(
            config.providerUrl, config.providerApiKey, config.providerModel,
            messages, toolDefs
          );
          if (reply.content) {
            process.stdout.write(reply.content);
            messages.push({ role: "assistant", content: reply.content });
            totalOut += Math.ceil(reply.content.length / 4);
          }

          if (reply.tool_calls && reply.tool_calls.length > 0) {
            // v5.6.21: Akıllı onay - sadece riskli işlemlerde onay iste
            let approved = true;
            for (const tc of reply.tool_calls) {
              let args = {};
              try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
              const risk = assessRisk(tc.function.name, args);
              if (risk.requiresApproval) {
                process.stdout.write("\n");
                approved = await confirm(
                  `⚠ ${tc.function.name}: ${risk.reason}\n  Devam edilsin mi? (Y/n) `
                );
                if (!approved) break;
              }
            }
            if (!approved) {
              console.log("\n  " + tui.C.yellow("⚠ Kullanıcı onayı iptal etti, tool çalıştırılmadı."));
              break;
            }

            messages.push({ role: "assistant", content: reply.content || null, tool_calls: reply.tool_calls });
            for (const tc of reply.tool_calls) {
              const name = tc.function.name;
              let args = {};
              try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
              printToolCall(name, args);
              if (name === "bash" || name === "shell_command") commandsRun++;
              if (name === "write_file" || name === "edit_file") filesChanged++;
              const result = await executeTool(name, args, toolDefs);
              // v5.6.21: Sonuç gizleme - sadece status goster, yol/size gizle
              printToolCallSafe(name, args, result);
              const out = result.error
                ? "ERROR: " + result.error
                : (typeof result.result === "string" ? result.result : JSON.stringify(result.result));
              messages.push({ role: "tool", tool_call_id: tc.id, content: (out || "(empty)").slice(0, 8000) });
              totalIn += Math.ceil(out.length / 4);
            }
            process.stdout.write("\n  " + tui.styled("AI   ", { color: tui.PALETTE.secondary, bold: true }));
            continue;
          }
          break;
        } catch (e) {
          console.log("\n  " + tui.C.red("❌ " + e.message));
          break;
        }
      }

      totalIn += Math.ceil(input.length / 4);
      process.stdout.write("\n\n  " + tui.styled("You  ", { color: tui.PALETTE.primary, bold: true }));
      ask();
    });
  };
  ask();
}

function printSummary(files, cmds, msgs, startTime) {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  console.log("\n  " + tui.styled("─── Session Özeti ───", { color: tui.PALETTE.primary, bold: true }));
  console.log("  " + tui.C.green("  ✓ " + files + " dosya değiştirildi"));
  console.log("  " + tui.C.green("  ✓ " + cmds + " komut çalıştırıldı"));
  console.log("  " + tui.C.amber("  ✓ " + msgs + " mesaj değişimi"));
  console.log("  " + tui.C.muted("  ⏱  " + min + "dk " + sec + "sn"));
  console.log("");
}

module.exports = codeV5;
