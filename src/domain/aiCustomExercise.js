import { EQUIPMENT } from './exerciseCatalog.js';
import { BODY_PARTS } from './exerciseTags.js';
import { createCustomExercise } from './customExercises.js';

const VALID_PURPOSES = new Set(['warmup', 'training', 'cooldown']);
const VALID_PARTS = new Set(BODY_PARTS.map(([key]) => key));
const VALID_EQUIPMENT = new Set(EQUIPMENT);
const VALID_UNITS = new Set(['reps', 'seconds', 'minutes', 'breaths']);
const UNIT_MAX = { reps: 100, seconds: 600, minutes: 10, breaths: 30 };

export function buildCustomExercisePrompt({ name, lang = 'zh' } = {}) {
  const cleanName = String(name || '').trim().slice(0, 100);
  const en = lang === 'en';
  const bodyPartList = BODY_PARTS.filter(([k]) => k !== 'unclassified').map(([k, zh, enLabel]) => `${k}(${en ? enLabel : zh})`).join(', ');
  const equipmentList = EQUIPMENT.join(', ');

  const systemContext = [
    en
      ? 'You are a certified badminton functional strength & conditioning coach. Output ONLY a single valid JSON object (no markdown fences, no extra prose).'
      : '你是一位專業羽球功能性體能教練。請「只輸出單一合法 JSON 物件」，不可加程式碼圍欄（```）或多餘說明文字。',
    'JSON schema:',
    '{',
    '  "name": string (1-100 chars, refined clear exercise name in user language; keep user intent),',
    '  "purpose": "warmup" | "training" | "cooldown",',
    `  "bodyParts": string[] (1 to 3 keys strictly from: ${bodyPartList}),`,
    `  "equipment": string[] (0 or more keys strictly from: ${equipmentList}; use [] for bodyweight),`,
    '  "description": string (80-240 chars; concise practical guide covering starting position, execution steps, and key safety cue / common mistake; avoid medical diagnosis),',
    '  "prescription": { "sets": 1..5, "value": "8" or "8-12" or "30", "unit": "reps"|"seconds"|"minutes"|"breaths", "restSeconds": 0..300, "perSide": boolean }',
    '}',
    en
      ? 'Write name and description in natural, concise English.'
      : 'name 與 description 請用自然、具體、專業的繁體中文撰寫（可用換行分段：起始姿勢、動作要領、注意重點）。',
  ].join('\n');

  const userMessage = en
    ? `Generate the structured exercise profile and movement instructions for: "${cleanName}"`
    : `請為以下動作生成完整動作設定與動作說明：「${cleanName}」`;

  return { systemContext, userMessage };
}

function extractJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI_EXERCISE_EMPTY');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('AI_EXERCISE_PARSE_FAILED');
  }
}

function sanitizeDoseValue(rawValue, unit) {
  const max = UNIT_MAX[unit] || 100;
  const fallback = unit === 'seconds' ? '30' : unit === 'minutes' ? '5' : unit === 'breaths' ? '6' : '8';
  const cleaned = String(rawValue ?? '').trim().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d{1,3})(?:[–-](\d{1,3}))?$/);
  if (!match) return fallback;
  const first = Math.min(max, Math.max(1, Number(match[1])));
  if (!match[2]) return String(first);
  const second = Math.min(max, Math.max(first, Number(match[2])));
  return first === second ? String(first) : `${first}–${second}`;
}

/**
 * Parse and strictly sanitize an AI-generated custom exercise payload so it
 * always conforms to `createCustomExercise` invariants.
 */
