// Сквозной тест API: профиль → проверка → ответы → отчёт → задачи.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../src/api.js';
import { signInitData } from '../src/auth.js';
import { loadCatalog } from '../src/catalog.js';
import { openDb } from '../src/db.js';
import { Service } from '../src/service.js';

const TOKEN = 'test-token';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gkp-'));
const config = {
  botToken: TOKEN,
  botEnabled: false,
  initDataMaxAge: 86400,
  devAuth: false,
  uploadsDir: path.join(tmp, 'uploads'),
  webDir: path.join(tmp, 'no-web'),
  reminderDemoSeconds: 0,
};
const sent = [];
const notifier = { checkCompleted: async (uid, report) => sent.push({ uid, report }) };
const service = new Service({ db: openDb(':memory:'), catalog: loadCatalog(), config });
const logger = { error() {}, warn() {}, info() {} };
let server;
let base;

const auth = (id) =>
  signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Тест' }) }, TOKEN);

async function call(method, url, body, user = 7) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'X-Max-Init-Data': auth(user) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  server = createApp({ service, config, notifier, logger }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

test('без подписи initData доступ запрещён', async () => {
  const res = await call('GET', '/me', null, null);
  assert.equal(res.status, 401);
  assert.equal((await call('GET', '/health', null, null)).status, 200);
});

test('полный сценарий самопроверки', async () => {
  assert.equal((await call('POST', '/checks')).status, 409, 'без профиля проверку не начать');
  assert.equal((await call('PUT', '/profile', { legalForm: 'xx', activity: 'cafe' })).status, 400);

  const profile = await call('PUT', '/profile', { legalForm: 'ip', activity: 'cafe', hasStaff: false, flags: { alcohol: false } });
  assert.equal(profile.status, 200);

  const started = await call('POST', '/checks');
  assert.equal(started.status, 201);
  const check = started.body;
  assert.ok(check.items.length > 5);

  const early = await call('POST', `/checks/${check.id}/complete`);
  assert.equal(early.status, 409, 'нельзя завершить, пока есть неотвеченные вопросы');

  for (const [i, item] of check.items.entries()) {
    const answer = i === 0 ? 'no' : i === 1 ? 'unknown' : 'yes';
    const res = await call('PUT', `/checks/${check.id}/answers/${item.id}`, { answer });
    assert.equal(res.status, 200);
  }
  assert.equal((await call('PUT', `/checks/${check.id}/answers/${check.items[0].id}`, { answer: 'maybe' })).status, 400);

  // чужой пользователь не видит проверку
  assert.equal((await call('GET', `/checks/${check.id}/report`, null, 999)).status, 404);

  const report = await call('POST', `/checks/${check.id}/complete`);
  assert.equal(report.status, 200);
  assert.equal(report.body.initial.counts.no, 1);
  assert.equal(report.body.problems.length, 2);
  assert.equal(sent.length, 1, 'отчёт отправлен в чат');

  const again = await call('POST', `/checks/${check.id}/complete`);
  assert.equal(again.status, 200);
  assert.equal(sent.length, 1, 'повторное завершение идемпотентно');

  const tasks = await call('GET', '/tasks');
  assert.equal(tasks.body.tasks.length, 2);
  const done = await call('PATCH', `/tasks/${tasks.body.tasks[0].id}`, { status: 'done' });
  assert.equal(done.body.status, 'done');

  const updated = await call('GET', `/checks/${check.id}/report`);
  assert.ok(updated.body.readiness > updated.body.initial.readiness, 'готовность растёт после исправления');

  const locked = await call('PUT', `/checks/${check.id}/answers/${check.items[0].id}`, { answer: 'yes' });
  assert.equal(locked.status, 409);
});
