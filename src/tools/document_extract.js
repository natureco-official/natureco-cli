const fs = require('fs');
const { expandPath } = require('../utils/paths');
const path = require('path');
const { execSync } = require('child_process');

module.exports = {
  name: 'document_extract',
  description: 'Extract text content from local documents (PDF, DOCX, TXT, CSV, JSON, MD, RTF, ODT)',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to extract text from' },
      maxChars: { type: 'number', description: 'Maximum characters to return (default: 50000)', default: 50000 }
    },
    required: ['path']
  },

  async execute(params) {
    try {
      const filePath = path.resolve(expandPath(params.path));
      const maxChars = params.maxChars || 50000;

      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Dosya bulunamadı: ${filePath}` };
      }

      const stats = fs.statSync(filePath);
      if (stats.size > 50 * 1024 * 1024) {
        return { success: false, error: 'Dosya çok büyük (max 50MB)' };
      }

      const ext = path.extname(filePath).toLowerCase();
      let text = '';

      if (ext === '.txt' || ext === '.csv' || ext === '.json' || ext === '.md' || ext === '.xml' || ext === '.yaml' || ext === '.yml') {
        text = fs.readFileSync(filePath, 'utf-8');
      } else if (ext === '.pdf') {
        try {
          text = execSync(`pdftotext "${filePath}" -`, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] });
        } catch {
          // Fallback: read raw PDF extract
          const raw = fs.readFileSync(filePath, 'utf-8');
          const matches = raw.match(/\((.*?)\)/g);
          text = (matches || []).map(m => m.slice(1, -1)).filter(s => s.length > 3).join(' ');
        }
      } else if (ext === '.docx') {
        try {
          const zip = require('../utils/zip-reader');
          text = await zip.readText(filePath);
        } catch {
          return { success: false, error: 'DOCX okuma hatası. npm install adm-zip gerekli olabilir.' };
        }
      } else if (ext === '.rtf' || ext === '.odt') {
        const raw = fs.readFileSync(filePath, 'utf-8');
        text = raw.replace(/<[^>]+>/g, ' ').replace(/\\[a-z]+|\{[^}]*\}|[{}]/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        // Fallback: read as text
        text = fs.readFileSync(filePath, 'utf-8');
      }

      const cleaned = text
        .replace(/\r\n/g, '\n')
        .replace(/\x00/g, '')
        .trim();

      const truncated = cleaned.length > maxChars
        ? cleaned.slice(0, maxChars) + '...'
        : cleaned;

      return {
        success: true,
        path: filePath,
        extension: ext,
        fileSize: stats.size,
        content: truncated,
        wordCount: cleaned.split(/\s+/).length,
        totalChars: cleaned.length,
        truncated: cleaned.length > maxChars,
        source: 'document_extract'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
