#!/usr/bin/env node
/**
 * NatureCo CLI - Kurulum Sonrasi Doctor
 */

const { execSync } = require('child_process');

try {
  const result = execSync('node ' + require('path').join(__dirname, '..', 'bin', 'natureco.js') + ' doctor --auto-fix', { stdio: 'inherit' });
  process.exit(0);
} catch (e) {
  console.log('Doctor hatasi. Manuel: natureco doctor');
  process.exit(1);
}
