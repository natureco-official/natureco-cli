/**
 * delegate_task - Alt-agent'a gorev devret (v4.9.0)
 *
 * Hermes delegate_task'ina benzer. Bir alt-agent baslatip ozel bir gorev verir.
 * Not: Bu basitlestirilmis versiyon - async sub-process olarak agent calistirir.
 */

const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

// v5.2.0: Agent alias mapping
const AGENT_ALIASES = {
  "review": "general",          // eskiden review diye bir vardi, simdi general
  "analyze": "explore",
  "scan": "security",
  "audit": "security",
  "check": "general",
};

const VALID_AGENTS = ["explore", "general", "seo", "content", "security", "debugger", "translator"];

async function delegate({ task, agent = "general", timeoutMs = 60000 }) {
  if (!task) return { success: false, error: "task gerekli" };

  // Alias cozumu
  if (AGENT_ALIASES[agent]) {
    agent = AGENT_ALIASES[agent];
  }
  if (!VALID_AGENTS.includes(agent)) {
    return {
      success: false,
      error: `Gecersiz agent: ${agent}. Var olan agent tipleri: ${VALID_AGENTS.join(", ")}. Alias'lar: ${Object.keys(AGENT_ALIASES).join(", ")}`,
    };
  }

  // Bu basitlestirilmis versiyon: kendi agent sistemi yerine
  // natureco'nun REPL'ini sub-process olarak baslatip gorev verir
  return new Promise((resolve) => {
    const cliPath = path.resolve(__dirname, "..", "..", "bin", "natureco.js");
    const args = ["ask", `"${task.replace(/"/g, '\\"')}"`];

    let stdout = "";
    let stderr = "";
    const proc = spawn("node", [cliPath, ...args], {
      timeout: timeoutMs,
      env: { ...process.env },
    });

    proc.stdout.on("data", d => stdout += d.toString());
    proc.stderr.on("data", d => stderr += d.toString());

    proc.on("close", code => {
      // natureco ask komutu genelde cevabi stdout'a yazar
      const output = stdout.split("\n").filter(l => !l.startsWith("[") && l.trim()).join("\n").trim();
      resolve({
        success: code === 0,
        task,
        agent,
        output: output || stderr,
        exitCode: code,
      });
    });
    proc.on("error", e => resolve({ success: false, error: e.message, task }));
  });
}

module.exports = {
  name: "delegate_task",
  description: "Alt-agent'a ozel gorev devret. Sub-process olarak REPL calistirip gorev verir, cevabi dondurur.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "Alt-agent'in yapacagi gorev (ornek: 'README.md dosyasinin ilk 100 satirini ozetle')" },
      agent: { type: "string", description: "Agent tipi (default: general)", enum: ["general", "explore", "review", "seo", "content", "security", "debugger", "translator"] },
      timeoutMs: { type: "number", description: "Timeout ms (default 60000)" },
    },
    required: ["task"],
  },
  async execute(params) {
    return await delegate(params);
  },
};