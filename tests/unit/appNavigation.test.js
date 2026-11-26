import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationState, navigationReducer } from '../../src/domain/appNavigation.js';

const init = (overrides = {}) => ({
  ...createNavigationState({ today: '2026-11-18', currentWeek: '2026-W47' }),
  ...overrides,
});

test('initial state derives today weekday and defaults to Today training view', () => {
  const wednesday = createNavigationState({ today: '2026-11-18', currentWeek: '2026-W47' });
  assert.equal(wednesday.activeTab, 'train');
  assert.equal(wednesday.trainingMode, 'today');
  assert.equal(wednesday.activeDay, 3);
  assert.equal(wednesday.planScreen, 'overview');
  assert.equal(wednesday.localBrowseWeek, '2026-W47');

  const sunday = createNavigationState({ today: '2026-11-22', currentWeek: '2026-W47' });
  assert.equal(sunday.activeDay, 7);
});

test('tab switching between train, plan, library, records, and settings preserves invariants', () => {
  let state = init({ activeDay: 1, planScreen: 'settings', periodCreating: true });

  state = navigationReducer(state, { type: 'NAVIGATE', tab: 'plan', calendarDay: 3 });
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.trainingMode, 'plan');
  assert.equal(state.planScreen, 'overview');
  assert.equal(state.periodCreating, false);

  state = navigationReducer(state, { type: 'NAVIGATE', tab: 'library', calendarDay: 3 });
  assert.equal(state.activeTab, 'library');

  state = navigationReducer(state, { type: 'VIEW_RECORDS' });
  assert.equal(state.activeTab, 'records');
  assert.equal(state.recordsView, 'training');

  state = navigationReducer(state, { type: 'SET_RECORDS_VIEW', view: 'body' });
  assert.equal(state.recordsView, 'body');

  state = navigationReducer(state, { type: 'NAVIGATE', tab: 'settings', calendarDay: 3 });
  assert.equal(state.activeTab, 'settings');

  state = navigationReducer(state, { type: 'NAVIGATE', tab: 'train', calendarDay: 0 });
  assert.equal(state.activeTab, 'train');
  assert.equal(state.trainingMode, 'today');
  assert.equal(state.activeDay, 7);
});

test('direct single-day Add and Edit flow opens manual on chosen day and returns to origin', () => {
  const session = [{ day: 3, date: '2026-11-18', routine: ['bf_A01'] }];
  let state = init({ activeTab: 'train', planScreen: 'overview', activeDay: 3 });

  state = navigationReducer(state, {
    type: 'OPEN_MANUAL',
    sessions: session,
    sourceItem: null,
    activeDate: '2026-11-18',
    singleDayEdit: { returnTab: 'train', returnScreen: 'overview', returnDay: 3, add: true },
  });
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.planScreen, 'manual');
  assert.equal(state.periodCreating, false);
  assert.equal(state.manualActiveDate, '2026-11-18');
  assert.deepEqual(state.manualInput, session);
  assert.equal(state.singleDayEdit.add, true);

  // Cancel returns directly to Today without losing returnDay, and clears singleDayEdit.
  const cancelled = navigationReducer(state, { type: 'MANUAL_CANCEL' });
  assert.equal(cancelled.singleDayEdit, null);
  assert.equal(cancelled.activeTab, 'train');
  assert.equal(cancelled.activeDay, 3);
  assert.equal(cancelled.planScreen, 'overview');

  // Non-single-day cancel returns to plan overview with singleDayEdit cleared.
  const multi = navigationReducer(init({ activeTab: 'plan', planScreen: 'manual', singleDayEdit: null }), { type: 'MANUAL_CANCEL' });
  assert.equal(multi.singleDayEdit, null);
  assert.equal(multi.planScreen, 'overview');
});

