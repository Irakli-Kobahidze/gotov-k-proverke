// Тексты сообщений чат-бота (формат HTML MAX).
import { LEVEL_TITLES, formatRub } from '../assessment.js';

export function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SEVERITY_ICON = { high: '🔴', medium: '🟠', low: '🟡' };
const SEVERITY_TITLE = { high: 'высокая', medium: 'средняя', low: 'низкая' };
const LEVEL_ICON = { ready: '🟢', risks: '🟠', high_risk: '🔴', incomplete: '⚪️' };
const ANSWER_TITLE = { yes: '✅ Да', no: '❌ Нет', unknown: '❓ Не знаю' };

export function progressBar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export function formatDate(ms, timeZone = 'Europe/Moscow') {
  return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone });
}

export function fineText(fines) {
  if (!fines.max && !fines.withoutAmount) return 'нет';
  const parts = [];
  if (fines.max) parts.push(fines.min === fines.max ? formatRub(fines.max) : `от ${formatRub(fines.min)} до ${formatRub(fines.max)}`);
  if (fines.withoutAmount) parts.push(`ещё ${fines.withoutAmount} п. с особыми санкциями`);
  return parts.join(', ');
}

export function welcome(name, hasApp) {
  return [
    `Здравствуйте${name ? `, ${esc(name)}` : ''}! Я — <b>«Готов к проверке»</b>.`,
    '',
    'Помогаю владельцам кафе и салонов красоты подготовиться к проверкам Роспотребнадзора, МЧС, трудовой инспекции и ФНС <b>до того</b>, как придёт инспектор.',
    '',
    '1️⃣ Отвечаете на 3–4 вопроса о бизнесе',
    '2️⃣ Проходите чек-лист только из тех требований, что касаются именно вас',
    '3️⃣ Получаете отчёт: риски, возможные штрафы и план исправлений со сроками',
    '4️⃣ Я напомню о сроках, пока всё не будет исправлено',
    '',
    hasApp ? 'Проверку можно пройти прямо здесь, в чате, или в приложении — прогресс общий.' : 'Проверка занимает 5–7 минут.',
  ].join('\n');
}

export const HELP = [
  '<b>Как это работает</b>',
  '',
  'Требования собраны из официальных источников (СанПиН, Правила противопожарного режима, Трудовой кодекс, КоАП РФ) и отфильтрованы под ваш профиль: вид деятельности, форма бизнеса, наличие сотрудников.',
  '',
  'На каждый пункт отвечайте честно: «Нет» и «Не знаю» — это не штраф, а задача в плане исправлений.',
  '',
  '<b>Команды</b>',
  '/start — главное меню',
  '/check — начать или продолжить самопроверку',
  '/report — последний отчёт',
  '/tasks — план исправлений',
  '/sources — источники требований',
  '',
  '<i>Сервис не является юридической консультацией. Данные MVP — демонстрационные, см. /sources.</i>',
].join('\n');

export function askLegalForm() {
  return '<b>Шаг 1 из 3.</b> В какой форме зарегистрирован бизнес?\n\n<i>От этого зависят суммы штрафов.</i>';
}

export function askActivity() {
  return '<b>Шаг 2 из 3.</b> Чем занимаетесь?';
}

export function askStaff() {
  return '<b>Шаг 3 из 3.</b> У вас есть наёмные сотрудники?\n\n<i>Если нет — уберу требования о медкнижках, трудовых договорах и охране труда.</i>';
}

export function askFlag(flag) {
  return `<b>Уточнение.</b> ${esc(flag.question)}`;
}

export function profileSummary(catalog, profile, itemsCount) {
  const activity = catalog.activities.find((a) => a.id === profile.activity);
  const legal = catalog.legalForms.find((l) => l.id === profile.legalForm)?.title;
  return [
    `${activity.emoji} <b>${esc(activity.title)}</b> · ${esc(legal)} · ${profile.hasStaff ? 'с сотрудниками' : 'без сотрудников'}`,
    '',
    `Подобрал <b>${itemsCount} требований</b>, по которым вас могут проверить: ${esc(activity.authorities.join(', '))}.`,
    '',
    'Где удобнее пройти самопроверку?',
  ].join('\n');
}

export function questionCard(view, item, sectionTitle) {
  return [
    `<b>Вопрос ${item.index + 1} из ${view.progress.total}</b> · ${esc(sectionTitle)}`,
    progressBar((view.progress.answered / view.progress.total) * 100),
    '',
    `<b>${esc(item.question)}</b>`,
    '',
    `${SEVERITY_ICON[item.severity]} Важность: ${SEVERITY_TITLE[item.severity]} · ${esc(item.authority)}`,
  ].join('\n');
}

