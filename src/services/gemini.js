import { buildPlanningPrompt } from '../domain/coachingPrompt.js';
import { validateNewAIPlan } from '../domain/newAIPlan.js';
import { SESSION_PHASES, SESSION_TYPES } from '../domain/phases.js';
import { normalizeCoachHistory } from '../domain/aiCoachChat.js';

export const generateAIPlan = async (lastWeekData, currentLevel, lastWeekFeedback, userApiKey, allProgress, metricsHistory, userGoal, dailyTime, userMessage, availableExercises, lang = 'zh', selectedModel = 'gemini-2.5-flash', options = {}) => {
  if (!userApiKey) throw new Error('API_KEY_MISSING');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;
  const prompt = buildPlanningPrompt({ lastWeekData, currentLevel, lastWeekFeedback, allProgress, metricsHistory,
    userGoal, dailyTime, userMessage, availableExercises, lang, ...options });
  const doseSchema = {
    type: 'OBJECT',
    properties: { id: { type: 'STRING' }, sets: { type: 'INTEGER' }, value: { type: 'STRING' },
      unit: { type: 'STRING', enum: ['reps', 'seconds', 'minutes', 'breaths'] },
      restSeconds: { type: 'INTEGER' }, perSide: { type: 'BOOLEAN' }, phase: { type: 'STRING', enum: SESSION_PHASES },
      preparation: { type: 'OBJECT', properties: { sets: { type: 'INTEGER' }, value: { type: 'STRING' },
        unit: { type: 'STRING', enum: ['reps', 'seconds', 'breaths'] }, restSeconds: { type: 'INTEGER' }, perSide: { type: 'BOOLEAN' }, instruction: { type: 'STRING' } },
      required: ['sets', 'value', 'unit', 'restSeconds', 'perSide', 'instruction'] } },
    required: ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase'],
  };
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT', properties: {
          conclusion: { type: 'STRING' },
          schedule: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            day: { type: 'INTEGER' }, name: { type: 'STRING' }, theme: { type: 'STRING' },
            concept: { type: 'STRING' }, coachAdvice: { type: 'STRING' },
            sessionType: { type: 'STRING', enum: SESSION_TYPES }, warmupNote: { type: 'STRING' }, cooldownNote: { type: 'STRING' },
            routine: { type: 'ARRAY', items: { type: 'STRING' } },
            prescriptions: { type: 'ARRAY', items: doseSchema },
          }, required: ['day', 'name', 'theme', 'concept', 'coachAdvice', 'sessionType', 'warmupNote', 'cooldownNote', 'routine', 'prescriptions'] } },
        }, required: ['conclusion', 'schedule'],
      },
    },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API Error');
      return validateNewAIPlan(JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text), availableExercises, dailyTime, { ...options, lang });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
};

export function buildPeriodChunkSchema(includeReport = false) {
  const doseSchema = {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      sets: { type: 'INTEGER' },
      value: { type: 'STRING' },
      unit: { type: 'STRING', enum: ['reps', 'seconds', 'minutes', 'breaths'] },
      restSeconds: { type: 'INTEGER' },
      perSide: { type: 'BOOLEAN' },
      phase: { type: 'STRING', enum: SESSION_PHASES },
      preparation: {
        type: 'OBJECT',
        properties: {
          sets: { type: 'INTEGER' },
          value: { type: 'STRING' },
          unit: { type: 'STRING', enum: ['reps', 'seconds', 'breaths'] },
          restSeconds: { type: 'INTEGER' },
          perSide: { type: 'BOOLEAN' },
          instruction: { type: 'STRING' },
        },
        required: ['sets', 'value', 'unit', 'restSeconds', 'perSide', 'instruction'],
      },
    },
    required: ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase'],
  };

  const properties = {
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          name: { type: 'STRING' },
          theme: { type: 'STRING' },
          concept: { type: 'STRING' },
          coachAdvice: { type: 'STRING' },
          sessionType: { type: 'STRING', enum: SESSION_TYPES },
          warmupNote: { type: 'STRING' },
          cooldownNote: { type: 'STRING' },
          routine: { type: 'ARRAY', items: { type: 'STRING' } },
          prescriptions: { type: 'ARRAY', items: doseSchema },
        },
        required: ['date', 'name', 'theme', 'concept', 'coachAdvice', 'sessionType', 'warmupNote', 'cooldownNote', 'routine', 'prescriptions'],
      },
    },
  };
  const required = ['days'];

  if (includeReport) {
    properties.report = {
      type: 'OBJECT',
      properties: {
        reviewAndPraise: { type: 'STRING' },
        reminders: { type: 'ARRAY', items: { type: 'STRING' } },
        planOverview: { type: 'STRING' },
        checkpoints: { type: 'STRING' },
      },
      required: ['reviewAndPraise', 'reminders', 'planOverview', 'checkpoints'],
    };
    required.push('report');
  }

  return { type: 'OBJECT', properties, required };
}

