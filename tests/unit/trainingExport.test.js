import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingReport, csvCell, exportPreset, reportNotes, trainingReportCsv, trainingReportText, validateExportRange } from '../../src/domain/trainingExport.js';
import { EXPORT_TEXT } from '../../src/exportLocale.js';

const log = (overrides = {}) => ({ week: '2026-W40', day: 1, exerciseId: 'bf_B01', date: '2026-10-14', variant: 'dumbbell', loadKg: 5, loadBasis: 'per_dumbbell', resistanceLabel: 'PRIVATE_RESISTANCE_NOTE', unit: 'reps', perSide: true,
  sets: [{ value: 6, otherSide: 5 }, { value: 0, otherSide: 2 }], rir: 0, quality: 'unknown', symptoms: 'worse', nextDay: 'pending',
  planned: { sets: 3, value: '8', unit: 'reps', perSide: true, phase: 'strength', restSeconds: 90 }, schemaVersion: 1, ...overrides });
const args = { from: '2026-10-10', to: '2026-10-16', today: '2026-10-16', exercises: { bf_B01: { name: '分腿蹲' }, bf_A12: { name: '每日暖身流程' } } };
const make = overrides => buildTrainingReport({ ...args, logs: [log()], ...overrides });

test('presets, inclusive calendar ranges and year/leap boundaries validate independently of plan weeks', () => {
  assert.deepEqual(exportPreset('seven', '2026-01-01'), { from: '2025-12-26', to: '2026-01-01' });
  assert.deepEqual(exportPreset('thirty', '2024-03-01'), { from: '2024-02-01', to: '2024-03-01' });
  assert.deepEqual(exportPreset('week', '2026-01-01'), { from: '2025-12-29', to: '2026-01-01' });
  assert.doesNotThrow(() => validateExportRange('2024-01-01', '2024-12-31', '2026-10-16'));
  for (const [from, to] of [['2026-02-30', args.to], [args.to, args.from], [args.from, '2026-10-17'], ['2024-01-01', '2025-01-01'], ['', '']]) assert.throws(() => validateExportRange(from, to, args.today), /INVALID_EXPORT_RANGE/);
  const report = make({ logs: [log({ date: args.from }), log({ day: 2, date: args.to }), log({ day: 3, date: '2026-10-09' }), log({ day: 4, date: '2026-10-17' })] });
  assert.deepEqual(report.entries.map(entry => entry.date), [args.from, args.to]);
  assert.equal(report.counts.actual, 2, 'actual dates count, not the older scheduled plan week');
});

test('actuals retain both sides, zeros, weight convention and unknowns without using prescribed targets', () => {
  const report = make({ logs: [log(), log(), log({ exerciseId: 'deleted_move', day: 2, loadKg: null, rir: null })] });
  assert.equal(report.counts.actual, 2);
  assert.equal(report.counts.actualDays, 1);
  assert.deepEqual(report.entries[0].sets, log().sets);
  const text = trainingReportText(report);
  assert.match(text, /6 \/ 5 · 0 \/ 2/);
  assert.match(text, /餘力（次）: 0/);
  assert.match(text, /每顆啞鈴/);
  assert.match(text, /未記錄/);
  assert.match(text, /deleted_move/);
  assert.equal(JSON.stringify(report).includes('planned'), false);
  assert.equal(text.includes('3 × 8'), false, 'planned volume must not replace actual sets');
  const source = log(); const clone = structuredClone(source); make({ logs: [source] }); assert.deepEqual(source, clone);
});

