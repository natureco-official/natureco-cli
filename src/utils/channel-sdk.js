'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

function deliveryId(channel, target, payload, explicitKey) {
  if (explicitKey) return String(explicitKey);
  return crypto.createHash('sha256').update(`${channel}\0${target}\0${JSON.stringify(payload)}`).digest('hex').slice(0, 24);
}

class ChannelAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    if (!options.name) throw new Error('channel adapter name is required');
    this.name = options.name;
    this.connectFn = options.connect;
    this.disconnectFn = options.disconnect;
    this.sendFn = options.send;
    this.healthFn = options.health;
    this.state = 'disconnected';
    this.lastError = null;
    this.connectedAt = null;
  }

  async connect() {
    if (this.state === 'connected') return { ok: true, reused: true };
    this.state = 'connecting';
    try {
      if (this.connectFn) await this.connectFn();
      this.state = 'connected'; this.connectedAt = new Date().toISOString(); this.lastError = null;
      this.emit('state', this.state);
      return { ok: true };
    } catch (error) {
      this.state = 'degraded'; this.lastError = error.message; this.emit('state', this.state);
      return { ok: false, error: error.message };
    }
  }

  async disconnect() {
    try { if (this.disconnectFn) await this.disconnectFn(); } finally { this.state = 'disconnected'; this.emit('state', this.state); }
  }

  async send(delivery) {
    if (typeof this.sendFn !== 'function') throw new Error(`channel ${this.name} cannot send`);
    if (this.state !== 'connected') {
      const connected = await this.connect();
      if (!connected.ok) throw new Error(connected.error);
    }
    return this.sendFn(delivery);
  }

  async health() {
    try {
      const detail = this.healthFn ? await this.healthFn() : { ok: this.state === 'connected' };
      return { channel: this.name, state: this.state, connectedAt: this.connectedAt, lastError: this.lastError, ...detail };
    } catch (error) { return { channel: this.name, state: 'degraded', ok: false, error: error.message }; }
  }
}

class ChannelDeliveryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.adapters = new Map();
    this.queue = [];
    this.completed = new Map();
    this.inFlight = new Map();
    this.maxAttempts = options.maxAttempts || 4;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxCompleted = options.maxCompleted || 10000;
    this.sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.store = options.store || null;
    this.deadLetters = [];
    this.metrics = { enqueued: 0, delivered: 0, failed: 0, retried: 0, deduplicated: 0, byChannel: {} };
    if (this.store) {
      const persisted = this.store.load();
      this.queue = persisted.queue || [];
      this.deadLetters = persisted.deadLetters || [];
    }
  }

  register(adapter) { if (!(adapter instanceof ChannelAdapter)) throw new Error('ChannelAdapter required'); this.adapters.set(adapter.name, adapter); return adapter; }

  enqueue(channel, target, payload, options = {}) {
    const id = deliveryId(channel, target, payload, options.idempotencyKey);
    if (this.completed.has(id) || this.inFlight.has(id) || this.queue.some(item => item.id === id)) {
      this.metrics.deduplicated++; return { ok: true, id, duplicate: true };
    }
    const item = { id, channel, target, payload, attempt: 0, createdAt: new Date().toISOString(), metadata: options.metadata || {} };
    this.queue.push(item); this.metrics.enqueued++; this._channel(channel).enqueued++;
    this._persist();
    this.emit('queued', item);
    return { ok: true, id, duplicate: false };
  }

  async drain() {
    const results = [];
    while (this.queue.length) {
      const item = this.queue.shift();
      this._persist();
      results.push(await this._deliver(item));
    }
    return results;
  }

  async _deliver(item) {
    const adapter = this.adapters.get(item.channel);
    if (!adapter) return this._failure(item, `channel adapter not registered: ${item.channel}`);
    this.inFlight.set(item.id, item);
    while (item.attempt < this.maxAttempts) {
      item.attempt++;
      try {
        const result = await adapter.send(item);
        const record = { ok: true, id: item.id, attempts: item.attempt, result, deliveredAt: new Date().toISOString() };
        this.inFlight.delete(item.id); this.completed.set(item.id, record);
        while (this.completed.size > this.maxCompleted) this.completed.delete(this.completed.keys().next().value);
        this.metrics.delivered++; this._channel(item.channel).delivered++; this.emit('delivered', record);
        this._persist();
        return record;
      } catch (error) {
        item.lastError = error.message;
        if (item.attempt < this.maxAttempts) {
          this.metrics.retried++; this._channel(item.channel).retried++;
          await this.sleep(Math.min(this.baseDelayMs * (2 ** (item.attempt - 1)), 30000));
        }
      }
    }
    this.inFlight.delete(item.id);
    return this._failure(item, item.lastError || 'delivery failed');
  }

  _failure(item, error) {
    const record = { ok: false, id: item.id, attempts: item.attempt, error };
    this.deadLetters.push({ ...item, failedAt: new Date().toISOString(), error });
    if (this.deadLetters.length > 10000) this.deadLetters.shift();
    this.metrics.failed++; this._channel(item.channel).failed++; this.emit('failed', record); this._persist(); return record;
  }

  _channel(name) {
    if (!this.metrics.byChannel[name]) this.metrics.byChannel[name] = { enqueued: 0, delivered: 0, failed: 0, retried: 0 };
    return this.metrics.byChannel[name];
  }

  snapshotMetrics() { return JSON.parse(JSON.stringify({ ...this.metrics, queueDepth: this.queue.length, inFlight: this.inFlight.size })); }
  async health() { return Promise.all([...this.adapters.values()].map(adapter => adapter.health())); }
  _persist() { if (this.store) this.store.save({ queue: this.queue, deadLetters: this.deadLetters }); }
  requeueDeadLetter(id) {
    const index = this.deadLetters.findIndex(item => item.id === id);
    if (index === -1) return { ok: false, error: 'dead letter not found' };
    const [item] = this.deadLetters.splice(index, 1);
    item.attempt = 0; delete item.error; delete item.failedAt;
    this.queue.push(item); this._persist();
    return { ok: true, id };
  }
}

