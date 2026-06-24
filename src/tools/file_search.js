/**
 * file_search - Glob pattern ile dosya arama (v4.9.0)
 *
 * Hermes dosya arama motoruna benzer.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Recursive glob search
 * @param pattern - Glob pattern (ornek: "glob" ile "glob" arasi)
 * @param basePath - Aranacak dizin (default: cwd)
 * @param maxResults - Max sonuc sayisi (default 100)
 */
async function searchFiles({ pattern, basePath = null, maxResults = 100 }) {
  if (!pattern) return { success: false, error: "pattern gerekli" };

  const cwd = basePath || process.cwd();
  const results = [];

  // Basit glob regex donusumu (glob deseni)
  // **/ ve ** pattern'lerini placeholder yap (once kalsin),
  // sonra escape et, en son placeholder'lari replace et.
  // Glob -> regex: **/* is once, ** is sonra, sonra *, ?
  const regexPattern = pattern
    .replace(/\*\*\//g, '@@DSLASH@@')           // **/ -> placeholder
    .replace(/\*\*/g, '@@DSTAR@@')              // ** -> placeholder
    .replace(/\?/g, '@@QMARK@@')                 // ? -> placeholder
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')      // diger ozel karakterleri escape
    .replace(/@@DSLASH@@/g, '(?:.*\\/)?')         // **/ -> (?:.*\/)?  (sifir veya daha fazla dizin)
    .replace(/@@DSTAR@@/g, '.*')                    // ** -> .*
    .replace(/@@QMARK@@/g, '[^/]')                  // ? -> [^/]
    .replace(/\*/g, '[^/]*');

  const regex = new RegExp("^" + regexPattern + "$");

  function walk(dir, depth) {
    if (depth > 8 || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
      if (entry.name === "node_modules") continue;

      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(cwd, fullPath);

      if (regex.test(relative) || regex.test(entry.name)) {
        results.push({
          path: fullPath,
          relative,
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size: entry.isFile() ? fs.statSync(fullPath).size : null,
        });
      }

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  }

  try {
    walk(cwd, 0);
    return { success: true, pattern, count: results.length, results };
  } catch (e) {
    return { success: false, error: e.message, pattern };
  }
}

module.exports = {
  name: "file_search",
  description: "Glob pattern ile dosya/klasor arama. Hermes dosya arama motoru gibi. Default cwd arar.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (ornek: glob)" },
      basePath: { type: "string", description: "Aranacak dizin (default: cwd)" },
      maxResults: { type: "number", description: "Max sonuc (default 100)" },
    },
    required: ["pattern"],
  },
  async execute(params) {
    return await searchFiles(params);
  },
};
