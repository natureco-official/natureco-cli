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
      const filePath = path.resolve(params.path);
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
