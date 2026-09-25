import { createApp } from './api.js';
import { createBot } from './bot/index.js';
import { loadCatalog } from './catalog.js';
import { config } from './config.js';
import { openDb } from './db.js';
import { startReminders } from './reminders.js';
import { Service } from './service.js';

const db = openDb(config.dbPath);
const catalog = loadCatalog();
const service = new Service({ db, catalog, config });

let notifier = null;
let bot = null;
if (config.botEnabled) {
  const created = createBot({ service, config });
  bot = created.bot;
  notifier = created.notifier;
  startReminders({ service, notifier, intervalMs: config.reminderIntervalMs });
  created.start().catch((err) => {
    console.error('[bot] остановлен с ошибкой:', err);
    process.exit(1);
  });
} else {
  console.warn('[bot] BOT_TOKEN не задан или BOT_ENABLED=false — работает только API мини-приложения');
}

const app = createApp({ service, config, notifier });
const server = app.listen(config.port, () => {
  console.info(`[api] слушаю порт ${config.port}; мини-приложение: ${config.miniAppUrl || 'MINIAPP_URL не задан'}`);
});

function shutdown(signal) {
  console.info(`[app] ${signal}: останавливаюсь`);
  bot?.stopPolling();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
