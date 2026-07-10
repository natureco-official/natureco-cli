/**
 * GÜVENLİK (v5.51.1): edit_file onay atlaması + kendi-kaynağını-düzenleme kısıtı.
 *
 * Açık: tool-runner'ın needsConfirm kontrolü write_file için diff+onay isterken
 * edit_file'ı KAPSAMIYORDU → aynı riski taşıyan hedefli dosya değişikliği hiç
 * onaysız geçiyordu. SELF.md "kendini onar" protokolü + Tek Beyin (kanallara
 * terminal-eşdeğeri araç erişimi) birleşince: prompt injection ile paket kaynak
 * kodu gözetimsiz değiştirilebilirdi. Bu testler üç garantiyi kilitler:
 *   1) edit_file onay kapsamında,
 *   2) paket kaynak koduna yazma varsayılan olarak KAPALI (opt-in bayrak),
 *   3) kanal kaynaklı çağrılarda bayrak açık olsa bile KOŞULSUZ red.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import toolRunner from '../../src/utils/tool-runner.js';
import editFile from '../../src/tools/edit_file.js';
import writeFile from '../../src/tools/write_file.js';

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const SELF_DIR = path.join(PKG_ROOT, '.tmp-selfedit-test');
const SELF_FILE = path.join(SELF_DIR, 'hedef.txt');
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-selfedit-'));
const OUT_FILE = path.join(OUT_DIR, 'serbest.txt');

function cleanEnv() {
  delete process.env.NATURECO_ALLOW_SELF_EDIT;
  delete process.env.NATURECO_CHANNEL_ORIGIN;
}

beforeEach(() => {
  cleanEnv();
  fs.mkdirSync(SELF_DIR, { recursive: true });
  fs.writeFileSync(SELF_FILE, 'eski icerik satiri\n', 'utf8');
  fs.writeFileSync(OUT_FILE, 'eski icerik satiri\n', 'utf8');
});

afterEach(() => {
  cleanEnv();
  try { fs.rmSync(SELF_DIR, { recursive: true, force: true }); } catch {}
});

describe('1) needsConfirmation — edit_file onay kapsamında', () => {
  it('edit_file ve write_file onay ister; read_file istemez', () => {
    const needs = toolRunner.needsConfirmation;
    expect(typeof needs, 'needsConfirmation export edilmeli (test edilebilirlik)').toBe('function');
    expect(needs('edit_file', { path: 'x', old_string: 'a', new_string: 'b' })).toBe(true);
    expect(needs('write_file', { path: 'x', content: 'y' })).toBe(true);
    expect(needs('read_file', { path: 'x' })).toBe(false);
    expect(needs('bash', { command: 'rm -rf temp' })).toBe(true);
    expect(needs('bash', { command: 'ls' })).toBe(false);
  });
});

describe('2) kendi-kaynağını-düzenleme — varsayılan KAPALI, bayrakla açılır', () => {
  it('paket kökü altındaki dosyada edit_file bayraksız REDDEDİLİR', async () => {
    const r = await editFile.execute({ path: SELF_FILE, old_string: 'eski', new_string: 'yeni' });
    expect(r.success).toBe(false);
    expect(String(r.error)).toMatch(/NATURECO_ALLOW_SELF_EDIT|kaynak kod/i);
    // dosya DEĞİŞMEMİŞ olmalı
    expect(fs.readFileSync(SELF_FILE, 'utf8')).toContain('eski icerik');
  });

  it('paket kökü altındaki dosyada write_file bayraksız REDDEDİLİR', async () => {
    const r = await writeFile.execute({ path: SELF_FILE, content: 'ezildi' });
    expect(r.success).toBe(false);
    expect(fs.readFileSync(SELF_FILE, 'utf8')).toContain('eski icerik');
  });

  it('NATURECO_ALLOW_SELF_EDIT=1 ile bilinçli açılınca edit_file çalışır', async () => {
    process.env.NATURECO_ALLOW_SELF_EDIT = '1';
    const r = await editFile.execute({ path: SELF_FILE, old_string: 'eski', new_string: 'yeni' });
    expect(r.success).toBe(true);
    expect(fs.readFileSync(SELF_FILE, 'utf8')).toContain('yeni icerik');
  });

  it('paket DIŞI dosyalar bayraksız da serbesttir (normal işlev bozulmaz)', async () => {
    const r = await editFile.execute({ path: OUT_FILE, old_string: 'eski', new_string: 'yeni' });
    expect(r.success).toBe(true);
  });
});

describe('3) kanal kaynaklı çağrı — bayrak açık olsa bile paket kaynağına ASLA yazamaz', () => {
  it('NATURECO_CHANNEL_ORIGIN=1 iken allowSelfEdit bayrağı YOK SAYILIR', async () => {
    process.env.NATURECO_CHANNEL_ORIGIN = '1';
    process.env.NATURECO_ALLOW_SELF_EDIT = '1'; // trusted+bayrak bile olsa
    const e = await editFile.execute({ path: SELF_FILE, old_string: 'eski', new_string: 'yeni' });
    const w = await writeFile.execute({ path: SELF_FILE, content: 'ezildi' });
    expect(e.success).toBe(false);
    expect(w.success).toBe(false);
    expect(fs.readFileSync(SELF_FILE, 'utf8')).toContain('eski icerik');
  });

  it('kanal kaynağında paket DIŞI dosya yine düzenlenebilir (özellik korunur)', async () => {
    process.env.NATURECO_CHANNEL_ORIGIN = '1';
    const r = await editFile.execute({ path: OUT_FILE, old_string: 'eski', new_string: 'yeni' });
    expect(r.success).toBe(true);
  });

  it('channel-brain (runBrain) kanal-kaynağı işaretini koyar', async () => {
    const brain = (await import('../../src/utils/channel-brain.js')).default;
    delete process.env.NATURECO_CHANNEL_ORIGIN;
    await brain.runBrain(
      { channel: 'testsec', chatKey: 'c1', text: 'merhaba' },
      { workflow: { execute: async () => ({ success: true, passthrough: true, reply: 'ok' }) }, getConfig: () => ({ botName: 'T' }) }
    );
    expect(process.env.NATURECO_CHANNEL_ORIGIN).toBe('1');
    try { fs.unlinkSync(path.join(os.homedir(), '.natureco', 'channel-history', 'testsec_c1.json')); } catch {}
  });
});
