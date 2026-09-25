import { Button, CellHeader } from '@maxhub/max-ui';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../max.js';
import { Badge, Card, ErrorState, Loader, ProgressBar, SEVERITY, Screen, formatDate } from '../ui.jsx';

export default function TasksScreen({ go, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.tasks().then(setData).catch(setError);
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!data) return <Loader />;

  const { tasks } = data;
  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');

  async function patch(task, body, message) {
    setBusy(task.id);
    try {
      const updated = await api.setTask(task.id, body);
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? updated : t)) }));
      haptic(body.status === 'done' ? 'success' : 'light');
      notify(message, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!tasks.length) {
    return (
      <Screen title="План исправлений">
        <Card tone="good" className="center">
          <div className="done-card__icon">🎉</div>
          <b>Исправлять нечего</b>
          <span className="muted small">По итогам последней проверки нарушений нет.</span>
        </Card>
      </Screen>
    );
  }

  const renderTask = (t) => (
    <Card key={t.id} className={`task ${t.status === 'done' ? 'task--done' : ''} ${t.overdue ? 'task--overdue' : ''}`}>
      <div className="row row--wrap">
        <Badge tone={SEVERITY[t.severity]?.tone}>{SEVERITY[t.severity]?.short}</Badge>
        {t.status === 'done' ? (
          <Badge tone="good">Исправлено {t.doneAt ? formatDate(t.doneAt) : ''}</Badge>
        ) : (
          <Badge tone={t.overdue ? 'bad' : 'neutral'}>
            {t.overdue ? 'Просрочено: ' : 'До '}
            {formatDate(t.dueAt)}
          </Badge>
        )}
      </div>
      <b>{t.fix}</b>
      <span className="muted small">{t.question}</span>
      {t.status === 'open' ? (
        <div className="row">
          <Button size="medium" loading={busy === t.id} onClick={() => patch(t, { status: 'done' }, 'Отлично! Готовность выросла')}>
            ✓ Исправлено
          </Button>
          <Button size="medium" variant="secondary" disabled={busy === t.id} onClick={() => patch(t, { snoozeDays: 3 }, 'Срок перенесён на 3 дня')}>
            +3 дня
          </Button>
        </div>
      ) : (
        <Button size="small" variant="ghost" onClick={() => patch(t, { status: 'open' }, 'Задача снова открыта')}>
          Вернуть в работу
        </Button>
      )}
    </Card>
  );

  return (
    <Screen
      title="План исправлений"
      subtitle="Напомним в чате MAX за день до каждого срока"
      footer={
        data.checkId && (
          <Button size="large" variant="secondary" stretched onClick={() => go({ name: 'report', checkId: data.checkId })}>
            Открыть отчёт
          </Button>
        )
      }
    >
      <Card>
        <div className="row row--between">
          <b>
            Выполнено {done.length} из {tasks.length}
          </b>
          <span className="muted small">{Math.round((done.length / tasks.length) * 100)}%</span>
        </div>
        <ProgressBar value={(done.length / tasks.length) * 100} tone="good" />
      </Card>

      {open.length > 0 && <CellHeader titleStyle="caps">В работе · {open.length}</CellHeader>}
      {open.map(renderTask)}
      {done.length > 0 && <CellHeader titleStyle="caps">Готово · {done.length}</CellHeader>}
      {done.map(renderTask)}
    </Screen>
  );
}
