const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to write'
      },
      content: {
        type: 'string',
        description: 'Content to write'
      }
    },
    required: ['path', 'content']
  },
  
  async execute(params) {
    try {
      // v5.6.22: ~ expansion fix
      let rawPath = params.path;
      if (rawPath && rawPath.startsWith('~')) {
        rawPath = path.join(require('os').homedir(), rawPath.slice(1));
      }
      const filePath = path.resolve(rawPath);

      // GÜVENLİK (v5.51.1): paketin kendi kaynak koduna yazma varsayılan kapalı;
      // kanal kaynaklı çağrılarda koşulsuz red. Bkz. src/utils/self-edit-guard.js
      const guard = require('../utils/self-edit-guard').checkSelfEdit(filePath);
      if (!guard.allowed) {
        return { success: false, error: guard.error, reason: guard.reason, path: filePath };
      }

      const dir = path.dirname(filePath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, params.content, 'utf-8');
      
      const stats = fs.statSync(filePath);
      
      return {
        success: true,
        output: `Dosya başarıyla yazıldı: ${filePath} (${stats.size} bytes)`,
        path: filePath,
        size: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
