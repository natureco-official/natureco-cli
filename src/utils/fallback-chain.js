/**
 * fallback-chain — Multi-model fallback chain (3 models max)
 *
 * Config:
 *   "models": ["gpt-4", "claude-3", "gemini-pro"]
 *   "fallback": {
 *     "enabled": true,
 *     "onError": true,
 *     "onRateLimit": true,
 *     "onTimeout": true
 *   }
 *
 * Returns which model to use for each turn, rotating through the chain
 * when errors occur.
 */

class FallbackChain {
  constructor() {
    this.models = [];
    this.currentIndex = 0;
    this.config = { onError: true, onRateLimit: true, onTimeout: true };
    this.fallbacksUsed = 0;
    this.history = [];
  }

  configure(models, config = {}) {
    this.models = Array.isArray(models) ? models.filter(Boolean) : [];
    this.currentIndex = 0;
    this.fallbacksUsed = 0;
    this.config = { ...this.config, ...config };
    this.history = [];
  }

  get current() {
    return this.models[this.currentIndex] || null;
  }

  get hasFallback() {
    return this.currentIndex < this.models.length - 1;
  }

  get remaining() {
    return Math.max(0, this.models.length - this.currentIndex - 1);
  }

  get list() {
    return [...this.models];
  }

  recordError(model, error) {
    this.history.push({ model, error: error.message || String(error), at: Date.now() });
    if (this.hasFallback) {
      this.currentIndex++;
      this.fallbacksUsed++;
      return { fallback: true, nextModel: this.current, from: model };
    }
    return { fallback: false, nextModel: null, from: model };
  }

  reset() {
    this.currentIndex = 0;
    this.fallbacksUsed = 0;
  }
}

let _instance = null;
function getFallbackChain() {
  if (!_instance) _instance = new FallbackChain();
  return _instance;
}

module.exports = { FallbackChain, getFallbackChain };
