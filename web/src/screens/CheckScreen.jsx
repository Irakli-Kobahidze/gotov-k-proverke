import { Button, Textarea, Typography } from '@maxhub/max-ui';
import { useEffect, useRef, useState } from 'react';
import { api, compressImage } from '../api.js';
import { haptic } from '../max.js';
import { ANSWER, Badge, Card, ErrorState, Loader, ProgressBar, SEVERITY, Screen, formatRub } from '../ui.jsx';

function fineLine(item, legalForm) {
  const range = item.fine?.[legalForm];
  const amount = Array.isArray(range)
    ? range[0] === range[1]
      ? `от ${formatRub(range[0])}`
      : `${formatRub(range[0])} – ${formatRub(range[1])}`
    : null;
  return [item.fine?.article, amount].filter(Boolean).join(': ');
}

export default function CheckScreen({ catalog, go, refresh, notify }) {
  const [check, setCheck] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [comment, setComment] = useState('');
  const [photoState, setPhotoState] = useState({});
  const [completing, setCompleting] = useState(false);
  const fileInput = useRef();
  const advanceTimer = useRef();

  useEffect(() => {
    api
      .currentCheck()
      .then((c) => {
        setCheck(c);
        const next = c.items.findIndex((i) => !i.answer);
        setIndex(next === -1 ? c.items.length : next);
      })
      .catch(setError);
    return () => clearTimeout(advanceTimer.current);
  }, []);

  const item = check?.items[index];
  useEffect(() => {
    setComment(item?.comment || '');
    setShowDetails(false);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    if (error.status === 404) {
      return (
        <Screen title="Нет активной проверки">
          <Button size="large" stretched onClick={() => go({ name: 'profile' }, { replace: true })}>
            Начать самопроверку
          </Button>
        </Screen>
      );
    }
    return <ErrorState error={error} />;
  }
  if (!check) return <Loader text="Загружаем чек-лист…" />;

  const total = check.items.length;
  const answered = check.items.filter((i) => i.answer).length;
  const allDone = answered === total;
  const legalForm = check.profile.legalForm;

  async function answer(value) {
    if (saving) return;
    haptic('light');
    setSaving(value);
    try {
      const updated = await api.answer(check.id, item.id, value, comment || undefined);
      setCheck(updated);
      const nextIndex = updated.items.findIndex((i, n) => n > index && !i.answer);
      const fallback = updated.items.findIndex((i) => !i.answer);
      const target = nextIndex !== -1 ? nextIndex : fallback !== -1 ? fallback : total;
      // Короткая пауза, чтобы пользователь увидел выбранный ответ.
      advanceTimer.current = setTimeout(() => setIndex(target), value === 'yes' ? 250 : 450);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }

  async function attachPhoto(file) {
    if (!file) return;
    setPhotoState((s) => ({ ...s, [item.id]: { uploading: true } }));
    try {
      const dataUrl = await compressImage(file);
      await api.uploadPhoto(check.id, item.id, dataUrl);
      setPhotoState((s) => ({ ...s, [item.id]: { preview: dataUrl } }));
      setCheck((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, hasPhoto: true } : i)) }));
      haptic('success');
      notify('Фото сохранено — пригодится на проверке', 'success');
    } catch (err) {
      setPhotoState((s) => ({ ...s, [item.id]: {} }));
      notify(err.message, 'error');
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      const report = await api.complete(check.id);
      haptic('success');
      await refresh();
      go({ name: 'report', checkId: report.checkId }, { replace: true });
    } catch (err) {
      notify(err.message, 'error');
      setCompleting(false);
    }
  }

  const header = (
    <div className="check-head">
      <div className="row row--between">
        <span className="muted small">
          {check.activity} · {answered} из {total}
        </span>
        <button type="button" className="link-button" onClick={() => setShowMap((v) => !v)}>
          {showMap ? 'Скрыть список' : 'Все вопросы'}
        </button>
      </div>
      <ProgressBar value={(answered / total) * 100} />
      {showMap && (
        <div className="qmap" role="list">
          {check.items.map((i, n) => (
            <button
              key={i.id}
              type="button"
              role="listitem"
              className={`qmap__dot ${i.answer ? `qmap__dot--${ANSWER[i.answer].tone}` : ''} ${n === index ? 'qmap__dot--current' : ''}`}
              onClick={() => {
                setIndex(n);
                setShowMap(false);
              }}
              aria-label={`Вопрос ${n + 1}${i.answer ? `, ответ: ${ANSWER[i.answer].label}` : ''}`}
            >
              {n + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!item) {
    return (
      <Screen>
        {header}
        <Card className="done-card">
          <div className="done-card__icon">{allDone ? '🎯' : '📝'}</div>
          <Typography.Title variant="medium-strong">{allDone ? 'Все вопросы пройдены' : 'Остались вопросы без ответа'}</Typography.Title>
          <Typography.Body variant="small" className="muted">
            {allDone
              ? 'Посчитаем готовность, возможные штрафы и составим план исправлений со сроками.'
              : `Ответьте ещё на ${total - answered} вопр., чтобы получить отчёт.`}
          </Typography.Body>
          {allDone ? (
            <Button size="large" stretched loading={completing} onClick={complete}>
              Получить отчёт
            </Button>
          ) : (
            <Button size="large" stretched onClick={() => setIndex(check.items.findIndex((i) => !i.answer))}>
              К неотвеченным
            </Button>
          )}
        </Card>
      </Screen>
    );
  }

  const severity = SEVERITY[item.severity];
  const photo = photoState[item.id] || {};

  return (
    <Screen
      footer={
        <div className="answer-bar">
          {Object.entries(ANSWER).map(([value, a]) => (
            <button
              key={value}
              type="button"
              className={`answer answer--${a.tone} ${item.answer === value ? 'answer--selected' : ''}`}
              disabled={Boolean(saving)}
              onClick={() => answer(value)}
            >
              <span className="answer__icon">{saving === value ? '…' : a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      }
    >
      {header}

      <Card className="question">
        <div className="row row--wrap">
          <Badge tone="neutral">{catalog.sectionTitles[item.section]}</Badge>
          <Badge tone={severity.tone}>{severity.label}</Badge>
        </div>
        <span className="muted small">
          Вопрос {index + 1} из {total}
        </span>
        <Typography.Title variant="large-strong" className="question__text">
          {item.question}
        </Typography.Title>

        <button type="button" className="details-toggle" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>
          {showDetails ? 'Скрыть подробности' : 'Что проверит инспектор и какой штраф?'}
          <span className={`chevron ${showDetails ? 'chevron--up' : ''}`} aria-hidden="true" />
        </button>

        {showDetails && (
          <dl className="details">
            <dt>Требование</dt>
            <dd>{item.requirement}</dd>
            <dt>Основание</dt>
            <dd>{item.basis}</dd>
            <dt>Кто проверяет</dt>
            <dd>{item.authority}</dd>
            <dt>Ответственность</dt>
            <dd>
              {fineLine(item, legalForm)}
              {item.fine?.note && <span className="muted"> {item.fine.note}</span>}
            </dd>
            <dt>Как исправить</dt>
            <dd>{item.fix}</dd>
          </dl>
        )}
      </Card>

      {item.answer && (
        <Card className="evidence">
          <Typography.Label variant="medium-strong">Подтверждение (необязательно)</Typography.Label>
          <Textarea
            mode="secondary"
            rows={2}
            maxLength={500}
            placeholder="Комментарий: номер договора, где лежит журнал…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => {
              if (comment !== (item.comment || '')) {
                api
                  .answer(check.id, item.id, item.answer, comment)
                  .then((c) => {
                    setCheck(c);
                    notify('Комментарий сохранён', 'success');
                  })
                  .catch((err) => notify(err.message, 'error'));
              }
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              attachPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="row">
            {photo.preview && <img className="thumb" src={photo.preview} alt="Прикреплённое фото" />}
            <Button
              variant="secondary"
              size="medium"
              loading={photo.uploading}
              onClick={() => fileInput.current?.click()}
            >
              {item.hasPhoto ? '📷 Заменить фото' : '📷 Прикрепить фото'}
            </Button>
          </div>
        </Card>
      )}

      <div className="row row--between nav-row">
        <Button variant="ghost" size="medium" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ← Назад
        </Button>
        <Button variant="ghost" size="medium" onClick={() => setIndex(index + 1)}>
          {index + 1 < total ? 'Пропустить →' : 'К итогам →'}
        </Button>
      </div>
    </Screen>
  );
}
