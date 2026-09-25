import { getInitData } from './max.js';

// Вне MAX (локальная разработка) можно открыть приложение с ?dev=<user_id>,
// если на сервере включён DEV_AUTH=true.
const devUser = new URLSearchParams(window.location.search).get('dev');

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const initData = getInitData();
  if (initData) headers['X-Max-Init-Data'] = initData;
  else if (devUser) headers['X-Dev-User'] = devUser;

  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network', 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error, data.message || 'Не удалось выполнить действие');
  return data;
}

export const api = {
  catalog: () => request('GET', '/catalog'),
  me: () => request('GET', '/me'),
  saveProfile: (profile) => request('PUT', '/profile', profile),
  startCheck: () => request('POST', '/checks'),
  currentCheck: () => request('GET', '/checks/current'),
  answer: (checkId, itemId, answer, comment) =>
    request('PUT', `/checks/${checkId}/answers/${itemId}`, { answer, comment }),
  uploadPhoto: (checkId, itemId, dataUrl) => request('PUT', `/checks/${checkId}/answers/${itemId}/photo`, { dataUrl }),
  complete: (checkId) => request('POST', `/checks/${checkId}/complete`),
  report: (checkId) => request('GET', `/checks/${checkId}/report`),
  share: (checkId) => request('POST', `/checks/${checkId}/share`),
  tasks: () => request('GET', '/tasks'),
  setTask: (taskId, patch) => request('PATCH', `/tasks/${taskId}`, patch),
};

/** Сжимает фото на устройстве до 1280px по длинной стороне (JPEG), чтобы экономить трафик. */
export async function compressImage(file, maxSide = 1280) {
  if (!file.type.startsWith('image/')) throw new ApiError(415, 'unsupported_image', 'Выберите изображение');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
