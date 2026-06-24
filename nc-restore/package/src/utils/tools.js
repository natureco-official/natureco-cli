/**
 * NatureCo CLI — Tool Definitions for OpenAI-compatible APIs
 *
 * src/tools/*.js dosyalarını OpenAI uyumlu function calling format'ına dönüştürür.
 * Her tool'un:
 *   - name: tool adı
 *   - description: ne yaptığı
 *   - parameters: JSON schema
 *
 * REPL bu listeyi API'ye gönderir, model tool çağrısı yapar,
 * biz tool'u çalıştırır, sonucu modele geri veririz.
 */

const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

/**
 * src/tools/*.js dosyalarını oku, her birinin export'ladığı
 * tool metadata'sını topla. Eğer tool'un export'unda
 * { name, description, parameters, execute } varsa kullan,
 * yoksa dosya adından otomatik üret.
 */

/**
 * v5.6.1: Provider'a gore tool filtrele
 * Groq validator cok kati — sadece basit tool'lar
 * Anthropic, OpenAI tam tool seti kullanir
 */
function getToolsForProvider(allTools, providerUrl) {
  const url = (providerUrl || '').toLowerCase();

  // Groq icin minimum tool seti
  if (url.includes('groq.com')) {
    const allowed = ['read_file', 'write_file', 'bash', 'shell_command', 'list_dir', 'soul', 'memory_write', 'memory_search'];
    return allTools.filter(t => allowed.includes(t.name));
  }

  // Anthropic, OpenAI, MiniMax tam set
  return allTools;
}

function loadToolDefinitions() {
  const tools = [];
  const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.js'));

  // v5.6.1: Provider tespiti - Groq icin sadece temel tool'lar
  let isGroq = false;
  try {
    const { getConfig } = require('./config');
    const cfg = getConfig();
    if (cfg.providerUrl && cfg.providerUrl.toLowerCase().includes('groq.com')) {
      isGroq = true;
    }
  } catch (e) {}

  const GROQ_ALLOWED = new Set([
    'read_file', 'write_file', 'list_dir', 'bash', 'shell_command',
    'soul', 'memory_write', 'memory_search', 'filesystem', 'grep_search'
  ]);

  for (const file of files) {
    try {
      const toolPath = path.join(TOOLS_DIR, file);
      const mod = require(toolPath);

      // Groq icin sadece temel tool'lar
      if (isGroq) {
        const toolName = mod.name || path.basename(file, '.js');
        if (!GROQ_ALLOWED.has(toolName)) continue;
      }

      // Tool metadata çıkar
      const meta = {
        name: mod.name || path.basename(file, '.js'),
        description: mod.description || `${path.basename(file, '.js')} tool`,
        parameters: mod.parameters || mod.inputSchema || { type: 'object', properties: {} },
        execute: mod.execute || (mod.default && mod.default.execute) || null,
      };

      // Eğer execute fonksiyonu varsa ekle (CLI'da çalıştırmak için)
      if (meta.execute) {
        tools.push(meta);
      }
    } catch (e) {
      // Sessizce atla — bozuk tool dosyaları kritik değil
    }
  }

  return tools;
}

/**
 * OpenAI uyumlu API'ye gönderilecek format:
 *   [{ type: "function", function: { name, description, parameters } }]
 */
function toOpenAIFormat(toolDefs) {
  return toolDefs.map(t => {
    // v5.4.21: Groq uyumluluk - additionalProperties: false kaldirildi
    // ve gereksiz kisitlamalar temizlendi
    const cleanParams = JSON.parse(JSON.stringify(t.parameters || {}));
    if (cleanParams.properties) {
      Object.keys(cleanParams.properties).forEach(key => {
        const prop = cleanParams.properties[key];
        // "type": ["number", "string"] union types Groq'da hata verir
        // Sadece ilk tipi al
        if (Array.isArray(prop.type)) {
          prop.type = prop.type[0];
        }
        // additionalProperties kaldir
        delete prop.additionalProperties;
      });
    }
    // Groq icin required kismi bazen sorun cikarir - olduugu gibi birak
    // ama type validation'u gevset
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: cleanParams,
      },
    };
  });
}

/**
 * Tool çağrısını çalıştır
 * @param toolName - tool adı
 * @param args - tool argümanları (object)
 * @param toolDefs - loadToolDefinitions() sonucu
 * @returns { result, error }
 */
async function executeTool(toolName, args, toolDefs) {
  const tool = toolDefs.find(t => t.name === toolName);
  if (!tool) {
    return { error: `Tool bulunamadı: ${toolName}` };
  }
  if (!tool.execute) {
    return { error: `Tool execute fonksiyonu yok: ${toolName}` };
  }
  try {
    const result = await tool.execute(args || {});
    return { result };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

module.exports = {
  loadToolDefinitions,
  toOpenAIFormat,
  executeTool,
};
