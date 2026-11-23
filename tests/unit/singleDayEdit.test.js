import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { DEFAULT_PLANNING_CONTEXT, planningExercises } from '../../src/domain/planning.js';
import { dailyWarmupPrescriptions } from '../../src/domain/quickWorkouts.js';
import { saveLocalSingleDaySession } from '../../src/domain/periodDraft.js';
import {
  getRecordedExerciseIds,
  mergePreservingRecordedExercises,
  quickAddExerciseToDay,
  quickRemoveExerciseFromDay,
} from '../../src/domain/singleDayEdit.js';

const exercises = catalogExercises('zh');
const eligible = planningExercises(exercises, DEFAULT_PLANNING_CONTEXT);

function sampleSession(date = '2026-11-23') {
  const warmups = dailyWarmupPrescriptions('warmup');
  return {
    date,
    week: '2026-W48',
    day: 1,
    name: '週一',
    theme: '羽球下肢與核心',
    concept: '測試',
    coachAdvice: '測試',
    warmupNote: '八段暖身',
    cooldownNote: '收尾',
    sessionType: 'training',
    routine: [...warmups.map(d => d.id), 'bf_B01', 'dead_bug'],
    prescriptions: [
      ...warmups,
      {
        id: 'bf_B01',
        sets: 2,
        value: '8',
        unit: 'reps',
        restSeconds: 60,
        perSide: true,
        phase: 'strength',
        preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: true, instruction: '輕量準備' },
      },
      { id: 'dead_bug', sets: 2, value: '8', unit: 'reps', restSeconds: 45, perSide: true, phase: 'accessory' },
    ],
  };
}

test('getRecordedExerciseIds collects both completed marks and training logs for a date', () => {
  const ids = getRecordedExerciseIds('2026-11-23', {
    progressByWeek: {
      '2026-W48': {
        completed: { day1_bf_A16: true, day1_dead_bug: false, day2_bf_B01: true },
      },
    },
    logs: [
      { week: '2026-W48', day: 1, exerciseId: 'bf_B01' },
      { week: '2026-W48', day: 3, exerciseId: 'bf_C03' },
    ],
  });
  assert.deepEqual([...ids].sort(), ['bf_A16', 'bf_B01']);
});

test('quickAddExerciseToDay and quickRemoveExerciseFromDay allow 1-tap +/- while protecting recorded exercises', () => {
  const session = sampleSession('2026-11-23');
  const recordedIds = new Set(['bf_A16', 'bf_B01']);

  // Cannot remove a completed/logged exercise
  assert.throws(
    () => quickRemoveExerciseFromDay(session, 'bf_B01', { recordedIds, exercises, lang: 'zh' }),
    /RECORDED_EXERCISE_LOCKED/,
  );

  // Can quickly remove an unrecorded exercise
  const removed = quickRemoveExerciseFromDay(session, 'dead_bug', { recordedIds, exercises, lang: 'zh' });
  assert.equal(removed.routine.includes('dead_bug'), false);
  assert.equal(removed.routine.includes('bf_B01'), true);

  // Can quickly add an eligible exercise
  const added = quickAddExerciseToDay(removed, 'bf_B06', { exercises, eligibleExercises: eligible, lang: 'zh' });
  assert.equal(added.routine.includes('bf_B06'), true);
});

test('mergePreservingRecordedExercises restores recorded prescriptions even if omitted or altered in incoming edit', () => {
  const existing = sampleSession('2026-11-23');
  const recordedIds = new Set(['bf_B01']);
  // Incoming edit tries to drop bf_B01 and add bf_B06
  const edited = {
    ...existing,
    routine: existing.routine.filter(id => id !== 'bf_B01').concat('bf_B06'),
    prescriptions: existing.prescriptions.filter(d => d.id !== 'bf_B01').concat({
      id: 'bf_B06',
      sets: 2,
      value: '10',
      unit: 'reps',
      restSeconds: 60,
      perSide: false,
      phase: 'strength',
    }),
  };

  const merged = mergePreservingRecordedExercises(existing, edited, recordedIds, { exercises, lang: 'zh' });
  assert.equal(merged.routine.includes('bf_B01'), true);
  assert.equal(merged.routine.includes('bf_B06'), true);
  // Original bf_B01 dose preserved verbatim
  assert.deepEqual(
    merged.prescriptions.find(d => d.id === 'bf_B01'),
    existing.prescriptions.find(d => d.id === 'bf_B01'),
  );
});

test('saveLocalSingleDaySession saves edits on a day with existing completion records without DATE_PROTECTED', () => {
  const session = sampleSession('2026-11-23');
  const otherDay = sampleSession('2026-11-25');
  otherDay.day = 3;
  const draft = {
    version: 1,
    range: { from: '2026-11-23', to: '2026-11-29' },
    dates: ['2026-11-23', '2026-11-25'],
    sessionsByDate: { '2026-11-23': { ...session, revision: 1 }, '2026-11-25': { ...otherDay, revision: 1 } },
    progressByWeek: {
      '2026-W48': {
        completed: { day1_bf_A16: true },
        completedAt: { day1_bf_A16: '2026-11-23' },
      },
    },
    logs: [],
    readiness: [],
    profile: { context: DEFAULT_PLANNING_CONTEXT, focus: 'balanced', time: '30', goal: '' },
    conclusion: '',
    weeklySummaries: [],
    periodId: 'local_1',
  };

  const removed = quickRemoveExerciseFromDay(session, 'dead_bug', {
    recordedIds: new Set(['bf_A16']),
    exercises,
    lang: 'zh',
  });
  const saved = saveLocalSingleDaySession(draft, '2026-11-23', removed, {
    today: '2026-11-23',
    exercises,
    profile: draft.profile,
    lang: 'zh',
  });

  assert.equal(saved.sessionsByDate['2026-11-23'].routine.includes('dead_bug'), false);
  assert.equal(saved.sessionsByDate['2026-11-23'].routine.includes('bf_A16'), true);
  assert.equal(saved.sessionsByDate['2026-11-23'].revision, 2);
  // Completion mark and other dates remain intact
  assert.equal(saved.progressByWeek['2026-W48'].completed.day1_bf_A16, true);
  assert.deepEqual(saved.sessionsByDate['2026-11-25'].routine, otherDay.routine);
});
