"use strict";
const { Store } = require("express-session");
const { randomUUID } = require("node:crypto");
const { hash, token } = require("./security");

// Development only. A durable adapter must preserve atomic takeFlow/upsertUser
// and family revocation across processes, with unique identity constraints.
class MemoryAuthStore extends Store {
  constructor({ now = Date.now, capacity = 2000 } = {}) {
    super();
    this.kind = "memory";
    this.now = now;
    this.capacity = capacity;
    this.sessions = new Map();
    this.flows = new Map();
    this.families = new Map();
    this.users = new Map();
    this.identities = new Map();
    this.timer = setInterval(() => this.prune(), 30000);
    this.timer.unref();
  }
  close() { clearInterval(this.timer); }
  prune() {
    const now = this.now();
    for (const map of [this.sessions, this.flows, this.families]) {
      for (const [key, row] of map) if (row.expiresAt <= now) map.delete(key);
    }
  }
  space(map) { this.prune(); if (map.size >= this.capacity) throw new Error("Storage capacity reached"); }
  get(sid, cb) {
    this.prune();
    const row = this.sessions.get(hash(sid));
    cb(null, row ? structuredClone(row.value) : null);
  }
  set(sid, value, cb) {
    Promise.resolve().then(async () => {
      if (!this.sessions.has(hash(sid))) this.space(this.sessions);
      // A stale response cannot resurrect a revoked authentication family.
      if (value.family && !await this.familyActive(value.family)) return cb(null);
      this.sessions.set(hash(sid), { value: structuredClone(value), expiresAt: Math.min(new Date(value.cookie.expires).getTime(), value.deadline) });
      cb(null);
    }).catch(cb);
  }
  touch(sid, value, cb) {
    if (this.sessions.has(hash(sid))) this.set(sid, value, cb);
    else cb(null);
  }
  destroy(sid, cb) { this.sessions.delete(hash(sid)); cb(null); }
  async newFamily(expiresAt) { this.space(this.families); const id = token(); this.families.set(id, { expiresAt }); return id; }
  async familyActive(id) { const row = this.families.get(id); return Boolean(row && row.expiresAt > this.now()); }
  async extendFamily(id, expiresAt) { if (!await this.familyActive(id)) throw new Error("Session revoked"); this.families.get(id).expiresAt = expiresAt; }
  async revokeFamily(id) {
    this.families.delete(id);
    for (const [key, row] of this.sessions) if (row.value.family === id) this.sessions.delete(key);
    for (const [key, row] of this.flows) if (row.family === id) this.flows.delete(key);
  }
  async putFlow(state, row) {
    this.space(this.flows);
    // One live attempt per browser; a second tab explicitly replaces the first.
    for (const [key, value] of this.flows) if (value.binding === row.binding) this.flows.delete(key);
    this.flows.set(hash(state), structuredClone(row));
  }
  async takeFlow(state, binding) {
    this.prune();
    const key = hash(state), row = this.flows.get(key);
    if (!row || row.binding !== binding || !await this.familyActive(row.family) || this.flows.get(key) !== row) return null;
    this.flows.delete(key); // Atomic before any provider I/O: fail closed on uncertain exchange.
    return row;
  }
  async upsertUser(namespace, subject, displayName) {
    const key = namespace + ":" + subject;
    const existing = this.identities.get(key);
    if (existing) return structuredClone(this.users.get(existing));
    this.space(this.users);
    const user = { id: randomUUID(), role: "parent", displayName };
    this.users.set(user.id, user);
    this.identities.set(key, user.id);
    return structuredClone(user);
  }
  async getUser(id) { return structuredClone(this.users.get(id) || null); }
}
module.exports = { MemoryAuthStore };