const FALLBACK_PLANNING_MODEL = 'gemini-2.5-flash';
const NON_FALLBACK_ERRORS = new Set(['API_KEY_MISSING', 'API_KEY_INVALID', 'RATE_LIMITED', 'ABORTED', 'NETWORK_ERROR']);

function supportsThinkingConfig(model) {
  return /^gemini-(2\.5|3)/.test(String(model || ''));
}

function buildPeriodGenerationConfig(model, includeReport) {
  const isFlash = String(model || '').includes('flash');
  const thinking = supportsThinkingConfig(model)
    ? { thinkingConfig: { thinkingBudget: isFlash ? 0 : 1024 } }
    : {};
  return {
    temperature: 0.35,
    maxOutputTokens: isFlash ? 8192 : 16384,
    ...thinking,
    responseMimeType: 'application/json',
    responseSchema: buildPeriodChunkSchema(includeReport),
  };
}

async function requestPeriodChunkOnce({ prompt, key, model, includeReport, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: buildPeriodGenerationConfig(model, includeReport),
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw new Error('ABORTED');
    throw new Error('NETWORK_ERROR');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    if (response.status === 401 || response.status === 403) throw new Error('API_KEY_INVALID');
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error('AI_INVALID_JSON');
  }

  if (!response.ok || data?.error) {
    const status = response.status || data?.error?.code;
    const message = String(data?.error?.message || '');
    if (status === 401 || status === 403 || /api key/i.test(message)) throw new Error('API_KEY_INVALID');
    if (status === 429 || /quota|rate/i.test(message)) throw new Error('RATE_LIMITED');
    throw new Error(message || 'AI_REQUEST_FAILED');
  }

  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.filter(part => !part.thought).map(part => part.text || '').join('').trim();
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  try {
    return JSON.parse(text);
  } catch {
    if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('AI_INCOMPLETE_RESULT');
    throw new Error('AI_INVALID_JSON');
  }
}

