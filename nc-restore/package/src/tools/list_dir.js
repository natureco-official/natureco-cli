const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * List Directory Tool
 * Lists files and directories in a given path
 */

module.exports = {
  name: 'list_dir',
  description: 'List files and directories in a given path. Returns file names, sizes, and types.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (relative or absolute). Use "." for current directory.'
      }
    },
    required: ['path']
  },
  
  async execute(params) {
    try {
      // Expand ~ to home directory
      let dirPath = params.path || '.';
      dirPath = dirPath.replace(/^~/, os.homedir());
      
      // Fix /home path - replace with actual home directory (Unix only)
      // Handles: /home, home, /home/Documents, /home/anything
      if (process.platform !== 'win32') {
        if (dirPath === '/home' || dirPath === 'home' || dirPath.startsWith('/home/')) {
          dirPath = dirPath.replace(/^\/home/, os.homedir());
        }
      }
      
      const absolutePath = path.resolve(dirPath);
      
      // Check if directory exists
      if (!fs.existsSync(absolutePath)) {
        return {
          success: false,
          error: `Directory not found: ${params.path}`
        };
      }
      
      // Check if it's a directory
      const stats = fs.statSync(absolutePath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Not a directory: ${params.path}`
        };
      }
      
      // Read directory
      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
      
      // Format entries
      const items = entries.map(entry => {
        const itemPath = path.join(absolutePath, entry.name);
        let size = 0;
        let type = 'unknown';
        
        try {
          const itemStats = fs.statSync(itemPath);
          size = itemStats.size;
          
          if (entry.isDirectory()) {
            type = 'directory';
          } else if (entry.isFile()) {
            type = 'file';
          } else if (entry.isSymbolicLink()) {
            type = 'symlink';
          }
        } catch (err) {
          // Ignore stat errors
        }
        
        return {
          name: entry.name,
          type: type,
          size: size
        };
      });
      
      // Sort: directories first, then files
      items.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Format output
      let output = `Directory: ${absolutePath}\n`;
      output += `Total items: ${items.length}\n\n`;
      
      items.forEach(item => {
        const typeIcon = item.type === 'directory' ? '📁' : '📄';
        const sizeStr = item.type === 'file' ? ` (${formatSize(item.size)})` : '';
        output += `${typeIcon} ${item.name}${sizeStr}\n`;
      });
      
      return {
        success: true,
        output: output,
        items: items,
        path: absolutePath
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
