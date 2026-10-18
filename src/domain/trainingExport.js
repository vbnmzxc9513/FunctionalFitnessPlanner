import { isCalendarDate, localDate, dateForWeekDay, getWeekString } from './dates.js';
import { validateTrainingLog, trainingLogId } from './coaching.js';
import { coachText } from '../coachLocale.js';
import { exportText } from '../exportLocale.js';

export function validateExportRange(from, to, today = localDate()) {
  if (![from, to, today].every(isCalendarDate) || from > to || to > today
    || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 >= 366) throw new Error('INVALID_EXPORT_RANGE');
  return { from, to };
}

export function exportPreset(preset, today = localDate()) {
  if (!isCalendarDate(today)) throw new Error('INVALID_EXPORT_RANGE');
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (preset === 'thirty' ? 29 : 6));
  return { from: preset === 'week' ? dateForWeekDay(getWeekString(new Date(`${today}T12:00:00`))) : start.toISOString().slice(0, 10), to: today };
}

// Construct an allowlisted report, never serialize raw account documents. Targets
// are not actual work; completion marks without dates cannot define this range.
export function buildTrainingReport({ from, to, today = localDate(), logs = [], progress = {}, exercises = {},
  includeCompletions = true, includeDescriptions = false, includeResponses = false, source = 'cloud' }) {
  validateExportRange(from, to, today);
  includeDescriptions = includeDescriptions === true;
  includeResponses = includeResponses === true;
  const entries = []; const actualIds = new Set(); const seen = new Set();
  let invalid = 0; let undated = 0;
  const nameFor = id => Object.hasOwn(exercises, id) && typeof exercises[id]?.name === 'string' && exercises[id].name.trim() ? exercises[id].name.trim() : id;
  for (const raw of logs) {
    let log;
    try { log = validateTrainingLog(raw, { today }); } catch { invalid++; continue; }
    if (log.date < from || log.date > to) continue;
    const id = trainingLogId(log);
    if (seen.has(id)) continue;
    seen.add(id); actualIds.add(id);
    entries.push({ date: log.date, kind: 'actual', name: nameFor(log.exerciseId), phase: log.planned.phase,
      variant: log.variant, loadKg: log.loadKg, loadBasis: log.loadBasis, unit: log.unit, perSide: log.perSide,
      sets: log.sets.map(set => ({ ...set })), rir: log.rir, quality: log.quality,
      ...(includeDescriptions ? { description: log.resistanceLabel } : {}),
      ...(includeResponses ? { symptoms: log.symptoms, nextDay: log.nextDay } : {}) });
  }
  if (includeCompletions) for (const [week, record] of Object.entries(progress)) {
    if (!dateForWeekDay(week)) continue;
    for (const [key, done] of Object.entries(record?.completed || {})) {
      if (done !== true) continue;
      const match = /^day([1-7])_([A-Za-z0-9_-]{1,80})$/.exec(key);
      if (!match) { invalid++; continue; }
      const id = `${week}-D${match[1]}-${match[2]}`;
      if (actualIds.has(id)) continue;
      const date = record.completedAt?.[key];
      if (!isCalendarDate(date) || date > today) { undated++; continue; }
      if (date < from || date > to) continue;
      // No target, theme, note or health data is copied from a plan snapshot.
      entries.push({ date, kind: 'completion', name: nameFor(match[2]) });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { from, to, generated: today, source: source === 'preview' ? 'preview' : 'cloud',
    options: { includeDescriptions: !!includeDescriptions, includeResponses: !!includeResponses },
    entries, counts: { actual: entries.filter(entry => entry.kind === 'actual').length,
      actualDays: new Set(entries.filter(entry => entry.kind === 'actual').map(entry => entry.date)).size,
      completion: entries.filter(entry => entry.kind === 'completion').length }, warnings: { invalid, undated } };
}

export function reportNotes(report, lang = 'zh') {
  const t = exportText(lang);
  return [report.source === 'preview' ? t.previewOnly : t.cloud, t.scope,
    ...(report.warnings.undated ? [t.unknownDates.replace('{n}', report.warnings.undated)] : []),
    ...(report.warnings.invalid ? [t.invalidRecords.replace('{n}', report.warnings.invalid)] : [])];
}

function displayEntry(entry, lang) {
  const t = exportText(lang); const c = key => coachText(lang, key);
  if (entry.kind === 'completion') return [entry.date, t.completion, entry.name, t.checkedOnly];
  const phase = { zh: { legacy: '原有訓練', warmup: '暖身', skill: '協調與步伐', strength: '肌力', accessory: '輔助', recovery: '恢復', cooldown: '收操' },
    en: { legacy: 'Legacy training', warmup: 'Warm-up', skill: 'Coordination / footwork', strength: 'Strength', accessory: 'Accessory', recovery: 'Recovery', cooldown: 'Cooldown' } }[lang === 'en' ? 'en' : 'zh'][entry.phase];
  return [entry.date, t.actual, entry.name, phase, c(entry.variant), entry.loadKg ?? t.missing, c(entry.loadBasis), entry.sets.length,
    entry.sets.map(set => entry.perSide ? `${set.value} / ${set.otherSide}` : String(set.value)).join(' · '),
    c(`unit_${entry.unit}`), entry.perSide ? t.yes : t.no, entry.rir ?? t.missing, c(entry.quality)];
}

export function trainingReportText(report, lang = 'zh') {
  const t = exportText(lang); const c = key => coachText(lang, key);
  const lines = [t.report, `${t.period}: ${report.from} – ${report.to}`, `${t.generated}: ${report.generated}`,
    `${t.actual}: ${report.counts.actual} · ${t.days}: ${report.counts.actualDays} · ${t.completion}: ${report.counts.completion}`, ''];
  for (const entry of report.entries) {
    const cells = displayEntry(entry, lang);
    lines.push(`${entry.date} · ${cells[1]} · ${entry.name}`);
    if (entry.kind === 'completion') { lines.push(t.checkedOnly, ''); continue; }
    lines.push(`${t.phase}: ${cells[3]} · ${cells[4]}`,
      `${t.values}: ${cells[8]} ${cells[9]}${entry.perSide ? ` (${t.perSide}: ${t.yes})` : ''}`,
      `${t.load}: ${cells[5]} · ${t.basis}: ${cells[6]}`,
      `${t.rir}: ${cells[11]} · ${t.quality}: ${cells[12]}`);
    if (report.options.includeDescriptions) lines.push(`${t.description}: ${entry.description || t.missing}`);
    if (report.options.includeResponses) lines.push(`${t.symptoms}: ${c(entry.symptoms === 'none' ? 'noSymptoms' : entry.symptoms)} · ${t.nextDay}: ${c(entry.nextDay === 'good' ? 'nextDayGood' : entry.nextDay)}`);
    lines.push('');
  }
  return [...lines, ...reportNotes(report, lang)].join('\n');
}

// CSV quoting alone does not prevent spreadsheet formulas in custom names/text.
export function csvCell(value) {
  const text = String(value ?? '');
  const first = [...text].find(char => char.trim() && char.codePointAt(0) > 31);
  const safe = first && '=+@-'.includes(first) || ['\t', '\r', '\n'].includes(text[0]) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function trainingReportCsv(report, lang = 'zh') {
  const t = exportText(lang); const c = key => coachText(lang, key);
  const headings = [t.fromColumn, t.toColumn, t.date, t.kind, t.name, t.phase, t.variant, t.load, t.basis, t.sets, t.values, t.unit, t.perSide, t.rir, t.quality,
    ...(report.options.includeDescriptions ? [t.description] : []), ...(report.options.includeResponses ? [t.symptoms, t.nextDay] : []), t.notes];
  const rows = report.entries.map(entry => {
    const display = displayEntry(entry, lang);
    const cells = entry.kind === 'actual' ? display : [...display.slice(0, 3), ...Array(10).fill('')];
    return [report.from, report.to, ...cells,
      ...(report.options.includeDescriptions ? [entry.kind === 'actual' ? entry.description : ''] : []),
      ...(report.options.includeResponses ? [entry.kind === 'actual' ? c(entry.symptoms === 'none' ? 'noSymptoms' : entry.symptoms) : '', entry.kind === 'actual' ? c(entry.nextDay === 'good' ? 'nextDayGood' : entry.nextDay) : ''] : []),
      [...(entry.kind === 'completion' ? [t.checkedOnly] : []), ...reportNotes(report, lang)].join(' '),
    ];
  });
  return '\uFEFF' + [headings, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
