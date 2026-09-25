// Справочник требований. Ядро продукта не зависит от содержимого: новая отрасль
// или регион подключается добавлением данных в checklists.json, без изменения кода.
import { readFileSync } from 'node:fs';

const SEVERITIES = ['high', 'medium', 'low'];
const SECTION_ORDER = ['docs', 'sanitary', 'staff', 'fire'];

export function loadCatalog(url = new URL('../data/checklists.json', import.meta.url)) {
  const raw = JSON.parse(readFileSync(url, 'utf8'));
  validateCatalog(raw);
  return raw;
}

export function validateCatalog(catalog) {
  const ids = new Set();
  for (const activity of catalog.activities) {
    if (!activity.id || !activity.title || !Array.isArray(activity.items)) {
      throw new Error(`Некорректное описание вида деятельности: ${activity.id}`);
    }
    for (const item of activity.items) {
      if (ids.has(item.id)) throw new Error(`Повторяющийся id требования: ${item.id}`);
      ids.add(item.id);
      if (!SEVERITIES.includes(item.severity)) throw new Error(`Неизвестная критичность у ${item.id}`);
      if (!catalog.sectionTitles[item.section]) throw new Error(`Неизвестный раздел у ${item.id}`);
      if (!item.question || !item.basis || !item.fix) throw new Error(`Не заполнены поля у ${item.id}`);
    }
  }
}

export function getActivity(catalog, activityId) {
  return catalog.activities.find((a) => a.id === activityId) || null;
}

/** Требования, применимые к профилю бизнеса, в порядке разделов. */
export function applicableItems(catalog, profile) {
  const activity = getActivity(catalog, profile.activity);
  if (!activity) return [];
  const flags = profile.flags || {};
  return activity.items
    .filter((item) => {
      const when = item.when || {};
      if (when.hasStaff !== undefined && Boolean(profile.hasStaff) !== when.hasStaff) return false;
      if (when.flags && !when.flags.every((f) => flags[f])) return false;
      return true;
    })
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));
}

export function findItem(catalog, itemId) {
  for (const activity of catalog.activities) {
    const item = activity.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

/** Публичное представление справочника для мини-приложения. */
export function publicCatalog(catalog) {
  return {
    version: catalog.version,
    dataStatus: catalog.dataStatus,
    disclaimer: catalog.disclaimer,
    sources: catalog.sources,
    legalForms: catalog.legalForms,
    sectionTitles: catalog.sectionTitles,
    activities: catalog.activities.map(({ items, ...rest }) => ({ ...rest, itemsCount: items.length })),
  };
}
