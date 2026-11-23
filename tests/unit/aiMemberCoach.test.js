import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachGenerationConfig, createMemberCoachService } from '../../functions/memberCoach.js';

function createHarness(members = {}) {
  const counts = new Map();
  const calls = [];
  const service = createMemberCoachService({
    clock: () => new Date('2026-11-23T12:00:00Z'),
    getMember: async uid => members[uid] || null,
    consumeQuota: async ({ uid, utcDate, dailyLimit }) => {
      const key = `${utcDate}:${uid}`;
      const used = counts.get(key) || 0;
      if (used >= dailyLimit) return false;
      counts.set(key, used + 1);
      return true;
    },
    generate: async args => {
      calls.push(args);
      return { reply: '很棒的進度！今天的弓步急停請保持膝蓋對齊腳尖。' };
    },
  });
  return { service, calls };
}

const VALID_DATA = {
  systemContext: 'You are a warm badminton coach.',
  messages: [{ role: 'user', text: '今天課表要注意什麼？' }],
  model: 'gemini-2.5-flash',
};

test('member coach proxy requires Google sign-in and rejects anonymous users', async () => {
  const { service } = createHarness({ u1: { active: true } });
  await assert.rejects(() => service({ uid: null, provider: null, data: VALID_DATA }), { code: 'AI_MEMBER_SIGN_IN_REQUIRED' });
  await assert.rejects(() => service({ uid: 'u1', provider: 'anonymous', data: VALID_DATA }), { code: 'AI_MEMBER_SIGN_IN_REQUIRED' });
});

test('member coach proxy rejects non-members, inactive members, and expired members', async () => {
  const { service } = createHarness({
    inactive: { active: false },
    expired: { active: true, expiresAt: '2026-11-20T00:00:00Z' },
  });
  await assert.rejects(() => service({ uid: 'stranger', provider: 'google.com', data: VALID_DATA }), { code: 'AI_MEMBER_NOT_ACTIVE' });
  await assert.rejects(() => service({ uid: 'inactive', provider: 'google.com', data: VALID_DATA }), { code: 'AI_MEMBER_NOT_ACTIVE' });
  await assert.rejects(() => service({ uid: 'expired', provider: 'google.com', data: VALID_DATA }), { code: 'AI_MEMBER_NOT_ACTIVE' });
});

test('member coach proxy validates systemContext size, messages array bounds, roles, and char limits before consuming quota', async () => {
  const { service, calls } = createHarness({ vip: { active: true, dailyLimit: 1 } });

  // Oversized systemContext > 28000 UTF-8 bytes
  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: { ...VALID_DATA, systemContext: 'a'.repeat(28001) } }),
    { code: 'AI_MEMBER_INVALID_INPUT' },
  );
  // Empty messages array
  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: { ...VALID_DATA, messages: [] } }),
    { code: 'AI_MEMBER_INVALID_INPUT' },
  );
  // Too many messages (> 20)
  await assert.rejects(
    () => service({
      uid: 'vip',
      provider: 'google.com',
      data: {
        ...VALID_DATA,
        messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'model', text: `msg ${i}` })),
      },
    }),
    { code: 'AI_MEMBER_INVALID_INPUT' },
  );
  // Invalid role
  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: { ...VALID_DATA, messages: [{ role: 'system', text: 'hi' }] } }),
    { code: 'AI_MEMBER_INVALID_INPUT' },
  );
  // Oversized message text > 4000 chars
  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: { ...VALID_DATA, messages: [{ role: 'user', text: 'x'.repeat(4001) }] } }),
    { code: 'AI_MEMBER_INVALID_INPUT' },
  );

  // Quota must remain unconsumed after all validation rejections
  const ok = await service({ uid: 'vip', provider: 'google.com', data: VALID_DATA });
  assert.equal(ok.reply, '很棒的進度！今天的弓步急停請保持膝蓋對齊腳尖。');
  assert.equal(calls.length, 1);
});

test('member coach proxy enforces allowed models, daily quota, and returns reply', async () => {
  const { service, calls } = createHarness({
    vip: { active: true, dailyLimit: 2, expiresAt: '2026-12-31T00:00:00Z' },
  });

  const first = await service({
    uid: 'vip',
    provider: 'google.com',
    data: { ...VALID_DATA, model: 'gemini-2.5-pro' },
  });
  assert.ok(first.reply.length > 0);
  assert.equal(calls[0].model, 'gemini-2.5-pro');

  await service({
    uid: 'vip',
    provider: 'google.com',
    data: {
      systemContext: 'Context',
      messages: [
        { role: 'user', text: '問題一' },
        { role: 'model', text: '回覆一' },
        { role: 'user', text: '問題二' },
      ],
      model: 'unlisted-model',
    },
  });
  assert.equal(calls[1].model, 'gemini-2.5-flash');
  assert.equal(calls[1].messages.length, 3);

  await assert.rejects(
    () => service({ uid: 'vip', provider: 'google.com', data: VALID_DATA }),
    { code: 'AI_MEMBER_DAILY_LIMIT' },
  );
});

test('buildCoachGenerationConfig disables thinking only for flash models and increases maxOutputTokens for pro', () => {
  const flashConfig = buildCoachGenerationConfig('gemini-2.5-flash');
  assert.deepEqual(flashConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(flashConfig.maxOutputTokens, 2048);

  const proConfig = buildCoachGenerationConfig('gemini-2.5-pro');
  assert.equal(Object.hasOwn(proConfig, 'thinkingConfig'), false);
  assert.equal(proConfig.maxOutputTokens, 4096);
});
