import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Activity, Flame, Shield, Zap, RefreshCw, Info, CalendarDays, Dumbbell, BarChart3, LogIn, LogOut, Brain, Loader2, Settings, Key, ExternalLink, Feather, Ruler, Weight, TrendingUp, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { TRANSLATIONS, EXERCISES_I18N, DEFAULT_SCHEDULE_I18N } from './locale.js';

// --- Debug Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('=== REACT ERROR BOUNDARY CAUGHT ===');
    console.error('Error:', error.toString());
    console.error('Stack:', error.stack);
    console.error('Component Stack:', info.componentStack);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', background: '#fff', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2>⚠️ App Crashed - Error Details:</h2>
          <p><strong>Error:</strong> {this.state.error?.toString()}</p>
          <p><strong>Stack:</strong> {this.state.error?.stack}</p>
          <p><strong>Component Stack:</strong> {this.state.info?.componentStack}</p>
        </div>
      );
    }
    return this.props.children;
  }
}


// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDWuhndkvdi3q41hVe8IqV7n9NxV1CKYiM",
  authDomain: "myfitnessapp-c4aba.firebaseapp.com",
  projectId: "myfitnessapp-c4aba",
  storageBucket: "myfitnessapp-c4aba.firebasestorage.app",
  messagingSenderId: "561947598853",
  appId: "1:561947598853:web:6dc6113a3ea351aa9f3c6c",
  measurementId: "G-DNWE53R5KH"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "my-fitness-app-yp";

// EXERCISES and DEFAULT_SCHEDULE are now in locale.js as EXERCISES_I18N and DEFAULT_SCHEDULE_I18N
const _LEGACY_SCHEDULE_PLACEHOLDER = [
  { day: 1, name: '星期一', theme: '單邊穩定與網前急停', concept: '【羽球連結：上網撲球與防守步伐】\n原理：透過單腳支撐與髖關節鉸鏈的訓練，強化大腿後側與臀部煞車能力，讓你在網前迅速急停而不失去平衡。', routine: ['thoracic', 'single_dl', 'bulgarian', 'weighted_lunge', 'stretch_10m'], coachAdvice: '今天是本週的開始，針對下肢的急停煞車會讓你的大腿前側與臀部較有感。明天會進行上半身的抗旋轉訓練，因此今天最後的伸展請務必確實放鬆下半身，避免明天的發力受到代償影響。' },
  { day: 2, name: '星期二', theme: '核心抗旋轉與殺球力量傳導', concept: '【羽球連結：躍起殺球與平抽擋】\n原理：殺球的力量來自於軀幹抗旋轉後的反作用力。此模組強化背部與胸肩力量，讓你在擊球瞬間維持強大的空中核心剛性。', routine: ['dead_bug', 'pull_up', 'plank_row', 'shoulder_press', 'finger_pushup'], coachAdvice: '昨天的大量下肢訓練可能會讓你今天覺得腿部痠痛，因此今天的重點會轉移到上半身與核心。請注意在做平板划船等抗旋轉動作時，不要利用腿部的搖晃來代償。明天是動態恢復日，今天可以盡情發揮上半身的力量！' },
  { day: 3, name: '星期三', theme: '動態恢復與關節活動度', concept: '【羽球連結：救球延展與降低受傷率】\n原理：羽球中常有極端角度的救球動作（如大跨步救球）。主動恢復與胸椎、髖關節活動度能增加救球的安全範圍。', routine: ['thoracic', 'bear_crawl', 'dead_bug', 'stretch_10m'], coachAdvice: '經過前兩天的高強度訓練，你的肌肉現在應該處於輕微疲勞緊繃狀態。今天的目的是疏通筋骨、增加關節活動度。明天會加入不對稱負重的挑戰，所以今天好好把脊椎與髖部打開，為明天的核心耐力戰做好準備。' },
  { day: 4, name: '星期四', theme: '側向轉換與前臂抓握耐力', concept: '【羽球連結：被動防守與反手發力】\n原理：挑戰不對稱負重，全面提升核心抗側屈。前臂抓握力的增強有助於長時間比賽中反手握拍與快速抽擋的穩定度。', routine: ['thoracic', 'one_arm_plank', 'plank_row', 'farmer_walk'], coachAdvice: '昨天關節活動度增加後，今天你的身體應該更靈活了。農夫行走等抓握訓練會讓你的前臂很脹，請在訓練後多按摩前臂。明天是本週最後的爆發力考驗，今天務必保留下肢的神經彈性。' },
  { day: 5, name: '星期五', theme: '下肢爆發力與動力鏈整合', concept: '【羽球連結：起跳殺球與快速敏捷連動】\n原理：將穩定度轉化為力量傳導。透過增強式跳躍與連貫性發力，訓練肌肉的快速收縮，提升場上啟動的第一步速度。', routine: ['bear_crawl', 'squat_jump', 'lunge_press', 'farmer_walk', 'stretch_10m'], coachAdvice: '撐過前面的訓練，今天是收割爆發力的時刻！由於昨天前臂與側腹部有受到刺激，今天在做弓步上推時要把核心鎖得更緊。週末好好的休息，為下週的訓練儲備能量！' }
];

const TOTAL_WEEKLY_EXERCISES = 25;

// --- Helper functions ---
const getWeekString = (date = new Date(), offsetWeeks = 0) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setDate(d.getDate() + (offsetWeeks * 7));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

const getMonthFromWeek = (weekStr) => {
  if (!weekStr || !weekStr.includes('-W')) return '未知月份';
  const [year, week] = weekStr.split('-W');
  const d = new Date(year, 0, 1 + (parseInt(week) - 1) * 7);
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
};

// Returns the calendar date for a given ISO week string + weekday (1=Mon, 5=Fri)
const getDateForWeekDay = (weekStr, dayNum) => {
  if (!weekStr || !weekStr.includes('-W')) return '';
  const [year, week] = weekStr.split('-W');
  // ISO week: find the Monday of that week
  const jan4 = new Date(Date.UTC(parseInt(year), 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon...7=Sun
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (parseInt(week) - 1) * 7);
  // Add (dayNum - 1) days to Monday
  const target = new Date(monday);
  target.setUTCDate(monday.getUTCDate() + (dayNum - 1));
  return `${target.getUTCMonth() + 1}/${target.getUTCDate()}`;
};

// --- Gemini AI Configuration ---
// Removed automatic model selection in favor of user manual selection

// --- Gemini AI Function ---
const generateAIPlan = async (lastWeekData, currentLevel, lastWeekFeedback, userApiKey, allProgress, metricsHistory, userGoal, dailyTime, userMessage, availableExercises, lang = 'zh', selectedModel = 'gemini-2.5-flash') => {
  if (!userApiKey) throw new Error("API_KEY_MISSING");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;
  const completedCount = lastWeekData ? Object.values(lastWeekData).filter(Boolean).length : 0;

  let feedbackText = "無反饋紀錄";
  if (lastWeekFeedback === -1) feedbackText = "覺得太困難 (請考慮增加動態恢復、減少高衝擊動作)";
  if (lastWeekFeedback === 0) feedbackText = "覺得強度剛好 (請維持目前的主題與強度架構)";
  if (lastWeekFeedback === 1) feedbackText = "覺得太簡單 (請增加動作複雜度或替換為爆發力導向動作)";

  const metricsSummary = metricsHistory && metricsHistory.length > 0
    ? metricsHistory.map(m => `日期: ${m.date}, 體重: ${m.weight || '-'}kg, 體脂: ${m.bodyFat || '-'}%, 基礎代謝: ${m.bmr || '-'}kcal, 肌肉(左手/右手/左腳/右腳/軀幹): ${m.muscleLarm || '-'}/${m.muscleRarm || '-'}/${m.muscleLleg || '-'}/${m.muscleRleg || '-'}/${m.muscleTrunk || '-'}kg`).join('\n  ')
    : "無身體組成紀錄";

  const historySummary = Object.entries(allProgress || {})
    .filter(([weekId]) => weekId.includes('-W'))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .map(([weekId, data]) => {
      const done = data.completed ? Object.values(data.completed).filter(Boolean).length : 0;
      let fb = "無反饋";
      if (data.feedbackValue === -1) fb = "太困難";
      if (data.feedbackValue === 0) fb = "剛好";
      if (data.feedbackValue === 1) fb = "太簡單";
      return `週次: ${weekId}, 完成數量: ${done}/25, 體感反饋: ${fb}`;
    }).join('\n  ') || "無歷史紀錄";

  const customPromptSection = userGoal && userGoal.trim() !== ''
    ? `\n  【使用者近期訓練目標】\n  ${userGoal.trim()}\n  (請以此目標為核心，挑選針對性動作，並在總結中詳細說明你如何利用這週課表幫助他達成。)`
    : '';

  const messageSection = userMessage && userMessage.trim() !== ''
    ? `\n  【使用者想對教練說的話】\n  ${userMessage.trim()}\n  (請在給予建議時，適當地回應這段話，展現教練的關心與專業。)`
    : '';

  const prompt = `
  你是一位專注於羽球專項的「專業功能性健身教練」。排表時請特別注重羽球所需的步伐敏捷、核心抗旋轉、肩關節穩定與爆發力。
  使用者每週預期運動 5 天，每天大約 ${dailyTime || 30} 分鐘。請根據此時間，合理評估每天應該安排的動作數量與各動作組數範圍。
  請綜合評估使用者的近期訓練目標、歷史身體數值趨勢與歷史運動紀錄，為本週（星期一到星期五）安排一份全新、最適合他當前狀態的課表，並向使用者說明「為何這樣安排」。
  
  【使用者上週狀態】
  - 上週完成動作數: ${completedCount} / 25
  - 當前難度參數: ${currentLevel} (0=減壓, 1=建構, 2=高強度)
  - 上週體感反饋: ${feedbackText}
  
  【歷史身體數值趨勢】
  ${metricsSummary}

  【歷史運動紀錄】
  ${historySummary}
  ${customPromptSection}
  ${messageSection}
  
  【可用動作代碼與名稱】
  ${Object.entries(availableExercises).map(([k, v]) => `${k}: ${v.name} (${v.type})`).join('\n')}
  
   1. 給予一段客製化的教練總結建議。你「必須」在這段建議中包含以下要素，並且【強制使用 Markdown 語法進行排版】。請將長篇內容拆分為數個易於閱讀的段落，並為每個段落自創一個【符合該段落內容核心精神的動態標題】（例如：『### 🔥 體脂驟降！超群的核心成長』）。【⚠️排版警告：每個 ### 標題的前面與後面，都請「務必」加上「兩次換行 (Enter 兩次)」！絕對不要把標題跟普通內文黏在同一行，否則排版會完全損壞！】，【絕對不要】使用制式的死板標題（例如：忌用「專業診斷」、「推斷原因」、「課表對策」等）。整份評語必須像一封專業且熱情的教練信件，段落分層必須非常清晰：
      - 綜合診斷與具體讚美：解讀「歷史身體數值趨勢」與「完成度」，明確點出數據的變化，並客觀評估學員「目前狀態的優劣程度」。以專業角度解釋其變化原因。若發現學員有進步（如肌肉量上升、高完成度），在維持專業感的前提下【請不要吝嗇你的讚美】，給予強烈、熱情且有數據佐證的正向鼓勵。
      - 課表對策與目標對焦：針對觀察到的身體狀態與使用者的「近期訓練目標」，具體說明這週課表「為什麼這樣排」、「背後的訓練目的是什麼」，以及這些特定動作將如何幫助他解決當前問題，並在羽球場上達成他的目標。
  2. 安排星期一到星期五的課表，每天請絕對從【可用動作代碼與名稱】挑選剛好 4 到 5 個動作代碼。
  3. 每天的主題 (theme) 必須是明確的「羽球專項訓練目標」 (例如：單邊穩定與網前急停)。
  4. 每天的評語 (concept) 必須說明當天的訓練如何連結到「羽球的特定動作 (如躍起殺球、防守接殺、米字步)」，以及「背後的發力與穩定原理」。請分為【羽球連結】與【原理】兩部分撰寫，中間務必使用 \\n 換行。
  5. 每天的教練叮嚀 (coachAdvice) 必須是非常具體的「每日銜接建議」：綜合考量「昨天練了什麼/哪裡會痠痛」、「今天要注意什麼代償/該如何放鬆」，以及「明天預計要練什麼/所以今天該做什麼準備」。例如：『因為昨天做了大量下肢，今天大腿前側可能較痠，所以今天的核心訓練要注意不要用腿部代償；明天預計會練肩推，因此今天的最後請務必確實拉伸胸大肌。』
  ${lang === 'en' ? '\n  [IMPORTANT] The user interface is currently set to English. Please write ALL your responses (conclusion, schedule themes, concepts, and coachAdvice) in ENGLISH.' : ''}
  `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          conclusion: { type: "STRING", description: "教練給予的建議，以及這週課表「為何這樣安排」的詳細原因與依據。" },
          schedule: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                day: { type: "INTEGER" },
                name: { type: "STRING" },
                theme: { type: "STRING" },
                concept: { type: "STRING" },
                coachAdvice: { type: "STRING" },
                routine: { type: "ARRAY", items: { type: "STRING" } }
              }
            }
          }
        }
      }
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "API Error");
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(resultText);
    } catch (e) {
      if (e.message === "API_KEY_MISSING" || attempt === 2) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
};

