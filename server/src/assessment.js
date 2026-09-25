// Расчёт готовности к проверке. Чистые функции без ввода-вывода — их проверяют unit-тесты.

export const ANSWERS = ['yes', 'no', 'unknown'];
export const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function fineRange(item, legalForm) {
  const range = item.fine?.[legalForm === 'org' ? 'org' : 'ip'];
  return Array.isArray(range) ? { min: range[0], max: range[1] } : null;
}

/**
 * @param {object[]} items применимые требования
 * @param {Record<string, {answer: string}>} answers ответы по id требования
 * @param {'ip'|'org'} legalForm
 */
export function computeReport(items, answers, legalForm) {
  let totalWeight = 0;
  let okWeight = 0;
  const counts = { yes: 0, no: 0, unknown: 0, pending: 0 };
  const problems = [];
  const sections = {};
  let fineMin = 0;
  let fineMax = 0;
  let finesWithoutAmount = 0;

  for (const item of items) {
    const weight = SEVERITY_WEIGHT[item.severity];
    const answer = answers[item.id]?.answer;
    totalWeight += weight;
    const section = (sections[item.section] ??= { total: 0, ok: 0, problems: 0 });
    section.total += 1;

    if (answer === 'yes') {
      okWeight += weight;
      counts.yes += 1;
      section.ok += 1;
      continue;
    }
    if (answer !== 'no' && answer !== 'unknown') {
      counts.pending += 1;
      continue;
    }
    counts[answer] += 1;
    section.problems += 1;
    const fine = fineRange(item, legalForm);
    if (fine) {
      fineMin += fine.min;
      fineMax += fine.max;
    } else {
      finesWithoutAmount += 1;
    }
    problems.push({
      itemId: item.id,
      answer,
      section: item.section,
      severity: item.severity,
      question: item.question,
      fix: item.fix,
      fixDays: item.fixDays,
      basis: item.basis,
      authority: item.authority,
      fineArticle: item.fine?.article || null,
      fine,
    });
  }

  problems.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.fixDays - b.fixDays,
  );

  const readiness = totalWeight ? Math.round((okWeight / totalWeight) * 100) : 0;
  const criticalOpen = problems.filter((p) => p.severity === 'high').length;
  let level;
  if (counts.pending > 0) level = 'incomplete';
  else if (readiness >= 85 && criticalOpen === 0) level = 'ready';
  else if (readiness >= 60) level = 'risks';
  else level = 'high_risk';

  return {
    readiness,
    level,
    counts,
    total: items.length,
    criticalOpen,
    fines: { min: fineMin, max: fineMax, withoutAmount: finesWithoutAmount },
    sections,
    problems,
  };
}

export const LEVEL_TITLES = {
  incomplete: 'Проверка не завершена',
  ready: 'Готов к проверке',
  risks: 'Есть риски',
  high_risk: 'Высокий риск штрафов',
};

/** План исправлений: задача на каждое нарушение или неизвестный пункт. */
export function buildPlan(problems, now = Date.now()) {
  return problems.map((p) => ({
    itemId: p.itemId,
    dueAt: now + p.fixDays * DAY_MS,
  }));
}

/** Когда напомнить о задаче: за сутки до срока (но не раньше чем через час) или через N секунд в демо-режиме. */
export function firstReminderAt(dueAt, now = Date.now(), demoSeconds = 0) {
  if (demoSeconds > 0) return now + demoSeconds * 1000;
  return Math.max(dueAt - DAY_MS, now + 60 * 60 * 1000);
}

export function formatRub(value) {
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}
