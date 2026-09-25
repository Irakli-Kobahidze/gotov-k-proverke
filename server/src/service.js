// Бизнес-логика, общая для чат-бота и API мини-приложения: оба канала работают
// с одними и теми же данными, поэтому проверку можно начать в чате и продолжить в приложении.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { applicableItems, findItem, getActivity } from './catalog.js';
import { ANSWERS, buildPlan, computeReport, firstReminderAt } from './assessment.js';
import { tx } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class Service {
  constructor({ db, catalog, config }) {
    this.db = db;
    this.catalog = catalog;
    this.config = config;
  }

  // ---------- пользователи и профиль ----------

  ensureUser(userId, name) {
    this.db
      .prepare(
        `INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = COALESCE(excluded.name, users.name)`,
      )
      .run(userId, name ?? null, Date.now());
  }

  getProfile(userId) {
    const row = this.db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    if (!row) return null;
    return {
      legalForm: row.legal_form,
      activity: row.activity,
      hasStaff: Boolean(row.has_staff),
      flags: JSON.parse(row.flags),
    };
  }

  saveProfile(userId, input) {
    const profile = this.normalizeProfile(input);
    this.db
      .prepare(
        `INSERT INTO profiles (user_id, legal_form, activity, has_staff, flags, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET legal_form = excluded.legal_form, activity = excluded.activity,
           has_staff = excluded.has_staff, flags = excluded.flags, updated_at = excluded.updated_at`,
      )
      .run(userId, profile.legalForm, profile.activity, profile.hasStaff ? 1 : 0, JSON.stringify(profile.flags), Date.now());
    return profile;
  }

  normalizeProfile(input = {}) {
    if (!['ip', 'org'].includes(input.legalForm)) {
      throw new AppError(400, 'invalid_legal_form', 'Укажите форму бизнеса: ИП или ООО');
    }
    const activity = getActivity(this.catalog, input.activity);
    if (!activity) throw new AppError(400, 'invalid_activity', 'Выберите вид деятельности из списка');
    const flags = {};
    for (const flag of activity.flags || []) flags[flag.id] = Boolean(input.flags?.[flag.id]);
    return { legalForm: input.legalForm, activity: activity.id, hasStaff: Boolean(input.hasStaff), flags };
  }

  // ---------- проверки ----------

  latestCheck(userId) {
    return this.db.prepare('SELECT * FROM checks WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) || null;
  }

  latestCompletedCheck(userId) {
    return (
      this.db
        .prepare(`SELECT * FROM checks WHERE user_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`)
        .get(userId) || null
    );
  }

  activeCheck(userId) {
    const check = this.latestCheck(userId);
    return check && check.status === 'in_progress' ? check : null;
  }

  getOwnedCheck(userId, checkId) {
    const check = this.db.prepare('SELECT * FROM checks WHERE id = ?').get(Number(checkId));
    if (!check || check.user_id !== userId) throw new AppError(404, 'check_not_found', 'Проверка не найдена');
    return check;
  }

  startCheck(userId) {
    const profile = this.getProfile(userId);
    if (!profile) throw new AppError(409, 'profile_required', 'Сначала заполните профиль бизнеса');
    const items = applicableItems(this.catalog, profile);
    const result = this.db
      .prepare(
        `INSERT INTO checks (user_id, profile, item_ids, status, started_at) VALUES (?, ?, ?, 'in_progress', ?)`,
      )
      .run(userId, JSON.stringify(profile), JSON.stringify(items.map((i) => i.id)), Date.now());
    return this.getOwnedCheck(userId, result.lastInsertRowid);
  }

  checkItems(check) {
    return JSON.parse(check.item_ids).map((id) => findItem(this.catalog, id)).filter(Boolean);
  }

  answersMap(checkId) {
    const rows = this.db.prepare('SELECT item_id, answer, comment, photo, updated_at FROM answers WHERE check_id = ?').all(checkId);
    return Object.fromEntries(rows.map((r) => [r.item_id, r]));
  }

  /** Полное состояние проверки для мини-приложения и бота. */
  checkView(check) {
    const profile = JSON.parse(check.profile);
    const items = this.checkItems(check);
    const answers = this.answersMap(check.id);
    const answered = items.filter((i) => answers[i.id]).length;
    const next = items.find((i) => !answers[i.id]) || null;
    return {
      id: check.id,
      status: check.status,
      startedAt: check.started_at,
      completedAt: check.completed_at,
      profile,
      activity: getActivity(this.catalog, profile.activity)?.title,
      progress: { answered, total: items.length },
      nextItemId: next?.id || null,
      items: items.map((item, index) => ({
        ...item,
        index,
        answer: answers[item.id]?.answer || null,
        comment: answers[item.id]?.comment || null,
        hasPhoto: Boolean(answers[item.id]?.photo),
      })),
    };
  }

  setAnswer(userId, checkId, itemId, answer, comment) {
    const check = this.getOwnedCheck(userId, checkId);
    if (check.status !== 'in_progress') {
      throw new AppError(409, 'check_completed', 'Проверка уже завершена — начните новую, чтобы изменить ответы');
    }
    if (!ANSWERS.includes(answer)) throw new AppError(400, 'invalid_answer', 'Ответ должен быть: да, нет или не знаю');
    if (!JSON.parse(check.item_ids).includes(itemId)) {
      throw new AppError(404, 'item_not_found', 'Такого пункта нет в этой проверке');
    }
    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 500) || null : null;
    this.db
      .prepare(
        `INSERT INTO answers (check_id, item_id, answer, comment, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(check_id, item_id) DO UPDATE SET answer = excluded.answer,
           comment = COALESCE(excluded.comment, answers.comment), updated_at = excluded.updated_at`,
      )
      .run(check.id, itemId, answer, cleanComment, Date.now());
    return this.checkView(this.getOwnedCheck(userId, checkId));
  }

  /** Фото-подтверждение к пункту (JPEG/PNG/WebP до 5 МБ). */
  setPhoto(userId, checkId, itemId, buffer, mime) {
    const check = this.getOwnedCheck(userId, checkId);
    const row = this.db.prepare('SELECT photo FROM answers WHERE check_id = ? AND item_id = ?').get(check.id, itemId);
    if (!row) throw new AppError(409, 'answer_required', 'Сначала ответьте на вопрос, затем прикрепите фото');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    if (!ext) throw new AppError(415, 'unsupported_image', 'Поддерживаются только JPEG, PNG и WebP');
    if (buffer.length > 5 * 1024 * 1024) throw new AppError(413, 'image_too_large', 'Фото больше 5 МБ');

    const dir = path.join(this.config.uploadsDir, String(userId));
    mkdirSync(dir, { recursive: true });
    const fileName = `${randomUUID()}.${ext}`;
    writeFileSync(path.join(dir, fileName), buffer);
    this.db.prepare('UPDATE answers SET photo = ? WHERE check_id = ? AND item_id = ?').run(fileName, check.id, itemId);
    if (row.photo) {
      try {
        unlinkSync(path.join(dir, row.photo));
      } catch {
        /* старого файла может уже не быть */
      }
    }
    return fileName;
  }

  photoPath(userId, checkId, itemId) {
    const check = this.getOwnedCheck(userId, checkId);
    const row = this.db.prepare('SELECT photo FROM answers WHERE check_id = ? AND item_id = ?').get(check.id, itemId);
    if (!row?.photo) throw new AppError(404, 'photo_not_found', 'Фото не найдено');
    return path.join(this.config.uploadsDir, String(userId), row.photo);
  }

  /** Завершает проверку: считает отчёт и формирует план исправлений с напоминаниями. Идемпотентно. */
  completeCheck(userId, checkId) {
    const check = this.getOwnedCheck(userId, checkId);
    if (check.status === 'completed') return { report: this.report(userId, check.id), alreadyCompleted: true };

    const profile = JSON.parse(check.profile);
    const items = this.checkItems(check);
    const report = computeReport(items, this.answersMap(check.id), profile.legalForm);
    if (report.counts.pending > 0) {
      throw new AppError(409, 'check_incomplete', `Осталось ответить на ${report.counts.pending} вопр.`);
    }
    const now = Date.now();
    tx(this.db, () => {
      this.db
        .prepare(`UPDATE checks SET status = 'completed', completed_at = ?, readiness = ? WHERE id = ?`)
        .run(now, report.readiness, check.id);
      // Новая проверка заменяет план предыдущей: закрываем старые открытые задачи без напоминаний.
      this.db
        .prepare(`UPDATE tasks SET remind_at = NULL WHERE user_id = ? AND check_id <> ? AND status = 'open'`)
        .run(userId, check.id);
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO tasks (check_id, user_id, item_id, status, due_at, remind_at) VALUES (?, ?, ?, 'open', ?, ?)`,
      );
      for (const task of buildPlan(report.problems, now)) {
        insert.run(check.id, userId, task.itemId, task.dueAt, firstReminderAt(task.dueAt, now, this.config.reminderDemoSeconds));
      }
    });
    return { report: this.report(userId, check.id), alreadyCompleted: false };
  }

  /** Отчёт по завершённой проверке с учётом уже исправленных пунктов. */
  report(userId, checkId) {
    const check = this.getOwnedCheck(userId, checkId);
    const profile = JSON.parse(check.profile);
    const items = this.checkItems(check);
    const answers = this.answersMap(check.id);
    const initial = computeReport(items, answers, profile.legalForm);

    const tasks = this.tasksForCheck(check.id);
    const byItem = Object.fromEntries(tasks.map((t) => [t.itemId, t]));
    const afterFixes = { ...answers };
    for (const t of tasks) if (t.status === 'done') afterFixes[t.itemId] = { answer: 'yes' };
    const current = computeReport(items, afterFixes, profile.legalForm);

    return {
      checkId: check.id,
      status: check.status,
      completedAt: check.completed_at,
      profile,
      activity: getActivity(this.catalog, profile.activity)?.title,
      initial: { readiness: initial.readiness, level: initial.level, counts: initial.counts, fines: initial.fines },
      ...current,
      problems: initial.problems.map((p) => ({ ...p, task: byItem[p.itemId] || null })),
      disclaimer: this.catalog.disclaimer,
    };
  }

  // ---------- задачи и напоминания ----------

  tasksForCheck(checkId) {
    return this.db
      .prepare('SELECT * FROM tasks WHERE check_id = ? ORDER BY due_at, id')
      .all(checkId)
      .map((row) => this.taskView(row));
  }

  taskView(row) {
    const item = findItem(this.catalog, row.item_id);
    return {
      id: row.id,
      checkId: row.check_id,
      itemId: row.item_id,
      status: row.status,
      dueAt: row.due_at,
      remindAt: row.remind_at,
      doneAt: row.done_at,
      overdue: row.status === 'open' && row.due_at < Date.now(),
      question: item?.question,
      fix: item?.fix,
      severity: item?.severity,
      section: item?.section,
    };
  }

  /** Задачи по последней завершённой проверке. */
  listTasks(userId) {
    const check = this.latestCompletedCheck(userId);
    if (!check) return { checkId: null, tasks: [] };
    return { checkId: check.id, tasks: this.tasksForCheck(check.id) };
  }

  ownedTask(userId, taskId) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(taskId));
    if (!row || row.user_id !== userId) throw new AppError(404, 'task_not_found', 'Задача не найдена');
    return row;
  }

  setTaskStatus(userId, taskId, status) {
    if (!['open', 'done'].includes(status)) throw new AppError(400, 'invalid_status', 'Неизвестный статус задачи');
    const row = this.ownedTask(userId, taskId);
    const now = Date.now();
    if (status === 'done') {
      this.db.prepare(`UPDATE tasks SET status = 'done', done_at = ?, remind_at = NULL WHERE id = ?`).run(now, row.id);
    } else {
      this.db
        .prepare(`UPDATE tasks SET status = 'open', done_at = NULL, remind_at = ? WHERE id = ?`)
        .run(firstReminderAt(row.due_at, now, this.config.reminderDemoSeconds), row.id);
    }
    return this.taskView(this.ownedTask(userId, taskId));
  }

  snoozeTask(userId, taskId, days = 3) {
    const row = this.ownedTask(userId, taskId);
    if (row.status !== 'open') throw new AppError(409, 'task_done', 'Задача уже выполнена');
    const d = Math.min(Math.max(Number(days) || 3, 1), 30);
    const now = Date.now();
    const due = Math.max(row.due_at, now) + d * DAY_MS;
    this.db.prepare('UPDATE tasks SET due_at = ?, remind_at = ? WHERE id = ?').run(due, firstReminderAt(due, now), row.id);
    return this.taskView(this.ownedTask(userId, taskId));
  }

  dueReminders(now = Date.now(), limit = 50) {
    return this.db
      .prepare(`SELECT * FROM tasks WHERE status = 'open' AND remind_at IS NOT NULL AND remind_at <= ? ORDER BY remind_at LIMIT ?`)
      .all(now, limit);
  }

  /** После напоминания: следующее — в день срока, а после срока — раз в 3 дня. */
  markReminded(taskId, now = Date.now()) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!row) return;
    const next = now < row.due_at - 60 * 60 * 1000 ? row.due_at : now + 3 * DAY_MS;
    this.db.prepare('UPDATE tasks SET reminded_at = ?, remind_at = ? WHERE id = ?').run(now, next, taskId);
  }

  // ---------- состояние диалога в чате ----------

  getChatState(userId) {
    const row = this.db.prepare('SELECT state FROM chat_state WHERE user_id = ?').get(userId);
    return row ? JSON.parse(row.state) : {};
  }

  setChatState(userId, state) {
    this.db
      .prepare(
        `INSERT INTO chat_state (user_id, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(state), Date.now());
  }
}
