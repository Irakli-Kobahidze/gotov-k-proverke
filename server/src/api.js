// HTTP API мини-приложения. Каждый запрос /api/* (кроме health и catalog) авторизуется
// подписанным initData из MAX Bridge в заголовке X-Max-Init-Data.
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { InitDataError, validateInitData } from './auth.js';
import { publicCatalog } from './catalog.js';
import { AppError } from './service.js';

export function createApp({ service, config, notifier, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: '8mb' }));

  api.get('/health', (req, res) => res.json({ ok: true, bot: config.botEnabled }));
  api.get('/catalog', (req, res) => res.json(publicCatalog(service.catalog)));

  api.use((req, res, next) => {
    const initData = req.get('X-Max-Init-Data');
    try {
      if (initData) {
        req.user = validateInitData(initData, config.botToken, { maxAgeSeconds: config.initDataMaxAge });
      } else if (config.devAuth && req.get('X-Dev-User')) {
        const id = Number(req.get('X-Dev-User'));
        if (!Number.isSafeInteger(id)) throw new InitDataError('Некорректный X-Dev-User');
        req.user = { id, name: 'Тестовый пользователь' };
      } else {
        throw new InitDataError('Откройте приложение из чат-бота в MAX');
      }
    } catch (err) {
      if (err instanceof InitDataError) {
        return res.status(401).json({ error: 'unauthorized', message: err.message });
      }
      return next(err);
    }
    service.ensureUser(req.user.id, req.user.name);
    next();
  });

  api.get('/me', (req, res) => {
    const uid = req.user.id;
    const active = service.activeCheck(uid);
    const completed = service.latestCompletedCheck(uid);
    const tasks = service.listTasks(uid).tasks;
    res.json({
      user: { id: uid, name: req.user.name },
      profile: service.getProfile(uid),
      activeCheck: active ? service.checkView(active) : null,
      lastReport: completed ? service.report(uid, completed.id) : null,
      tasksSummary: {
        open: tasks.filter((t) => t.status === 'open').length,
        done: tasks.filter((t) => t.status === 'done').length,
        overdue: tasks.filter((t) => t.overdue).length,
      },
    });
  });

  api.put('/profile', (req, res) => {
    res.json({ profile: service.saveProfile(req.user.id, req.body) });
  });

  api.post('/checks', (req, res) => {
    const check = service.startCheck(req.user.id);
    res.status(201).json(service.checkView(check));
  });

  api.get('/checks/current', (req, res) => {
    const check = service.activeCheck(req.user.id);
    if (!check) throw new AppError(404, 'no_active_check', 'Нет активной проверки');
    res.json(service.checkView(check));
  });

  api.put('/checks/:checkId/answers/:itemId', (req, res) => {
    const { answer, comment } = req.body || {};
    res.json(service.setAnswer(req.user.id, req.params.checkId, req.params.itemId, answer, comment));
  });

  api.put('/checks/:checkId/answers/:itemId/photo', (req, res) => {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || '');
    if (!match) throw new AppError(400, 'invalid_image', 'Не удалось прочитать фото');
    service.setPhoto(req.user.id, req.params.checkId, req.params.itemId, Buffer.from(match[2], 'base64'), match[1]);
    res.json({ ok: true });
  });

  api.get('/checks/:checkId/answers/:itemId/photo', (req, res) => {
    res.sendFile(service.photoPath(req.user.id, req.params.checkId, req.params.itemId));
  });

  api.post('/checks/:checkId/complete', async (req, res) => {
    const { report, alreadyCompleted } = service.completeCheck(req.user.id, req.params.checkId);
    if (!alreadyCompleted) await notifier?.checkCompleted(req.user.id, report);
    res.json(report);
  });

  api.get('/checks/:checkId/report', (req, res) => {
    res.json(service.report(req.user.id, req.params.checkId));
  });

  api.post('/checks/:checkId/share', async (req, res) => {
    const report = service.report(req.user.id, req.params.checkId);
    if (!notifier) throw new AppError(503, 'bot_disabled', 'Чат-бот сейчас недоступен');
    await notifier.sendReport(req.user.id, report);
    res.json({ ok: true });
  });

  api.get('/tasks', (req, res) => res.json(service.listTasks(req.user.id)));

  api.patch('/tasks/:taskId', (req, res) => {
    const { status, snoozeDays } = req.body || {};
    const task = snoozeDays
      ? service.snoozeTask(req.user.id, req.params.taskId, snoozeDays)
      : service.setTaskStatus(req.user.id, req.params.taskId, status);
    res.json(task);
  });

  api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'Метод не найден' }));

  app.use('/api', api);

  // Статика мини-приложения (собранный React). SPA: все прочие пути отдают index.html.
  if (existsSync(path.join(config.webDir, 'index.html'))) {
    app.use(express.static(config.webDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDir, 'index.html'));
    });
  }

  // Единый формат ошибок: { error, message }.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large', message: 'Слишком большой файл' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Некорректный JSON' });
    }
    if (err?.status === 404) return res.status(404).json({ error: 'not_found', message: 'Файл не найден' });
    logger.error('[api]', err);
    res.status(500).json({ error: 'internal', message: 'Внутренняя ошибка. Попробуйте ещё раз.' });
  });

  return app;
}