export function answeredCard(view, item, answer) {
  return `${ANSWER_TITLE[answer]} · <i>${item.index + 1}/${view.progress.total}</i>\n${esc(item.question)}`;
}

export function itemDetails(item, legalForm) {
  const range = item.fine?.[legalForm];
  const fine = Array.isArray(range)
    ? range[0] === range[1]
      ? `от ${formatRub(range[0])}`
      : `${formatRub(range[0])} – ${formatRub(range[1])}`
    : null;
  return [
    `<b>${esc(item.question)}</b>`,
    '',
    `📌 <b>Требование:</b> ${esc(item.requirement)}`,
    `📚 <b>Основание:</b> ${esc(item.basis)}`,
    `🏛 <b>Кто проверяет:</b> ${esc(item.authority)}`,
    `💸 <b>Ответственность:</b> ${esc(item.fine?.article || '—')}${fine ? `, ${fine}` : ''}${item.fine?.note ? `. ${esc(item.fine.note)}` : ''}`,
    `🛠 <b>Как исправить:</b> ${esc(item.fix)}`,
  ].join('\n');
}

export function reportMessage(report, catalog, timeZone) {
  const legal = catalog.legalForms.find((l) => l.id === report.profile.legalForm)?.title;
  const r = report.initial;
  const lines = [
    '📋 <b>Результат самопроверки</b>',
    `${esc(report.activity)} · ${esc(legal)}`,
    '',
    `${LEVEL_ICON[r.level]} Готовность: <b>${r.readiness}%</b> — ${LEVEL_TITLES[r.level]}`,
    progressBar(r.readiness),
    `✅ Выполнено: ${r.counts.yes} · ❌ Нарушений: ${r.counts.no} · ❓ Уточнить: ${r.counts.unknown}`,
    `💸 Возможные штрафы: ${fineText(r.fines)}`,
  ];
  if (report.readiness !== r.readiness) {
    lines.push(`📈 С учётом исправлений: <b>${report.readiness}%</b>`);
  }
  const open = report.problems.filter((p) => p.task?.status !== 'done');
  if (open.length) {
    lines.push('', '<b>Что исправить в первую очередь:</b>');
    open.slice(0, 5).forEach((p, i) => {
      const due = p.task ? ` — до ${formatDate(p.task.dueAt, timeZone)}` : '';
      lines.push(`${i + 1}. ${SEVERITY_ICON[p.severity]} ${esc(p.fix)}${due}`);
    });
    if (open.length > 5) lines.push(`…и ещё ${open.length - 5} в плане исправлений.`);
    lines.push('', '🔔 Напомню о каждом сроке. Отмечайте исправленное — готовность будет расти.');
  } else {
    lines.push('', '🎉 Все требования выполнены. Сохраните документы в одной папке — это ускорит проверку.');
  }
  return lines.join('\n');
}

export function tasksMessage(tasks, timeZone) {
  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');
  if (!tasks.length) return '📋 План исправлений пуст — нарушений не найдено. 🎉';
  const lines = [`📋 <b>План исправлений</b> · выполнено ${done.length} из ${tasks.length}`, ''];
  open.slice(0, 8).forEach((t, i) => {
    lines.push(`${i + 1}. ${SEVERITY_ICON[t.severity]} ${esc(t.fix)}`);
    lines.push(`   ${t.overdue ? '⚠️ просрочено' : '⏳ до'} ${formatDate(t.dueAt, timeZone)}`);
  });
  if (open.length > 8) lines.push(`…и ещё ${open.length - 8} — смотрите в приложении.`);
  if (!open.length) lines.push('Все задачи выполнены. 🎉');
  if (open.length) lines.push('', 'Нажмите номер, когда исправите пункт:');
  return lines.join('\n');
}

export function reminderMessage(task, timeZone) {
  const overdue = task.dueAt < Date.now();
  return [
    overdue ? '⚠️ <b>Срок исправления прошёл</b>' : `⏰ <b>Напоминание: срок до ${formatDate(task.dueAt, timeZone)}</b>`,
    '',
    esc(task.question),
    '',
    `🛠 ${esc(task.fix)}`,
  ].join('\n');
}

export function sourcesMessage(catalog) {
  return [
    '📚 <b>Источники требований</b>',
    '',
    ...catalog.sources.map((s) => `• ${esc(s.title)}`),
    '',
    `<i>${esc(catalog.disclaimer)}</i>`,
    `<i>Версия справочника: ${esc(catalog.version)}</i>`,
  ].join('\n');
}