test('dated marks are separate from actuals, deduplicated by plan identity and never dated from the schedule', () => {
  const progress = { '2026-W40': { completed: { day1_bf_B01: true, day2_bf_A12: true, day3_undated: true, day4_old: true, day5_unchecked: false },
    completedAt: { day1_bf_B01: args.from, day2_bf_A12: args.to, day4_old: '2026-10-01' }, scheduleSnapshot: [{ secret: 'PRIVATE_PLAN' }] } };
  const report = make({ progress });
  assert.deepEqual(report.counts, { actual: 1, actualDays: 1, completion: 1 });
  assert.deepEqual(report.entries.find(entry => entry.kind === 'completion'), { date: args.to, kind: 'completion', name: '每日暖身流程' });
  assert.equal(report.warnings.undated, 1);
  assert.equal(JSON.stringify(report).includes('PRIVATE_PLAN'), false);
  assert.match(trainingReportText(report), /缺少有效實際日期/);
  const actualOutside = make({ logs: [log({ date: '2026-10-01' })], progress });
  assert.equal(actualOutside.counts.actual, 0);
  assert.equal(actualOutside.counts.completion, 2, 'a dated mark may appear without an in-range actual; it is explicitly only a mark');
  assert.equal(make({ progress, includeCompletions: false }).counts.completion, 0);
});

test('privacy defaults are allowlisted and optional descriptions/responses require explicit selection', () => {
  const report = make({ uid: 'PRIVATE_UID', apiKey: 'PRIVATE_KEY', readiness: [{ healthNotes: 'PRIVATE_HEALTH' }], metrics: [{ weight: 99 }] });
  for (const output of [JSON.stringify(report), trainingReportText(report), trainingReportCsv(report)]) {
    for (const secret of ['PRIVATE_RESISTANCE_NOTE', 'PRIVATE_UID', 'PRIVATE_KEY', 'PRIVATE_HEALTH', 'nextDay', 'symptoms']) assert.ok(!output.includes(secret), secret);
  }
  const optIn = make({ includeDescriptions: true, includeResponses: true });
  assert.ok(trainingReportText(optIn).includes('PRIVATE_RESISTANCE_NOTE'));
  assert.ok(trainingReportText(optIn).includes('症狀增加'));
  assert.ok(trainingReportCsv(optIn).includes('PRIVATE_RESISTANCE_NOTE'));
  assert.ok(!trainingReportText(make({ includeDescriptions: 'false', includeResponses: 'true' })).includes('PRIVATE_RESISTANCE_NOTE'), 'only a boolean true opts into private text');
  assert.equal(make({ logs: [log({ exerciseId: 'constructor' })] }).entries[0].name, 'constructor', 'prototype names are not borrowed as exercise names');
  assert.equal(make({ logs: [log({ uid: 'PRIVATE_UID' })] }).entries.length, 0, 'invalid raw documents are not serialized');
  assert.equal(make({ logs: [log({ uid: 'PRIVATE_UID' })] }).warnings.invalid, 1);
});

test('CSV preserves Chinese, quotes, multiline text and defuses spreadsheet formulas', () => {
  for (const value of ['=HYPERLINK("evil")', '  +SUM(1,2)', '-1+1', '@SUM(A1)', '\t=1', '\rfoo', '\n=1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('5 kg'), '"5 kg"');
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  const report = make({ exercises: { bf_B01: { name: '=HYPERLINK("url")' } }, includeDescriptions: true });
  const csv = trainingReportCsv(report);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""url"")"'));
  assert.ok(csv.includes('每顆啞鈴'));
  assert.equal(report.entries[0].name, '=HYPERLINK("url")', 'sanitization does not alter stored/displayed names');
});

test('English reports and both sources disclose their scope with matching locale controls', () => {
  assert.deepEqual(Object.keys(EXPORT_TEXT.zh).sort(), Object.keys(EXPORT_TEXT.en).sort());
  const report = make({ source: 'preview', includeResponses: true });
  assert.match(trainingReportText(report, 'en'), /temporary preview/);
  assert.match(trainingReportCsv(report, 'en'), /Actual training log/);
  assert.match(reportNotes(make(), 'en').join(' '), /saved records/);
  assert.match(trainingReportText(make({ logs: [] }), 'en'), /Actual training log: 0/);
});
