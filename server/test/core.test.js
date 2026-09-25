import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeReport, firstReminderAt } from '../src/assessment.js';
import { signInitData, validateInitData, InitDataError } from '../src/auth.js';
import { applicableItems, loadCatalog } from '../src/catalog.js';

const catalog = loadCatalog();
const TOKEN = 'test-token';

test('справочник валиден и фильтруется по профилю', () => {
  const solo = applicableItems(catalog, { activity: 'cafe', legalForm: 'ip', hasStaff: false, flags: { alcohol: false } });
  const team = applicableItems(catalog, { activity: 'cafe', legalForm: 'ip', hasStaff: true, flags: { alcohol: true } });
  assert.ok(solo.length < team.length);
  assert.ok(!solo.some((i) => i.id === 'cafe-medbooks'));
  assert.ok(team.some((i) => i.id === 'cafe-alcohol'));
  assert.deepEqual(applicableItems(catalog, { activity: 'unknown' }), []);
});

test('отчёт: готовность, штрафы и приоритет нарушений', () => {
  const items = applicableItems(catalog, { activity: 'cafe', legalForm: 'org', hasStaff: true, flags: {} });
  const answers = Object.fromEntries(items.map((i) => [i.id, { answer: 'yes' }]));
  assert.equal(computeReport(items, answers, 'org').readiness, 100);
  assert.equal(computeReport(items, answers, 'org').level, 'ready');

  answers['cafe-info'] = { answer: 'no' };
  answers['cafe-evac'] = { answer: 'unknown' };
  const report = computeReport(items, answers, 'org');
  assert.equal(report.counts.no, 1);
  assert.equal(report.counts.unknown, 1);
  assert.equal(report.problems[0].itemId, 'cafe-evac', 'высокая критичность идёт первой');
  assert.equal(report.fines.max, 10000 + 400000);
  assert.notEqual(report.level, 'ready', 'открытое критичное нарушение не даёт статус «готов»');

  delete answers['cafe-kkt'];
  assert.equal(computeReport(items, answers, 'org').level, 'incomplete');
});

test('напоминание: за сутки до срока, не раньше часа; демо-режим', () => {
  const now = 1_000_000_000_000;
  const day = 86_400_000;
  assert.equal(firstReminderAt(now + 7 * day, now), now + 6 * day);
  assert.equal(firstReminderAt(now + day / 2, now), now + 3_600_000);
  assert.equal(firstReminderAt(now + 7 * day, now, 60), now + 60_000);
});

test('initData: корректная подпись принимается, подделка отклоняется', () => {
  const authDate = Math.floor(Date.now() / 1000);
  const initData = signInitData(
    { auth_date: String(authDate), query_id: 'q1', user: JSON.stringify({ id: 42, first_name: 'Анна' }) },
    TOKEN,
  );
  const user = validateInitData(initData, TOKEN);
  assert.equal(user.id, 42);
  assert.equal(user.name, 'Анна');

  const forged = initData.replace('%22id%22%3A42', '%22id%22%3A43');
  assert.throws(() => validateInitData(forged, TOKEN), InitDataError);
  assert.throws(() => validateInitData(initData, 'other-token'), InitDataError);

  const old = signInitData({ auth_date: String(authDate - 3 * 86400), user: JSON.stringify({ id: 1 }) }, TOKEN);
  assert.throws(() => validateInitData(old, TOKEN, { maxAgeSeconds: 86400 }), /истёк/);
});
