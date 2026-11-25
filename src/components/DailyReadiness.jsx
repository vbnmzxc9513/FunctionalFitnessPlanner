import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { coachText } from '../i18n/coach.js';
import { readinessForm, readinessInput, readinessMissing, readinessChanges } from '../domain/logForms.js';
import { evaluateReadiness, validateReadiness } from '../domain/coaching.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { localDate } from '../domain/dates.js';

const FEEL_OPTIONS = [
  { key: '0', zh: '狀態很好', en: 'Fresh', value: '0', tone: 'good' },
  { key: '2', zh: '略感疲勞', en: 'A bit tired', value: '2', tone: 'neutral' },
  { key: '3', zh: '偏累／痠痛', en: 'Tired / sore', value: '3', tone: 'warn' },
  { key: '4', zh: '非常疲勞', en: 'Exhausted', value: '4', tone: 'danger' },
];

const SYMPTOM_OPTIONS = [
  { key: 'none', zh: '無不適', en: 'No pain', tone: 'good' },
  { key: 'stable', zh: '原有微痠', en: 'Mild / stable', tone: 'warn' },
  { key: 'worse', zh: '症狀加重', en: 'Worsening', tone: 'danger' },
  { key: 'red_flags', zh: '警訊／麻痛', en: 'Red flags', tone: 'danger' },
];

const COURT_OPTIONS = [
  { key: 'none', zh: '不打球', en: 'No court', tone: 'neutral' },
  { key: 'light', zh: '輕鬆練球', en: 'Light play', tone: 'neutral' },
  { key: 'hard', zh: '激烈／比賽', en: 'Hard / match', tone: 'warn' },
];

const SLEEP_PRESETS = [
  { value: '4.5', zh: '< 5h', en: '< 5h', match: h => h < 5 },
  { value: '5.5', zh: '5–6h', en: '5–6h', match: h => h >= 5 && h < 6 },
  { value: '6.5', zh: '6–7h', en: '6–7h', match: h => h >= 6 && h < 7 },
  { value: '7.5', zh: '7h+', en: '7h+', match: h => h >= 7 },
];

const COURT_MINUTE_PRESETS = ['60', '90', '120', '150'];
const COURT_RPE_PRESETS = [
  { value: '4', zh: '輕鬆 4', en: 'Easy 4' },
  { value: '6', zh: '中等 6', en: 'Mod 6' },
  { value: '8', zh: '激烈 8', en: 'Hard 8' },
  { value: '9', zh: '爆累 9', en: 'Max 9' },
];

function feelKeyFromForm(form) {
  if (form.fatigue === '' && form.soreness === '') return '';
  const f = form.fatigue === '' ? 0 : Number(form.fatigue);
  const s = form.soreness === '' ? 0 : Number(form.soreness);
  const peak = Math.max(f, s);
  if (peak <= 1) return '0';
  if (peak === 2) return '2';
  if (peak === 3) return '3';
  return '4';
}

