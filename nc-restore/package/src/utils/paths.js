/**
 * paths.js — Path helper utilities (v5.2.0)
 *
 * Tum tool'larda ~/Desktop/test.txt gibi path'leri dogru handle etmek icin.
 * Parton'un gercek testinde "File does not exist" bug'i duzeltildi.
 */

const os = require("os");
const path = require("path");

/**
 * Path'i normalize et ve ~/ expansion yap.
 * Mac/Windows/Linux'ta calisir.
 *
 * Ornek:
 *   expandPath("~/Desktop/test.txt") -> "/Users/gencay/Desktop/test.txt"
 *   expandPath("~")                  -> "/Users/gencay"
 *   expandPath("/tmp/x")             -> "/tmp/x"
 *   expandPath("Downloads/x.txt")    -> "<cwd>/Downloads/x.txt"
 */
function expandPath(inputPath) {
  if (!inputPath) return inputPath;
  let p = String(inputPath);

  // ~ veya ~/foo -> home + foo
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }

  // Zaten absolut ise dokunma
  if (path.isAbsolute(p)) return p;

  // Relative ise cwd'ye gore resolve
  return path.resolve(process.cwd(), p);
}

function isValidPath(p) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (p.includes("\0")) return false; // null byte
  return true;
}

/**
 * Path icin shell-safe quote (Parton'un "Downloads/adsiz klasor" gibi yollari icin)
 * shlex.quote kullaniyor — universal
 */
function quotePath(p) {
  if (!p) return p;
  const { execSync } = require("child_process");
  // shlex.quote Python'dan cagiriliyor cunku Node'da yok
  // Veya: bash -c 'echo $1' ile quote edilmis halini al
  try {
    // macOS/Unix: shlex.quote'a benzer sekilde single-quote wrap
    if (/^[\w\-\.\/=]+$/.test(p)) return p; // guvenli karakterler
    return `'${p.replace(/'/g, "'\\''")}'`;
  } catch {
    return p;
  }
}

module.exports = { expandPath, isValidPath, quotePath };