/**
 * plan - Plan modu (v5.3.1)
 *
 * Planlama — karmasik isleri adimlara bolup calistirir
 *
 * Ozellikler:
 *   - Sadece plan yapar, hicbir tool calistirmaz
 *   - Multi-step gorevler icin adim adim yol haritasi
 *   - Kullanici plani onayladiktan sonra execute
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const PLAN_DIR = path.join(os.homedir(), ".natureco", "plans");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".natureco", "config.json"), "utf8"));
  } catch { return {}; }
}

function isMiniMax(url) {
  return url && (url.includes("minimax.io") || url.includes("minimaxi.com"));
}

async function planTask({ task, depth = "detailed" }) {
  const cfg = loadConfig();
  if (!cfg.providerUrl || !cfg.providerApiKey) {
    return { success: false, error: "Provider ayarli degil. Once: natureco setup" };
  }

  const prompt = `Asagidaki gorev icin ${depth === "minimal" ? "kisa" : "detayli"} bir PLAN olustur. Sadece plan, hicbir islem yapma.

GOREV: ${task}

CIKTI FORMATI (Markdown):
# Plan: <Gorev Adi>

## Ozet
[1-2 cumle]

## On Kosullar
- [...]

## Adimlar
1. **Adim 1**: <aciklama>
   - Arac: <tool adi>
   - Beklenen cikti: <ne elde edecegiz>
2. **Adim 2**: ...

## Dizinleyici Bilgiler
- Toplam adim: X
- Tahmini sure: X dakika
- Risk: <dusuk/orta/yuksek>
- Bagimlilik: <hangi dosyalar/klasorler>

Sadece plan yaz, baska bir sey yazma.`;

  const body = {
    model: cfg.providerModel || "MiniMax-M2.5",
    messages: [
      { role: "system", content: "Sen bir planlama asistanisin. SADECE PLAN YAZ. HiCBiR tool cagirma (bash, write_file, edit_file, read_file YASAK). Sadece duz metin plan uret. Asla dosya yazma veya komut calistirma. Kullanici izni olsa bile plan modunda islem YAPMA." },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  };

  return new Promise((resolve) => {
    const isMM = isMiniMax(cfg.providerUrl);
    const endpoint = isMM
      ? cfg.providerUrl.replace(/\/+$/, "") + "/v1/text/chatcompletion_v2"
      : cfg.providerUrl.replace(/\/+$/, "") + "/chat/completions";
    const data = JSON.stringify(body);
    const req = https.request(endpoint, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.providerApiKey, "Content-Type": "application/json" },
      timeout: 60000,
    }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            const planText = parsed.choices?.[0]?.message?.content || "";
            // Plani kaydet
            if (!fs.existsSync(PLAN_DIR)) fs.mkdirSync(PLAN_DIR, { recursive: true });
            const planId = `plan-${Date.now().toString(36)}`;
            const planFile = path.join(PLAN_DIR, planId + ".md");
            fs.writeFileSync(planFile, planText, "utf8");
            resolve({
              success: true,
              planId,
              task,
              plan: planText,
              path: planFile,
              message: `Plan olusturuldu: ${planId}. Onaylarsan 'execute' ile calistir.`,
            });
          } catch (e) {
            resolve({ success: false, error: "Parse hatasi: " + e.message });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
        }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.on("timeout", () => req.destroy() && resolve({ success: false, error: "Timeout" }));
    req.write(data);
    req.end();
  });
}

async function listPlans() {
  try {
    if (!fs.existsSync(PLAN_DIR)) return { success: true, count: 0, plans: [] };
    const files = fs.readdirSync(PLAN_DIR).filter(f => f.endsWith(".md")).sort().reverse().slice(0, 10);
    const plans = files.map(f => {
      try {
        const content = fs.readFileSync(path.join(PLAN_DIR, f), "utf8");
        const titleMatch = content.match(/^# Plan: (.+)$/m);
        const stepMatch = content.match(/^(\d+)\. \*\*Adim/m);
        return {
          id: f.replace(".md", ""),
          title: titleMatch ? titleMatch[1] : f,
          totalSteps: stepMatch ? parseInt(stepMatch[1]) : 0,
          preview: content.slice(0, 200),
          path: path.join(PLAN_DIR, f),
        };
      } catch {
        return { id: f, error: "parse hatasi" };
      }
    });
    return { success: true, count: plans.length, plans };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "plan",
  description: "[PLAN MODE - DANGEROUS] SADECE plan yazar, HICBIR tool calistirmaz (no bash, write_file, edit_file, vb.). Sadece metin plan uretir. Kullanici /exit yapip manuel olarak adimlari calistiracak.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "create (plan olustur) / list (planlari listele)", enum: ["create", "list"] },
      task: { type: "string", description: "Planlanacak gorev (create icin)" },
      depth: { type: "string", description: "minimal/detailed (default: detailed)", enum: ["minimal", "detailed"] },
    },
    required: ["action"],
  },
  async execute(params) {
    if (params.action === "list") return listPlans();
    if (!params.task) return { success: false, error: "task gerekli (create icin)" };
    return await planTask(params);
  },
};