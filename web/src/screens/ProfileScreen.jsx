import { Button, CellHeader, CellList, CellSimple, Switch } from '@maxhub/max-ui';
import { useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../max.js';
import { Screen } from '../ui.jsx';

function Choice({ selected, onSelect, title, subtitle, icon }) {
  return (
    <button type="button" className={`choice ${selected ? 'choice--selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      {icon && <span className="choice__icon">{icon}</span>}
      <span className="choice__text">
        <b>{title}</b>
        {subtitle && <span className="muted small">{subtitle}</span>}
      </span>
      <span className="choice__mark" aria-hidden="true" />
    </button>
  );
}

export default function ProfileScreen({ catalog, me, go, refresh, notify }) {
  const initial = me.profile || { legalForm: null, activity: null, hasStaff: true, flags: {} };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const activity = catalog.activities.find((a) => a.id === form.activity);
  const valid = form.legalForm && form.activity;

  const update = (patch) => {
    haptic('light');
    setForm((f) => ({ ...f, ...patch }));
  };

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await api.saveProfile(form);
      await api.startCheck();
      await refresh();
      haptic('success');
      go({ name: 'check' }, { replace: true });
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Профиль бизнеса"
      subtitle="Подберём только те требования, которые касаются именно вас"
      footer={
        <Button size="large" stretched disabled={!valid} loading={saving} onClick={submit}>
          {me.activeCheck ? 'Сохранить и начать заново' : 'Подобрать требования'}
        </Button>
      }
    >
      <CellHeader titleStyle="caps">Чем вы занимаетесь</CellHeader>
      <div className="choices">
        {catalog.activities.map((a) => (
          <Choice
            key={a.id}
            icon={a.emoji}
            title={a.title}
            subtitle={`Проверяют: ${a.authorities.slice(0, 3).join(', ')}`}
            selected={form.activity === a.id}
            onSelect={() => update({ activity: a.id, flags: {} })}
          />
        ))}
      </div>

      <CellHeader titleStyle="caps">Форма бизнеса</CellHeader>
      <div className="choices choices--row">
        {catalog.legalForms.map((f) => (
          <Choice key={f.id} title={f.title} selected={form.legalForm === f.id} onSelect={() => update({ legalForm: f.id })} />
        ))}
      </div>
      <p className="hint">Суммы штрафов для ИП и организаций различаются в десятки раз.</p>

      <CellList mode="island" filled header={<CellHeader titleStyle="caps">Уточнения</CellHeader>}>
        <CellSimple
          as="label"
          title="Есть наёмные сотрудники"
          subtitle="Медкнижки, трудовые договоры, охрана труда"
          after={<Switch checked={form.hasStaff} onChange={(e) => update({ hasStaff: e.target.checked })} />}
        />
        {activity?.flags?.map((flag) => (
          <CellSimple
            key={flag.id}
            as="label"
            title={flag.question}
            after={
              <Switch
                checked={Boolean(form.flags?.[flag.id])}
                onChange={(e) => update({ flags: { ...form.flags, [flag.id]: e.target.checked } })}
              />
            }
          />
        ))}
      </CellList>
    </Screen>
  );
}
