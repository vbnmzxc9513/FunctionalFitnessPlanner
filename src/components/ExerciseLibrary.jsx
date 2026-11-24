import { Check, ChevronRight, Loader2, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EXERCISE_CATEGORIES } from '../domain/exerciseCatalog.js';
import { LIBRARY_PURPOSES, libraryGroups, matchesLibraryPurpose, suggestedUses } from '../domain/library.js';
import { LIBRARY_TEXT } from '../i18n/library.js';
import CreateExerciseDialog from './CreateExerciseDialog.jsx';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExerciseTags, { BodyPartFilter } from './ExerciseTags.jsx';
import { matchesBodyPart, matchesExerciseQuery } from '../domain/exerciseTags.js';
import { weeklyChoiceBlockReason } from '../domain/weeklyChoices.js';
import { MAX_WEEKLY_CHOICES } from '../domain/trainingPreferences.js';
import './exercise-library.css';

export default function ExerciseLibrary({ t, exercises, adding, onAdd, createScope = 'device', onToggle, onDelete, busy, canManage = true, lang = 'zh', onOrganize, onSignIn, weeklyExerciseIds = [], weeklyAvailable = {}, planningContext = {}, onToggleWeekly, onOpenWeeklySelection }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [bodyPart, setBodyPart] = useState('all');
  const [visibleCount, setVisibleCount] = useState(20);
  const [purpose, setPurpose] = useState('all');
  const [scope, setScope] = useState('all');
  const [managing, setManaging] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [organizeError, setOrganizeError] = useState('');
  const en = lang === 'en';
  const text = LIBRARY_TEXT[en ? 'en' : 'zh'];
  const showManagement = canManage && managing;
  const organizing = !!pendingId || busy;
  const entries = Object.entries(exercises).filter(([id, exercise]) => matchesLibraryPurpose(id, exercise, purpose, scope)
    && (!category || exercise.category === category) && matchesBodyPart(id, exercise, bodyPart)
    && matchesExerciseQuery(id, exercise, query, lang)).sort(([, left], [, right]) => Number(left.active === false) - Number(right.active === false));

  const toggleExpand = id => setExpandedIds(previous => ({ ...previous, [id]: !previous[id] }));

  async function organize(id, groups, { expandOnAdd = false } = {}) {
    if (!canManage) { onSignIn?.(); return; }
    if (!onOrganize || organizing) return;
    if (expandOnAdd && groups.length > 0) {
      setExpandedIds(previous => ({ ...previous, [id]: true }));
    }
    setPendingId(id); setOrganizeError('');
    try {
      const result = await onOrganize(id, groups);
      if (result === false) throw new Error('NOT_SAVED');
    } catch { setOrganizeError(text.savedFailure); }
    finally { setPendingId(null); }
  }

  return <section className="exercise-library" aria-label={t('exercisesTitle')}>
    <div className="library-toolbar">
      <div className="library-top-actions">
        <div className="library-top-left">
          {onAdd && <button type="button" data-testid="library-create-exercise" className="exercise-create-entry" disabled={adding} onClick={() => setCreating(true)}><Plus size={16} />{en ? 'Create exercise' : '新增自己的動作'}</button>}
          {onOpenWeeklySelection && <button type="button" data-testid="library-auto-plan" onClick={onOpenWeeklySelection} className="library-auto-plan-btn"><Sparkles size={15} />{en ? 'Plan with selected' : '用選取動作自動排課'} · {weeklyExerciseIds.length}</button>}
        </div>
        {canManage && <button type="button" aria-expanded={showManagement} aria-controls="exercise-management" onClick={() => setManaging(value => !value)} className="library-manage-btn">{showManagement ? text.done : text.manage}</button>}
      </div>

      {!canManage && <p className="text-xs text-slate-500 m-0">{text.loginHint} <button type="button" onClick={() => onSignIn?.()} className="text-sky-700 font-medium underline">{text.login}</button></p>}
      {showManagement && <div id="exercise-management" className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs text-slate-600 space-y-1.5">
        <p className="m-0 text-sm text-slate-700">{text.manageHint}</p>
        <p className="m-0 text-slate-500">{t('catalogEligibilityNotice')}</p>
      </div>}

      <div className="library-scope-tabs" role="group" aria-label={text.scope}>
        {['all', 'mine'].map(value => <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setVisibleCount(20); }}>{text[value]}</button>)}
      </div>

      <div className="library-search-wrap">
        <Search size={16} className="library-search-icon" aria-hidden="true" />
        <input data-testid="library-search" aria-label={t('searchExercises')} placeholder={t('searchExercises')} value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(20); }} />
      </div>

      <div className="library-purpose-pills" role="group" aria-label={text.purposes}>
        {['all', ...LIBRARY_PURPOSES].map(value => <button key={value} type="button" aria-pressed={purpose === value} onClick={() => { setPurpose(value); setVisibleCount(20); }}>{value === 'all' ? text.purposeAll : text[value]}</button>)}
      </div>

      <div className="library-filter-row">
        <BodyPartFilter value={bodyPart} onChange={value => { setBodyPart(value); setVisibleCount(20); }} lang={lang} testId="library-body-part" />
        <details className="library-more-filters">
          <summary>{text.moreFilters}{category && ` · ${t(`category_${category}`)}`}</summary>
          <select aria-label={t('filterCategory')} value={category} onChange={event => { setCategory(event.target.value); setVisibleCount(20); }} className="mt-2 max-w-full rounded-lg border border-sky-200 bg-white p-2 text-sm">
            <option value="">{t('allCategories')}</option>
            {EXERCISE_CATEGORIES.map(item => <option key={item} value={item}>{t(`category_${item}`)}</option>)}
          </select>
        </details>
      </div>
    </div>

    <div className="library-count-bar">
      <span aria-live="polite">{text.count(entries.length)}</span>
      <span>{en ? 'Tap arrow for details' : '點右側箭頭查看詳細說明'}</span>
    </div>
    {organizeError && <p role="alert" className="text-sm text-red-600 m-0">{organizeError}</p>}

    <div className="library-grid">{entries.slice(0, visibleCount).map(([id, exercise]) => {
      const groups = libraryGroups(exercise);
      const selectedThisWeek = weeklyExerciseIds.includes(id);
      const weeklyBlock = weeklyChoiceBlockReason(id, exercises, planningContext, weeklyAvailable);
      const isExpanded = !!expandedIds[id];
      const isCustom = id.startsWith('custom_');
      const favLabel = !canManage ? text.favoriteLogin : groups.length ? text.removeFavorite : text.favorite;
      const weeklyLabel = t(selectedThisWeek ? 'choiceRemove' : 'choiceSelect');

      return <article key={id} data-testid={`library-exercise-${id}`} data-expanded={isExpanded} data-inactive={exercise.active === false} className="library-card">
        <div className="library-row-head">
          <button
            type="button"
            className="library-row-trigger"
            onClick={() => toggleExpand(id)}
            aria-expanded={isExpanded}
            aria-controls={`library-detail-${id}`}
          >
            <span className="library-row-title-line">
              <h3 className="library-row-title">{exercise.name}</h3>
              {exercise.advanced && <span className="library-meta-badge">{t('advancedExercise')}</span>}
              {exercise.active === false && <span className="library-meta-badge">{text.disabled}</span>}
              {isCustom && <span className="library-meta-badge">{en ? 'Custom' : '自訂'}</span>}
            </span>
            <span className="library-row-meta">
              <span className="library-meta-cat">{exercise.category ? t(`category_${exercise.category}`) : t(`type_${exercise.type}`)}</span>
              {groups.length > 0 && <span className="library-meta-badge is-fav">{`${text.currentGroups}：${groups.map(group => text[group]).join(' · ')}`}</span>}
              {!isExpanded && onToggleWeekly && weeklyBlock && !isCustom && <span className="library-meta-badge is-amber">{en ? 'Restricted' : '條件限制'}</span>}
            </span>
          </button>

          <div className="library-row-actions">
            {showManagement ? <>
              <button type="button" disabled={busy} role="switch" aria-checked={exercise.active !== false} aria-label={exercise.name} onClick={() => onToggle(id)} className={`w-12 h-6 rounded-full relative shrink-0 ${exercise.active === false ? 'bg-slate-200' : 'bg-sky-500'}`}><span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${exercise.active === false ? '' : 'translate-x-6'}`} /></button>
              <button type="button" disabled={busy} aria-label={`${t('removeExercise')} ${exercise.name}`} onClick={() => onDelete(id)} className="library-icon-btn text-red-500"><Trash2 size={17} /></button>
            </> : <>
              {onToggleWeekly && !isCustom && <button
                type="button"
                data-testid={`library-weekly-${id}`}
                aria-pressed={selectedThisWeek}
                aria-label={`${weeklyLabel} ${exercise.name}`}
                title={weeklyLabel}
                disabled={busy || (!selectedThisWeek && (!!weeklyBlock || weeklyExerciseIds.length >= MAX_WEEKLY_CHOICES))}
                onClick={() => onToggleWeekly(id)}
                className="library-icon-btn is-weekly"
              >
                {selectedThisWeek ? <Check size={17} /> : <Plus size={17} />}
                <span className="sr-only">{weeklyLabel}</span>
              </button>}
              {(canManage || !isCustom) && <button
                type="button"
                data-testid={`favorite-${id}`}
                disabled={!!organizing || (canManage && !onOrganize)}
                aria-label={`${favLabel} ${exercise.name}`}
                title={favLabel}
                onClick={() => organize(id, groups.length ? [] : (purpose === 'all' ? suggestedUses(id, exercise) : [purpose]), { expandOnAdd: !groups.length })}
                className={`library-icon-btn ${groups.length ? 'is-fav-active' : ''}`}
              >
                {pendingId === id ? <Loader2 size={16} className="animate-spin" /> : <Star size={17} fill={groups.length ? 'currentColor' : 'none'} />}
                <span className="sr-only">{favLabel}</span>
              </button>}
            </>}
            <button
              type="button"
              data-testid={`library-expand-${id}`}
              aria-expanded={isExpanded}
              aria-controls={`library-detail-${id}`}
              aria-label={isExpanded ? (en ? `Hide details for ${exercise.name}` : `收合 ${exercise.name} 詳細內容`) : (en ? `Show details for ${exercise.name}` : `展開 ${exercise.name} 詳細內容`)}
              onClick={() => toggleExpand(id)}
              className="library-expand-btn"
            >
              <ChevronRight size={18} className="library-expand-chevron" />
            </button>
          </div>
        </div>

        {isExpanded && <div id={`library-detail-${id}`} className="library-row-detail" data-testid={`library-detail-${id}`}>
          <ExerciseTags id={id} exercise={exercise} lang={lang} />

          {onToggleWeekly && weeklyBlock && !isCustom && <p className="library-detail-notice is-block">{t(`choice_reason_${weeklyBlock}`)}</p>}
          {isCustom && <div className="library-detail-footer">
            <p className="library-detail-notice flex-1">{en ? 'Custom · available in manual planning' : '自訂動作 · 可手動加入課表'}</p>
            {!canManage && <button type="button" className="library-custom-delete" onClick={() => onDelete(id)}>{en ? 'Delete my exercise' : '刪除自訂動作'}</button>}
          </div>}

          {(exercise.prescription || exercise.equipmentOptions) && <div className="library-spec-card">
            {exercise.prescription && <p className="library-spec-row">
              <strong>{t('starterDoseLabel')}</strong>
              <span>{exercise.prescription.sets} {t('setsUnit')} × {exercise.prescription.value} {t(exercise.prescription.unit)}{exercise.prescription.perSide && ` · ${t('eachSide')}`}{exercise.prescription.restSeconds > 0 && ` · ${t('restLabel')} ${exercise.prescription.restSeconds} ${t('seconds')}`}</span>
            </p>}
            {exercise.equipmentOptions && <p className="library-spec-row">
              <strong>{t('equipmentLabel')}</strong>
              <span>{exercise.equipmentOptions.map(option => option.length ? option.map(item => t(`equipment_${item}`)).join(' + ') : t('equipment_bodyweight')).join(' / ')}{exercise.requiresPartner && ` · ${t('partnerRequired')}`}</span>
            </p>}
            <p className="library-spec-hint">{text.doseHint}</p>
          </div>}

          <ExerciseGuide id={id} exercise={exercise} lang={lang} />

          {canManage && <details className="library-organize-details">
            <summary>{text.organize}</summary>
            <p className="my-2">{text.groupHint}</p>
            <div className="library-organize-groups">
              {LIBRARY_PURPOSES.map(group => <label key={group}><input type="checkbox" checked={groups.includes(group)} disabled={!!organizing || !onOrganize} onChange={event => organize(id, event.target.checked ? [...groups, group] : groups.filter(item => item !== group))} />{text[group]}</label>)}
            </div>
          </details>}
        </div>}
      </article>;
    })}</div>

    {entries.length > visibleCount && <button type="button" data-testid="library-load-more" onClick={() => setVisibleCount(value => value + 20)} className="library-load-more">{en ? `Show more (${Math.min(visibleCount, entries.length)} / ${entries.length})` : `顯示更多（${Math.min(visibleCount, entries.length)} / ${entries.length}）`}</button>}
    {!entries.length && <p className="text-sm text-slate-500 text-center py-6">{scope === 'mine' ? text.emptyMine : t('noMatchingExercises')}</p>}
    {creating && <CreateExerciseDialog lang={lang} t={t} scope={createScope} initialPart={bodyPart} onSave={async form => { const saved = await onAdd(form); setQuery(saved.exercise.name); setScope('all'); setPurpose('all'); setBodyPart('all'); }} onClose={() => setCreating(false)} />}
  </section>;
}
