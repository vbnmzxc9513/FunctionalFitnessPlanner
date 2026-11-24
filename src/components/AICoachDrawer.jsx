import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRightLeft,
  CalendarPlus,
  Check,
  Crown,
  KeyRound,
  Loader2,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation.js';
import {
  MAX_USER_MESSAGE_CHARS,
  buildCoachChatSystemContext,
  buildCoachQuickPrompts,
  buildCoachToPlannerNote,
  normalizeCoachHistory,
  parseCoachActionSuggestions,
  stripStreamingSwapTags,
} from '../domain/aiCoachChat.js';
import { normalizePlanningContext, planningExercises } from '../domain/planning.js';
import { streamCoachReply } from '../services/gemini.js';
import { requestMemberAiCoachReply } from '../services/aiMembership.js';
import { writeStorage } from '../domain/storage.js';
import './ai-coach.css';

const DEFAULT_AI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

const FALLBACK_COACH_MODEL = 'gemini-2.5-flash';
const NON_FALLBACK_MEMBER_ERRORS = new Set([
  'ABORTED',
  'NETWORK_ERROR',
  'AI_MEMBER_SIGN_IN_REQUIRED',
  'AI_MEMBER_NOT_ACTIVE',
  'AI_MEMBER_DAILY_LIMIT',
  'AI_MEMBER_INVALID_INPUT',
]);

function coachChatStorageKey(uid) {
  return `ai_coach_chat_${uid || 'public'}`;
}

