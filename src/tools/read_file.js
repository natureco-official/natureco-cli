const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  name: 'read_file',
  description: 'PRIMARY TOOL: Read a specific file content. Use this when user wants to read/view/look at a single file. For listing directories use filesystem tool.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read'
      }
    },
    required: ['path']
  },
  
  async execute(params) {
    try {
      // v5.2.0: Robust path expansion (~, ~/, relative)
      const { expandPath } = require('../utils/paths');
      const filePath = expandPath(params.path);
      
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'File does not exist'
        };
      }
      
      const stats = fs.statSync(filePath);
      
      if (!stats.isFile()) {
        return {
          success: false,
          error: 'Path is not a file'
        };
      }
      
      // Check file size - if > 1MB, read only first 50KB
      if (stats.size > 1024 * 1024) {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(50000);
        fs.readSync(fd, buf, 0, 50000, 0);
        fs.closeSync(fd);
        
        const content = '[Büyük dosya - ilk ~50KB gösteriliyor]\n' + buf.toString('utf8');
        
        return {
          success: true,
          path: filePath,
          content,
          size: stats.size,
          truncated: true
        };
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      
      return {
        success: true,
        path: filePath,
        content,
        size: stats.size,
        truncated: false
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