test('manual preview -> assign -> back to manual preserves manualInput and editOrigin with add reset', () => {
  const initialSession = [{ day: 2, date: '2026-11-17', routine: ['bf_A01'] }];
  const editedSession = [{ day: 2, date: '2026-11-17', routine: ['bf_A01', 'bf_C17'] }];
  let state = init({ activeTab: 'plan', planScreen: 'day', activeDay: 2 });

  state = navigationReducer(state, {
    type: 'OPEN_MANUAL',
    sessions: initialSession,
    sourceItem: { id: 'fav1', name: 'Upper' },
    activeDate: null,
    singleDayEdit: { returnTab: 'plan', returnScreen: 'day', returnDay: 2, add: true },
  });
  state = navigationReducer(state, {
    type: 'MANUAL_PREVIEW',
    sessions: editedSession,
    name: 'My manual plan',
  });

  assert.equal(state.planScreen, 'assign');
  assert.deepEqual(state.manualInput, editedSession);
  assert.equal(state.singleDayEdit.add, false);
  assert.deepEqual(state.assignment.editOrigin, { returnTab: 'plan', returnScreen: 'day', returnDay: 2, add: false });
  assert.deepEqual(state.assignment.initialDates, ['2026-11-17']);
  assert.equal(state.assignment.returnScreen, 'manual');

  // Cancel assignment returns to manual preserving manualInput & editOrigin.
  const backToManual = navigationReducer(state, { type: 'ASSIGNMENT_CANCEL' });
  assert.equal(backToManual.planScreen, 'manual');
  assert.deepEqual(backToManual.manualInput, editedSession);
  assert.deepEqual(backToManual.singleDayEdit, { returnTab: 'plan', returnScreen: 'day', returnDay: 2, add: false });

  // Back action during assign returns to assignment.returnScreen.
  const planBack = navigationReducer(state, { type: 'PLAN_BACK' });
  assert.equal(planBack.planScreen, 'manual');

  // Apply assignment with editOrigin restores returnTab, returnDay, trainingMode, and returnScreen, and clears singleDayEdit.
  const applied = navigationReducer(state, {
    type: 'ASSIGNMENT_APPLIED',
    editOrigin: state.assignment.editOrigin,
    periodId: 'period_42',
    browseWeek: '2026-W47',
  });
  assert.equal(applied.singleDayEdit, null);
  assert.equal(applied.assignment, null);
  assert.equal(applied.selectedPeriodId, 'period_42');
  assert.equal(applied.localBrowseWeek, '2026-W47');
  assert.equal(applied.activeTab, 'plan');
  assert.equal(applied.activeDay, 2);
  assert.equal(applied.trainingMode, 'plan');
  assert.equal(applied.planScreen, 'day');

  // Apply assignment originating from train restores today mode and clears singleDayEdit.
  const appliedFromTrain = navigationReducer(state, {
    type: 'ASSIGNMENT_APPLIED',
    editOrigin: { returnTab: 'train', returnScreen: 'overview', returnDay: 4, add: false },
    periodId: 'period_99',
    browseWeek: '2026-W48',
  });
  assert.equal(appliedFromTrain.singleDayEdit, null);
  assert.equal(appliedFromTrain.activeTab, 'train');
  assert.equal(appliedFromTrain.trainingMode, 'today');
  assert.equal(appliedFromTrain.activeDay, 4);
  assert.equal(appliedFromTrain.planScreen, 'overview');

  // Apply multi-day assignment without editOrigin lands on plan overview and clears singleDayEdit.
  const appliedMulti = navigationReducer(state, {
    type: 'ASSIGNMENT_APPLIED',
    editOrigin: null,
    periodId: '',
    browseWeek: '2026-W47',
  });
  assert.equal(appliedMulti.singleDayEdit, null);
  assert.equal(appliedMulti.activeTab, 'plan');
  assert.equal(appliedMulti.planScreen, 'overview');
});

