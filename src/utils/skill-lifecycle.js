'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomicSync, writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

function validSkill(content) {
  return typeof content === 'string' && content.startsWith('---') && /\nname:\s*[^\n]+/.test(content) && /\ndescription:\s*[^\n]+/.test(content);
}

class SkillLifecycle {
  constructor(root) { this.root = root; }
  _dir(name) { return path.join(this.root, name); }
  _meta(name) { return path.join(this._dir(name), 'lifecycle.json'); }

  stage({ name, content, source = 'pattern', evidence = {} }) {
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) return { ok: false, error: 'invalid skill name' };
    if (!validSkill(content)) return { ok: false, error: 'invalid SKILL.md frontmatter' };
    const id = `candidate_${crypto.randomBytes(6).toString('hex')}`;
    return { ok: true, candidate: { id, name, content, source, evidence, status: 'candidate', createdAt: new Date().toISOString() } };
  }

  async promote(candidate, approval, validate = async () => ({ ok: true })) {
    if (!approval?.approved || !approval.userId) return { ok: false, error: 'explicit user approval required' };
    const validation = await validate(candidate);
    if (!validation?.ok) return { ok: false, error: 'skill validation failed', validation };
    const dir = this._dir(candidate.name);
    fs.mkdirSync(path.join(dir, 'versions'), { recursive: true });
    const meta = readJsonSafeSync(this._meta(candidate.name), { currentVersion: 0, versions: [] });
    const version = (meta.currentVersion || 0) + 1;
    const currentPath = path.join(dir, 'SKILL.md');
    if (fs.existsSync(currentPath) && meta.currentVersion) {
      writeFileAtomicSync(path.join(dir, 'versions', `${meta.currentVersion}.md`), fs.readFileSync(currentPath));
    }
    writeFileAtomicSync(currentPath, candidate.content);
    meta.currentVersion = version;
    meta.versions.push({ version, candidateId: candidate.id, source: candidate.source, evidence: candidate.evidence, approvedBy: approval.userId, approvedAt: new Date().toISOString(), validation });
    writeJsonAtomicSync(this._meta(candidate.name), meta, { mode: 0o600 });
    return { ok: true, name: candidate.name, version, path: currentPath, validation };
  }

  rollback(name, version, approval) {
    if (!approval?.approved || !approval.userId) return { ok: false, error: 'explicit user approval required' };
    const dir = this._dir(name);
    const source = path.join(dir, 'versions', `${version}.md`);
    if (!fs.existsSync(source)) return { ok: false, error: `version not found: ${version}` };
    const current = path.join(dir, 'SKILL.md');
    const meta = readJsonSafeSync(this._meta(name), { currentVersion: 0, versions: [] });
    if (fs.existsSync(current) && meta.currentVersion) writeFileAtomicSync(path.join(dir, 'versions', `${meta.currentVersion}.md`), fs.readFileSync(current));
    writeFileAtomicSync(current, fs.readFileSync(source));
    meta.currentVersion = version;
    meta.rollback = { toVersion: version, approvedBy: approval.userId, at: new Date().toISOString() };
    writeJsonAtomicSync(this._meta(name), meta, { mode: 0o600 });
    return { ok: true, name, version, path: current };
  }
}

module.exports = { SkillLifecycle, validSkill };
