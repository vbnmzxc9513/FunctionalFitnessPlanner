export class MemberCoachError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
const DEFAULT_DAILY_LIMIT = 20;
const MAX_DAILY_LIMIT = 50;
const MAX_SYSTEM_CONTEXT_BYTES = 28000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

const fail = code => {
  throw new MemberCoachError(code);
};

export function buildCoachGenerationConfig(model) {
  const isFlash = String(model || '').includes('flash');
  return {
    temperature: 0.6,
    maxOutputTokens: isFlash ? 2048 : 4096,
    ...(isFlash ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  };
}

function isActiveMember(member, nowMs) {
  if (!member || member.active !== true) return false;
  if (member.expiresAt) {
    const millis = typeof member.expiresAt.toMillis === 'function'
      ? member.expiresAt.toMillis()
      : Date.parse(String(member.expiresAt));
    if (Number.isFinite(millis) && millis < nowMs) return false;
  }
  return true;
}

function validateMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    fail('AI_MEMBER_INVALID_INPUT');
  }
  const clean = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('AI_MEMBER_INVALID_INPUT');
    if (item.role !== 'user' && item.role !== 'model') fail('AI_MEMBER_INVALID_INPUT');
    if (typeof item.text !== 'string') fail('AI_MEMBER_INVALID_INPUT');
    const text = item.text.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS) fail('AI_MEMBER_INVALID_INPUT');
    clean.push({ role: item.role, text });
  }
  if (!clean.some(item => item.role === 'user')) fail('AI_MEMBER_INVALID_INPUT');
  return clean;
}

export function createMemberCoachService({
  getMember,
  consumeQuota,
  generate,
  clock = () => new Date(),
}) {
  return async ({ uid, provider, data }) => {
    if (!uid || provider !== 'google.com') fail('AI_MEMBER_SIGN_IN_REQUIRED');
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('AI_MEMBER_INVALID_INPUT');

    if (data.systemContext !== undefined && typeof data.systemContext !== 'string') {
      fail('AI_MEMBER_INVALID_INPUT');
    }
    const systemContext = typeof data.systemContext === 'string' ? data.systemContext.trim() : '';
    if (Buffer.byteLength(systemContext, 'utf8') > MAX_SYSTEM_CONTEXT_BYTES) {
      fail('AI_MEMBER_INVALID_INPUT');
    }

    const messages = validateMessages(data.messages);
    const model = typeof data.model === 'string' && ALLOWED_MODELS.has(data.model)
      ? data.model
      : 'gemini-2.5-flash';

    const now = clock();
    const member = await getMember(uid);
    if (!isActiveMember(member, now.getTime())) fail('AI_MEMBER_NOT_ACTIVE');

    const requestedLimit = Number(member.dailyLimit);
    const dailyLimit = Number.isInteger(requestedLimit) && requestedLimit >= 1
      ? Math.min(MAX_DAILY_LIMIT, requestedLimit)
      : DEFAULT_DAILY_LIMIT;
    const utcDate = now.toISOString().slice(0, 10);

    const allowed = await consumeQuota({ uid, utcDate, dailyLimit });
    if (!allowed) fail('AI_MEMBER_DAILY_LIMIT');

    try {
      const result = await generate({ systemContext, messages, model });
      const reply = typeof result === 'string'
        ? result.trim()
        : typeof result?.reply === 'string'
          ? result.reply.trim()
          : '';
      if (!reply) throw new Error('INVALID_COACH_REPLY');
      return { reply };
    } catch (error) {
      if (error instanceof MemberCoachError) throw error;
      fail('AI_MEMBER_FAILED');
    }
  };
}