const generateExerciseDetails = async (exerciseName, userApiKey, selectedModel = 'gemini-2.5-flash') => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;
  const prompt = `我需要將一個新動作加入健身資料庫，動作名稱為「${exerciseName}」。\n請判斷這個動作的類型 (type)，只能從以下選擇一個：mobility, lower, core, upper_pull, upper_push, full, power。\n並給予一句約 20~30 字以內的教練提示 (tip)，著重於發力感受或該如何避免受傷。\n請務必回傳嚴格的 JSON 格式：{"type": "xxx", "tip": "xxx"}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { type: { type: "STRING" }, tip: { type: "STRING" } } } } };
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "API Error");
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(resultText);
};

export { ErrorBoundary };

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('train'); // train | ai | exercises | metrics | history | settings
  const [activeDay, setActiveDay] = useState(new Date().getDay() === 0 || new Date().getDay() === 6 ? 1 : new Date().getDay());

  // Language State
  const [lang, setLang] = useState(localStorage.getItem('app_lang') || 'zh');
  const t = (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.zh[key];
  const toggleLang = () => {
    setLang(prev => {
      const newLang = prev === 'zh' ? 'en' : 'zh';
      localStorage.setItem('app_lang', newLang);
      return newLang;
    });
  };
  // Locale-aware exercise pool and schedule
  const EXERCISES = EXERCISES_I18N[lang];
  const DEFAULT_SCHEDULE = DEFAULT_SCHEDULE_I18N[lang];

  const [currentWeek] = useState(getWeekString(new Date(), 0));
  const [lastWeek] = useState(getWeekString(new Date(), -1));

  // Data State
  const [allProgress, setAllProgress] = useState({});
  const [progress, setProgress] = useState({});
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [difficultyLevel, setDifficultyLevel] = useState(1);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [aiGoalInput, setAiGoalInput] = useState('');
  const [aiTimeInput, setAiTimeInput] = useState('30');
  const [aiMessageInput, setAiMessageInput] = useState('');
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [backupPlan, setBackupPlan] = useState(null);

  // Exercises State
  const [exercisesData, setExercisesData] = useState(() => EXERCISES_I18N[localStorage.getItem('app_lang') || 'zh'] || EXERCISES_I18N.zh);
  const [newExName, setNewExName] = useState('');
  const [isAddingEx, setIsAddingEx] = useState(false);

  // Metrics Form State
  const [metricForm, setMetricForm] = useState({
    date: new Date().toISOString().split('T')[0],
    height: '', weight: '', age: '', bodyFat: '', bmr: '',
    muscleLarm: '', muscleRarm: '', muscleLleg: '', muscleRleg: '', muscleTrunk: ''
  });

  // BYOK State & Toast
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_byok_key') || '');
  const [tempKeyInput, setTempKeyInput] = useState(localStorage.getItem('gemini_byok_key') || '');
  const [selectedAiModel, setSelectedAiModel] = useState(localStorage.getItem('app_ai_model') || 'gemini-2.5-flash');
  const [availableModels, setAvailableModels] = useState([{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]);
  const [toastMsg, setToastMsg] = useState('');

  // Responsive: desktop detection
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const checkAvailableModels = async (key) => {
    const defaultModels = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!response.ok) return defaultModels;
      const data = await response.json();
      const validModels = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.startsWith('models/gemini-'))
        .map(m => m.name.replace('models/', ''));

      // Remove duplicates and deprecated versions, and obscure preview/image models
      const options = validModels
        .filter(m =>
          !m.includes('vision') &&
          !m.includes('latest') &&
          !m.includes('image') &&
          !m.includes('tts') &&
          (!m.includes('preview') || m.includes('3.0') || m.includes('3.1'))
        )
        .sort((a, b) => b.localeCompare(a)) // Put newer versions first
        .map(m => {
          let label = m.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          // Enhance label if it's an experimental or premium pro model
          if (m.includes('exp') || (m.includes('pro') && !m.includes('test'))) {
            label = label + ' 💎';
          }
          return { id: m, label: label };
        });

      return options.length > 0 ? options : defaultModels;
    } catch (e) {
      return defaultModels;
    }
  };

  useEffect(() => {
    if (apiKey) {
      checkAvailableModels(apiKey).then(models => {
        setAvailableModels(models);
        // Ensure selected model is still valid
        if (!models.some(m => m.id === selectedAiModel)) {
          setSelectedAiModel(models[0].id);
          localStorage.setItem('app_ai_model', models[0].id);
        }
      });
    }
  }, [apiKey]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthLoading(false);
      } else {
        setUser(null);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          signInWithCustomToken(auth, __initial_auth_token).finally(() => setIsAuthLoading(false));
        } else {
          setIsAuthLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const progressColRef = collection(db, 'artifacts', appId, 'users', user.uid, 'progress');
    const unsubProgress = onSnapshot(progressColRef, (snapshot) => {
      const data = {};
      snapshot.forEach(doc => { data[doc.id] = doc.data(); });
      setAllProgress(data);
      setProgress(data[currentWeek]?.completed || {});
    });

    const profileDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
    getDoc(profileDocRef).then((docSnap) => {
      if (docSnap.exists() && docSnap.data().difficultyLevel !== undefined) {
        setDifficultyLevel(docSnap.data().difficultyLevel);
      }
    });

    const planDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'plans', currentWeek);
    const unsubPlan = onSnapshot(planDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setWeeklyPlan(docSnap.data());
      } else {
        setWeeklyPlan(null);
      }
    });

    const metricsColRef = collection(db, 'artifacts', appId, 'users', user.uid, 'metrics');
    const unsubMetrics = onSnapshot(metricsColRef, (snapshot) => {
      const data = [];
      snapshot.forEach(doc => { data.push({ id: doc.id, ...doc.data() }); });
      data.sort((a, b) => a.date.localeCompare(b.date));
      setMetricsHistory(data);
    });

    const exercisesDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', 'custom');
    const unsubExercises = onSnapshot(exercisesDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const customEx = docSnap.data().exercises || {};
        const merged = { ...EXERCISES };
        Object.keys(customEx).forEach(k => {
          if (merged[k]) merged[k] = { ...merged[k], ...customEx[k] };
          else merged[k] = customEx[k];
        });
        setExercisesData(merged);
      } else {
        setExercisesData(EXERCISES);
      }
    });

    return () => { unsubProgress(); unsubPlan(); unsubMetrics(); unsubExercises(); };
  }, [user, currentWeek, lang]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      showToast("登入失敗，請確認彈出視窗未被阻擋。");
    }
  };

  const handleLogout = () => signOut(auth);

  const saveKeyToLocal = () => {
    localStorage.setItem('gemini_byok_key', tempKeyInput.trim());
    setApiKey(tempKeyInput.trim());
    showToast(t('toastKeySaved'));
  };

  const requestAIPlan = async () => {
    if (!user) return;
    if (!apiKey) {
      showToast(t('toastNoKey'));
      setActiveTab('settings');
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const lastWeekDoc = allProgress[lastWeek] || {};
      const lastWeekData = lastWeekDoc.completed || {};
      const lastWeekFeedback = lastWeekDoc.feedbackValue;

      const activeExercises = Object.fromEntries(Object.entries(exercisesData).filter(([k, v]) => v.active !== false && !v.deleted));
      const aiResponse = await generateAIPlan(lastWeekData, difficultyLevel, lastWeekFeedback, apiKey, allProgress, metricsHistory, aiGoalInput, aiTimeInput, aiMessageInput, activeExercises, lang);

      const planDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'plans', currentWeek);
      await setDoc(planDocRef, aiResponse);
      setBackupPlan(weeklyPlan); // Save current plan as backup before overwriting (if exists)
      setIsEditingPlan(false);
      setAiGoalInput('');
      setAiTimeInput('30');
      setAiMessageInput('');
      showToast(t('toastAISuccess'));
    } catch (err) {
      console.error("AI Generation Error:", err);
      if (err.message.includes("API_KEY_INVALID") || err.message.includes("API key not valid")) {
        showToast(t('toastKeyInvalid'));
      } else {
        showToast(t('toastAIError'));
      }
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const restoreBackupPlan = async () => {
    if (!user || !backupPlan) return;
    try {
      const planDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'plans', currentWeek);
      await setDoc(planDocRef, backupPlan);
      setBackupPlan(null);
      setIsEditingPlan(false);
      showToast("已還原上一次的課表！");
    } catch (err) {
      console.error(err);
      showToast("還原失敗，請重試。");
    }
  };

  const toggleExercise = async (day, exerciseKey) => {
    if (!user) {
      showToast(t('toastRequireLogin'));
      return;
    }
    const key = `day${day}_${exerciseKey}`;
    const newProgress = { ...progress, [key]: !progress[key] };
    setProgress(newProgress);

    try {
      const progressDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', currentWeek);
      await setDoc(progressDocRef, { completed: newProgress }, { merge: true });
    } catch (err) { setProgress(progress); }
  };

  const handleFeedback = async (adjustment) => {
    if (!user) {
      showToast(t('toastRequireLogin'));
      return;
    }
    let newLevel = Math.max(0, Math.min(2, difficultyLevel + adjustment));
    setDifficultyLevel(newLevel);
    try {
      const profileDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'settings');
      await setDoc(profileDocRef, { difficultyLevel: newLevel }, { merge: true });

      const progressDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'progress', currentWeek);
      await setDoc(progressDocRef, { feedbackProvided: true, feedbackValue: adjustment }, { merge: true });
      showToast("已記錄體感反饋，將作為下週排表依據。");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExercise = async () => {
    if (!user) return;
    if (!apiKey) { showToast("請先至設定頁面綁定 API Key"); return; }
    if (!newExName.trim()) return;
    setIsAddingEx(true);
    try {
      const aiResult = await generateExerciseDetails(newExName, apiKey);
      const key = 'custom_' + Date.now();
      const exercisesDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', 'custom');
      await setDoc(exercisesDocRef, { exercises: { [key]: { name: newExName.trim(), type: aiResult.type, tip: aiResult.tip, active: true } } }, { merge: true });
      setNewExName('');
      showToast("動作新增成功！");
    } catch (e) {
      console.error(e);
      showToast("新增失敗，請確認 API Key。");
    } finally {
      setIsAddingEx(false);
    }
  };

  const deleteExercise = async (key) => {
    if (!user) return;
    if (window.confirm(lang === 'zh' ? '確定要刪除這個動作嗎？' : 'Are you sure you want to delete this exercise?')) {
      try {
        const exercisesDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', 'custom');
        await setDoc(exercisesDocRef, { exercises: { [key]: { deleted: true } } }, { merge: true });
        showToast(lang === 'zh' ? '已刪除動作！' : 'Exercise deleted!');
      } catch (err) {
        console.error(err);
        showToast(lang === 'zh' ? '刪除失敗，請重試。' : 'Failed to delete, please try again.');
      }
    }
  };

  const toggleExerciseActive = async (key) => {
    if (!user) return;
    const currentActive = exercisesData[key]?.active !== false;
    const exercisesDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'exercises', 'custom');
    await setDoc(exercisesDocRef, { exercises: { [key]: { active: !currentActive } } }, { merge: true });
  };

  const saveMetrics = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const docId = metricForm.date;
      const metricsDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'metrics', docId);
      await setDoc(metricsDocRef, {
        date: metricForm.date,
        height: metricForm.height !== '' ? Number(metricForm.height) : null,
        weight: metricForm.weight !== '' ? Number(metricForm.weight) : null,
        age: metricForm.age !== '' ? Number(metricForm.age) : null,
        bodyFat: metricForm.bodyFat !== '' ? Number(metricForm.bodyFat) : null,
        bmr: metricForm.bmr !== '' ? Number(metricForm.bmr) : null,
        muscleLarm: metricForm.muscleLarm !== '' ? Number(metricForm.muscleLarm) : null,
        muscleRarm: metricForm.muscleRarm !== '' ? Number(metricForm.muscleRarm) : null,
        muscleLleg: metricForm.muscleLleg !== '' ? Number(metricForm.muscleLleg) : null,
        muscleRleg: metricForm.muscleRleg !== '' ? Number(metricForm.muscleRleg) : null,
        muscleTrunk: metricForm.muscleTrunk !== '' ? Number(metricForm.muscleTrunk) : null
      });
      showToast("身體數據已成功儲存！");
    } catch (err) {
      console.error(err);
      showToast("儲存失敗，請重試。");
    }
  };

  const handleMetricChange = (e) => {
    setMetricForm({ ...metricForm, [e.target.name]: e.target.value });
  };

  const getExerciseParams = (exerciseKey) => {
    let sets = 3; let value = "";
    if (['stretch_10m', 'thoracic'].includes(exerciseKey)) {
      sets = 1; value = difficultyLevel === 0 ? "5分鐘" : difficultyLevel === 1 ? "10分鐘" : "12分鐘";
    } else if (['farmer_walk', 'one_arm_plank', 'bear_crawl'].includes(exerciseKey)) {
      sets = difficultyLevel === 0 ? 3 : difficultyLevel === 1 ? 4 : 5; value = difficultyLevel === 0 ? "30秒" : difficultyLevel === 1 ? "45秒" : "60秒";
    } else if (['squat_jump', 'lunge_press', 'finger_pushup'].includes(exerciseKey)) {
      sets = difficultyLevel === 0 ? 3 : 4; value = difficultyLevel === 0 ? "8下" : difficultyLevel === 1 ? "12下" : "15下";
    } else {
      sets = difficultyLevel === 2 ? 4 : 3; value = difficultyLevel === 0 ? "8-10下" : difficultyLevel === 1 ? "10-12下" : "12-15下";
    }
    return `${sets} 組 x ${value}`;
  };

  const getDifficultyLabel = () => [t('diffLow'), t('diffMid'), t('diffHigh')][difficultyLevel];

  const LoginPrompt = ({ title, desc }) => (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-sky-100 mt-6 shadow-sm">
      <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mb-4">
        <Feather size={32} className="text-sky-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title || t('promoLoginTitle')}</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs leading-relaxed">{desc || t('promoLoginDesc')}</p>
      <button
        onClick={handleGoogleLogin}
        className="flex items-center justify-center py-3 px-6 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-500 transition-colors shadow-lg shadow-sky-600/20 w-full max-w-xs mx-auto"
      >
        <LogIn className="mr-2" size={20} /> {t('promoLoginBtn')}
      </button>
    </div>
  );

  if (isAuthLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-800"><Loader2 className="animate-spin mr-2" />{lang === 'zh' ? '載入中...' : 'Loading...'}</div>;

  const currentSchedule = weeklyPlan?.schedule || DEFAULT_SCHEDULE;
  const activeSchedule = currentSchedule.find(s => s.day === activeDay) || currentSchedule[0];
  const completedCount = Object.values(progress).filter(Boolean).length;
  const totalThisWeek = currentSchedule.reduce((acc, curr) => acc + curr.routine.length, 0);
  const progressPercent = Math.round((completedCount / totalThisWeek) * 100) || 0;
  const currentWeekFeedbackValue = allProgress[currentWeek]?.feedbackValue;

  const monthlyData = Object.values(Object.entries(allProgress).reduce((acc, [weekId, data]) => {
    if (!weekId.includes('-W')) return acc;
    const m = getMonthFromWeek(weekId);
    if (!acc[m]) acc[m] = { completed: 0, totalWeeks: 0, monthKey: m };
    acc[m].completed += data.completed ? Object.values(data.completed).filter(Boolean).length : 0;
    acc[m].totalWeeks += 1;
    return acc;
  }, {})).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  // --- Advanced Stats Calculation for History Tab ---
  const calculateStats = () => {
    let totalCompleted = 0;
    let typeStats = { lower: 0, core: 0, upper_push: 0, upper_pull: 0, mobility: 0, power: 0, full: 0 };

    // Process all history for heatmap & total counts
    // Flatten progress to daily data: { "2024-W01-1": { count: 3, done: true } }
    let dailyMap = {};

    Object.entries(allProgress).forEach(([weekId, data]) => {
      if (!weekId.includes('-W') || !data.completed) return;

      Object.entries(data.completed).forEach(([key, isDone]) => {
        if (!isDone) return;
        totalCompleted++;

        // Count by type
        const match = key.match(/^day(\d+)_(.+)$/);
        if (match) {
          const [, dayStr, exKey] = match;
          const type = exercisesData[exKey]?.type;
          if (type && typeStats[type] !== undefined) typeStats[type]++;

          // Build daily map for streak and heatmap
          const dailyKey = `${weekId}-${dayStr}`;
          if (!dailyMap[dailyKey]) dailyMap[dailyKey] = 0;
          dailyMap[dailyKey]++;
        }
      });
    });

    // Calculate Streak (Simplified: just counting consecutive days that have any activity backwards from today, logic can be complex with weeks so we approximate recent activity)
    // We'll just generate the last 28 days keys and check them
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Sort all unique days chronologically (approximated string sort works for YYYY-Wxx-d)
    const sortedDays = Object.keys(dailyMap).sort();

    // Longest streak
    for (let i = 0; i < sortedDays.length; i++) {
      // Without pure date conversion it's hard to tell if W01-5 is adjacent to W02-1 gap-free.
      // For simplicity of this demo, we just count non-empty days array sequence as streak if we assume they only train weekdays.
      // A more rigorous approach requires Date math. We will skip complex streak logic and just show total Active Days.
    }
    const totalActiveDays = sortedDays.length;

    return { totalCompleted, totalActiveDays, typeStats, dailyMap };
  };

  const stats = activeTab === 'history' ? calculateStats() : null;

  // Generate Hex Map blocks (last 12 weeks ideally, we'll just show what we have in allProgress up to 12 weeks)
  const heatmapWeeks = activeTab === 'history' ?
    Object.keys(allProgress)
      .filter(k => k.includes('-W'))
      .sort((a, b) => a.localeCompare(b))
      .slice(-12) : [];

  // --- Desktop Sidebar Navigation ---
  const navItems = [
    { key: 'train', icon: <Feather size={20} />, label: t('navTrain') },
    { key: 'ai', icon: <Brain size={20} />, label: t('navAI') },
    { key: 'exercises', icon: <Dumbbell size={20} />, label: t('navExercises') },
    { key: 'metrics', icon: <Activity size={20} />, label: t('navMetrics') },
    { key: 'history', icon: <BarChart3 size={20} />, label: t('navHistory') },
    { key: 'settings', icon: <Settings size={20} />, label: t('navSettings') },
  ];

  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-slate-100 text-slate-700 font-sans">
        {/* Toast */}
        {toastMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
            <div className="bg-white border border-sky-200 shadow-xl rounded-full px-6 py-3 flex items-center">
              <Info size={18} className="text-blue-600 mr-2" />
              <span className="text-sm font-medium">{toastMsg}</span>
            </div>
          </div>
        )}

        {/* Left Sidebar */}
        <aside className="w-56 bg-white border-r border-sky-100 flex flex-col fixed top-0 left-0 h-screen z-30 shadow-sm">
          {/* Brand */}
          <div className="p-5 border-b border-sky-100">
            <div className="flex items-center mb-1">
              <Feather size={22} className="text-sky-600 mr-2 flex-shrink-0" />
              <span className="text-base font-bold text-slate-800 leading-tight">{t('appTitle')}</span>
            </div>
            {activeTab === 'train' && (
              <div className="mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">{t('weekLabel')}: {currentWeek}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-sky-600 font-medium">{getDifficultyLabel()}</span>
                  <span className="text-lg font-bold text-sky-600">{progressPercent}%</span>
                </div>
                <div className="w-full bg-blue-50 rounded-full h-1.5 mt-1.5">
                  <div className="bg-sky-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>
            )}
            {activeTab === 'ai' && <p className="text-xs text-slate-400 mt-1 leading-snug">{t('headerAI')}</p>}
            {activeTab === 'metrics' && <p className="text-xs text-slate-400 mt-1 leading-snug">{t('headerMetrics')}</p>}
            {activeTab === 'exercises' && <p className="text-xs text-slate-400 mt-1 leading-snug">{t('headerExercises')}</p>}
            {activeTab === 'history' && <p className="text-xs text-slate-400 mt-1 leading-snug">{t('headerHistory')}</p>}
            {activeTab === 'settings' && <p className="text-xs text-slate-400 mt-1 leading-snug">{t('headerSettings')}</p>}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === item.key
                    ? 'bg-sky-50 text-sky-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
              >
                <span className={`mr-3 flex-shrink-0 ${activeTab === item.key ? 'text-sky-600' : 'text-slate-400'}`}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Bottom: lang + user */}
          <div className="p-4 border-t border-sky-100 space-y-2">
            <button onClick={toggleLang} className="w-full text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-2 rounded-lg transition-colors">🌐 {t('langToggle')}</button>
            {user ? (
              <button onClick={handleLogout} className="w-full flex items-center justify-center text-xs text-slate-500 hover:text-sky-600 transition-colors py-1.5">
                <LogOut size={14} className="mr-1" /> {lang === 'zh' ? '登出' : 'Logout'}
              </button>
            ) : (
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center text-xs font-bold text-sky-600 hover:text-sky-500 transition-colors bg-sky-50 px-3 py-2 rounded-lg">
                <LogIn size={14} className="mr-1" /> {lang === 'zh' ? '登入' : 'Login'}
              </button>
            )}
          </div>
        </aside>

        {/* Main content area */}
        <main className="ml-56 flex-1 min-h-screen">
          <div className="max-w-5xl mx-auto p-8">

            {/* TRAIN TAB - Desktop 2-column layout */}
            {activeTab === 'train' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Day selector - full width */}
                <div className="flex bg-white rounded-xl p-2 mb-6 shadow-inner overflow-x-auto gap-1">
                  {currentSchedule.map((schedule) => {
                    const isSelected = activeDay === schedule.day;
                    const allDone = schedule.routine.every(exKey => progress[`day${schedule.day}_${exKey}`]);
                    return (
                      <button key={schedule.day} onClick={() => setActiveDay(schedule.day)} className={`flex flex-col items-center justify-center min-w-[4rem] h-14 rounded-lg transition-colors flex-1 ${isSelected ? 'bg-sky-600 text-white shadow-md' : 'text-slate-500 hover:bg-blue-50'}`}>
                        <span className="text-xs font-bold mb-0.5">{t('dayShort')[schedule.day - 1]}</span>
                        <span className="text-[10px] opacity-80">{getDateForWeekDay(currentWeek, schedule.day)}</span>
                        {allDone ? <CheckCircle2 size={14} className={isSelected ? 'text-slate-800' : 'text-sky-600'} /> : <Circle size={14} className="opacity-50" />}
                      </button>
                    );
                  })}
                </div>

                {/* 2-column layout for desktop */}
                <div className="grid grid-cols-5 gap-6">
                  {/* Left: Exercise list (3/5) */}
                  <div className="col-span-3 space-y-4">
                    <h3 className="text-md font-semibold text-slate-600 ml-1 mb-2">{t('todaySchedule')}</h3>
                    {activeSchedule?.routine.map((exKey, index) => {
                      let exercise = exercisesData[exKey];
                      if (!exercise && typeof exKey === 'string') {
                        const fallbackKey = Object.keys(exercisesData).find(k => exercisesData[k].name === exKey || exKey.includes(k));
                        if (fallbackKey) { exercise = exercisesData[fallbackKey]; exKey = fallbackKey; }
                      }
                      if (!exercise) return (
                        <div key={`missing-${index}`} className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-500 text-xs">
                          [Debug] 未知動作代碼: {String(exKey)}
                        </div>
                      );
                      const isCompleted = !!progress[`day${activeSchedule.day}_${exKey}`];
                      const params = getExerciseParams(exKey);
                      return (
                        <div key={exKey} className={`flex flex-col p-4 rounded-xl transition-all border ${isCompleted ? 'bg-sky-100/10 border-sky-200/50' : 'bg-white border-sky-100'}`}>
                          <div className="flex items-center cursor-pointer" onClick={() => toggleExercise(activeSchedule.day, exKey)}>
                            <button className="mr-4 flex-shrink-0">
                              {isCompleted ? <CheckCircle2 size={24} className="text-sky-600" /> : <Circle size={24} className="text-slate-500" />}
                            </button>
                            <div className="flex-grow">
                              <h4 className={`font-medium ${isCompleted ? 'line-through decoration-sky-400/50 text-slate-500' : 'text-slate-800'}`}>
                                {index + 1}. {exercise.name}
                              </h4>
                              <p className={`text-xs mt-1 ${isCompleted ? 'text-slate-600' : 'text-slate-500'}`}>{params}</p>
                            </div>
                          </div>
                          {!isCompleted && (
                            <div className="mt-3 ml-10 pl-3 border-l-2 border-blue-300/30 flex items-start text-xs text-slate-500 bg-white/50 py-2 pr-2 rounded-r-lg">
                              <Info size={14} className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{exercise.tip}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Feedback */}
                    <div className="mt-6 bg-white rounded-2xl p-5 border border-sky-100">
                      <h3 className="text-md font-bold text-slate-800 mb-2">{t('feedbackTitle')}</h3>
                      <p className="text-xs text-slate-500 mb-4">{t('feedbackSubtitle')}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => handleFeedback(-1)} className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === -1 ? 'bg-red-100/20 border-red-300 text-red-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}>
                          {t('feedbackHard')}<span className="block text-xs opacity-60 mt-1">{t('feedbackHardSub')}</span>
                        </button>
                        <button onClick={() => handleFeedback(0)} className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === 0 ? 'bg-blue-100/20 border-blue-300 text-blue-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}>
                          {t('feedbackOk')}<span className="block text-xs opacity-60 mt-1">{t('feedbackOkSub')}</span>
                        </button>
                        <button onClick={() => handleFeedback(1)} className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === 1 ? 'bg-sky-500/20 border-sky-300 text-sky-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}>
                          {t('feedbackEasy')}<span className="block text-xs opacity-60 mt-1">{t('feedbackEasySub')}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Theme card + Coach advice (2/5) */}
                  <div className="col-span-2 space-y-4">
                    <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800/80 rounded-2xl p-5 border border-sky-200/30 shadow-lg">
                      <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center">
                        <Feather size={18} className="mr-2 text-sky-600" /> {activeSchedule?.theme}
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-xl mt-3 whitespace-pre-wrap">{activeSchedule?.concept}</p>
                    </div>
                    {activeSchedule?.coachAdvice && (
                      <div className="bg-indigo-50/30 rounded-2xl p-5 border border-indigo-200/30 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                        <h2 className="text-md font-bold text-indigo-700 mb-2 flex items-center">
                          <Brain size={18} className="mr-2" /> {t('coachAdvice')}
                        </h2>
                        <p className="text-sm text-slate-600 leading-relaxed relative z-10 whitespace-pre-wrap">{activeSchedule.coachAdvice}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Other tabs - same content but in a wider container */}
            {activeTab !== 'train' && (
              <div className="max-w-3xl mx-auto">
                {activeTab === 'ai' && (
                  !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('aiCoachTitle')} /></div> :
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className={`p-6 rounded-2xl border ${weeklyPlan ? 'bg-indigo-50/30 border-indigo-200/30' : 'bg-white border-sky-100'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold flex items-center text-indigo-600 text-lg">
                            <Brain className="mr-2" size={24} /> {t('aiCoachTitle')}
                          </h3>
                          {(!weeklyPlan || isEditingPlan) && (
                            <button
                              onClick={requestAIPlan}
                              disabled={isGeneratingPlan}
                              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center shadow-lg shadow-indigo-600/20"
                            >
                              {isGeneratingPlan ? <><Loader2 size={16} className="mr-2 animate-spin" /> {t('aiGenerating')}</> : weeklyPlan ? t('aiRegenerateBtn') : t('aiGenerateBtn')}
                            </button>
                          )}
                        </div>
                        {!apiKey && !weeklyPlan && (
                          <div className="bg-amber-50/30 border border-amber-200/50 rounded-xl p-4 mb-4 flex items-start shadow-inner">
                            <Key size={18} className="text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700">{t('aiNoKey')}</p>
                          </div>
                        )}
                        {weeklyPlan && !isEditingPlan && (
                          <div className="bg-slate-50/50 p-6 rounded-xl border border-sky-100/50 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                            <div className="flex justify-between items-center mb-4 border-b border-slate-900/5 pb-3">
                              <h4 className="text-sm font-bold text-slate-600 flex items-center"><Brain size={16} className="mr-2 text-indigo-600" /> {t('aiConclusionTitle')}</h4>
                              <button onClick={() => setIsEditingPlan(true)} className="text-xs bg-white hover:bg-blue-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors border border-sky-100 flex items-center">
                                <RefreshCw size={12} className="mr-1" /> {t('aiTweakBtn')}
                              </button>
                            </div>
                            <div className="w-full text-sm text-slate-700 leading-relaxed font-normal space-y-4">
                              <ReactMarkdown
                                components={{
                                  h3: ({ node, ...props }) => <h3 className="text-lg font-bold text-indigo-700 mt-8 mb-3 border-b-2 border-indigo-100 pb-2" {...props} />,
                                  p: ({ node, ...props }) => <p className="mb-5 leading-loose text-slate-700" {...props} />,
                                  strong: ({ node, ...props }) => <strong className="font-bold text-indigo-800 bg-indigo-50/80 px-1.5 py-0.5 rounded shadow-sm" {...props} />,
                                  ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-5 space-y-2 text-slate-700" {...props} />,
                                  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-5 space-y-2 text-slate-700" {...props} />,
                                  li: ({ node, ...props }) => <li className="pl-1" {...props} />
                                }}
                              >
                                {weeklyPlan.conclusion}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {(!weeklyPlan || isEditingPlan) && (
                          <div className="mb-6 mt-4 space-y-5 bg-slate-50/60 p-6 rounded-xl border border-sky-100 shadow-inner">
                            {isEditingPlan && (
                              <div className="bg-indigo-50/20 border border-indigo-200/30 rounded-lg p-3 mb-2 flex items-start">
                                <RefreshCw size={16} className="text-indigo-600 mr-2 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-indigo-700 leading-relaxed">{t('aiEditingHint')}</p>
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiGoalLabel')}</label>
                              <input type="text" value={aiGoalInput} onChange={(e) => setAiGoalInput(e.target.value)} placeholder={t('aiGoalPlaceholder')}
                                className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiTimeLabel')}</label>
                              <input type="number" value={aiTimeInput} onChange={(e) => setAiTimeInput(e.target.value)} placeholder="30"
                                className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm" />
                            </div>
                            {!isEditingPlan && (
                              <div className="bg-sky-100/20 border border-sky-200/40 rounded-lg p-3">
                                <p className="text-xs text-sky-600 leading-relaxed flex items-start"><span className="mr-1.5">💡</span>{t('aiTip')}</p>
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiMessageLabel')} {isEditingPlan ? <span className="text-indigo-600 text-xs ml-1">{t('aiMessageLabelEditing')}</span> : <span className="text-slate-500 text-xs ml-1">{t('aiMessageLabelOptional')}</span>}</label>
                              <textarea value={aiMessageInput} onChange={(e) => setAiMessageInput(e.target.value)} placeholder={isEditingPlan ? t('aiMessagePlaceholderEditing') : t('aiMessagePlaceholder')}
                                className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-24 shadow-sm" />
                            </div>
                            {isEditingPlan && (
                              <div className="flex justify-end pt-2 border-t border-sky-100/50 space-x-3">
                                {backupPlan && (<button onClick={restoreBackupPlan} className="text-sm bg-white hover:bg-blue-50 text-slate-600 px-4 py-2 rounded-xl transition-colors border border-sky-200">{t('aiRestoreBtn')}</button>)}
                                <button onClick={() => setIsEditingPlan(false)} className="text-sm bg-transparent hover:bg-white text-slate-500 px-4 py-2 rounded-xl transition-colors">{t('aiCancelBtn')}</button>
                              </div>
                            )}
                          </div>
                        )}
                        {!weeklyPlan && (<p className="text-sm text-slate-500 leading-relaxed mt-4 text-center font-medium">{t('aiReadyMsg')}</p>)}
                      </div>
                    </div>
                )}

                {activeTab === 'exercises' && (
                  !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('exercisesTitle')} /></div> :
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                      <div className="bg-white p-6 rounded-2xl border border-sky-100">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Dumbbell className="mr-2 text-indigo-600" size={20} /> 自訂動作庫</h2>
                        <p className="text-sm text-slate-500 mb-4 leading-relaxed">新增你想練的動作，AI 會自動為其分類並標註發力技巧。排表時 AI 只會從「啟用」的動作中挑選。</p>
                        <div className="flex space-x-2 mb-6">
                          <input type="text" value={newExName} onChange={e => setNewExName(e.target.value)} placeholder="輸入動作名稱 (例如：高腳杯深蹲)"
                            className="flex-1 bg-slate-50 border border-sky-200 rounded-xl px-4 py-2 text-slate-700 text-sm focus:outline-none focus:border-indigo-200" />
                          <button onClick={handleAddExercise} disabled={isAddingEx || !newExName.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-blue-50 disabled:text-slate-500 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium flex items-center justify-center min-w-[5rem]">
                            {isAddingEx ? <Loader2 size={16} className="animate-spin" /> : '新增'}
                          </button>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(exercisesData).filter(([_, ex]) => !ex.deleted).map(([key, ex]) => {
                            const isActive = ex.active !== false;
                            return (
                              <div key={key} className={`p-4 rounded-xl border transition-all flex items-start justify-between ${isActive ? 'bg-slate-50/50 border-sky-200' : 'bg-slate-50/20 border-slate-800 opacity-60'}`}>
                                <div className="flex-1 pr-4">
                                  <div className="flex items-center">
                                    <h4 className={`font-semibold text-sm ${isActive ? 'text-slate-700' : 'text-slate-500'}`}>{ex.name}</h4>
                                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-blue-50 text-slate-600' : 'bg-green-900/30 text-sky-600/50'}`}>{ex.type}</span>
                                  </div>
                                  <p className={`text-xs mt-1 leading-relaxed ${isActive ? 'text-slate-500' : 'text-slate-600'}`}>{ex.tip}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2 mt-1 flex-shrink-0">
                                  <button onClick={() => toggleExerciseActive(key)} className={`w-12 h-6 rounded-full relative transition-colors ${isActive ? 'bg-sky-500' : 'bg-blue-50'}`}>
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                  </button>
                                  <button onClick={() => deleteExercise(key)} className="text-red-400 hover:text-red-600 transition-colors p-1" title={lang === 'zh' ? '刪除動作' : 'Delete Exercise'}>
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                )}

                {activeTab === 'metrics' && (
                  !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('metricsTitle')} /></div> :
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                      <div className="bg-white p-6 rounded-2xl border border-sky-100">
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Activity className="mr-2 text-sky-600" size={20} /> {t('metricsTitle')}</h2>
                        <form onSubmit={saveMetrics} className="space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelDate')}</label><input type="date" name="date" value={metricForm.date} onChange={handleMetricChange} className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" required /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelAge')}</label><input type="number" step="1" name="age" value={metricForm.age} onChange={handleMetricChange} placeholder={t('labelAgePlaceholder')} className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelHeight')}</label><input type="number" step="0.1" name="height" value={metricForm.height} onChange={handleMetricChange} placeholder="cm" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelWeight')}</label><input type="number" step="0.1" name="weight" value={metricForm.weight} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelBodyFat')}</label><input type="number" step="0.1" name="bodyFat" value={metricForm.bodyFat} onChange={handleMetricChange} placeholder="%" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">{t('labelBMR')}</label><input type="number" step="1" name="bmr" value={metricForm.bmr} onChange={handleMetricChange} placeholder="kcal" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                          </div>
                          <div className="mt-4">
                            <h3 className="text-sm font-semibold text-sky-600 mb-3 border-b border-emerald-900 pb-2">{t('labelMuscle')}</h3>
                            <div className="grid grid-cols-3 gap-4">
                              <div><label className="block text-xs text-slate-500 mb-1">{t('labelLArm')}</label><input type="number" step="0.1" name="muscleLarm" value={metricForm.muscleLarm} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                              <div><label className="block text-xs text-slate-500 mb-1">{t('labelRArm')}</label><input type="number" step="0.1" name="muscleRarm" value={metricForm.muscleRarm} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                              <div><label className="block text-xs text-slate-500 mb-1">{t('labelLLeg')}</label><input type="number" step="0.1" name="muscleLleg" value={metricForm.muscleLleg} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                              <div><label className="block text-xs text-slate-500 mb-1">{t('labelRLeg')}</label><input type="number" step="0.1" name="muscleRleg" value={metricForm.muscleRleg} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                              <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">{t('labelTrunk')}</label><input type="number" step="0.1" name="muscleTrunk" value={metricForm.muscleTrunk} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" /></div>
                            </div>
                          </div>
                          <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 mt-4 rounded-xl transition-colors shadow-lg shadow-emerald-600/20">{t('metricsSaveBtn')}</button>
                        </form>
                      </div>
                      {metricsHistory.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl border border-sky-100">
                          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center"><TrendingUp className="mr-2 text-sky-600" size={20} /> {t('metricsTrendTitle')}</h2>
                          <div className="grid grid-cols-2 gap-6">
                            <div className="h-64">
                              <h3 className="text-xs text-slate-500 mb-2 text-center">{t('metricsChartWeight')}</h3>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(tick) => tick.slice(5)} />
                                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                                  <Line yAxisId="left" type="monotone" dataKey="weight" name={t('chartWeightName')} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                  <Line yAxisId="right" type="monotone" dataKey="bodyFat" name={t('chartBodyFatName')} stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="h-64">
                              <h3 className="text-xs text-slate-500 mb-2 text-center">{t('metricsChartMuscle')}</h3>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(tick) => tick.slice(5)} />
                                  <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  <Line type="monotone" dataKey="muscleRarm" name={t('chartRArm')} stroke="#ef4444" strokeWidth={2} />
                                  <Line type="monotone" dataKey="muscleLarm" name={t('chartLArm')} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} />
                                  <Line type="monotone" dataKey="muscleRleg" name={t('chartRLeg')} stroke="#10b981" strokeWidth={2} />
                                  <Line type="monotone" dataKey="muscleLleg" name={t('chartLLeg')} stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                )}

                {activeTab === 'history' && (
                  !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('monthlyTitle')} /></div> :
                    stats && (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-white p-5 rounded-2xl border border-sky-100 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                            <div className="absolute -top-4 -right-4 w-16 h-16 bg-blue-100/10 rounded-full blur-xl"></div>
                            <Flame size={24} className="text-orange-500 mb-2 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                            <div className="text-3xl font-black text-slate-800">{stats.totalActiveDays} <span className="text-sm font-medium text-slate-500">{t('historyDaysUnit')}</span></div>
                            <div className="text-xs text-slate-500 mt-1 font-medium">{t('historyActiveDays')}</div>
                          </div>
                          <div className="bg-white p-5 rounded-2xl border border-sky-100 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                            <div className="absolute -top-4 -left-4 w-16 h-16 bg-sky-500/10 rounded-full blur-xl"></div>
                            <CheckCircle2 size={24} className="text-sky-600 mb-2 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                            <div className="text-3xl font-black text-slate-800">{stats.totalCompleted} <span className="text-sm font-medium text-slate-500">{t('historyCompletedUnit')}</span></div>
                            <div className="text-xs text-slate-500 mt-1 font-medium">{t('historyCompleted')}</div>
                          </div>
                          <div className="col-span-2 bg-white p-5 rounded-2xl border border-sky-100 shadow-lg">
                            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><Shield className="mr-2 text-indigo-600" size={16} />{t('radarTitle')}</h3>
                            <div className="space-y-2">
                              {[
                                { label: t('radarLower'), val: stats.typeStats.lower, color: 'bg-indigo-500' },
                                { label: t('radarCore'), val: stats.typeStats.core, color: 'bg-blue-400' },
                                { label: t('radarUpper'), val: stats.typeStats.upper_push + stats.typeStats.upper_pull, color: 'bg-sky-500' },
                                { label: t('radarMobility'), val: stats.typeStats.mobility, color: 'bg-teal-400' },
                                { label: t('radarPower'), val: stats.typeStats.power + stats.typeStats.full, color: 'bg-orange-500' },
                              ].map(row => (
                                <div key={row.label} className="flex items-center text-xs">
                                  <span className="w-14 text-slate-500 flex-shrink-0">{row.label}</span>
                                  <div className="flex-1 h-2.5 bg-blue-50 rounded-full mx-2 overflow-hidden">
                                    <div className={`h-full ${row.color} rounded-full`} style={{ width: `${Math.min(100, (row.val / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                                  </div>
                                  <span className="w-6 text-right text-slate-600 font-medium">{row.val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-sky-100 shadow-lg">
                          <h2 className="text-md font-bold text-slate-800 mb-4 flex items-center"><Zap className="mr-2 text-yellow-400" size={18} /> {t('heatmapTitle')}</h2>
                          {heatmapWeeks.length === 0 ? (<p className="text-sm text-slate-500 text-center py-4">{t('heatmapEmpty')}</p>) : (
                            <div className="overflow-x-auto pb-2">
                              <div className="flex space-x-1.5 min-w-max">
                                {heatmapWeeks.map(weekId => (
                                  <div key={weekId} className="flex flex-col space-y-1.5">
                                    {[1, 2, 3, 4, 5].map(dayIdx => {
                                      const count = stats.dailyMap[`${weekId}-${dayIdx}`] || 0;
                                      let bgClass = "bg-blue-50/50";
                                      if (count > 0 && count <= 2) bgClass = "bg-sky-100/60";
                                      else if (count > 2 && count < 5) bgClass = "bg-sky-600";
                                      else if (count >= 5) bgClass = "bg-sky-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]";
                                      return (<div key={`${weekId}-${dayIdx}`} className={`w-5 h-5 rounded-sm ${bgClass} transition-colors`} title={`${weekId} Day ${dayIdx}: ${count}`}></div>);
                                    })}
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between items-center mt-3 text-[10px] text-slate-500 font-medium">
                                <span>{t('heatmapOldest')}</span>
                                <div className="flex items-center space-x-1">
                                  <span className="mr-1">{t('heatmapLess')}</span>
                                  <div className="w-3 h-3 rounded-sm bg-blue-50/50"></div>
                                  <div className="w-3 h-3 rounded-sm bg-sky-100/60"></div>
                                  <div className="w-3 h-3 rounded-sm bg-sky-600"></div>
                                  <div className="w-3 h-3 rounded-sm bg-sky-400"></div>
                                  <span className="ml-1">{t('heatmapMore')}</span>
                                </div>
                                <span>{t('heatmapNewest')}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <h2 className="text-lg font-bold text-slate-800 mb-4 mt-8 flex items-center"><CalendarDays className="mr-2 text-blue-600" size={20} /> {t('monthlyTitle')}</h2>
                        {monthlyData.length === 0 ? (
                          <div className="text-center p-8 bg-white rounded-xl border border-sky-100"><p className="text-slate-500">{t('historyEmpty')}</p></div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            {monthlyData.map((data) => {
                              const targetForMonth = data.totalWeeks * TOTAL_WEEKLY_EXERCISES;
                              const monthPercent = Math.round((data.completed / targetForMonth) * 100);
                              return (
                                <div key={data.monthKey} className="bg-white p-5 rounded-2xl border border-sky-100 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 h-1 bg-sky-500/50" style={{ width: `${monthPercent}%` }}></div>
                                  <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-lg text-slate-800">{data.monthKey}</h3>
                                    <div className="text-2xl font-black text-sky-600">{monthPercent}%</div>
                                  </div>
                                  <div className="flex items-center text-sm text-slate-500 mb-1"><CheckCircle2 size={16} className="mr-2 text-sky-600" /> {t('historyTotal')} <span className="text-slate-700 ml-2 font-medium">{data.completed} {t('historyActionsUnit')}</span></div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )
                )}

                {activeTab === 'settings' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                    {!user && <div className="mb-6"><LoginPrompt title={t('settingsTitle')} /></div>}
                    <div className="bg-white p-6 rounded-2xl border border-sky-100">
                      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Key className="mr-2 text-blue-600" size={20} /> {t('settingsTitle')}</h2>
                      <p className="text-sm text-slate-500 mb-4 leading-relaxed">{t('settingsDesc')}<strong className="text-sky-600">{t('settingsDescStrong')}</strong>{t('settingsDescEnd')}</p>
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Gemini API Key</label>
                        <input type="password" value={tempKeyInput} onChange={(e) => setTempKeyInput(e.target.value)} onFocus={(e) => e.target.select()} placeholder="AIzaSy..."
                          className="w-full bg-slate-50 border border-sky-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm" />
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">{t('settingsModelTitle')}</label>
                        <select value={selectedAiModel} onChange={(e) => { setSelectedAiModel(e.target.value); localStorage.setItem('app_ai_model', e.target.value); }}
                          className="w-full bg-slate-50 border border-sky-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-500 transition-all text-sm">
                          {availableModels.map(model => (<option key={model.id} value={model.id}>{model.label}</option>))}
                        </select>
                      </div>
                      <div className="flex space-x-3 mt-4">
                        <button onClick={saveKeyToLocal} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-colors">{t('settingsSaveBtn')}</button>
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-medium text-sm">
                          <ExternalLink size={18} className="mr-2" />{t('settingsGetKey')}
                        </a>
                      </div>
                      {apiKey && (
                        <div className="mt-4 p-3 bg-sky-100/20 border border-sky-200/50 rounded-lg flex items-start">
                          <CheckCircle2 size={16} className="text-sky-600 mr-2 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-sky-600">{t('settingsKeyBound')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ===== MOBILE LAYOUT (< 1024px) =====
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-24 relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
          <div className="bg-white border border-sky-200 shadow-xl rounded-full px-6 py-3 flex items-center">
            <Info size={18} className="text-blue-600 mr-2" />
            <span className="text-sm font-medium">{toastMsg}</span>
          </div>
        </div>
      )}

      <header className="bg-white p-6 rounded-b-3xl shadow-lg border-b border-sky-100 relative">
        <div className="absolute top-6 right-6 flex items-center space-x-3">
          <button onClick={toggleLang} className="text-xs font-bold bg-sky-100 hover:bg-sky-200 text-sky-700 px-2.5 py-1 rounded-full transition-colors">🌐 {t('langToggle')}</button>
          {user ? (
            <button onClick={handleLogout} className="text-sm font-medium text-slate-500 hover:text-sky-600 transition-colors flex items-center">
              <LogOut size={16} className="mr-1" /> {lang === 'zh' ? '登出' : 'Logout'}
            </button>
          ) : (
            <button onClick={handleGoogleLogin} title={t('promoLoginBtn')} className="text-sm font-bold text-sky-600 hover:text-sky-500 transition-colors flex items-center bg-sky-50 px-3 py-1.5 rounded-full">
              <LogIn size={16} className="mr-1" /> {lang === 'zh' ? '登入' : 'Login'}
            </button>
          )}
        </div>
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-slate-800 mb-2 flex items-center">
            <Feather size={24} className="mr-2 text-sky-600" /> {t('appTitle')}
          </h1>
          {activeTab === 'train' && (
            <>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="text-sm text-slate-500">{t('weekLabel')}: {currentWeek}</p>
                  <p className="text-sm text-sky-600 font-medium mt-1">{t('difficultyLabel')}: {getDifficultyLabel()}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-sky-600">{progressPercent}%</div>
                  <p className="text-xs text-slate-500">{t('weekCompletion')}</p>
                </div>
              </div>
              <div className="w-full bg-blue-50 rounded-full h-2 mt-4">
                <div className="bg-sky-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </>
          )}
          {activeTab === 'ai' && <div className="pt-2"><p className="text-slate-500 text-sm">{t('headerAI')}</p></div>}
          {activeTab === 'metrics' && <div className="pt-2"><p className="text-slate-500 text-sm">{t('headerMetrics')}</p></div>}
          {activeTab === 'exercises' && <div className="pt-2"><p className="text-slate-500 text-sm">{t('headerExercises')}</p></div>}
          {activeTab === 'history' && <div className="pt-2"><p className="text-slate-500 text-sm">{t('headerHistory')}</p></div>}
          {activeTab === 'settings' && <div className="pt-2"><p className="text-slate-500 text-sm">{t('headerSettings')}</p></div>}
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 mt-2">
        {activeTab === 'train' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between bg-white rounded-xl p-2 mb-6 shadow-inner overflow-x-auto">
              {currentSchedule.map((schedule) => {
                const isSelected = activeDay === schedule.day;
                const allDone = schedule.routine.every(exKey => progress[`day${schedule.day}_${exKey}`]);
                return (
                  <button key={schedule.day} onClick={() => setActiveDay(schedule.day)} className={`flex flex-col items-center justify-center min-w-[3rem] h-14 rounded-lg transition-colors ${isSelected ? 'bg-sky-600 text-white shadow-md' : 'text-slate-500 hover:bg-blue-50'}`}>
                    <span className="text-[10px] font-bold mb-0.5">{t('dayShort')[schedule.day - 1]}</span>
                    <span className="text-[9px] opacity-80">{getDateForWeekDay(currentWeek, schedule.day)}</span>
                    {allDone ? <CheckCircle2 size={14} className={isSelected ? 'text-slate-800' : 'text-sky-600'} /> : <Circle size={14} className="opacity-50" />}
                  </button>
                );
              })}
            </div>

            <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800/80 rounded-2xl p-5 mb-6 border border-sky-200/30 shadow-lg">
              <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center">
                <Feather size={18} className="mr-2 text-sky-600" /> {activeSchedule?.theme}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-xl mt-3 whitespace-pre-wrap">{activeSchedule?.concept}</p>
            </div>

            {activeSchedule?.coachAdvice && (
              <div className="bg-indigo-50/30 rounded-2xl p-5 mb-6 border border-indigo-200/30 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <h2 className="text-md font-bold text-indigo-700 mb-2 flex items-center">
                  <Brain size={18} className="mr-2" /> {t('coachAdvice')}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed relative z-10 whitespace-pre-wrap">
                  {activeSchedule.coachAdvice}
                </p>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-md font-semibold text-slate-600 ml-1 mb-2">{t('todaySchedule')}</h3>
              {activeSchedule?.routine.map((exKey, index) => {
                let exercise = exercisesData[exKey];

                // Fallback: If AI returned the name instead of the key, try to find it
                if (!exercise && typeof exKey === 'string') {
                  const fallbackKey = Object.keys(exercisesData).find(k => exercisesData[k].name === exKey || exKey.includes(k));
                  if (fallbackKey) {
                    exercise = exercisesData[fallbackKey];
                    exKey = fallbackKey; // Override exKey to work with progress object
                  }
                }

                if (!exercise) {
                  return (
                    <div key={`missing-${index}`} className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-500 text-xs">
                      [Debug] 未知動作代碼/名稱: {typeof exKey === 'object' ? JSON.stringify(exKey) : String(exKey)}
                    </div>
                  );
                }
                const isCompleted = !!progress[`day${activeSchedule.day}_${exKey}`];
                const params = getExerciseParams(exKey);

                return (
                  <div key={exKey} className={`flex flex-col p-4 rounded-xl transition-all border ${isCompleted ? 'bg-sky-100/10 border-sky-200/50' : 'bg-white border-sky-100'}`}>
                    <div className="flex items-center cursor-pointer" onClick={() => toggleExercise(activeSchedule.day, exKey)}>
                      <button className="mr-4 flex-shrink-0">
                        {isCompleted ? <CheckCircle2 size={24} className="text-sky-600" /> : <Circle size={24} className="text-slate-500" />}
                      </button>
                      <div className="flex-grow">
                        <h4 className={`font-medium ${isCompleted ? 'line-through decoration-sky-400/50 text-slate-500' : 'text-slate-800'}`}>
                          {index + 1}. {exercise.name}
                        </h4>
                        <p className={`text-xs mt-1 ${isCompleted ? 'text-slate-600' : 'text-slate-500'}`}>{params}</p>
                      </div>
                    </div>
                    {!isCompleted && (
                      <div className="mt-3 ml-10 pl-3 border-l-2 border-blue-300/30 flex items-start text-xs text-slate-500 bg-white/50 py-2 pr-2 rounded-r-lg">
                        <Info size={14} className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{exercise.tip}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-10 bg-white rounded-2xl p-5 border border-sky-100">
              <h3 className="text-md font-bold text-slate-800 mb-2">{t('feedbackTitle')}</h3>
              <p className="text-xs text-slate-500 mb-4">{t('feedbackSubtitle')}</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleFeedback(-1)}
                  className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === -1 ? 'bg-red-100/20 border-red-300 text-red-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}
                >
                  {t('feedbackHard')}<span className="block text-xs opacity-60 mt-1">{t('feedbackHardSub')}</span>
                </button>
                <button
                  onClick={() => handleFeedback(0)}
                  className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === 0 ? 'bg-blue-100/20 border-blue-300 text-blue-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}
                >
                  {t('feedbackOk')}<span className="block text-xs opacity-60 mt-1">{t('feedbackOkSub')}</span>
                </button>
                <button
                  onClick={() => handleFeedback(1)}
                  className={`py-2 px-1 text-sm rounded-lg transition-colors border ${currentWeekFeedbackValue === 1 ? 'bg-sky-500/20 border-sky-300 text-sky-600 font-bold' : 'bg-blue-50 border-sky-100 hover:bg-slate-600 text-slate-700'}`}
                >
                  {t('feedbackEasy')}<span className="block text-xs opacity-60 mt-1">{t('feedbackEasySub')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('aiCoachTitle')} /></div> :
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className={`p-6 rounded-2xl border ${weeklyPlan ? 'bg-indigo-50/30 border-indigo-200/30' : 'bg-white border-sky-100'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center text-indigo-600 text-lg">
                    <Brain className="mr-2" size={24} /> {t('aiCoachTitle')}
                  </h3>
                  {(!weeklyPlan || isEditingPlan) && (
                    <button
                      onClick={requestAIPlan}
                      disabled={isGeneratingPlan}
                      className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center shadow-lg shadow-indigo-600/20"
                    >
                      {isGeneratingPlan ? <><Loader2 size={16} className="mr-2 animate-spin" /> {t('aiGenerating')}</> : weeklyPlan ? t('aiRegenerateBtn') : t('aiGenerateBtn')}
                    </button>
                  )}
                </div>

                {!apiKey && !weeklyPlan && (
                  <div className="bg-amber-50/30 border border-amber-200/50 rounded-xl p-4 mb-4 flex items-start shadow-inner">
                    <Key size={18} className="text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700">{t('aiNoKey')}</p>
                  </div>
                )}

                {weeklyPlan && !isEditingPlan && (
                  <div className="bg-slate-50/50 p-6 rounded-xl border border-sky-100/50 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="flex justify-between items-center mb-4 border-b border-slate-900/5 pb-3">
                      <h4 className="text-sm font-bold text-slate-600 flex items-center"><Brain size={16} className="mr-2 text-indigo-600" /> {t('aiConclusionTitle')}</h4>
                      <button
                        onClick={() => setIsEditingPlan(true)}
                        className="text-xs bg-white hover:bg-blue-50 text-slate-600 px-3 py-1.5 rounded-lg transition-colors border border-sky-100 flex items-center"
                      >
                        <RefreshCw size={12} className="mr-1" /> {t('aiTweakBtn')}
                      </button>
                    </div>

                    <div className="w-full text-sm text-slate-700 leading-relaxed font-normal space-y-4">
                      <ReactMarkdown
                        components={{
                          h3: ({ node, ...props }) => <h3 className="text-lg font-bold text-indigo-700 mt-8 mb-3 border-b-2 border-indigo-100 pb-2" {...props} />,
                          p: ({ node, ...props }) => <p className="mb-5 leading-loose text-slate-700" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-bold text-indigo-800 bg-indigo-50/80 px-1.5 py-0.5 rounded shadow-sm" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-5 space-y-2 text-slate-700" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-5 space-y-2 text-slate-700" {...props} />,
                          li: ({ node, ...props }) => <li className="pl-1" {...props} />
                        }}
                      >
                        {weeklyPlan.conclusion}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {(!weeklyPlan || isEditingPlan) && (
                  <div className="mb-6 mt-4 space-y-5 bg-slate-50/60 p-6 rounded-xl border border-sky-100 shadow-inner">
                    {isEditingPlan && (
                      <div className="bg-indigo-50/20 border border-indigo-200/30 rounded-lg p-3 mb-2 flex items-start">
                        <RefreshCw size={16} className="text-indigo-600 mr-2 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-indigo-700 leading-relaxed">
                          {t('aiEditingHint')}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiGoalLabel')}</label>
                      <input
                        type="text"
                        value={aiGoalInput}
                        onChange={(e) => setAiGoalInput(e.target.value)}
                        placeholder={t('aiGoalPlaceholder')}
                        className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiTimeLabel')}</label>
                      <input
                        type="number"
                        value={aiTimeInput}
                        onChange={(e) => setAiTimeInput(e.target.value)}
                        placeholder="30"
                        className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                    {!isEditingPlan && (
                      <div className="bg-sky-100/20 border border-sky-200/40 rounded-lg p-3">
                        <p className="text-xs text-sky-600 leading-relaxed flex items-start">
                          <span className="mr-1.5">💡</span>
                          {t('aiTip')}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">{t('aiMessageLabel')} {isEditingPlan ? <span className="text-indigo-600 text-xs ml-1">{t('aiMessageLabelEditing')}</span> : <span className="text-slate-500 text-xs ml-1">{t('aiMessageLabelOptional')}</span>}</label>
                      <textarea
                        value={aiMessageInput}
                        onChange={(e) => setAiMessageInput(e.target.value)}
                        placeholder={isEditingPlan ? t('aiMessagePlaceholderEditing') : t('aiMessagePlaceholder')}
                        className="w-full bg-white border border-sky-200 rounded-xl p-3 text-sm text-slate-700 placeholder-slate-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-24 shadow-sm"
                      />
                    </div>

                    {isEditingPlan && (
                      <div className="flex justify-end pt-2 border-t border-sky-100/50 space-x-3">
                        {backupPlan && (
                          <button
                            onClick={restoreBackupPlan}
                            className="text-sm bg-white hover:bg-blue-50 text-slate-600 px-4 py-2 rounded-xl transition-colors border border-sky-200"
                          >
                            {t('aiRestoreBtn')}
                          </button>
                        )}
                        <button
                          onClick={() => setIsEditingPlan(false)}
                          className="text-sm bg-transparent hover:bg-white text-slate-500 px-4 py-2 rounded-xl transition-colors"
                        >
                          {t('aiCancelBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!weeklyPlan && (
                  <p className="text-sm text-slate-500 leading-relaxed mt-4 text-center font-medium">
                    {t('aiReadyMsg')}
                  </p>
                )}
              </div>
            </div>
        )}

        {
          activeTab === 'exercises' && (
            !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('exercisesTitle')} /></div> :
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-sky-100">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <Dumbbell className="mr-2 text-indigo-600" size={20} /> 自訂動作庫
                  </h2>
                  <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                    新增你想練的動作，AI 會自動為其分類並標註發力技巧。排表時 AI 只會從「啟用」的動作中挑選。
                  </p>

                  <div className="flex space-x-2 mb-6">
                    <input
                      type="text"
                      value={newExName}
                      onChange={e => setNewExName(e.target.value)}
                      placeholder="輸入動作名稱 (例如：高腳杯深蹲)"
                      className="flex-1 bg-slate-50 border border-sky-200 rounded-xl px-4 py-2 text-slate-700 text-sm focus:outline-none focus:border-indigo-200"
                    />
                    <button
                      onClick={handleAddExercise}
                      disabled={isAddingEx || !newExName.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-blue-50 disabled:text-slate-500 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium flex items-center justify-center min-w-[5rem]"
                    >
                      {isAddingEx ? <Loader2 size={16} className="animate-spin" /> : '新增'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(exercisesData).filter(([_, ex]) => !ex.deleted).map(([key, ex]) => {
                      const isActive = ex.active !== false;
                      return (
                        <div key={key} className={`p-4 rounded-xl border transition-all flex items-start justify-between ${isActive ? 'bg-slate-50/50 border-sky-200' : 'bg-slate-50/20 border-slate-800 opacity-60'}`}>
                          <div className="flex-1 pr-4">
                            <div className="flex items-center">
                              <h4 className={`font-semibold text-sm ${isActive ? 'text-slate-700' : 'text-slate-500'}`}>{ex.name}</h4>
                              <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-blue-50 text-slate-600' : 'bg-green-900/30 text-sky-600/50'}`}>{ex.type}</span>
                            </div>
                            <p className={`text-xs mt-1 leading-relaxed ${isActive ? 'text-slate-500' : 'text-slate-600'}`}>{ex.tip}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2 mt-1 flex-shrink-0">
                            <button
                              onClick={() => toggleExerciseActive(key)}
                              className={`w-12 h-6 rounded-full relative transition-colors ${isActive ? 'bg-sky-500' : 'bg-blue-50'}`}
                            >
                              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                            </button>
                            <button
                              onClick={() => deleteExercise(key)}
                              className="text-red-400 hover:text-red-600 transition-colors p-1"
                              title={lang === 'zh' ? '刪除動作' : 'Delete Exercise'}
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
          )
        }

        {
          activeTab === 'metrics' && (
            !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('metricsTitle')} /></div> :
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-sky-100">
                  <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                    <Activity className="mr-2 text-sky-600" size={20} /> {t('metricsTitle')}
                  </h2>
                  <form onSubmit={saveMetrics} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelDate')}</label>
                        <input type="date" name="date" value={metricForm.date} onChange={handleMetricChange} className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" required />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelAge')}</label>
                        <input type="number" step="1" name="age" value={metricForm.age} onChange={handleMetricChange} placeholder={t('labelAgePlaceholder')} className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelHeight')}</label>
                        <input type="number" step="0.1" name="height" value={metricForm.height} onChange={handleMetricChange} placeholder="cm" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelWeight')}</label>
                        <input type="number" step="0.1" name="weight" value={metricForm.weight} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelBodyFat')}</label>
                        <input type="number" step="0.1" name="bodyFat" value={metricForm.bodyFat} onChange={handleMetricChange} placeholder="%" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t('labelBMR')}</label>
                        <input type="number" step="1" name="bmr" value={metricForm.bmr} onChange={handleMetricChange} placeholder="kcal" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                      </div>
                    </div>

                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-sky-600 mb-3 border-b border-emerald-900 pb-2">{t('labelMuscle')}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t('labelLArm')}</label>
                          <input type="number" step="0.1" name="muscleLarm" value={metricForm.muscleLarm} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t('labelRArm')}</label>
                          <input type="number" step="0.1" name="muscleRarm" value={metricForm.muscleRarm} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t('labelLLeg')}</label>
                          <input type="number" step="0.1" name="muscleLleg" value={metricForm.muscleLleg} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">{t('labelRLeg')}</label>
                          <input type="number" step="0.1" name="muscleRleg" value={metricForm.muscleRleg} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-500 mb-1">{t('labelTrunk')}</label>
                          <input type="number" step="0.1" name="muscleTrunk" value={metricForm.muscleTrunk} onChange={handleMetricChange} placeholder="kg" className="w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 text-slate-700 text-sm" />
                        </div>
                      </div>
                    </div>

                    <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 mt-4 rounded-xl transition-colors shadow-lg shadow-emerald-600/20">
                      {t('metricsSaveBtn')}
                    </button>
                  </form>
                </div>

                {metricsHistory.length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-sky-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                      <TrendingUp className="mr-2 text-sky-600" size={20} /> {t('metricsTrendTitle')}
                    </h2>
                    <div className="h-64 mb-8">
                      <h3 className="text-xs text-slate-500 mb-2 text-center">{t('metricsChartWeight')}</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metricsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(tick) => tick.slice(5)} />
                          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                          <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="weight" name={t('chartWeightName')} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line yAxisId="right" type="monotone" dataKey="bodyFat" name={t('chartBodyFatName')} stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-64">
                      <h3 className="text-xs text-slate-500 mb-2 text-center">{t('metricsChartMuscle')}</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metricsHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(tick) => tick.slice(5)} />
                          <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '10px' }} />
                          <Line type="monotone" dataKey="muscleRarm" name={t('chartRArm')} stroke="#ef4444" strokeWidth={2} />
                          <Line type="monotone" dataKey="muscleLarm" name={t('chartLArm')} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} />
                          <Line type="monotone" dataKey="muscleRleg" name={t('chartRLeg')} stroke="#10b981" strokeWidth={2} />
                          <Line type="monotone" dataKey="muscleLleg" name={t('chartLLeg')} stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
          )
        }

        {
          activeTab === 'history' && (
            !user ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><LoginPrompt title={t('monthlyTitle')} /></div> :
              stats && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">

                  {/* Highlight Stats Row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-sky-100 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                      <div className="absolute -top-4 -right-4 w-16 h-16 bg-blue-100/10 rounded-full blur-xl"></div>
                      <Flame size={24} className="text-orange-500 mb-2 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                      <div className="text-3xl font-black text-slate-800">{stats.totalActiveDays} <span className="text-sm font-medium text-slate-500">{t('historyDaysUnit')}</span></div>
                      <div className="text-xs text-slate-500 mt-1 font-medium">{t('historyActiveDays')}</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-sky-100 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                      <div className="absolute -top-4 -left-4 w-16 h-16 bg-sky-500/10 rounded-full blur-xl"></div>
                      <CheckCircle2 size={24} className="text-sky-600 mb-2 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                      <div className="text-3xl font-black text-slate-800">{stats.totalCompleted} <span className="text-sm font-medium text-slate-500">{t('historyCompletedUnit')}</span></div>
                      <div className="text-xs text-slate-500 mt-1 font-medium">{t('historyCompleted')}</div>
                    </div>
                  </div>

                  {/* Heatmap Section */}
                  <div className="bg-white p-6 rounded-2xl border border-sky-100 shadow-lg">
                    <h2 className="text-md font-bold text-slate-800 mb-4 flex items-center">
                      <Zap className="mr-2 text-yellow-400" size={18} /> {t('heatmapTitle')}
                    </h2>

                    {heatmapWeeks.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">{t('heatmapEmpty')}</p>
                    ) : (
                      <div className="overflow-x-auto pb-2">
                        <div className="flex space-x-1.5 min-w-max">
                          {heatmapWeeks.map(weekId => (
                            <div key={weekId} className="flex flex-col space-y-1.5">
                              {[1, 2, 3, 4, 5].map(dayIdx => {
                                const count = stats.dailyMap[`${weekId}-${dayIdx}`] || 0;
                                // Activity levels: 0 (bg-blue-50), 1-2 (emerald-900), 3-4 (emerald-600), 5+ (emerald-400)
                                let bgClass = "bg-blue-50/50";
                                if (count > 0 && count <= 2) bgClass = "bg-sky-100/60";
                                else if (count > 2 && count < 5) bgClass = "bg-sky-600";
                                else if (count >= 5) bgClass = "bg-sky-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]";

                                return (
                                  <div
                                    key={`${weekId}-${dayIdx}`}
                                    className={`w-4 h-4 rounded-sm ${bgClass} transition-colors`}
                                    title={`${weekId} ${t('heatmapTooltip')}${dayIdx}: ${count} ${t('heatmapActions')}`}
                                  ></div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center mt-3 text-[10px] text-slate-500 font-medium">
                          <span>{t('heatmapOldest')}</span>
                          <div className="flex items-center space-x-1">
                            <span className="mr-1">{t('heatmapLess')}</span>
                            <div className="w-3 h-3 rounded-sm bg-blue-50/50"></div>
                            <div className="w-3 h-3 rounded-sm bg-sky-100/60"></div>
                            <div className="w-3 h-3 rounded-sm bg-sky-600"></div>
                            <div className="w-3 h-3 rounded-sm bg-sky-400"></div>
                            <span className="ml-1">{t('heatmapMore')}</span>
                          </div>
                          <span>{t('heatmapNewest')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Radar/Bar Chart Alternative for Parts */}
                  <div className="bg-white p-6 rounded-2xl border border-sky-100 shadow-lg">
                    <h2 className="text-md font-bold text-slate-800 mb-4 flex items-center">
                      <Shield className="mr-2 text-indigo-600" size={18} /> {t('radarTitle')}
                    </h2>
                    <div className="space-y-3">
                      <div className="flex items-center text-sm">
                        <span className="w-16 text-slate-500 text-xs">{t('radarLower')}</span>
                        <div className="flex-1 h-3 bg-blue-50 rounded-full mx-3 overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (stats.typeStats.lower / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-slate-600 font-medium">{stats.typeStats.lower}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="w-16 text-slate-500 text-xs">{t('radarCore')}</span>
                        <div className="flex-1 h-3 bg-blue-50 rounded-full mx-3 overflow-hidden">
                          <div className="h-full bg-blue-100 rounded-full" style={{ width: `${Math.min(100, (stats.typeStats.core / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-slate-600 font-medium">{stats.typeStats.core}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="w-16 text-slate-500 text-xs">{t('radarUpper')}</span>
                        <div className="flex-1 h-3 bg-blue-50 rounded-full mx-3 overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.min(100, ((stats.typeStats.upper_push + stats.typeStats.upper_pull) / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-slate-600 font-medium">{stats.typeStats.upper_push + stats.typeStats.upper_pull}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="w-16 text-slate-500 text-xs">{t('radarMobility')}</span>
                        <div className="flex-1 h-3 bg-blue-50 rounded-full mx-3 overflow-hidden">
                          <div className="h-full bg-teal-400 rounded-full" style={{ width: `${Math.min(100, (stats.typeStats.mobility / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-slate-600 font-medium">{stats.typeStats.mobility}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="w-16 text-slate-500 text-xs">{t('radarPower')}</span>
                        <div className="flex-1 h-3 bg-blue-50 rounded-full mx-3 overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(100, ((stats.typeStats.power + stats.typeStats.full) / Math.max(1, stats.totalCompleted)) * 250)}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-slate-600 font-medium">{stats.typeStats.power + stats.typeStats.full}</span>
                      </div>
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-slate-800 mb-4 mt-8 flex items-center">
                    <CalendarDays className="mr-2 text-blue-600" size={20} /> {t('monthlyTitle')}
                  </h2>
                  {monthlyData.length === 0 ? (
                    <div className="text-center p-8 bg-white rounded-xl border border-sky-100"><p className="text-slate-500">{t('historyEmpty')}</p></div>
                  ) : (
                    monthlyData.map((data) => {
                      const targetForMonth = data.totalWeeks * TOTAL_WEEKLY_EXERCISES;
                      const monthPercent = Math.round((data.completed / targetForMonth) * 100);
                      return (
                        <div key={data.monthKey} className="bg-white p-5 rounded-2xl border border-sky-100 relative overflow-hidden mb-4">
                          <div className="absolute top-0 left-0 h-1 bg-sky-500/50" style={{ width: `${monthPercent}%` }}></div>
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-lg text-slate-800">{data.monthKey}</h3>
                            <div className="text-2xl font-black text-sky-600">{monthPercent}%</div>
                          </div>
                          <div className="flex items-center text-sm text-slate-500 mb-1"><CheckCircle2 size={16} className="mr-2 text-sky-600" /> {t('historyTotal')} <span className="text-slate-700 ml-2 font-medium">{data.completed} {t('historyActionsUnit')}</span></div>
                        </div>
                      );
                    })
                  )}
                </div>
              )
          )
        }

        {
          activeTab === 'settings' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              {!user && <div className="mb-6"><LoginPrompt title={t('settingsTitle')} /></div>}
              <div className="bg-white p-6 rounded-2xl border border-sky-100">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                  <Key className="mr-2 text-blue-600" size={20} /> {t('settingsTitle')}
                </h2>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                  {t('settingsDesc')}
                  <strong className="text-sky-600">{t('settingsDescStrong')}</strong>
                  {t('settingsDescEnd')}
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Gemini API Key</label>
                  <input
                    type="password"
                    value={tempKeyInput}
                    onChange={(e) => setTempKeyInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-50 border border-sky-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">{t('settingsModelTitle')}</label>
                  <select
                    value={selectedAiModel}
                    onChange={(e) => {
                      setSelectedAiModel(e.target.value);
                      localStorage.setItem('app_ai_model', e.target.value);
                    }}
                    className="w-full bg-slate-50 border border-sky-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  >
                    {availableModels.map(model => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col space-y-3 mt-4">
                  <button
                    onClick={saveKeyToLocal}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    {t('settingsSaveBtn')}
                  </button>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors font-medium text-sm"
                  >
                    <ExternalLink size={18} className="mr-2" />
                    {t('settingsGetKey')}
                  </a>
                </div>

                {apiKey && (
                  <div className="mt-4 p-3 bg-sky-100/20 border border-sky-200/50 rounded-lg flex items-start">
                    <CheckCircle2 size={16} className="text-sky-600 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-sky-600">{t('settingsKeyBound')}</p>
                  </div>
                )}
              </div>
            </div>
          )
        }
      </main >

      <nav className="fixed bottom-0 w-full mb-0 pb-0 left-0 bg-transparent pointer-events-none z-50">
        <div className="max-w-md mx-auto bg-white border-t border-sky-100 flex justify-between items-center px-2 py-3 pointer-events-auto pb-safe">
          <button onClick={() => setActiveTab('train')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'train' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <Feather size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navTrain')}</span>
          </button>
          <button onClick={() => setActiveTab('ai')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'ai' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <Brain size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navAI')}</span>
          </button>
          <button onClick={() => setActiveTab('exercises')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'exercises' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <Dumbbell size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navExercises')}</span>
          </button>
          <button onClick={() => setActiveTab('metrics')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'metrics' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <Activity size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navMetrics')}</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'history' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <BarChart3 size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navHistory')}</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center p-2 flex-1 transition-colors ${activeTab === 'settings' ? 'text-sky-600' : 'text-slate-500 hover:text-slate-600'}`}>
            <Settings size={20} className="mb-1" /> <span className="text-[10px] font-medium">{t('navSettings')}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}