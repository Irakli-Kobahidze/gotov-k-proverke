import path from 'node:path';

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = process.env.DATA_DIR || path.resolve('var');

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  // Включает чат-бота (long polling). Без токена работает только API — удобно для локальной разработки UI.
  botEnabled: bool(process.env.BOT_ENABLED, true) && Boolean(process.env.BOT_TOKEN),
  port: int(process.env.PORT, 8080),
  // Публичный HTTPS-адрес мини-приложения (тот же, что указан в настройках бота на платформе MAX).
  miniAppUrl: process.env.MINIAPP_URL || '',
  // Ник бота для кнопки open_app; если пусто — берётся из /me при старте.
  botUsername: process.env.BOT_USERNAME || '',
  dataDir,
  dbPath: path.join(dataDir, 'app.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  webDir: process.env.WEB_DIR || path.resolve('../web/dist'),
  // Срок жизни подписи initData мини-приложения, секунд.
  initDataMaxAge: int(process.env.INIT_DATA_MAX_AGE, 24 * 60 * 60),
  // Только для локальной разработки вне MAX: заголовок X-Dev-User подменяет пользователя.
  devAuth: bool(process.env.DEV_AUTH, false),
  // Демо-режим напоминаний: первое напоминание приходит через N секунд вместо «за день до срока».
  reminderDemoSeconds: int(process.env.REMINDER_DEMO_SECONDS, 0),
  reminderIntervalMs: int(process.env.REMINDER_INTERVAL_MS, 30_000),
  timezone: process.env.TZ || 'Europe/Moscow',
};
