import { Button, CellList, CellSimple, Counter, Typography } from '@maxhub/max-ui';
import { useState } from 'react';
import { api } from '../api.js';
import { Card, LEVEL, ProgressBar, ReadinessRing, Screen, fineRangeText, formatDate } from '../ui.jsx';

export default function HomeScreen({ catalog, me, go, notify, refresh }) {
  const [starting, setStarting] = useState(false);
  const { profile, activeCheck, lastReport, tasksSummary } = me;
  const activity = profile && catalog.activities.find((a) => a.id === profile.activity);

  async function startNew() {
    if (!profile) return go({ name: 'profile' });
    setStarting(true);
    try {
      await api.startCheck();
      await refresh();
      go({ name: 'check' });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setStarting(false);
    }
  }

  const firstName = me.user.name?.split(' ')[0];

  return (
    <Screen>
      <div className="hero">
        <div className="hero__logo" aria-hidden="true">✓</div>
        <div>
          <Typography.Headline variant="medium" className="hero__title">
            Готов к проверке
          </Typography.Headline>
          <Typography.Body variant="small" className="muted">
            {firstName ? `${firstName}, п` : 'П'}одготовьтесь к проверке заранее — без штрафов и консультантов
          </Typography.Body>
        </div>
      </div>

      {!profile && !lastReport && (
        <Card className="intro">
          <ol className="steps">
            <li>
              <b>3 вопроса о бизнесе</b>
              <span className="muted">вид деятельности, ИП или ООО, есть ли сотрудники</span>
            </li>
            <li>
              <b>Чек-лист только под вас</b>
              <span className="muted">13–19 требований Роспотребнадзора, МЧС, ГИТ и ФНС</span>
            </li>
            <li>
              <b>Отчёт и план исправлений</b>
              <span className="muted">риски, возможные штрафы, сроки и напоминания в чат</span>
            </li>
          </ol>
          <Button size="large" stretched onClick={() => go({ name: 'profile' })}>
            Начать самопроверку
          </Button>
          <Typography.Body variant="small" className="muted center">
            Займёт 5–7 минут
          </Typography.Body>
        </Card>
      )}

      {activeCheck && (
        <Card tone="accent">
          <div className="row row--between">
            <Typography.Title variant="small-strong">Проверка не завершена</Typography.Title>
            <span className="muted small">
              {activeCheck.progress.answered} из {activeCheck.progress.total}
            </span>
          </div>
          <ProgressBar value={(activeCheck.progress.answered / activeCheck.progress.total) * 100} />
          <Button size="large" stretched onClick={() => go({ name: 'check' })}>
            Продолжить
          </Button>
        </Card>
      )}

      {lastReport && (
        <Card>
          <div className="report-summary">
            <ReadinessRing value={lastReport.readiness} tone={LEVEL[lastReport.level].tone} size={112} />
            <div className="report-summary__text">
              <span className={`level level--${LEVEL[lastReport.level].tone}`}>{LEVEL[lastReport.level].title}</span>
              <span className="muted small">Проверка от {formatDate(lastReport.completedAt)}</span>
              <span className="small">
                Возможные штрафы: <b>{fineRangeText(lastReport.initial.fines)}</b>
              </span>
            </div>
          </div>
          <CellList mode="island" filled>
            <CellSimple
              title="Отчёт и риски"
              subtitle={`${lastReport.problems.length} пунктов требуют внимания`}
              showChevron
              onClick={() => go({ name: 'report', checkId: lastReport.checkId })}
            />
            <CellSimple
              title="План исправлений"
              subtitle={
                tasksSummary.overdue
                  ? `Просрочено: ${tasksSummary.overdue}`
                  : `Выполнено ${tasksSummary.done} из ${tasksSummary.done + tasksSummary.open}`
              }
              after={tasksSummary.open ? <Counter value={tasksSummary.open} variant={tasksSummary.overdue ? 'attention' : 'primary'} rounded /> : null}
              showChevron
              onClick={() => go({ name: 'tasks' })}
            />
          </CellList>
        </Card>
      )}

      {profile && (
        <Card>
          <div className="row row--between">
            <div className="stack-xs">
              <span className="muted small">Профиль бизнеса</span>
              <b>
                {activity?.emoji} {activity?.title}
              </b>
              <span className="muted small">
                {profile.legalForm === 'ip' ? 'ИП' : 'ООО / АО'} · {profile.hasStaff ? 'с сотрудниками' : 'без сотрудников'}
              </span>
            </div>
            <Button size="small" variant="secondary" style={{ flex: 'none' }} onClick={() => go({ name: 'profile' })}>
              Изменить
            </Button>
          </div>
          {!activeCheck && (
            <Button size="large" stretched variant={lastReport ? 'secondary' : 'primary'} loading={starting} onClick={startNew}>
              {lastReport ? 'Пройти проверку заново' : 'Начать самопроверку'}
            </Button>
          )}
        </Card>
      )}

      <p className="disclaimer">
        {catalog.disclaimer}
        {catalog.dataStatus === 'demo' && ' Версия MVP: требования — демонстрационный набор, реальные интеграции с ФГИС ЕРКНМ не подключены.'}
      </p>
    </Screen>
  );
}
