import { dailyWarmupPrescriptions } from './quickWorkouts.js';
import { exerciseTrainingTargets } from './trainingTargets.js';
import { mobilityAreas } from './mobility.js';
import { catalogExercises } from './exerciseCatalog.js';

export const DEFAULT_MAX_PROMPT_BYTES = 56000;

const CATALOG = catalogExercises();
const CATEGORY_ORDER = ['warmup', 'lower', 'upper', 'core', 'power', 'footwork', 'reaction', 'recovery', 'conditioning'];
const STIFFNESS_MOBILITY_AREAS = {
  hip: ['hip_front', 'hip_rotation', 'adductors'],
  ankle: ['ankle'],
  thoracic: ['thoracic'],
  shoulder: ['shoulder'],
};
const encoder = new TextEncoder();

export const utf8Bytes = text => encoder.encode(String(text ?? '')).length;

function toCandidateRecord(entry, index) {
  if (Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string') {
    const [id, exercise, serialized] = entry;
    const payload = serialized || exercise;
    return {
      id,
      exercise: exercise || payload,
      serialized: payload,
      index,
      jsonBytes: utf8Bytes(JSON.stringify(payload)),
    };
  }
  const payload = entry;
  const fallback = payload?.catalogCode ? payload : (CATALOG[payload?.id] ? { ...CATALOG[payload.id], ...payload } : payload);
  return {
    id: payload.id,
    exercise: fallback,
    serialized: payload,
    index,
    jsonBytes: utf8Bytes(JSON.stringify(payload)),
  };
}

function collectPreviousPlanIds(previousPlan) {
  const ids = new Set();
  for (const day of Array.isArray(previousPlan?.schedule) ? previousPlan.schedule : []) {
    for (const id of Array.isArray(day?.routine) ? day.routine : []) {
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return ids;
}

function matchesStiffnessRegion(id, exercise, stiffnessRegions, exercisesById) {
  if (!stiffnessRegions.length) return false;
  const areas = mobilityAreas(id, exercisesById);
  if (areas.length) {
    return stiffnessRegions.some(region => (STIFFNESS_MOBILITY_AREAS[region] || [region]).some(area => areas.includes(area)));
  }
  return ['warmup', 'recovery'].includes(exercise?.category)
    && Array.isArray(exercise?.bodyParts)
    && stiffnessRegions.some(region => exercise.bodyParts.includes(region));
}

function interleaveByCategory(items) {
  if (items.length <= 1) return items;
  const buckets = new Map();
  for (const category of CATEGORY_ORDER) buckets.set(category, []);
  const extraCategories = [];
  for (const item of items) {
    const category = item.exercise?.category || 'custom';
    if (!buckets.has(category)) {
      buckets.set(category, []);
      extraCategories.push(category);
    }
    buckets.get(category).push(item);
  }
  const order = [...CATEGORY_ORDER, ...extraCategories.sort((a, b) => a.localeCompare(b))];
  for (const category of order) {
    buckets.get(category).sort((a, b) => a.id.localeCompare(b.id) || a.index - b.index);
  }
  const result = [];
  let remaining = items.length;
  while (remaining > 0) {
    let progressed = false;
    for (const category of order) {
      const queue = buckets.get(category);
      if (queue && queue.length) {
        result.push(queue.shift());
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return result;
}

function packOrdered(ordered, baseBytes, maxBytes) {
  const selected = [];
  let arrayBytes = 2; // '[]'
  for (const item of ordered) {
    const delta = item.jsonBytes + (selected.length > 0 ? 1 : 0);
    if (baseBytes + arrayBytes + delta <= maxBytes) {
      selected.push(item);
      arrayBytes += delta;
    }
  }
  return selected;
}

export function selectPromptCandidates(
  candidateEntries = [],
  { profile = {}, previousPlan = null, baseBytes = 0, maxBytes = DEFAULT_MAX_PROMPT_BYTES } = {},
) {
  const records = candidateEntries.map((entry, index) => toCandidateRecord(entry, index));
  const totalEligible = records.length;
  if (!totalEligible) {
    return { candidates: [], totalEligible: 0, includedCount: 0, omittedCount: 0, budgeted: false };
  }

  const allSerialized = records.map(record => record.serialized);
  const fullBytes = baseBytes + utf8Bytes(JSON.stringify(allSerialized));
  if (fullBytes <= maxBytes) {
    return {
      candidates: allSerialized,
      totalEligible,
      includedCount: totalEligible,
      omittedCount: 0,
      budgeted: false,
    };
  }

  const warmupIds = dailyWarmupPrescriptions().map(dose => dose.id);
  const warmupRank = new Map(warmupIds.map((id, idx) => [id, idx]));
  const weeklyIds = Array.isArray(profile?.weeklyExerciseIds) ? profile.weeklyExerciseIds : [];
  const weeklyRank = new Map(weeklyIds.map((id, idx) => [id, idx]));
  const previousIds = collectPreviousPlanIds(previousPlan);
  const targetRegions = Array.isArray(profile?.targetRegions) ? profile.targetRegions : [];
  const stiffnessRegions = Array.isArray(profile?.stiffnessRegions) ? profile.stiffnessRegions : [];
  const exercisesById = Object.fromEntries(records.map(record => [record.id, record.exercise]));

  const tier0Warmup = [];
  const tier0Weekly = [];
  const tier0Previous = [];
  const tier0Target = [];
  const tier0Stiffness = [];
  const tier1Priority = [];
  const tier2Rest = [];

  for (const record of records) {
    const id = record.id;
    const exercise = record.exercise || {};
    if (warmupRank.has(id)) {
      tier0Warmup.push(record);
    } else if (weeklyRank.has(id)) {
      tier0Weekly.push(record);
    } else if (previousIds.has(id)) {
      tier0Previous.push(record);
    } else {
      const hasTarget = targetRegions.length > 0 && (
        exerciseTrainingTargets(id, exercise).some(region => targetRegions.includes(region))
        || (Array.isArray(exercise.trainingTargets) && exercise.trainingTargets.some(region => targetRegions.includes(region)))
      );
      if (hasTarget) {
        tier0Target.push(record);
      } else if (matchesStiffnessRegion(id, exercise, stiffnessRegions, exercisesById)) {
        tier0Stiffness.push(record);
      } else if (exercise.priority) {
        tier1Priority.push(record);
      } else {
        tier2Rest.push(record);
      }
    }
  }

  tier0Warmup.sort((a, b) => warmupRank.get(a.id) - warmupRank.get(b.id));
  tier0Weekly.sort((a, b) => weeklyRank.get(a.id) - weeklyRank.get(b.id));
  tier0Previous.sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  tier0Target.sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  tier0Stiffness.sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));

  const ordered = [
    ...tier0Warmup,
    ...tier0Weekly,
    ...tier0Previous,
    ...tier0Target,
    ...tier0Stiffness,
    ...interleaveByCategory(tier1Priority),
    ...interleaveByCategory(tier2Rest),
  ];

  const packed = packOrdered(ordered, baseBytes, maxBytes);
  const selectedIds = new Set(packed.map(item => item.id));
  const candidates = records.filter(record => selectedIds.has(record.id)).map(record => record.serialized);
  const includedCount = candidates.length;

  return {
    candidates,
    totalEligible,
    includedCount,
    omittedCount: totalEligible - includedCount,
    budgeted: includedCount < totalEligible,
  };
}
