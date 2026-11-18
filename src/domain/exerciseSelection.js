import { exerciseEligibilityIssues } from './exerciseCatalog.js';
import { matchesBodyPart, matchesExerciseQuery } from './exerciseTags.js';

const essentials = ['bf_C11','shoulder_press','bf_B10','bf_B11','bf_C01','bf_C03','bf_B06','dead_bug','bf_C17','bf_C18','bf_C19','bf_C20'];
export function exerciseSelection(exercises = {}, eligible = {}, { query = '', region = 'all', context = {}, lang = 'zh' } = {}) {
  const rank = id => id.startsWith('custom_') ? -1 : essentials.includes(id) ? essentials.indexOf(id) : essentials.length;
  return Object.entries(exercises).filter(([id,row]) => !row.deleted && matchesBodyPart(id,row,region) && matchesExerciseQuery(id,row,query,lang))
    .map(([id,exercise]) => ({ id, exercise, available: !!eligible[id], issues: eligible[id] ? [] : exerciseEligibilityIssues(exercise,context) }))
    .sort((a,b) => Number(b.available) - Number(a.available) || rank(a.id) - rank(b.id));
}
export function selectionReason(row, lang = 'zh') {
  if (row.available) return '';
  const en = lang === 'en', codes = row.issues.map(issue => issue.code);
  if (codes.includes('disabled')) return en ? 'Disabled · enable in your library' : '已停用，可在動作庫管理開啟';
  if (codes.includes('advanced')) return en ? 'Requires intermediate experience or above' : '需中階以上訓練經驗';
  if (codes.some(code => ['health','unknown_treatment','treatment_equipment'].includes(code))) return en ? 'Unavailable under current treatment restrictions' : '目前治療／健康限制不適用';
  if (codes.includes('partner')) return en ? 'Requires a partner' : '需要搭檔';
  if (codes.includes('equipment')) return en ? 'Required equipment is not selected' : '尚未勾選所需器材';
  return en ? 'Unavailable under your planning conditions' : '目前排課條件不適用';
}