test('openLegacyAI, periodApplied, saved workout assignment, and plan sub-navigation transitions', () => {
  let state = init({ periodCreating: true });

  state = navigationReducer(state, { type: 'OPEN_LEGACY_AI' });
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.planScreen, 'legacy-ai');
  assert.equal(state.periodCreating, false);

  state = navigationReducer(state, { type: 'LEGACY_PREVIEW_READY' });
  assert.equal(state.planScreen, 'legacy-preview');

  state = navigationReducer(state, { type: 'LEGACY_PLAN_APPLIED' });
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.planScreen, 'overview');
  assert.equal(state.trainingMode, 'plan');
  assert.equal(state.periodCreating, false);

  state = navigationReducer(state, { type: 'OPEN_WEEKLY_SELECTION' });
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.periodCreating, true);
  assert.equal(state.planScreen, 'settings');

  state = navigationReducer(state, { type: 'CLOSE_PERIOD_CREATING' });
  assert.equal(state.periodCreating, false);
  assert.equal(state.planScreen, 'overview');

  state = navigationReducer(state, { type: 'PERIOD_APPLIED', periodId: 'p_123', browseWeek: '2026-W49' });
  assert.equal(state.selectedPeriodId, 'p_123');
  assert.equal(state.localBrowseWeek, '2026-W49');
  assert.equal(state.periodCreating, false);
  assert.equal(state.activeTab, 'plan');
  assert.equal(state.planScreen, 'overview');

  state = navigationReducer(state, { type: 'SELECT_PLAN_DAY', day: 5 });
  assert.equal(state.activeDay, 5);
  assert.equal(state.trainingMode, 'plan');
  assert.equal(state.planScreen, 'day');

  state = navigationReducer(state, { type: 'OPEN_PLAN_SCREEN', screen: 'settings' });
  assert.equal(state.planScreen, 'settings');
  assert.equal(state.periodCreating, true);

  state = navigationReducer(state, { type: 'PLAN_BACK' });
  assert.equal(state.planScreen, 'overview');
  assert.equal(state.periodCreating, false);

  state = navigationReducer(state, { type: 'USE_SAVED_WORKOUT', day: { routine: ['bf_A01'] }, name: 'Favorite' });
  assert.equal(state.planScreen, 'assign');
  assert.equal(state.assignment.returnScreen, 'saved');
  assert.equal(state.assignment.name, 'Favorite');

  state = navigationReducer(state, { type: 'ASSIGNMENT_CANCEL' });
  assert.equal(state.planScreen, 'saved');

  // Using a saved workout from Library tab opens date assignment in Plan and returns to Library on cancel.
  let fromLibrary = init({ activeTab: 'library', planScreen: 'overview' });
  fromLibrary = navigationReducer(fromLibrary, { type: 'USE_SAVED_WORKOUT', day: { routine: ['bf_A01'] }, name: 'Library fav', returnTab: 'library' });
  assert.equal(fromLibrary.activeTab, 'plan');
  assert.equal(fromLibrary.planScreen, 'assign');
  assert.equal(fromLibrary.assignment.returnTab, 'library');

  fromLibrary = navigationReducer(fromLibrary, { type: 'ASSIGNMENT_CANCEL' });
  assert.equal(fromLibrary.activeTab, 'library');
  assert.equal(fromLibrary.planScreen, 'overview');
});

test('modal and period browse state updates work cleanly', () => {
  let state = init();
  const workout = { day: 1, routine: ['bf_A01'] };
  const share = { days: [workout], name: 'My workout' };

  state = navigationReducer(state, { type: 'SET_SAVE_WORKOUT_DAY', day: workout });
  assert.deepEqual(state.saveWorkoutDay, workout);
  state = navigationReducer(state, { type: 'SET_SAVE_WORKOUT_DAY', day: null });
  assert.equal(state.saveWorkoutDay, null);

  state = navigationReducer(state, { type: 'SET_SHARE_REQUEST', request: share });
  assert.deepEqual(state.shareRequest, share);
  state = navigationReducer(state, { type: 'SET_SHARE_REQUEST', request: null });
  assert.equal(state.shareRequest, null);

  state = navigationReducer(state, { type: 'SET_SELECTED_PERIOD_ID', periodId: 'p2', resetBrowseWeek: true });
  assert.equal(state.selectedPeriodId, 'p2');
  assert.equal(state.localBrowseWeek, '');

  state = navigationReducer(state, { type: 'SET_LOCAL_BROWSE_WEEK', week: '2026-W50' });
  assert.equal(state.localBrowseWeek, '2026-W50');
});
