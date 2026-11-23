export class MemberAiError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const ALLOWED_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
const DEFAULT_DAILY_LIMIT = 20;
const MAX_DAILY_LIMIT = 50;
const MAX_PROMPT_BYTES = 60000;

const fail = code => {
  throw new MemberAiError(code);
};

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

export function createMemberPeriodService({
  getMember,
  consumeQuota,
  generate,
  clock = () => new Date(),
}) {
  return async ({ uid, provider, data }) => {
    if (!uid || provider !== 'google.com') fail('AI_MEMBER_SIGN_IN_REQUIRED');
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('AI_MEMBER_INVALID_INPUT');

    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    const promptBytes = Buffer.byteLength(prompt, 'utf8');
    if (!prompt || promptBytes > MAX_PROMPT_BYTES) fail('AI_MEMBER_INVALID_INPUT');

    const model = typeof data.model === 'string' && ALLOWED_MODELS.has(data.model)
      ? data.model
      : 'gemini-2.5-flash';
    const includeReport = data.includeReport === true;

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
      const result = await generate({ prompt, model, includeReport });
      if (!result || typeof result !== 'object' || !Array.isArray(result.days)) {
        throw new Error('INVALID_MEMBER_RESULT');
      }
      return result;
    } catch (error) {
      if (error instanceof MemberAiError) throw error;
      fail('AI_MEMBER_FAILED');
    }
  };
}
