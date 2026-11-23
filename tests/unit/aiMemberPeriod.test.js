import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberPeriodService } from '../../functions/memberPeriod.js';

function createHarness(members = {}) {
  const counts = new Map();
  const generated = [];
  const service = createMemberPeriodService({
    clock: () => new Date('2026-11-22T12:00:00Z'),
    getMember: async uid => members[uid] || null,
    consumeQuota: async ({ uid, utcDate, dailyLimit }) => {
      const key = `${utcDate}:${uid}`;
      const used = counts.get(key) || 0;
      if (used >= dailyLimit) return false;
      counts.set(key, used + 1);
      return true;
    },
    generate: async args => {
      generated.push(args);
      return { days: [{ date: '2026-11-23' }] };
    },
  });
  return { service, generated };
}

test('member proxy requires Google sign-in and rejects anonymous users', async () => {
  const { service } = createHarness({ u1: { active: true } });
  await assert.rejects(() => service({ uid: null, provider: null, data: { prompt: 'hello' } }), { code: 'AI_MEMBER_SIGN_IN_REQUIRED' });
  await assert.rejects(() => service({ uid: 'u1', provider: 'anonymous', data: { prompt: 'hello' } }), { code: 'AI_MEMBER_SIGN_IN_REQUIRED' });
});

test('member proxy rejects non-members, inactive members, and expired members', async () => {
  const { service } = createHarness({
    inactive: { active: false },
    expired: { active: true, expiresAt: '2026-11-20T00:00:00Z' },
  });
  await assert.rejects(() => service({ uid: 'stranger', provider: 'google.com', data: { prompt: 'hello' } }), { code: 'AI_MEMBER_NOT_ACTIVE' });
  await assert.rejects(() => service({ uid: 'inactive', provider: 'google.com', data: { prompt: 'hello' } }), { code: 'AI_MEMBER_NOT_ACTIVE' });
  await assert.rejects(() => service({ uid: 'expired', provider: 'google.com', data: { prompt: 'hello' } }), { code: 'AI_MEMBER_NOT_ACTIVE' });
});

test('member proxy allows active member, falls back unknown model to flash, and enforces dailyLimit', async () => {
  const { service, generated } = createHarness({
    vip: { active: true, dailyLimit: 2, expiresAt: '2026-12-31T00:00:00Z' },
  });
  const first = await service({ uid: 'vip', provider: 'google.com', data: { prompt: 'plan week 1', model: 'gemini-2.5-pro', includeReport: false } });
  assert.deepEqual(first, { days: [{ date: '2026-11-23' }] });
  assert.equal(generated[0].model, 'gemini-2.5-pro');

  await service({ uid: 'vip', provider: 'google.com', data: { prompt: 'plan week 2', model: 'evil-model', includeReport: true } });
  assert.equal(generated[1].model, 'gemini-2.5-flash');
  assert.equal(generated[1].includeReport, true);

  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: { prompt: 'plan week 3' } }),
    { code: 'AI_MEMBER_DAILY_LIMIT' },
  );
});

test('member proxy rejects empty or >60KB prompts before consuming quota', async () => {
  const { service } = createHarness({ vip: { active: true, dailyLimit: 1 } });
  await assert.rejects(() => service({ uid: 'vip', provider: 'google.com', data: { prompt: '' } }), { code: 'AI_MEMBER_INVALID_INPUT' });
  await assert.rejects(() => service({ uid: 'vip', provider: 'google.com', data: { prompt: 'a'.repeat(60001) } }), { code: 'AI_MEMBER_INVALID_INPUT' });
  // Quota must still be available because invalid input fails before consuming quota
  const ok = await service({ uid: 'vip', provider: 'google.com', data: { prompt: 'valid prompt' } });
  assert.equal(ok.days.length, 1);
});
