// Обёртка над MAX Bridge (window.WebApp). Все вызовы необязательны: вне MAX приложение
// продолжает работать в браузере (для локальной разработки).
const webApp = () => window.WebApp;

export function initBridge() {
  try {
    webApp()?.ready?.();
    webApp()?.expand?.();
  } catch {
    /* вне MAX */
  }
}

export function getInitData() {
  return webApp()?.initData || '';
}

export function getPlatform() {
  return webApp()?.platform || 'web';
}

export function haptic(kind = 'light') {
  try {
    const h = webApp()?.HapticFeedback;
    if (!h) return;
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred?.(kind);
    else h.impactOccurred?.(kind);
  } catch {
    /* необязательно */
  }
}

/** Системная кнопка «Назад» MAX; возвращает функцию отписки. */
export function setBackButton(handler) {
  const back = webApp()?.BackButton;
  if (!back) return () => {};
  try {
    if (handler) {
      back.onClick?.(handler);
      back.show?.();
    } else {
      back.hide?.();
    }
  } catch {
    return () => {};
  }
  return () => {
    try {
      back.offClick?.(handler);
    } catch {
      /* необязательно */
    }
  };
}

export function closeApp() {
  webApp()?.close?.();
}