export function parseAiCustomExerciseDraft(raw, fallbackName = '') {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI_EXERCISE_PARSE_FAILED');
  }

  const stripControl = text => Array.from(String(text || '').trim()).filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').slice(0, 100);
  const cleanFallback = stripControl(fallbackName);
  const rawName = stripControl(parsed.name);
  const name = rawName || cleanFallback;
  if (!name) throw new Error('CUSTOM_NAME');

  const purpose = VALID_PURPOSES.has(parsed.purpose) ? parsed.purpose : 'training';
  const rawParts = Array.isArray(parsed.bodyParts) ? parsed.bodyParts : [];
  const filteredParts = [...new Set(rawParts.filter(part => VALID_PARTS.has(part) && part !== 'unclassified'))].slice(0, 3);
  const bodyParts = filteredParts.length ? filteredParts : ['unclassified'];

  const rawEquip = Array.isArray(parsed.equipment) ? parsed.equipment : [];
  const equipment = [...new Set(rawEquip.filter(item => VALID_EQUIPMENT.has(item)))];

  const description = String(parsed.description || parsed.tip || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .slice(0, 1000);

  const mobility = purpose !== 'training';
  const rawDose = parsed.prescription && typeof parsed.prescription === 'object' ? parsed.prescription : {};
  const unit = VALID_UNITS.has(rawDose.unit) ? rawDose.unit : (mobility ? 'seconds' : 'reps');
  const hasSets = rawDose.sets !== undefined && rawDose.sets !== null && rawDose.sets !== '' && Number.isFinite(Number(rawDose.sets));
  const sets = hasSets ? Math.min(5, Math.max(1, Math.round(Number(rawDose.sets)))) : (mobility ? 1 : 2);
  const value = sanitizeDoseValue(rawDose.value, unit);
  const hasRest = rawDose.restSeconds !== undefined && rawDose.restSeconds !== null && rawDose.restSeconds !== '' && Number.isFinite(Number(rawDose.restSeconds));
  const restSeconds = hasRest ? Math.min(300, Math.max(0, Math.round(Number(rawDose.restSeconds)))) : (mobility ? 0 : 60);
  const perSide = Boolean(rawDose.perSide);

  const draft = {
    name,
    purpose,
    bodyParts,
    equipment,
    description,
    prescription: { sets, value, unit, restSeconds, perSide },
  };
  // Verify against canonical validator before returning.
  createCustomExercise(draft);
  return draft;
}

export function aiCustomExerciseError(error, lang = 'zh') {
  const en = lang === 'en';
  const code = error?.message || '';
  const map = {
    CUSTOM_NAME: en ? 'Enter an exercise name first.' : '請先輸入動作名稱。',
    AI_NOT_CONFIGURED: en
      ? 'No AI key configured yet. Add a Gemini API key in Settings, or fill in the fields manually below.'
      : '尚未設定 AI 金鑰。可到「設定」填入 Gemini API Key，或直接手動填寫下方欄位。',
    AI_MEMBER_DAILY_LIMIT: en
      ? 'Member Cloud AI daily limit reached. You can retry tomorrow or fill manually.'
      : '今日雲端 AI 額度已用完，可明天再試或先手動填寫。',
    AI_MEMBER_SIGN_IN_REQUIRED: en
      ? 'Please sign in with Google to use Member Cloud AI.'
      : '請使用 Google 帳號登入以使用會員雲端 AI。',
    AI_MEMBER_NOT_ACTIVE: en
      ? 'Member Cloud AI is not active for this account.'
      : '此帳號尚未開通會員雲端 AI，可改用自己的 API Key 或手動填寫。',
    API_KEY_INVALID: en
      ? 'Your Gemini API key is invalid or expired. Check Settings.'
      : 'Gemini API Key 無效或已過期，請到「設定」檢查。',
    RATE_LIMITED: en
      ? 'AI is busy right now. Please wait a moment and try again.'
      : 'AI 請求頻率過高，請稍候再試。',
    NETWORK_ERROR: en
      ? 'Network error while contacting AI. Check your connection and retry.'
      : '連線 AI 失敗，請確認網路後重試。',
  };
  return map[code] || (en ? 'AI generation failed. Please retry or fill in manually.' : 'AI 生成失敗，請重試或改為手動填寫。');
}
