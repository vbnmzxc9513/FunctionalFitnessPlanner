export function createNavigationState({ today, currentWeek, initialPeriodId = '' }) {
  const activeDay = new Date(`${today}T12:00:00`).getDay() || 7;
  return {
    activeTab: 'train',
    planScreen: 'overview',
    periodCreating: false,
    trainingMode: 'today',
    activeDay,
    recordsView: 'training',
    manualInput: undefined,
    manualActiveDate: null,
    manualSavedSource: null,
    singleDayEdit: null,
    assignment: null,
    saveWorkoutDay: null,
    shareRequest: null,
    selectedPeriodId: initialPeriodId,
    localBrowseWeek: currentWeek,
  };
}

export function navigationReducer(state, action) {
  switch (action.type) {
    case 'NAVIGATE': {
      const { tab, calendarDay } = action;
      return {
        ...state,
        activeTab: tab,
        ...(tab === 'train' ? { trainingMode: 'today', activeDay: calendarDay || 7 } : {}),
        ...(tab === 'plan' ? { trainingMode: 'plan', planScreen: 'overview', periodCreating: false } : {}),
      };
    }
    case 'VIEW_RECORDS':
      return {
        ...state,
        recordsView: 'training',
        activeTab: 'records',
      };
    case 'SET_RECORDS_VIEW':
      return { ...state, recordsView: action.view };
    case 'SET_ACTIVE_DAY':
      return { ...state, activeDay: action.day };
    case 'SYNC_TODAY_DAY':
      return state.trainingMode === 'today' ? { ...state, activeDay: new Date(`${action.today}T12:00:00`).getDay() || 7 } : state;
    case 'SET_PLAN_SCREEN':
      return { ...state, planScreen: action.screen };
    case 'OPEN_PLAN_SCREEN':
      return {
        ...state,
        planScreen: action.screen,
        ...(action.screen === 'settings' ? { periodCreating: true } : {}),
      };
    case 'SELECT_PLAN_DAY':
      return {
        ...state,
        activeDay: action.day,
        trainingMode: 'plan',
        planScreen: 'day',
      };
    case 'OPEN_WEEKLY_SELECTION':
      return {
        ...state,
        activeTab: 'plan',
        periodCreating: true,
        planScreen: 'settings',
      };
    case 'CLOSE_PERIOD_CREATING':
      return {
        ...state,
        periodCreating: false,
        planScreen: 'overview',
      };
    case 'OPEN_MANUAL': {
      const { sessions, sourceItem = null, activeDate = null, singleDayEdit = null } = action;
      return {
        ...state,
        singleDayEdit,
        manualActiveDate: activeDate,
        manualSavedSource: sourceItem,
        manualInput: sessions,
        periodCreating: false,
        activeTab: 'plan',
        planScreen: 'manual',
      };
    }
    case 'MANUAL_CANCEL':
      return state.singleDayEdit
        ? {
          ...state,
          singleDayEdit: null,
          activeTab: state.singleDayEdit.returnTab,
          activeDay: state.singleDayEdit.returnDay,
          planScreen: state.singleDayEdit.returnScreen || 'overview',
        }
        : { ...state, singleDayEdit: null, planScreen: 'overview' };
    case 'MANUAL_PREVIEW': {
      const { sessions, name } = action;
      const singleDayEdit = state.singleDayEdit ? { ...state.singleDayEdit, add: false } : state.singleDayEdit;
      return {
        ...state,
        manualInput: sessions,
        singleDayEdit,
        assignment: {
          editOrigin: singleDayEdit,
          days: sessions,
          initialDates: sessions.map(day => day.date),
          name,
          returnScreen: 'manual',
        },
        planScreen: 'assign',
      };
    }
    case 'USE_SAVED_WORKOUT':
      return {
        ...state,
        assignment: { days: [action.day], name: action.name, returnScreen: 'saved' },
        planScreen: 'assign',
      };
    case 'ASSIGNMENT_CANCEL':
      return state.assignment
        ? { ...state, planScreen: state.assignment.returnScreen }
        : state;
    case 'ASSIGNMENT_APPLIED': {
      const editOrigin = action.editOrigin;
      return {
        ...state,
        singleDayEdit: null,
        assignment: null,
        selectedPeriodId: action.periodId || '',
        localBrowseWeek: action.browseWeek,
        periodCreating: false,
        activeTab: editOrigin ? editOrigin.returnTab : 'plan',
        ...(editOrigin ? {
          activeDay: editOrigin.returnDay,
          trainingMode: editOrigin.returnTab === 'train' ? 'today' : 'plan',
          planScreen: editOrigin.returnScreen || 'overview',
        } : {
          planScreen: 'overview',
        }),
      };
    }
    case 'PERIOD_APPLIED':
      return {
        ...state,
        selectedPeriodId: action.periodId || '',
        localBrowseWeek: action.browseWeek,
        periodCreating: false,
        activeTab: 'plan',
        planScreen: 'overview',
      };
    case 'OPEN_LEGACY_AI':
      return {
        ...state,
        activeTab: 'plan',
        planScreen: 'legacy-ai',
        periodCreating: false,
      };
    case 'LEGACY_PREVIEW_READY':
      return {
        ...state,
        activeTab: 'plan',
        planScreen: 'legacy-preview',
      };
    case 'LEGACY_PLAN_APPLIED':
      return {
        ...state,
        periodCreating: false,
        trainingMode: 'plan',
        activeTab: 'plan',
        planScreen: 'overview',
      };
    case 'PLAN_BACK':
      if (state.planScreen === 'assign' && state.assignment) {
        return { ...state, planScreen: state.assignment.returnScreen };
      }
      return { ...state, planScreen: 'overview', periodCreating: false };
    case 'SET_SAVE_WORKOUT_DAY':
      return { ...state, saveWorkoutDay: action.day };
    case 'SET_SHARE_REQUEST':
      return { ...state, shareRequest: action.request };
    case 'SET_SELECTED_PERIOD_ID':
      return {
        ...state,
        selectedPeriodId: action.periodId,
        ...(action.resetBrowseWeek ? { localBrowseWeek: '' } : {}),
      };
    case 'SET_LOCAL_BROWSE_WEEK':
      return { ...state, localBrowseWeek: action.week };
    default:
      return state;
  }
}
