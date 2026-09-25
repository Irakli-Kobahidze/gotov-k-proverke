// Планировщик напоминаний о сроках исправления. Хранит состояние в БД, поэтому переживает перезапуск.
export function startReminders({ service, notifier, intervalMs, logger = console }) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const row of service.dueReminders()) {
        try {
          await notifier.reminder(row.user_id, service.taskView(row));
        } catch (err) {
          logger.warn(`[reminders] задача ${row.id}: ${err.message}`);
        }
        // Помечаем даже при ошибке, чтобы не зациклиться на недоступном пользователе.
        service.markReminded(row.id);
      }
    } catch (err) {
      logger.error('[reminders]', err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