function loadCoachHistory(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeCoachHistory(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function saveCoachHistory(storageKey, messages) {
  try {
    const normalized = normalizeCoachHistory(messages);
    if (!normalized.length) {
      sessionStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, JSON.stringify(normalized));
    }
  } catch {
    /* ignore sessionStorage failures in private or restricted browsers */
  }
}

function coachErrorMessage(code, lang) {
  const en = lang === 'en';
  if (code === 'API_KEY_MISSING') {
    return en
      ? 'Paste your Google API Key above (or sign in with an active member account) to chat with the AI Coach.'
      : '請先在上方貼上你的 Google API Key（或使用具會員權限的 Google 帳號登入），再開始與 AI 教練對話。';
  }
  if (code === 'API_KEY_INVALID') {
    return en
      ? 'Your Google API Key was rejected. Please check the key and try again.'
      : 'Google API Key 驗證失敗，請確認金鑰是否正確後再試一次。';
  }
  if (code === 'RATE_LIMITED') {
    return en
      ? 'Google API rate limit reached (429). Please wait a moment and try again.'
      : '已達 Google API 頻率上限（429），請稍候片刻再重試。';
  }
  if (code === 'AI_MEMBER_NOT_ACTIVE') {
    return en
      ? 'Cloud member AI is not active for this account. You can still paste your own Google API Key above.'
      : '此帳號目前未開通會員雲端 AI 權限，你仍可在上方貼上自己的 Google API Key 使用。';
  }
  if (code === 'AI_MEMBER_DAILY_LIMIT') {
    return en
      ? 'Today’s member cloud AI quota is full. Try again tomorrow or switch to your own Google API Key.'
      : '今日會員雲端 AI 額度已達上限，請明天再試或改用個人 Google API Key。';
  }
  if (code === 'AI_MEMBER_SIGN_IN_REQUIRED') {
    return en
      ? 'Please sign in with Google to use Member Cloud AI.'
      : '請使用 Google 帳號登入以使用會員專屬雲端 AI。';
  }
  if (code === 'AI_MEMBER_UNAVAILABLE') {
    return en
      ? 'Member cloud AI service is temporarily unavailable. You can switch to your own API key.'
      : '會員雲端 AI 服務目前無法連線，可先改用個人 Google API Key。';
  }
  if (code === 'NETWORK_ERROR') {
    return en
      ? 'Network error while reaching Gemini. Please check your connection and retry.'
      : '連線至 Gemini 時發生網路錯誤，請檢查網路後重試。';
  }
  if (code === 'AI_EMPTY_RESPONSE') {
    return en
      ? 'The coach returned an empty reply. Please try asking again.'
      : 'AI 教練這次沒有回傳內容，請再試一次。';
  }
  return en
    ? 'Could not get a reply from the AI Coach. Please try again.'
    : '目前無法取得 AI 教練回覆，請稍後再試。';
}

function maskApiKey(key) {
  const clean = String(key || '').trim();
  if (clean.length <= 8) return clean ? '••••' : '';
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

export default function AICoachDrawer({
  open,
  onClose,
  today,
  lang = 'zh',
  activeSession = null,
  schedule = [],
  exercises = {},
  profile = {},
  recentSummary = null,
  readiness = null,
  metrics = [],
  exerciseLogs = [],
  onSwapExercise,
  onSendToPlanner,
  apiKey = '',
  onSaveKey,
  onClearKey,
  model = FALLBACK_COACH_MODEL,
  models = [],
  onSelectModel,
  aiMember = { active: false, loaded: true },
  uid = null,
  onSignIn,
}) {
  const en = lang === 'en';
  const dialogRef = useRef(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const keyInputRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const storageKey = coachChatStorageKey(uid);
  const prevStorageKeyRef = useRef(storageKey);

  const [messages, setMessages] = useState(() => loadCoachHistory(storageKey));
  const [streamingText, setStreamingText] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preferOwnKey, setPreferOwnKey] = useState(false);
  const [inlineKey, setInlineKey] = useState('');
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [appliedSwaps, setAppliedSwaps] = useState({});
  const [applyingSwapKey, setApplyingSwapKey] = useState(null);
  const [swapErrors, setSwapErrors] = useState({});

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useBackNavigation(open, onClose, 115);

  useEffect(() => {
    if (prevStorageKeyRef.current !== storageKey) {
      prevStorageKeyRef.current = storageKey;
      setMessages(loadCoachHistory(storageKey));
      setAppliedSwaps({});
      setApplyingSwapKey(null);
      setSwapErrors({});
      return;
    }
    saveCoachHistory(storageKey, messages);
  }, [storageKey, messages]);

  useEffect(() => {
    if (!open) return undefined;
    const element = dialogRef.current;
    const reqIdRef = requestIdRef;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => {
      element?.querySelector('[data-coach-focus]')?.focus({ preventScroll: true });
    });
    return () => {
      reqIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      if (element?.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, busy, streamingText]);

  const usingMemberProxy = Boolean(aiMember?.active && !preferOwnKey);
  const availableModels = usingMemberProxy
    ? DEFAULT_AI_MODELS
    : (models?.length ? models : DEFAULT_AI_MODELS);
  const activeModel = availableModels.some(item => item.id === model) ? model : availableModels[0].id;
  const hasAuthReady = usingMemberProxy || Boolean(String(apiKey || '').trim());

  const eligibleCatalog = useMemo(
    () => planningExercises(exercises, normalizePlanningContext(profile?.context || profile)),
    [exercises, profile],
  );

  const systemContext = useMemo(
    () => buildCoachChatSystemContext({
      today,
      lang,
      activeSession,
      schedule,
      exercises,
      profile,
      recentSummary,
      readiness,
      metrics,
      exerciseLogs,
    }),
    [today, lang, activeSession, schedule, exercises, profile, recentSummary, readiness, metrics, exerciseLogs],
  );

  const quickPrompts = useMemo(
    () => buildCoachQuickPrompts({ activeSession, recentSummary, readiness, lang }),
    [activeSession, recentSummary, readiness, lang],
  );

  const handleSaveKey = () => {
    const trimmed = inlineKey.trim();
    if (!trimmed) return;
    const saved = onSaveKey ? onSaveKey(trimmed) : writeStorage('gemini_byok_key', trimmed);
    if (saved !== false) {
      setInlineKey('');
      setShowKeyEditor(false);
      setError('');
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
  };

  const stopGeneration = () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStreamingText('');
  };

  const clearChat = () => {
    stopGeneration();
    setMessages([]);
    setAppliedSwaps({});
    setApplyingSwapKey(null);
    setSwapErrors({});
    setError('');
    saveCoachHistory(storageKey, []);
  };

  const requestMemberReplyWithFallback = async ({ nextHistory, signal }) => {
    try {
      return await requestMemberAiCoachReply({
        systemContext,
        messages: nextHistory,
        model: activeModel,
        signal,
      });
    } catch (cause) {
      if (
        activeModel !== FALLBACK_COACH_MODEL
        && !NON_FALLBACK_MEMBER_ERRORS.has(cause?.message)
        && !signal?.aborted
      ) {
        return requestMemberAiCoachReply({
          systemContext,
          messages: nextHistory,
          model: FALLBACK_COACH_MODEL,
          signal,
        });
      }
      throw cause;
    }
  };

  const sendMessage = async rawText => {
    const text = String(rawText ?? '').trim().slice(0, MAX_USER_MESSAGE_CHARS);
    if (!text || busy) return;

    if (!hasAuthReady) {
      setError(coachErrorMessage('API_KEY_MISSING', lang));
      keyInputRef.current?.focus({ preventScroll: true });
      return;
    }

    const previousMessages = messages;
    const nextHistory = normalizeCoachHistory([...previousMessages, { role: 'user', text }]);
    const reqId = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages(nextHistory);
    setStreamingText('');
    setInput('');
    setError('');
    setBusy(true);

    try {
      const reply = usingMemberProxy
        ? await requestMemberReplyWithFallback({ nextHistory, signal: controller.signal })
        : await streamCoachReply({
          systemContext,
          messages: nextHistory,
          apiKey,
          model: activeModel,
          signal: controller.signal,
          onChunk: partial => {
            if (reqId === requestIdRef.current && !controller.signal.aborted) {
              setStreamingText(partial);
            }
          },
        });

      if (reqId !== requestIdRef.current || controller.signal.aborted) return;
      setStreamingText('');
      setMessages(previous => normalizeCoachHistory([...previous, { role: 'model', text: reply }]));
    } catch (cause) {
      if (cause?.message === 'ABORTED' || controller.signal.aborted) return;
      if (reqId !== requestIdRef.current) return;
      setStreamingText('');
      setMessages(previousMessages);
      setInput(previous => previous || text);
      setError(coachErrorMessage(cause?.message, lang));
    } finally {
      if (reqId === requestIdRef.current) {
        setBusy(false);
        setStreamingText('');
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleApplySwap = async (swapKey, swap) => {
    if (!onSwapExercise || applyingSwapKey || appliedSwaps[swapKey]) return;
    setApplyingSwapKey(swapKey);
    setSwapErrors(prev => {
      if (!prev[swapKey]) return prev;
      const next = { ...prev };
      delete next[swapKey];
      return next;
    });
    try {
      const ok = await onSwapExercise(swap.oldId, swap.newId);
      if (ok === false) {
        setSwapErrors(prev => ({
          ...prev,
          [swapKey]: en ? 'Could not apply this swap to today’s workout.' : '無法套用此替換至今日課表，請稍後再試。',
        }));
      } else {
        setAppliedSwaps(prev => ({ ...prev, [swapKey]: swap }));
      }
    } catch {
      setSwapErrors(prev => ({
        ...prev,
        [swapKey]: en ? 'Could not apply this swap to today’s workout.' : '無法套用此替換至今日課表，請稍後再試。',
      }));
    } finally {
      setApplyingSwapKey(current => (current === swapKey ? null : current));
    }
  };

  const handleSendToPlanner = () => {
    if (!onSendToPlanner || !messages.length || busy) return;
    const note = buildCoachToPlannerNote(messages, lang);
    if (note) onSendToPlanner(note);
  };

  const handleSubmit = event => {
    event.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  const handleBackdropClick = event => {
    if (event.target === dialogRef.current) closeRef.current?.();
  };

  const sessionDate = activeSession?.date || today;
  const subtitle = activeSession?.theme
    ? `${sessionDate} · ${activeSession.theme}`
    : today;

  const streamingDisplayText = streamingText ? stripStreamingSwapTags(streamingText) : '';

  return (
    <dialog
      ref={dialogRef}
      data-testid="ai-coach-drawer"
      className="ai-coach-drawer"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      onCancel={event => {
        event.preventDefault();
        closeRef.current?.();
      }}
    >
      <header className="ai-coach-header">
        <div className="ai-coach-title-group">
          <h3 id={titleId} className="ai-coach-title">
            <Sparkles size={18} className="text-sky-700 shrink-0" aria-hidden="true" />
            {en ? 'AI Badminton Coach' : 'AI 羽球體能教練'}
          </h3>
          <p className="ai-coach-subtitle">{subtitle}</p>
        </div>
        <div className="ai-coach-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              data-testid="coach-chat-clear"
              className="ai-coach-icon-btn"
              onClick={clearChat}
              aria-label={en ? 'Clear conversation' : '清除對話'}
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>{en ? 'Clear' : '清除'}</span>
            </button>
          )}
          <button
            type="button"
            data-coach-focus
            data-testid="coach-drawer-close"
            className="ai-coach-icon-btn"
            onClick={onClose}
            aria-label={en ? 'Close AI Coach' : '關閉 AI 教練'}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="ai-coach-auth" data-testid="coach-auth-status">
        {aiMember?.active && (
          <>
            <span className="ai-coach-member-badge" data-testid="coach-member-badge">
              <Crown size={14} aria-hidden="true" />
              {en ? 'Member Cloud AI Active · No API Key Needed' : '會員專屬雲端 AI 已啟用 · 免填 API Key'}
            </span>
            <div className="ai-coach-auth-row">
              <select
                data-testid="coach-model-select"
                aria-label={en ? 'AI model' : 'AI 模型'}
                disabled={busy}
                value={activeModel}
                onChange={event => onSelectModel?.(event.target.value)}
              >
                {DEFAULT_AI_MODELS.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <label className="ai-coach-checkbox">
                <input
                  type="checkbox"
                  checked={preferOwnKey}
                  disabled={busy}
                  onChange={event => setPreferOwnKey(event.target.checked)}
                />
                <span>{en ? 'Use my own API key' : '改用本機 API Key'}</span>
              </label>
            </div>
          </>
        )}

        {(!aiMember?.active || preferOwnKey) && (
          apiKey && !showKeyEditor ? (
            <div className="ai-coach-auth-row" data-testid="coach-byok-ready">
              <span className="ai-coach-byok-ready">
                <KeyRound size={14} aria-hidden="true" />
                {en
                  ? `Saved browser key (${maskApiKey(apiKey)})`
                  : `使用本機已存 API Key（${maskApiKey(apiKey)}）`}
              </span>
              <select
                data-testid="coach-model-select"
                aria-label={en ? 'AI model' : 'AI 模型'}
                disabled={busy}
                value={activeModel}
                onChange={event => onSelectModel?.(event.target.value)}
              >
                {availableModels.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="text-link text-xs min-h-11"
                disabled={busy}
                onClick={() => setShowKeyEditor(true)}
              >
                {en ? 'Change key' : '更換金鑰'}
              </button>
              {onClearKey && (
                <button
                  type="button"
                  data-testid="coach-clear-key"
                  className="text-link text-xs min-h-11"
                  disabled={busy}
                  onClick={() => {
                    onClearKey();
                    setShowKeyEditor(false);
                    setError('');
                  }}
                >
                  {en ? 'Clear key' : '清除金鑰'}
                </button>
              )}
            </div>
          ) : (
            <div className="ai-coach-key-form" data-testid="coach-inline-key-box">
              <p className="ai-coach-key-hint">
                {en
                  ? 'Paste your Google AI Studio API Key (stored only in this browser, never sent to Firestore).'
                  : '貼上你的 Google AI Studio API Key（僅存於此瀏覽器，不會上傳雲端資料庫）。'}
                {!uid && onSignIn && (
                  <>
                    {' '}
                    <button type="button" className="text-link text-xs" onClick={onSignIn}>
                      {en ? 'Member? Sign in' : '已是會員？前往登入'}
                    </button>
                  </>
                )}
              </p>
              <div className="ai-coach-key-row">
                <input
                  ref={keyInputRef}
                  type="password"
                  data-testid="coach-inline-key-input"
                  value={inlineKey}
                  onChange={event => setInlineKey(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSaveKey();
                    }
                  }}
                  placeholder={en ? 'AIza... Google API Key' : '貼上 AIza... Google API Key'}
                  aria-label="Google API Key"
                />
                <button
                  type="button"
                  data-testid="coach-inline-key-save"
                  className="button-primary"
                  disabled={!inlineKey.trim()}
                  onClick={handleSaveKey}
                >
                  {en ? 'Save key' : '儲存金鑰'}
                </button>
                {apiKey && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setShowKeyEditor(false)}
                  >
                    {en ? 'Cancel' : '取消'}
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </section>

      <div ref={threadRef} className="ai-coach-thread">
        {messages.length === 0 ? (
          <>
            <section className="ai-coach-welcome">
              <h4>{en ? 'Hi! I’m your badminton S&C coach.' : '嗨！我是你的羽球功能性體能教練'}</h4>
              <p>
                {en
                  ? 'I can see today’s workout, this week’s schedule, your recent readiness, and your 28-day recorded summary. Pick a quick question below or ask anything about form, recovery, or court-day pacing.'
                  : '我已同步閱讀你今天的課表、本週安排、近期體感與近 28 天真實訓練摘要。直接點選下方常見問題，或輸入任何動作發力、恢復與球日搭配的疑問吧！'}
              </p>
            </section>
            <div className="ai-coach-quick-grid" data-testid="coach-quick-prompts">
              {quickPrompts.map(item => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`coach-quick-prompt-${item.id}`}
                  className="ai-coach-quick-btn"
                  disabled={busy}
                  onClick={() => sendMessage(item.prompt)}
                >
                  <Sparkles size={14} className="text-sky-600 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <details className="ai-coach-quick-collapsible">
              <summary>{en ? 'Quick questions' : '快速提問建議'}</summary>
              <div className="ai-coach-quick-grid">
                {quickPrompts.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`coach-quick-prompt-${item.id}`}
                    className="ai-coach-quick-btn"
                    disabled={busy}
                    onClick={() => sendMessage(item.prompt)}
                  >
                    <Sparkles size={14} className="text-sky-600 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </details>
            <div className="ai-coach-messages" role="log" aria-live="polite" data-testid="coach-messages">
              {messages.map((msg, index) => {
                if (msg.role !== 'model') {
                  return (
                    <article
                      key={`${msg.role}-${index}`}
                      data-testid="coach-msg-user"
                      className="ai-coach-msg ai-coach-msg-user"
                    >
                      {msg.text}
                    </article>
                  );
                }

                const parsed = parseCoachActionSuggestions(msg.text, {
                  activeSession,
                  eligibleExercises: eligibleCatalog,
                  exercises,
                });
                const appliedPrefix = `${index}:`;
                const appliedList = Object.entries(appliedSwaps)
                  .filter(([key]) => key.startsWith(appliedPrefix))
                  .map(([key, swap]) => ({ key, swap, applied: true }));
                const appliedIds = new Set(appliedList.map(item => `${item.swap.oldId}->${item.swap.newId}`));
                const pendingList = parsed.swaps
                  .filter(swap => !appliedIds.has(`${swap.oldId}->${swap.newId}`))
                  .map(swap => ({ key: `${index}:${swap.oldId}->${swap.newId}`, swap, applied: false }));
                const displaySwaps = [...appliedList, ...pendingList];

                return (
                  <article
                    key={`${msg.role}-${index}`}
                    data-testid="coach-msg-model"
                    className="ai-coach-msg ai-coach-msg-model"
                  >
                    <div className="ai-coach-markdown">
                      <ReactMarkdown>{parsed.cleanText}</ReactMarkdown>
                    </div>
                    {displaySwaps.length > 0 && onSwapExercise && (
                      <div className="ai-coach-swap-list" data-testid="coach-swap-list">
                        {displaySwaps.map(({ key, swap, applied }) => {
                          const isApplying = applyingSwapKey === key;
                          const swapErr = swapErrors[key];
                          return (
                            <div key={key} className="ai-coach-swap-card" data-testid="coach-swap-card">
                              <div className="ai-coach-swap-info">
                                <p className="ai-coach-swap-title">
                                  <ArrowRightLeft size={14} className="shrink-0 text-sky-700" aria-hidden="true" />
                                  <span>
                                    {en
                                      ? `Suggested swap: "${swap.oldName}" → "${swap.newName}"`
                                      : `建議替換：將「${swap.oldName}」換成「${swap.newName}」`}
                                  </span>
                                </p>
                                {swap.reason && (
                                  <p className="ai-coach-swap-reason">{swap.reason}</p>
                                )}
                                {swapErr && (
                                  <p className="ai-coach-swap-error" role="alert">{swapErr}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                data-testid={`coach-swap-apply-${swap.oldId}-${swap.newId}`}
                                className={`ai-coach-swap-btn ${applied ? 'ai-coach-swap-btn-applied' : ''}`}
                                disabled={applied || isApplying || Boolean(applyingSwapKey)}
                                onClick={() => handleApplySwap(key, swap)}
                              >
                                {applied ? (
                                  <>
                                    <Check size={14} aria-hidden="true" />
                                    <span>{en ? 'Applied ✓' : '已套用 ✓'}</span>
                                  </>
                                ) : isApplying ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                    <span>{en ? 'Applying…' : '套用中…'}</span>
                                  </>
                                ) : (
                                  <span>{en ? 'Apply to today’s workout' : '套用至今日課表'}</span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
              {busy && streamingDisplayText && (
                <article
                  data-testid="coach-msg-streaming"
                  className="ai-coach-msg ai-coach-msg-model ai-coach-msg-streaming"
                >
                  <div className="ai-coach-markdown">
                    <ReactMarkdown>{streamingDisplayText}</ReactMarkdown>
                  </div>
                  <span className="ai-coach-cursor" aria-hidden="true" />
                </article>
              )}
              {busy && !streamingDisplayText && (
                <div className="ai-coach-thinking" role="status" data-testid="coach-thinking">
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>{en ? 'Coach is reviewing your data…' : 'AI 教練正在檢視你的紀錄並回覆…'}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="ai-coach-error" data-testid="coach-error">
          {error}
        </p>
      )}

      <form className="ai-coach-composer" onSubmit={handleSubmit}>
        {messages.length > 0 && onSendToPlanner && (
          <div className="ai-coach-handoff-row">
            <button
              type="button"
              data-testid="coach-send-to-planner"
              className="ai-coach-handoff-btn"
              disabled={busy}
              onClick={handleSendToPlanner}
            >
              <CalendarPlus size={15} aria-hidden="true" />
              <span>{en ? 'Send discussion to AI Planner' : '帶著討論去 AI 排課'}</span>
            </button>
          </div>
        )}
        <div className="ai-coach-input-row">
          <textarea
            ref={inputRef}
            rows={1}
            data-testid="coach-chat-input"
            className="ai-coach-input"
            value={input}
            maxLength={MAX_USER_MESSAGE_CHARS}
            disabled={busy}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={en ? 'Ask about today’s workout, form cues, or recovery…' : '輸入問題：今天動作怎麼發力、打球日怎麼調整…'}
            aria-label={en ? 'Message AI Coach' : '傳送訊息給 AI 教練'}
          />
          {busy ? (
            <button
              type="button"
              data-testid="coach-chat-stop"
              className="ai-coach-stop-btn"
              onClick={stopGeneration}
              aria-label={en ? 'Stop reply' : '停止回覆'}
            >
              <Square size={15} aria-hidden="true" />
              <span>{en ? 'Stop' : '停止'}</span>
            </button>
          ) : (
            <button
              type="submit"
              data-testid="coach-chat-send"
              className="ai-coach-send-btn"
              disabled={!input.trim()}
              aria-label={en ? 'Send message' : '送出問題'}
            >
              <Send size={15} aria-hidden="true" />
              <span>{en ? 'Send' : '送出'}</span>
            </button>
          )}
        </div>
        <p className="ai-coach-disclaimer">
          {en
            ? 'Sends a de-identified workout summary to Gemini. Coaching advice does not replace medical evaluation.'
            : '對話僅傳送去識別化訓練摘要至 Gemini；教練建議不取代醫師或物理治療師診斷。'}
        </p>
      </form>
    </dialog>
  );
}
