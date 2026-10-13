import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAIPlan } from '../../src/services/gemini.js';

test('Gemini request carries context and dose schema and validates the response without a real API call', async () => {
  const original = globalThis.fetch;
  let payload;
  const response = { conclusion: 'Use light recovery', schedule: [1, 2, 3, 4, 5].map(day => ({ day, name: 'Day', theme: 'Rest', concept: 'Recover', coachAdvice: 'Keep it light', routine: [], prescriptions: [] })) };
  globalThis.fetch = async (_url, request) => {
    payload = JSON.parse(request.body);
    return { json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }) };
  };
  try {
    const result = await generateAIPlan({}, 1, 1, 'test-only', {}, [], 'Coordination', 35, '', {}, 'en', undefined,
      { currentDate: '2026-10-13', currentWeek: '2026-W42', context: { badmintonDays: [2, 5, 6], competitionDate: '2026-11-16' } });
    assert.equal(result.schedule[0].routine.length, 0);
    assert.ok(payload.contents[0].parts[0].text.includes('Write all human-facing text in ENGLISH'));
    assert.ok(payload.contents[0].parts[0].text.includes('34'));
    assert.ok(payload.generationConfig.responseSchema.properties.schedule.items.required.includes('prescriptions'));
  } finally { globalThis.fetch = original; }
});
