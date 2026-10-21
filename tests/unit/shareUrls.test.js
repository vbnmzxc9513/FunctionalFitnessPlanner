import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedPlanUrl, buildEmbeddedPlanUrl } from '../../src/services/sharedPlanRepository.js';
import { createPlanPayload, readSharedPlanLocation } from '../../src/domain/sharedPlans.js';
const id = '0123456789abcdef0123456789abcdef';
const payload = createPlanPayload([{ routine: [] }], { name: 'Public rest day' });
test('new short and embedded links use canonical origin while explicit origin injection remains available', () => {
  assert.equal(buildSharedPlanUrl(id), `https://badminton-functional-fitness-planner.pages.dev/#plan=${id}`);
  const url = buildEmbeddedPlanUrl(payload);
  assert.equal(new URL(url).origin, 'https://badminton-functional-fitness-planner.pages.dev');
  assert.equal(new URL(url).pathname, '/');
  assert.deepEqual(readSharedPlanLocation(new URL(url)), { payload });
  const legacyLocation = { origin: 'https://vbnmzxc9513.github.io', pathname: '/FunctionalFitnessPlanner/', search: '?token=secret' };
  const legacy = buildSharedPlanUrl(id, legacyLocation);
  assert.deepEqual(readSharedPlanLocation(new URL(legacy)), { id });
  assert.ok(!legacy.includes('secret'));
});
