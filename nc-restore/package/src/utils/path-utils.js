const os = require('os');

function normalizeWindowsPaths(str) {
  let result = str.replace(/\\/g, '/');

  const homeDir = os.homedir().replace(/\\/g, '/');

  // Replace any Windows user profile path with actual homedir
  result = result.replace(/[A-Za-z]:\/Users\/[^/]+\//g, `${homeDir}/`);

  // Replace bare drive-letter references pointing to .openclaw
  result = result.replace(/[A-Za-z]:\/\.openclaw\//g, `${homeDir}/.natureco/`);

  // Migrate .openclaw paths to .natureco
  result = result.replace(/\.openclaw\//g, '.natureco/');

  // Normalize mixed path separators
  result = result.replace(/workspace\/scripts\\/g, 'workspace/scripts/');

  return result;
}

module.exports = { normalizeWindowsPaths };
