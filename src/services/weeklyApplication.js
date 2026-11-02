import { weeklyApplicationDraft } from '../domain/weeklyApplication.js';
import { loadPeriodState, applyPeriodPlan } from './periodRepository.js';

export async function prepareWeeklyApplication(uid, { plan, profile, week }, options = {}) {
  const draft = weeklyApplicationDraft(plan, profile, week, options);
  const state = await loadPeriodState(uid, draft.range, options);
  // The review must show what will actually remain on protected dates, rather
  // than proposed work the transaction is required to skip.
  const protectedDates = new Set(state.protectedDates);
  const sessions = draft.sessions.map(session => protectedDates.has(session.date)
    ? structuredClone(state.sessionsByDate[session.date] || session) : session);
  return { ...draft, sessions, expectedState: state.expectedState, protectedDates: state.protectedDates };
}

export function applyWeeklyApplication(uid, application) {
  return applyPeriodPlan(uid, application);
}
