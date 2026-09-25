// Чат-бот MAX. Основной сценарий полностью проходится в чате; мини-приложение — расширенный интерфейс
// к тем же данным (кнопка open_app появляется, если задан MINIAPP_URL).
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { applicableItems, findItem, getActivity } from '../catalog.js';
import { AppError } from '../service.js';
import * as T from './texts.js';

const btn = Keyboard.button;
const ANSWER_CODES = { y: 'yes', n: 'no', u: 'unknown' };

export function createBot({ service, config, logger = console }) {
  const bot = new Bot(config.botToken);
  const { catalog } = service;
  let appTarget = config.botUsername || null;
  let appButtonEnabled = Boolean(config.miniAppUrl);

  const html = (attachments) => ({ format: 'html', ...(attachments ? { attachments } : {}) });
  const kb = (rows) => [Keyboard.inlineKeyboard(rows.filter((r) => r && r.length))];
  const appRow = (text = '📱 Открыть приложение') =>
    appButtonEnabled && appTarget ? [btn.openApp(text, appTarget)] : null;

  // Отправка с защитой: если платформа отклонит кнопку open_app (например, мини-приложение
  // ещё не подключено к боту), повторяем без неё, чтобы основной сценарий не ломался.
  async function send(userId, text, rows) {
    try {
      return await bot.api.sendMessageToUser(userId, text, html(rows ? kb(rows) : undefined));
    } catch (err) {
      if (rows && appButtonEnabled && err?.status === 400) {
        logger.warn('[bot] open_app отклонена платформой, кнопка отключена:', err.message);
        appButtonEnabled = false;
        const cleaned = rows.map((r) => r?.filter((b) => b.type !== 'open_app'));
        return bot.api.sendMessageToUser(userId, text, html(kb(cleaned)));
      }
      throw err;
    }
  }

  const userOf = (ctx) => {
    const user = ctx.user || ctx.message?.sender;
    service.ensureUser(user.user_id, [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name);
    return user;
  };

  /** Ответ на нажатие кнопки: заменяет исходное сообщение или просто гасит «часики». */
  async function ack(ctx, message) {
    try {
      await ctx.answerOnCallback(message ? { message } : { notification: '✓' });
    } catch (err) {
      logger.warn('[bot] answerOnCallback:', err.message);
    }
  }

  // ---------- экраны ----------

  async function showMenu(userId, name) {
    const active = service.activeCheck(userId);
    const completed = service.latestCompletedCheck(userId);
    const rows = [
      active
        ? [btn.callback(`▶️ Продолжить проверку (${service.checkView(active).progress.answered}/${JSON.parse(active.item_ids).length})`, 'continue')]
        : [btn.callback('🚀 Начать самопроверку', 'start')],
      appRow(),
      completed ? [btn.callback('📊 Отчёт', 'report'), btn.callback('📋 Задачи', 'tasks')] : null,
      [btn.callback('ℹ️ Как это работает', 'help')],
    ];
    await send(userId, T.welcome(name, appButtonEnabled && Boolean(appTarget)), rows);
  }

  async function askLegalForm(userId) {
    service.setChatState(userId, { draft: {} });
    await send(userId, T.askLegalForm(), [catalog.legalForms.map((f) => btn.callback(f.title, `lf:${f.id}`))]);
  }

  async function askNextProfileStep(userId) {
    const { draft = {} } = service.getChatState(userId);
    if (!draft.legalForm) return askLegalForm(userId);
    if (!draft.activity) {
      return send(
        userId,
        T.askActivity(),
        catalog.activities.map((a) => [btn.callback(`${a.emoji} ${a.title}`, `act:${a.id}`)]),
      );
    }
    if (draft.hasStaff === undefined) {
      return send(userId, T.askStaff(), [[btn.callback('👥 Есть сотрудники', 'staff:1'), btn.callback('🙋 Работаю один', 'staff:0')]]);
    }
    const activity = getActivity(catalog, draft.activity);
    const flag = (activity.flags || []).find((f) => draft.flags?.[f.id] === undefined);
    if (flag) {
      return send(userId, T.askFlag(flag), [[btn.callback('Да', `flag:${flag.id}:1`), btn.callback('Нет', `flag:${flag.id}:0`)]]);
    }
    const profile = service.saveProfile(userId, draft);
    service.setChatState(userId, {});
    const count = applicableItems(catalog, profile).length;
    return send(userId, T.profileSummary(catalog, profile, count), [
      [btn.callback('💬 Пройти здесь, в чате', 'go:chat')],
      appRow('📱 Пройти в приложении (с фото)'),
    ]);
  }

  async function sendQuestion(userId, check) {
    const view = service.checkView(check);
    const item = view.items.find((i) => i.id === view.nextItemId);
    if (!item) return finishCheck(userId, check.id);
    const p = `${check.id}:${item.id}`;
    return send(userId, T.questionCard(view, item, catalog.sectionTitles[item.section]), [
      [btn.callback('✅ Да', `a:${p}:y`), btn.callback('❌ Нет', `a:${p}:n`), btn.callback('❓ Не знаю', `a:${p}:u`)],
      [btn.callback('📖 Требование и штраф', `more:${p}`)],
    ]);
  }

  async function finishCheck(userId, checkId) {
    const { report } = service.completeCheck(userId, checkId);
    await sendReport(userId, report);
  }

  async function sendReport(userId, report) {
    await send(userId, T.reportMessage(report, catalog, config.timezone), [
      [btn.callback('📋 План исправлений', 'tasks'), btn.callback('📚 Источники', 'sources')],
      appRow('📱 Подробный отчёт в приложении'),
      [btn.callback('🔁 Пройти заново', 'go:chat'), btn.callback('✏️ Изменить профиль', 'start')],
    ]);
  }

  function tasksKeyboard(tasks) {
    const open = tasks.filter((t) => t.status === 'open').slice(0, 8);
    const rows = [];
    for (let i = 0; i < open.length; i += 4) {
      rows.push(open.slice(i, i + 4).map((t, j) => btn.callback(`✅ ${i + j + 1}`, `td:${t.id}`)));
    }
    rows.push([btn.callback('📊 Отчёт', 'report'), btn.callback('🏠 Меню', 'menu')]);
    return rows;
  }

  async function sendTasks(userId) {
    const { tasks, checkId } = service.listTasks(userId);
    if (!checkId) {
      return send(userId, 'Плана пока нет — сначала пройдите самопроверку.', [[btn.callback('🚀 Начать самопроверку', 'start')]]);
    }
    return send(userId, T.tasksMessage(tasks, config.timezone), tasksKeyboard(tasks));
  }

  async function startOrContinue(userId) {
    const active = service.activeCheck(userId);
    if (active) return sendQuestion(userId, active);
    if (!service.getProfile(userId)) return askLegalForm(userId);
    return sendQuestion(userId, service.startCheck(userId));
  }

  // ---------- обработчики ----------

  bot.api.setMyCommands([
    { name: 'start', description: 'Главное меню' },
    { name: 'check', description: 'Начать или продолжить самопроверку' },
    { name: 'report', description: 'Последний отчёт' },
    { name: 'tasks', description: 'План исправлений' },
    { name: 'sources', description: 'Источники требований' },
    { name: 'help', description: 'Как это работает' },
  ]).catch((err) => logger.warn('[bot] setMyCommands:', err.message));

  bot.on('bot_started', async (ctx) => {
    const user = userOf(ctx);
    await showMenu(user.user_id, user.first_name);
  });

  bot.command('start', async (ctx) => {
    const user = userOf(ctx);
    await showMenu(user.user_id, user.first_name);
  });
  bot.command('check', async (ctx) => startOrContinue(userOf(ctx).user_id));
  bot.command('tasks', async (ctx) => sendTasks(userOf(ctx).user_id));
  bot.command('help', async (ctx) => {
    userOf(ctx);
    await ctx.reply(T.HELP, html());
  });
  bot.command('sources', async (ctx) => {
    userOf(ctx);
    await ctx.reply(T.sourcesMessage(catalog), html());
  });
  bot.command('report', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const completed = service.latestCompletedCheck(uid);
    if (!completed) return send(uid, 'Отчёта пока нет — пройдите самопроверку.', [[btn.callback('🚀 Начать', 'start')]]);
    return sendReport(uid, service.report(uid, completed.id));
  });

  bot.action('menu', async (ctx) => {
    const user = userOf(ctx);
    await ack(ctx);
    await showMenu(user.user_id, user.first_name);
  });
  bot.action('help', async (ctx) => {
    userOf(ctx);
    await ack(ctx);
    await send(ctx.user.user_id, T.HELP, [[btn.callback('🚀 Начать самопроверку', 'start')]]);
  });
  bot.action('sources', async (ctx) => {
    userOf(ctx);
    await ack(ctx);
    await send(ctx.user.user_id, T.sourcesMessage(catalog));
  });
  bot.action('start', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    await ack(ctx);
    await askLegalForm(uid);
  });
  bot.action('continue', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    await ack(ctx);
    await startOrContinue(uid);
  });

  bot.action(/^lf:(ip|org)$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const state = service.getChatState(uid);
    service.setChatState(uid, { draft: { ...state.draft, legalForm: ctx.match[1] } });
    await ack(ctx, { text: `Форма бизнеса: <b>${ctx.match[1] === 'ip' ? 'ИП' : 'ООО / АО'}</b>`, format: 'html', attachments: [] });
    await askNextProfileStep(uid);
  });

  bot.action(/^act:([\w-]+)$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const activity = getActivity(catalog, ctx.match[1]);
    const state = service.getChatState(uid);
    if (!activity || !state.draft?.legalForm) {
      await ack(ctx);
      return askLegalForm(uid);
    }
    service.setChatState(uid, { draft: { ...state.draft, activity: activity.id, flags: {} } });
    await ack(ctx, { text: `Деятельность: <b>${T.esc(activity.title)}</b>`, format: 'html', attachments: [] });
    await askNextProfileStep(uid);
  });

  bot.action(/^staff:([01])$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const state = service.getChatState(uid);
    if (!state.draft?.activity) {
      await ack(ctx);
      return askLegalForm(uid);
    }
    const hasStaff = ctx.match[1] === '1';
    service.setChatState(uid, { draft: { ...state.draft, hasStaff } });
    await ack(ctx, { text: hasStaff ? 'Есть сотрудники' : 'Работаю без сотрудников', attachments: [] });
    await askNextProfileStep(uid);
  });

  bot.action(/^flag:([\w-]+):([01])$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const state = service.getChatState(uid);
    if (!state.draft?.activity) {
      await ack(ctx);
      return askLegalForm(uid);
    }
    const flags = { ...state.draft.flags, [ctx.match[1]]: ctx.match[2] === '1' };
    service.setChatState(uid, { draft: { ...state.draft, flags } });
    const flag = getActivity(catalog, state.draft.activity).flags.find((f) => f.id === ctx.match[1]);
    await ack(ctx, { text: `${T.esc(flag?.question || '')} — <b>${ctx.match[2] === '1' ? 'да' : 'нет'}</b>`, format: 'html', attachments: [] });
    await askNextProfileStep(uid);
  });

  bot.action('go:chat', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    await ack(ctx);
    if (!service.getProfile(uid)) return askLegalForm(uid);
    await sendQuestion(uid, service.startCheck(uid));
  });

  bot.action(/^a:(\d+):([\w-]+):([ynu])$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const [, checkId, itemId, code] = ctx.match;
    let view;
    try {
      view = service.setAnswer(uid, checkId, itemId, ANSWER_CODES[code]);
    } catch (err) {
      if (err instanceof AppError && err.code === 'check_completed') {
        await ack(ctx, { text: 'Эта проверка уже завершена. Откройте /report или начните заново.', attachments: [] });
        return;
      }
      throw err;
    }
    const item = view.items.find((i) => i.id === itemId);
    await ack(ctx, { text: T.answeredCard(view, item, ANSWER_CODES[code]), format: 'html', attachments: [] });
    const check = service.getOwnedCheck(uid, checkId);
    if (view.nextItemId) await sendQuestion(uid, check);
    else await finishCheck(uid, check.id);
  });

  bot.action(/^more:(\d+):([\w-]+)$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const check = service.getOwnedCheck(uid, ctx.match[1]);
    const item = findItem(catalog, ctx.match[2]);
    await ack(ctx);
    if (!item) return;
    const legalForm = JSON.parse(check.profile).legalForm;
    await send(uid, T.itemDetails(item, legalForm));
  });

  bot.action('report', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    await ack(ctx);
    const completed = service.latestCompletedCheck(uid);
    if (!completed) return send(uid, 'Отчёта пока нет — пройдите самопроверку.', [[btn.callback('🚀 Начать', 'start')]]);
    await sendReport(uid, service.report(uid, completed.id));
  });

  bot.action('tasks', async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    await ack(ctx);
    await sendTasks(uid);
  });

  bot.action(/^td:(\d+)$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const task = service.setTaskStatus(uid, ctx.match[1], 'done');
    // Если нажали в списке задач — обновляем список на месте; в напоминании — заменяем его подтверждением.
    const { tasks } = service.listTasks(uid);
    const fromList = ctx.message?.body?.text?.startsWith('📋');
    if (fromList && tasks.some((t) => t.checkId === task.checkId)) {
      await ack(ctx, { text: T.tasksMessage(tasks, config.timezone), format: 'html', attachments: kb(tasksKeyboard(tasks)) });
    } else {
      await ack(ctx, { text: `✅ Исправлено: ${T.esc(task.fix)}`, format: 'html', attachments: [] });
    }
    const completed = service.latestCompletedCheck(uid);
    if (completed && tasks.every((t) => t.status === 'done')) {
      await send(uid, `🎉 Все пункты плана исправлены! Готовность: <b>${service.report(uid, completed.id).readiness}%</b>.`, [
        [btn.callback('📊 Отчёт', 'report')],
      ]);
    }
  });

  bot.action(/^ts:(\d+)$/, async (ctx) => {
    const { user_id: uid } = userOf(ctx);
    const task = service.snoozeTask(uid, ctx.match[1], 3);
    await ack(ctx, {
      text: `⏳ Перенёс срок на ${T.formatDate(task.dueAt, config.timezone)}:\n${T.esc(task.fix)}`,
      format: 'html',
      attachments: [],
    });
  });

  // Любой другой текст — подсказка вместо тишины.
  bot.on('message_created', async (ctx) => {
    const user = userOf(ctx);
    await send(user.user_id, 'Я работаю через кнопки 🙂 Выберите действие:', [
      service.activeCheck(user.user_id)
        ? [btn.callback('▶️ Продолжить проверку', 'continue')]
        : [btn.callback('🚀 Начать самопроверку', 'start')],
      [btn.callback('🏠 Меню', 'menu')],
    ]);
  });

  // Ошибка в одном обработчике не должна останавливать бота: пишем в лог и сообщаем пользователю.
  bot.catch(async (err, ctx) => {
    logger.error('[bot] ошибка обработки:', err);
    const uid = ctx?.user?.user_id ?? ctx?.message?.sender?.user_id;
    if (!uid) return;
    const text = err instanceof AppError ? `⚠️ ${T.esc(err.message)}` : '⚠️ Что-то пошло не так. Попробуйте ещё раз.';
    try {
      await send(uid, text, [[btn.callback('🏠 Меню', 'menu')]]);
    } catch {
      /* сеть недоступна — уже залогировано */
    }
  });

  // ---------- уведомления из API и планировщика ----------

  const notifier = {
    async checkCompleted(userId, report) {
      try {
        await sendReport(userId, report);
      } catch (err) {
        logger.warn('[bot] не удалось отправить отчёт в чат:', err.message);
      }
    },
    async sendReport(userId, report) {
      await sendReport(userId, report);
    },
    async reminder(userId, task) {
      await send(userId, T.reminderMessage(task, config.timezone), [
        [btn.callback('✅ Исправлено', `td:${task.id}`), btn.callback('⏳ +3 дня', `ts:${task.id}`)],
        appRow(),
      ]);
    },
  };

  async function start() {
    try {
      const me = await bot.api.getMyInfo();
      if (!appTarget) appTarget = me.username || null;
      logger.info(`[bot] запущен как @${me.username} (id ${me.user_id})`);
    } catch (err) {
      logger.error('[bot] не удалось получить /me — проверьте BOT_TOKEN и доступ к platform-api.max.ru:', err.message);
    }
    await bot.start({ mode: 'polling', options: { retry: true } });
  }

  return { bot, notifier, start };
}
