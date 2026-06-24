const listDir = require('./list_dir');

module.exports = {
  ...listDir,
  name: 'filesystem',
  description: 'List files and directories',
};
