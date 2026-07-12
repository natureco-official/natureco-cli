'use strict';

const path = require('path');
const os = require('os');

const SENSITIVE_READ = [
  /(^|[\\/])\.ssh[\\/]/i, /id_rsa|id_ed25519|id_ecdsa|id_dsa/i,
  /\.pem$|\.ppk$|\.key$/i, /(^|[\\/])\.aws[\\/]/i,
  /gcloud[\\/].*(credential|token)/i, /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i, /\.natureco[\\/]config\.json$/i,
  /(^|[\\/])\.netrc$/i,
];
const SENSITIVE_WRITE = [
  ...SENSITIVE_READ,
  /(^|[\\/])authorized_keys$/i, /System32[\\/]drivers[\\/]etc/i,
  /\.aws[\\/]credentials/i,
  /^[/\\](etc|usr|bin|sbin|boot|sys)[\\/]/i,
  /(^|[\\/])etc[\\/](passwd|shadow|sudoers|hosts|crontab|ssh)/i,
];

function expandPath(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const trimmed = value.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function assessToolPath(toolName, args = {}) {
  const rawPath = args.path || args.filePath || args.file_path;
  if (!rawPath) return { allowed: true };
  const targetPath = expandPath(rawPath);
  const write = toolName === 'write_file' || toolName === 'edit_file' || toolName === 'structural_patch';
  const read = toolName === 'read_file';
  if (!write && !read) return { allowed: true, path: targetPath };
  const patterns = write ? SENSITIVE_WRITE : SENSITIVE_READ;
  if (patterns.some(pattern => pattern.test(targetPath))) {
    return {
      allowed: false,
      path: targetPath,
      reason: `Hassas dosya yolu güvenlik politikasıyla engellendi: ${targetPath}`,
    };
  }
  return { allowed: true, path: targetPath };
}

module.exports = { assessToolPath, expandPath, SENSITIVE_READ, SENSITIVE_WRITE };