class ReconnectSupervisor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 60000;
    this.maxAttempts = options.maxAttempts ?? Infinity;
    this.jitter = options.jitter ?? 0.2;
    this.sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.random = options.random || Math.random;
    this.jobs = new Map();
    this.metrics = { attempts: 0, reconnected: 0, exhausted: 0, cancelled: 0 };
  }

  reconnect(adapter) {
    if (!(adapter instanceof ChannelAdapter)) return Promise.reject(new Error('ChannelAdapter required'));
    if (this.jobs.has(adapter.name)) return this.jobs.get(adapter.name).promise;
    const job = { cancelled: false, attempt: 0, promise: null };
    job.promise = this._run(adapter, job).finally(() => this.jobs.delete(adapter.name));
    this.jobs.set(adapter.name, job);
    return job.promise;
  }

  cancel(name) {
    const job = this.jobs.get(name);
    if (!job) return false;
    job.cancelled = true; this.metrics.cancelled++; this.emit('cancelled', { channel: name }); return true;
  }

  async _run(adapter, job) {
    while (!job.cancelled && job.attempt < this.maxAttempts) {
      job.attempt++; this.metrics.attempts++;
      if (job.attempt > 1) await this.sleep(this._delay(job.attempt - 1));
      if (job.cancelled) break;
      const result = await adapter.connect();
      this.emit('attempt', { channel: adapter.name, attempt: job.attempt, result });
      if (result.ok) {
        this.metrics.reconnected++; this.emit('reconnected', { channel: adapter.name, attempts: job.attempt });
        return { ok: true, channel: adapter.name, attempts: job.attempt };
      }
      // connect() leaves degraded state; reset so the next attempt calls connectFn.
      adapter.state = 'disconnected';
    }
    if (job.cancelled) return { ok: false, channel: adapter.name, stopped: 'cancelled', attempts: job.attempt };
    this.metrics.exhausted++; this.emit('exhausted', { channel: adapter.name, attempts: job.attempt });
    return { ok: false, channel: adapter.name, stopped: 'exhausted', attempts: job.attempt };
  }

  _delay(attempt) {
    const raw = Math.min(this.baseDelayMs * (2 ** Math.max(0, attempt - 1)), this.maxDelayMs);
    const spread = raw * this.jitter;
    return Math.max(0, Math.round(raw - spread + this.random() * spread * 2));
  }

  snapshotMetrics() { return { ...this.metrics, active: this.jobs.size }; }
}

module.exports = { ChannelAdapter, ChannelDeliveryManager, ReconnectSupervisor, deliveryId };