export default function DailyReadiness({ lang = 'zh', value = null, date, onSave, preview = null, onPreview, onApply, busy = false, disabled = false, today = localDate(), exercises = {}, context = {}, compact = false }) {
  const en = lang === 'en';
  const c = (key, parameters) => coachText(lang, key, parameters);
  const [form, setForm] = useState(() => readinessForm(value));
  const [dirty, setDirty] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(value));
  const fingerprint = JSON.stringify(value);
  if (fingerprint !== savedFingerprint) {
    setSavedFingerprint(fingerprint);
    if (!dirty) setForm(readinessForm(value));
  }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewInput, setPreviewInput] = useState(null);

  const input = readinessInput(form, date);
  const decision = evaluateReadiness(input, { ...context, today });
  const savedDecision = value ? evaluateReadiness(value, { ...context, today }) : null;
  const blocked = disabled || busy || submitting || date > today;
  const missing = readinessMissing(input);
  const changes = preview ? readinessChanges(preview.original, preview.adapted) : [];
  const matchesPreview = preview && preview.date === date && previewInput === JSON.stringify(input);

  const updateForm = patch => {
    setDirty(true);
    setSuccess(false);
    setPreviewInput(null);
    setForm(current => ({ ...current, ...patch }));
  };

  const activeFeel = feelKeyFromForm(form);
  const handleSelectFeel = option => {
    if (activeFeel === option.key) {
      updateForm({ fatigue: '', soreness: '' });
      return;
    }
    updateForm({ fatigue: option.value, soreness: option.value });
  };
  const handleSelectSymptom = key => updateForm({ symptoms: form.symptoms === key ? 'unknown' : key });
  const handleSelectCourt = key => updateForm({ todayCourtIntensity: form.todayCourtIntensity === key ? 'unknown' : key });

  const hasAnySelection = activeFeel !== '' || form.symptoms !== 'unknown' || form.todayCourtIntensity !== 'unknown' || form.sleepHours !== '' || form.yesterdayCourt !== 'unknown';
  const needsAdjustment = ['reduce', 'recover', 'rest'].includes(decision.action);

  const missingLabels = (() => {
    const labels = [];
    if (missing.includes('fatigue') || missing.includes('soreness')) labels.push(en ? 'Body feel' : '今天體感');
    if (missing.includes('symptoms')) labels.push(en ? 'Symptoms' : '身體不適');
    if (missing.includes('todayCourtIntensity')) labels.push(en ? 'Today’s court plan' : '今天打球');
    if (missing.includes('yesterdayCourtRpe')) labels.push(en ? 'Yesterday’s court effort' : '昨日打球費力程度');
    return labels;
  })();

  const optionalParts = [];
  if (input.sleepHours !== null) optionalParts.push(en ? `Sleep ${input.sleepHours}h` : `睡眠 ${input.sleepHours}h`);
  if (form.yesterdayCourt === 'yes' && input.yesterdayCourtMinutes !== null) optionalParts.push(en ? `Yesterday ${input.yesterdayCourtMinutes}m` : `昨日打球 ${input.yesterdayCourtMinutes} 分`);
  else if (form.yesterdayCourt === 'none') optionalParts.push(en ? 'No court yesterday' : '昨日未打球');

  const act = async action => {
    setError(''); setSuccess(false);
    let record;
    try { record = validateReadiness(input, { today }); } catch { setError(c('invalidReadiness')); return; }
    setSubmitting(true);
    try {
      if (action === 'save') { await onSave(record); setDirty(false); setSuccess(true); }
      else if (action === 'preview') { await onPreview(record); setPreviewInput(JSON.stringify(input)); }
      else { await onApply(record); setPreviewInput(null); setDirty(false); setSuccess(true); }
    } catch (cause) { setError(c(cause.message === 'READINESS_PLAN_CHANGED' ? 'applyConflict' : 'saveFailed')); } finally { setSubmitting(false); }
  };

  const badgeTone = action => (action === 'rest' ? 'is-danger' : ['reduce', 'recover'].includes(action) ? 'is-warn' : action === 'normal' ? 'is-good' : '');
  const summaryBadgeLabel = value
    ? (savedDecision?.action === 'normal' ? (en ? 'Ready' : '狀態正常')
      : savedDecision?.action === 'reduce' ? (en ? 'Reduce today' : '建議減量')
      : savedDecision?.action === 'recover' ? (en ? 'Recovery' : '改輕鬆恢復')
      : savedDecision?.action === 'rest' ? (en ? 'Rest today' : '建議休息')
      : c('saved'))
    : (en ? '3 taps · Optional' : '3 題快選');

  return <section className={compact ? 'readiness-compact space-y-2' : 'bg-white rounded-2xl p-4 border border-sky-100 space-y-3'} data-testid="daily-readiness" aria-label={c('readinessTitle')}>
    {!compact && <h3 className="font-semibold">{c('readinessTitle')} · {date}</h3>}
    {date !== today && <p className="text-xs text-amber-700">{c('onlyToday')}</p>}
    <details className="readiness-card">
      <summary className="readiness-summary">
        <span className="readiness-summary-label">{c('readinessTitle')}</span>
        <span className="readiness-summary-right">
          <span className={`readiness-pill ${value ? badgeTone(savedDecision?.action) : ''}`}>
            {value && savedDecision?.action === 'normal' && <Check size={12} aria-hidden="true" />}
            {summaryBadgeLabel}
          </span>
          <ChevronDown size={16} className="readiness-chevron" aria-hidden="true" />
        </span>
      </summary>

      <fieldset disabled={blocked} className="readiness-body disabled:opacity-60">
        <div className="readiness-group" data-testid="readiness-feel" role="group" aria-label={en ? 'How does your body feel today?' : '今天體感（疲勞與痠痛）'}>
          <span className="readiness-question">{en ? '1. Body feel today' : '1. 今天體感'}</span>
          <div className="readiness-chips is-grid-2">
            {FEEL_OPTIONS.map(option => {
              const active = activeFeel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`readiness-feel-${option.key}`}
                  aria-pressed={active}
                  onClick={() => handleSelectFeel(option)}
                  className={`readiness-chip ${active ? `is-active is-${option.tone}` : ''}`}
                >
                  {en ? option.en : option.zh}
                </button>
              );
            })}
          </div>
        </div>

        <div className="readiness-group" data-testid="readiness-symptoms" role="group" aria-label={c('currentSymptoms')}>
          <span className="readiness-question">{en ? '2. Any pain or symptoms?' : '2. 身體不適／症狀'}</span>
          <div className="readiness-chips is-grid-2">
            {SYMPTOM_OPTIONS.map(option => {
              const active = form.symptoms === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`readiness-symptom-${option.key}`}
                  aria-pressed={active}
                  onClick={() => handleSelectSymptom(option.key)}
                  className={`readiness-chip ${active ? `is-active is-${option.tone}` : ''}`}
                >
                  {en ? option.en : option.zh}
                </button>
              );
            })}
          </div>
        </div>

        <div className="readiness-group" data-testid="readiness-court" role="group" aria-label={c('todayCourtIntensity')}>
          <span className="readiness-question">{en ? '3. Playing badminton today?' : '3. 今天打球安排'}</span>
          <div className="readiness-chips is-grid-3">
            {COURT_OPTIONS.map(option => {
              const active = form.todayCourtIntensity === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`readiness-court-${option.key}`}
                  aria-pressed={active}
                  onClick={() => handleSelectCourt(option.key)}
                  className={`readiness-chip ${active ? `is-active is-${option.tone}` : ''}`}
                >
                  {en ? option.en : option.zh}
                </button>
              );
            })}
          </div>
        </div>

        <details className="readiness-more">
          <summary>
            <span>{en ? 'Optional details (sleep / yesterday’s court)' : '補充細節：昨晚睡眠／昨日打球（選填）'}</span>
            <span className="readiness-summary-right">
              {optionalParts.length > 0 && <span className="readiness-more-tag">{optionalParts.join(' · ')}</span>}
              <ChevronDown size={14} className="readiness-more-chevron" aria-hidden="true" />
            </span>
          </summary>
          <div className="readiness-more-body">
            <div className="readiness-group" role="group" aria-label={c('sleepHours')}>
              <span className="readiness-question">{c('sleepHours')}</span>
              <div className="readiness-chips">
                {SLEEP_PRESETS.map(preset => {
                  const active = input.sleepHours !== null && preset.match(input.sleepHours);
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateForm({ sleepHours: active ? '' : preset.value })}
                      className={`readiness-chip ${active ? 'is-active is-neutral' : ''}`}
                    >
                      {en ? preset.en : preset.zh}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="readiness-group" role="group" aria-label={c('yesterdayCourt')}>
              <span className="readiness-question">{c('yesterdayCourt')}</span>
              <div className="readiness-chips">
                {[['none', en ? 'No court' : '沒打球'], ['yes', en ? 'Played' : '有打球']].map(([key, label]) => {
                  const active = form.yesterdayCourt === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateForm({
                        yesterdayCourt: active ? 'unknown' : key,
                        yesterdayCourtMinutes: '',
                        yesterdayCourtRpe: '',
                      })}
                      className={`readiness-chip ${active ? 'is-active is-neutral' : ''}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {form.yesterdayCourt === 'yes' && (
                <div className="readiness-court-extra">
                  <div className="readiness-chips">
                    {COURT_MINUTE_PRESETS.map(mins => {
                      const active = String(form.yesterdayCourtMinutes) === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateForm({ yesterdayCourtMinutes: active ? '' : mins })}
                          className={`readiness-chip ${active ? 'is-active is-neutral' : ''}`}
                        >
                          {en ? `${mins}m` : `${mins} 分`}
                        </button>
                      );
                    })}
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="360"
                      step="10"
                      placeholder={en ? 'Mins' : '自訂分鐘'}
                      aria-label={c('yesterdayCourtMinutes')}
                      value={form.yesterdayCourtMinutes}
                      onChange={event => updateForm({ yesterdayCourtMinutes: event.target.value })}
                      className="readiness-mini-input"
                    />
                  </div>
                  <div className="readiness-chips">
                    {COURT_RPE_PRESETS.map(preset => {
                      const active = String(form.yesterdayCourtRpe) === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateForm({ yesterdayCourtRpe: active ? '' : preset.value })}
                          className={`readiness-chip ${active ? 'is-active is-neutral' : ''}`}
                        >
                          {en ? preset.en : preset.zh}
                        </button>
                      );
                    })}
                  </div>
                  {input.yesterdayCourtMinutes !== null && input.yesterdayCourtRpe !== null && (
                    <p className="text-xs text-slate-500">{c('loadTrend', { value: input.yesterdayCourtMinutes * input.yesterdayCourtRpe })}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </details>

        {hasAnySelection ? (
          <div className={`readiness-result ${badgeTone(decision.action)}`}>
            <p className="readiness-result-title">{c(`readiness_${decision.action}`)}</p>
            {missingLabels.length > 0 && (
              <p className="readiness-result-sub">{c('missingFields')}：{missingLabels.join('、')}</p>
            )}
            {decision.reasonCodes?.filter(code => code !== 'incomplete_readiness').slice(0, 2).map(reason => (
              <p key={reason} className="readiness-result-sub">{c(`reason_${reason}`)}</p>
            ))}
          </div>
        ) : (
          <p className="readiness-idle-hint">
            {en ? 'Tap 3 items to check whether today’s plan should be kept, scaled down, or stripped of jumps.' : '點選上方 3 題，即時判斷今天該照常訓練、減量，或自動移除跳躍爆發動作。'}
          </p>
        )}

        <div className="readiness-actions">
          {needsAdjustment && onPreview ? (
            <>
              <button type="button" disabled={date !== today} onClick={() => act('preview')} className="readiness-btn-primary disabled:opacity-40">{c('previewReadiness')}</button>
              <button type="button" onClick={() => act('save')} className="button-secondary">{c('saveReadiness')}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => act('save')} className="readiness-btn-primary">{c('saveReadiness')}</button>
              {onPreview && <button type="button" disabled={date !== today} onClick={() => act('preview')} className="button-secondary disabled:opacity-40">{c('previewReadiness')}</button>}
            </>
          )}
        </div>
      </fieldset>

      {matchesPreview && <div className="readiness-preview-box" data-testid="readiness-preview">
        <h4 className="font-semibold text-sm text-slate-900">{c('previewTitle')}</h4>
        <p className="text-sm text-slate-800">{c(`readiness_${preview.decision?.action || decision.action}`)}</p>
        {preview.changed ? <>
          <p className="text-sm font-semibold text-sky-900">{c('estimatedChange', { before: estimateSessionMinutes(preview.original, exercises, context.level || 1), after: estimateSessionMinutes(preview.adapted, exercises, context.level || 1) })}</p>
          <ul className="space-y-2 text-sm">{changes.map(change => <li key={change.id}><span className="font-medium">{exercises[change.id]?.name || change.id}</span>{change.removed ? ` · ${c('removedToday')}` : <><span className="block text-slate-600">{change.before.sets} × {change.before.value} {c(`unit_${change.before.unit}`)} → {change.after.sets} × {change.after.value} {c(`unit_${change.after.unit}`)}</span>{change.before.restSeconds !== change.after.restSeconds && <span className="block text-xs">{c('restChange', { before: change.before.restSeconds || 0, after: change.after.restSeconds || 0 })}</span>}{JSON.stringify(change.before.preparation) !== JSON.stringify(change.after.preparation) && <span className="block text-xs">{c('preparationChanged')}</span>}</>}</li>)}</ul>
          {changes.length === 0 && <p className="text-xs">{c('sessionChanged')}</p>}
          <details className="pt-2"><summary className="cursor-pointer text-xs text-slate-600">{c('fullComparison')}</summary><div className="grid sm:grid-cols-2 gap-3 mt-3">{[['original', preview.original], ['adapted', preview.adapted]].map(([key, day]) => day && <div key={key}><h5 className="text-xs font-semibold mb-1">{c(key)}</h5>{!day.routine.length && <p className="text-xs">{c('restDay')}</p>}<ul className="text-xs text-slate-600 list-disc pl-4">{day.routine.map(id => { const dose = day.prescriptions?.find(item => item.id === id); return <li key={id}>{exercises[id]?.name || id}{dose && ` · ${dose.sets} × ${dose.value} ${c(`unit_${dose.unit}`)}`}</li>; })}</ul></div>)}</div></details>
          <p className="text-xs text-slate-500">{c('previewHint')}</p>
          {onApply && <button type="button" disabled={blocked || date !== today} onClick={() => act('apply')} className="readiness-btn-primary disabled:opacity-40">{c('applyReadiness')}</button>}
        </> : <p className="text-sm text-slate-700">{c('noAdjustment')}</p>}
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-emerald-700">{c('saved')}</p>}
    </details>
  </section>;
}
