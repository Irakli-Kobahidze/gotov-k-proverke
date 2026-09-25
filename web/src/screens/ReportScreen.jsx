import { Button, CellHeader, Typography } from '@maxhub/max-ui';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../max.js';
import {
  ANSWER,
  Badge,
  Card,
  ErrorState,
  LEVEL,
  Loader,
  ProgressBar,
  ReadinessRing,
  SEVERITY,
  Screen,
  fineRangeText,
  formatDate,
  formatRub,
} from '../ui.jsx';

export default function ReportScreen({ catalog, checkId, go, home, notify }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    api.report(checkId).then(setReport).catch(setError);
  }, [checkId]);

  if (error) return <ErrorState error={error} />;
  if (!report) return <Loader text="Считаем риски…" />;

  const level = LEVEL[report.initial.level];
  const { counts, fines } = report.initial;
  const fixed = report.problems.filter((p) => p.task?.status === 'done').length;

  async function share() {
    setSharing(true);
    try {
      await api.share(report.checkId);
      haptic('success');
      notify('Отчёт отправлен в чат с ботом', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen
      title="Отчёт самопроверки"
      subtitle={`${report.activity} · ${report.profile.legalForm === 'ip' ? 'ИП' : 'ООО / АО'} · ${formatDate(report.completedAt)}`}
      footer={
        <div className="footer-actions">
          <Button size="large" stretched onClick={() => go({ name: 'tasks' })} disabled={!report.problems.length}>
            План исправлений{report.problems.length ? ` · ${report.problems.length - fixed}` : ''}
          </Button>
          <Button size="large" variant="secondary" loading={sharing} onClick={share} aria-label="Отправить отчёт в чат">
            В чат
          </Button>
        </div>
      }
    >
      <Card className="report-hero">
        <ReadinessRing value={report.initial.readiness} tone={level.tone} />
        <span className={`level level--${level.tone}`}>{level.title}</span>
        {report.readiness !== report.initial.readiness && (
          <span className="small">
            С учётом исправлений: <b>{report.readiness}%</b> ({LEVEL[report.level].title.toLowerCase()})
          </span>
        )}
        <div className="stats">
          <div className="stat stat--good">
            <b>{counts.yes}</b>
            <span>выполнено</span>
          </div>
          <div className="stat stat--bad">
            <b>{counts.no}</b>
            <span>нарушений</span>
          </div>
          <div className="stat stat--warn">
            <b>{counts.unknown}</b>
            <span>уточнить</span>
          </div>
        </div>
      </Card>

      <Card tone={fines.max ? 'bad' : 'good'}>
        <Typography.Label variant="medium-strong">Возможные штрафы при проверке</Typography.Label>
        <Typography.Headline variant="small" className="fine-sum">
          {fineRangeText(fines)}
        </Typography.Headline>
        <span className="muted small">
          Сумма по всем пунктам с ответами «Нет» и «Не знаю» для {report.profile.legalForm === 'ip' ? 'ИП' : 'организации'}
          {fines.withoutAmount ? `; ещё ${fines.withoutAmount} п. — с особыми санкциями` : ''}. Ориентировочно.
        </span>
      </Card>

      <CellHeader titleStyle="caps">По разделам</CellHeader>
      <Card>
        {Object.entries(report.sections).map(([id, s]) => {
          const pct = s.total ? Math.round(((s.total - s.problems) / s.total) * 100) : 0;
          return (
            <div key={id} className="section-row">
              <div className="row row--between">
                <span className="small">{catalog.sectionTitles[id]}</span>
                <span className="muted small">
                  {s.total - s.problems}/{s.total}
                </span>
              </div>
              <ProgressBar value={pct} tone={pct === 100 ? 'good' : pct >= 60 ? 'warn' : 'bad'} />
            </div>
          );
        })}
      </Card>

      {report.problems.length > 0 && <CellHeader titleStyle="caps">Что исправить — по приоритету</CellHeader>}
      {report.problems.map((p) => (
        <Card key={p.itemId} className={`problem ${p.task?.status === 'done' ? 'problem--done' : ''}`}>
          <div className="row row--wrap">
            <Badge tone={SEVERITY[p.severity].tone}>{SEVERITY[p.severity].short}</Badge>
            <Badge tone={ANSWER[p.answer].tone}>{p.answer === 'no' ? 'Нарушение' : 'Нужно уточнить'}</Badge>
            {p.task?.status === 'done' && <Badge tone="good">Исправлено</Badge>}
          </div>
          <b className="problem__fix">{p.fix}</b>
          <span className="muted small">{p.question}</span>
          <div className="problem__meta small">
            <span>📚 {p.basis}</span>
            <span>
              💸 {p.fineArticle}
              {p.fine ? `: до ${formatRub(p.fine.max)}` : ''}
            </span>
            {p.task && p.task.status !== 'done' && <span>⏳ Срок: {formatDate(p.task.dueAt)}</span>}
          </div>
        </Card>
      ))}

      {!report.problems.length && (
        <Card tone="good" className="center">
          <div className="done-card__icon">🎉</div>
          <b>Нарушений не найдено</b>
          <span className="muted small">Соберите документы в одну папку — это ускорит проверку.</span>
        </Card>
      )}

      <button type="button" className="link-button" onClick={() => setShowSources((v) => !v)}>
        {showSources ? 'Скрыть источники' : `Источники требований (${catalog.sources.length})`}
      </button>
      {showSources && (
        <ul className="sources">
          {catalog.sources.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ul>
      )}
      <p className="disclaimer">{report.disclaimer}</p>
      <Button variant="ghost" stretched onClick={home}>
        На главную
      </Button>
    </Screen>
  );
}