export async function generateAIPeriodChunk({
  prompt,
  apiKey,
  model = FALLBACK_PLANNING_MODEL,
  includeReport = false,
  signal,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('API_KEY_MISSING');
  if (signal?.aborted) throw new Error('ABORTED');

  try {
    return await requestPeriodChunkOnce({ prompt, key, model, includeReport, signal });
  } catch (error) {
    if (model !== FALLBACK_PLANNING_MODEL && !NON_FALLBACK_ERRORS.has(error?.message) && !signal?.aborted) {
      return requestPeriodChunkOnce({ prompt, key, model: FALLBACK_PLANNING_MODEL, includeReport, signal });
    }
    throw error;
  }
}

async function requestCoachReplyOnce({ systemText, normalized, key, model, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const isFlash = String(model || '').includes('flash');
  const thinking = supportsThinkingConfig(model)
    ? { thinkingConfig: { thinkingBudget: isFlash ? 0 : 1024 } }
    : {};
  const payload = {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents: normalized.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: isFlash ? 2048 : 4096,
      ...thinking,
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw new Error('ABORTED');
    throw new Error('NETWORK_ERROR');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    if (response.status === 401 || response.status === 403) throw new Error('API_KEY_INVALID');
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error('AI_EMPTY_RESPONSE');
  }

  if (!response.ok || data?.error) {
    const status = response.status || data?.error?.code;
    const message = String(data?.error?.message || '');
    if (status === 401 || status === 403 || /api key/i.test(message)) throw new Error('API_KEY_INVALID');
    if (status === 429 || /quota|rate/i.test(message)) throw new Error('RATE_LIMITED');
    throw new Error(message || 'AI_REQUEST_FAILED');
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(part => !part.thought).map(part => part.text || '').join('').trim();
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return text;
}

export async function generateCoachReply({
  systemContext = '',
  messages = [],
  apiKey,
  model = FALLBACK_PLANNING_MODEL,
  signal,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('API_KEY_MISSING');
  if (signal?.aborted) throw new Error('ABORTED');

  const normalized = normalizeCoachHistory(messages);
  if (!normalized.length) throw new Error('AI_EMPTY_MESSAGE');

  const systemText = String(systemContext || '').trim();
  try {
    return await requestCoachReplyOnce({ systemText, normalized, key, model, signal });
  } catch (error) {
    if (model !== FALLBACK_PLANNING_MODEL && !NON_FALLBACK_ERRORS.has(error?.message) && !signal?.aborted) {
      return requestCoachReplyOnce({ systemText, normalized, key, model: FALLBACK_PLANNING_MODEL, signal });
    }
    throw error;
  }
}

const VALID_EXERCISE_TYPES = ['mobility', 'lower', 'core', 'upper_pull', 'upper_push', 'full', 'power'];

export const generateExerciseDetails = async (exerciseName, userApiKey, selectedModel = 'gemini-2.5-flash') => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;

  const prompt = `你是一位專業健身教練，負責將新動作加入羽球功能性健身訓練資料庫。

動作名稱：「${exerciseName}」

【任務一】判斷動作類型 (type)
從以下 7 個類別中選擇「最符合」的一個，並輸出其對應的英文代碼：
- mobility（活動度）：增加關節活動範圍、伸展或鬆動。例：胸椎旋轉、臀屈肌伸展
- lower（下肢肌力）：訓練腿部與臀部肌力。例：深蹲、硬舉、保加利亞分腿蹲
- core（核心穩定）：訓練軀幹抗旋轉、抗屈曲或核心耐力。例：棒式、死蟲、平板划船
- upper_pull（上肢拉）：訓練背肌、二頭等「拉」的動作。例：引體向上、啞鈴划船
- upper_push（上肢推）：訓練胸肌、三頭、肩等「推」的動作。例：伏地挺身、肩推、臥推
- full（全身複合）：同時涉及上下肢與核心。例：農夫行走、壺鈴擺盪、熊爬
- power（爆發力）：需快速發力或增強式動作。例：跳箱、深蹲跳、藥球拋擲

【任務二】撰寫教練提示 (tip)
- 長度：20 到 30 個中文字
- 說明此動作的關鍵發力感受或最重要的安全注意事項
- 語氣：專業、具體，避免籠統句子`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: VALID_EXERCISE_TYPES,
            description: "動作類型，只能從 7 種類別代碼中選一"
          },
          tip: {
            type: "STRING",
            description: "20到30字的中文教練提示"
          }
        },
        required: ["type", "tip"]
      }
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "API Error");
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = JSON.parse(resultText);
      if (!VALID_EXERCISE_TYPES.includes(result.type)) result.type = 'full';
      if (!result.tip || result.tip.trim() === '') result.tip = '請專注於核心穩定，避免代償動作。';
      return result;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
};

const STABLE_PLANNING_MODEL_RE = /^gemini-(?:2\.(?:0|5)|[3-9]\.\d+)-(?:flash|pro)$/;
const MODEL_PRIORITY = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

export function filterSupportedModels(rawModels = []) {
  const defaultModels = [{ id: FALLBACK_PLANNING_MODEL, label: 'Gemini 2.5 Flash' }];
  const validModels = [...new Set(
    (Array.isArray(rawModels) ? rawModels : [])
      .filter(m => m?.supportedGenerationMethods?.includes('generateContent') && typeof m?.name === 'string' && m.name.startsWith('models/gemini-'))
      .map(m => m.name.replace('models/', ''))
      .filter(id => STABLE_PLANNING_MODEL_RE.test(id)),
  )];

  if (!validModels.length) return defaultModels;

  validModels.sort((a, b) => {
    const rankA = MODEL_PRIORITY.indexOf(a);
    const rankB = MODEL_PRIORITY.indexOf(b);
    if (rankA !== -1 || rankB !== -1) {
      return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
    }
    return b.localeCompare(a);
  });

  return validModels.map(id => {
    let label = id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    if (id.includes('pro')) label = `${label} 💎`;
    return { id, label };
  });
}

export const checkAvailableModels = async (key) => {
  const defaultModels = [{ id: FALLBACK_PLANNING_MODEL, label: 'Gemini 2.5 Flash' }];
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!response.ok) return defaultModels;
    const data = await response.json();
    return filterSupportedModels(data.models);
  } catch {
    return defaultModels;
  }
};
