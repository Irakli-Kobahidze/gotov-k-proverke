// Проверка подписи initData мини-приложения MAX (window.WebApp.initData).
// Алгоритм: secret = HMAC_SHA256(key="WebAppData", msg=botToken);
// hash = HEX(HMAC_SHA256(key=secret, msg=отсортированные пары "key=value", соединённые "\n")).
import { createHmac, timingSafeEqual } from 'node:crypto';

export class InitDataError extends Error {}

export function validateInitData(initData, botToken, { maxAgeSeconds = 86400, now = Date.now() } = {}) {
  if (!initData || typeof initData !== 'string') throw new InitDataError('Пустой initData');
  if (!botToken) throw new InitDataError('Не задан токен бота');

  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.filter((k) => k === 'hash').length !== 1) {
    throw new InitDataError('Некорректные параметры initData');
  }
  const receivedHash = params.get('hash');
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) throw new InitDataError('Нет auth_date');
  // auth_date приходит в секундах; на случай миллисекунд нормализуем.
  const authMs = authDate > 1e12 ? authDate : authDate * 1000;
  const age = (now - authMs) / 1000;
  if (age < -60 || age > maxAgeSeconds) throw new InitDataError('Срок действия initData истёк');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(String(receivedHash), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InitDataError('Неверная подпись initData');

  let user;
  try {
    user = JSON.parse(params.get('user'));
  } catch {
    throw new InitDataError('Нет данных пользователя');
  }
  const id = Number(user?.id ?? user?.user_id);
  if (!Number.isSafeInteger(id)) throw new InitDataError('Нет id пользователя');
  return {
    id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || null,
    startParam: params.get('start_param'),
  };
}

/** Подпись initData — используется в тестах и для локальной отладки. */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}
