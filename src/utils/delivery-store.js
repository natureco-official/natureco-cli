'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

class DeliveryStore {
  constructor(options = {}) {
    this.file = options.file || path.join(os.homedir(), '.natureco', 'delivery-queue.json');
    this.maxItems = options.maxItems || 10000;
  }

  load() {
    const data = readJsonSafeSync(this.file, { version: 1, queue: [], deadLetters: [] });
    return {
      version: 1,
      queue: Array.isArray(data.queue) ? data.queue.slice(0, this.maxItems) : [],
      deadLetters: Array.isArray(data.deadLetters) ? data.deadLetters.slice(-this.maxItems) : [],
    };
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeJsonAtomicSync(this.file, {
      version: 1,
      savedAt: new Date().toISOString(),
      queue: (state.queue || []).slice(0, this.maxItems),
      deadLetters: (state.deadLetters || []).slice(-this.maxItems),
    }, { mode: 0o600 });
  }
}

module.exports = { DeliveryStore };
