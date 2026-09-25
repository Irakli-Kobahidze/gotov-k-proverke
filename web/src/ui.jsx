// Общие элементы интерфейса поверх MAX UI.
import { Button, Spinner, Typography } from '@maxhub/max-ui';

export const SEVERITY = {
  high: { label: 'Высокая важность', short: 'Высокая', tone: 'bad' },
  medium: { label: 'Средняя важность', short: 'Средняя', tone: 'warn' },
  low: { label: 'Низкая важность', short: 'Низкая', tone: 'mild' },
};

export const LEVEL = {
  ready: { title: 'Готов к проверке', tone: 'good' },
  risks: { title: 'Есть риски', tone: 'warn' },
  high_risk: { title: 'Высокий риск штрафов', tone: 'bad' },
  incomplete: { title: 'Проверка не завершена', tone: 'mild' },
};

export const ANSWER = {
  yes: { label: 'Да', icon: '✓', tone: 'good' },
  no: { label: 'Нет', icon: '✕', tone: 'bad' },
  unknown: { label: 'Не знаю', icon: '?', tone: 'warn' },
};

const rub = new Intl.NumberFormat('ru-RU');
export const formatRub = (v) => `${rub.format(v)} ₽`;
export const formatDate = (ms) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function fineRangeText(fines) {
  if (!fines.max) return fines.withoutAmount ? 'особые санкции' : 'нет';
  return fines.min === fines.max ? formatRub(fines.max) : `${formatRub(fines.min)} – ${formatRub(fines.max)}`;
}

export function Screen({ title, subtitle, children, footer }) {
  return (
    <div className="screen">
      {title && (
        <header className="screen__header">
          <Typography.Headline variant="medium" className="screen__title">
            {title}
          </Typography.Headline>
          {subtitle && (
            <Typography.Body variant="small" className="muted">
              {subtitle}
            </Typography.Body>
          )}
        </header>
      )}
      <main className="screen__body">{children}</main>
      {footer && <footer className="screen__footer">{footer}</footer>}
    </div>
  );
}

export function Card({ children, className = '', tone }) {
  return <section className={`card ${tone ? `card--${tone}` : ''} ${className}`}>{children}</section>;
}

export function Badge({ tone = 'mild', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ProgressBar({ value, tone = 'accent' }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress__fill progress__fill--${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Кольцо готовности. */
export function ReadinessRing({ value, tone, size = 132, label = 'готовность' }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`ring__value ring__value--${tone}`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__center">
        <span className="ring__value-text">{value}%</span>
        <span className="ring__label">{label}</span>
      </div>
    </div>
  );
}

export function Loader({ text = 'Загружаем…' }) {
  return (
    <div className="center-state">
      <Spinner size={32} appearance="themed" />
      <Typography.Body variant="small" className="muted">
        {text}
      </Typography.Body>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const outsideMax = error?.status === 401;
  return (
    <div className="center-state">
      <div className="center-state__icon">{outsideMax ? '🔒' : '⚠️'}</div>
      <Typography.Title variant="medium-strong">{outsideMax ? 'Откройте приложение из MAX' : 'Что-то пошло не так'}</Typography.Title>
      <Typography.Body variant="small" className="muted">
        {outsideMax
          ? 'Приложение работает внутри мессенджера MAX: найдите бота «Готов к проверке» и нажмите «Открыть приложение».'
          : error?.message}
      </Typography.Body>
      {onRetry && !outsideMax && (
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.tone || 'info'}`} role="status">
      {toast.text}
    </div>
  );
}
