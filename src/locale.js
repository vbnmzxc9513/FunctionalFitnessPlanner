import { exercisePhase } from './domain/phases.js';
import { catalogExercises } from './domain/exerciseCatalog.js';

// --- i18n Locale File ---
// All static UI strings for ZH (Traditional Chinese) and EN (English)

export const TRANSLATIONS = {
    zh: {
        // App Title
        appTitle: '羽球功能性健身管理',
        // Login
        loginSubtitle: '專為羽球愛好者打造。登入並設定你的 API 金鑰，讓專屬 AI 規劃體能訓練。',
        loginBtn: '使用 Google 帳號登入',
        // Intro
        introTitle: '專為羽球人打造的功能性訓練',
        introDesc: '不只是流汗，更是針對羽球發力與步伐的進化。讓 AI 教練為你量身打造科學化的每週訓練課表。',
        introStartBtn: '開始體驗',
        // Header subtitles
        headerAI: '與專業 AI 功能性教練溝通，為您量身打造並解說最佳每週訓練。',
        headerMetrics: '追蹤您的身體組成，包含四肢肌肉質量，精確掌握訓練成效與發力基礎。',
        headerExercises: '管理專屬動作庫，讓 AI 教練從中自由安排。',
        headerHistory: '持之以恆是功能性訓練的基石。檢視每個月的累積成果。',
        headerSettings: '系統設定與 BYOK 金鑰管理。',
        // Nav labels
        navTrain: '每天',
        navAI: '教練',
        navExercises: '動作庫',
        navMetrics: '數據',
        navHistory: '成效',
        navSettings: '設定',
        // Week labels
        weekLabel: '週次',
        weekCompletion: '本週完成率',
        difficultyLabel: '難度',
        // Train tab
        todaySchedule: '本日課表',
        editSchedule: '編輯課表',
        saveEdits: '儲存修改',
        cancelEdits: '取消',
        addExercise: '新增動作至今日...',
        coachAdvice: '教練的訓練叮嚀',
        feedbackTitle: '本週體感反饋',
        feedbackSubtitle: '這會立即改變你當前的組數要求，並作為 AI 下週為你更換動作的科學依據。',
        feedbackHard: '太困難',
        feedbackHardSub: '需降階',
        feedbackOk: '剛好',
        feedbackOkSub: '維持架構',
        feedbackEasy: '太簡單',
        feedbackEasySub: '需增量',
        // Day names
        dayNames: ['星期一', '星期二', '星期三', '星期四', '星期五'],
        dayShort: ['週一', '週二', '週三', '週四', '週五'],
        // AI tab
        aiCoachTitle: 'AI 專屬教練診斷室',
        aiGenerateBtn: '✨ 綜合分析並排表',
        aiRegenerateBtn: '🔄 重新生成課表',
        aiGenerating: '運算中...',
        aiNoKey: '偵測到尚未設定 API 金鑰，請先至「設定」綁定金鑰以解鎖 AI 診斷與排表功能。',
        aiConclusionTitle: '教練本週總結與診斷',
        aiTweakBtn: '微調與重抽',
        aiEditingHint: '覺得剛才排的課表方向不對嗎？你可以補充更多細節，並請教練重新規劃。如果有需要，你可以在生成後隨時透過「復原按鈕」換回上一份課表。',
        aiGoalLabel: '近期訓練寫實目標',
        aiGoalPlaceholder: '例如：想加強反手高遠球發力、想改善網前撲球速度...',
        aiTimeLabel: '每天最多騰出運動時間 (分鐘)',
        aiTip: '填寫目標後，AI 教練會結合分析您過去填寫的「身體組成數據趨勢」，診斷潛在問題，為您客製化精準排表，並詳細說明背後的依據。',
        aiMessageLabel: '另外想對教練說的話',
        aiMessageLabelEditing: '(強烈建議說明需要修改的原因)',
        aiMessageLabelOptional: '(選填)',
        aiMessagePlaceholderEditing: '例如：我覺得這次排的腿部動作太多了，幫我換成多一點核心！',
        aiMessagePlaceholder: '任何想補充的都可以寫在這裡，例如：這週特別累、膝蓋有點酸痛...',
        aiRestoreBtn: '↩ 復原上一次的課表',
        aiCancelBtn: '取消修改',
        aiReadyMsg: '完成設定後，點擊右上角按鈕，教練將全面為您分析數據與規畫課表。',
        // Exercises tab
        exercisesTitle: '自訂動作庫',
        exercisesSubtitle: '新增你想練的動作，AI 會自動為其分類並標註發力技巧。排表時 AI 只會從「啟用」的動作中挑選。',
        exercisesPlaceholder: '輸入動作名稱 (例如：高腳杯深蹲)',
        exercisesAddBtn: '新增',
        // Metrics tab
        metricsTitle: '新增/更新測量紀錄',
        metricsSaveBtn: '儲存紀錄',
        metricsTrendTitle: '身體數據趨勢',
        metricsChartWeight: '體重與體脂率',
        metricsChartMuscle: '四肢肌肉量',
        labelDate: '測量日期',
        labelAge: '年齡',
        labelAgePlaceholder: '歲',
        labelHeight: '身高 (cm)',
        labelWeight: '體重 (kg)',
        labelBodyFat: '體脂率 (%)',
        labelBMR: '基礎代謝 (kcal)',
        labelMuscle: '肌肉量分佈 (kg)',
        labelLArm: '左手',
        labelRArm: '右手 (持拍手)',
        labelLLeg: '左腳',
        labelRLeg: '右腳',
        labelTrunk: '軀幹 (核心)',
        chartWeightName: '體重 (kg)',
        chartBodyFatName: '體脂率 (%)',
        chartRArm: '右臂',
        chartLArm: '左臂',
        chartRLeg: '右腿',
        chartLLeg: '左腿',
        // History tab
        historyActiveDays: '總訓練天數',
        historyDaysUnit: '天',
        historyCompleted: '累積完成動作',
        historyCompletedUnit: '次',
        heatmapTitle: '訓練活躍網格',
        heatmapEmpty: '尚無足夠的訓練紀錄來產生網格',
        heatmapOldest: '最早紀錄',
        heatmapNewest: '最新一週',
        heatmapLess: '少',
        heatmapMore: '多',
        heatmapTooltip: '星期',
        heatmapActions: '個動作',
        radarTitle: '肌群鍛鍊雷達防護網',
        radarLower: '下肢力量',
        radarCore: '核心抗暴',
        radarUpper: '上肢推拉',
        radarMobility: '活動度',
        radarPower: '全身爆發',
        monthlyTitle: '各月完成狀況',
        historyEmpty: '尚無歷史紀錄。',
        historyTotal: '總計完成',
        historyActionsUnit: '個動作',
        // Settings tab
        settingsTitle: 'AI 教練金鑰綁定 (BYOK)',
        settingsDesc: '為了保障你的雲端資源安全，本系統採用 Bring Your Own Key 模式。請輸入你個人的 Gemini API Key，該金鑰將',
        settingsDescStrong: '僅儲存於你當前的瀏覽器中 (LocalStorage)',
        settingsDescEnd: '，不會上傳至任何雲端資料庫。',
        settingsSaveBtn: '儲存金鑰',
        settingsGetKey: '前往 Google AI Studio 申請金鑰',
        settingsKeyBound: '本機已成功綁定金鑰，你可以隨時前往「今日課表」啟動 AI 排表功能。',
        // Toast messages
        toastLoginFail: '登入失敗，請確認彈出視窗未被阻擋。',
        toastKeySaved: '金鑰已安全儲存於本地瀏覽器！',
        toastNoKey: '請先至設定頁面輸入您的 Gemini API Key！',
        toastAISuccess: 'AI 教練排表成功！',
        toastAIError: 'AI 安排課表時發生錯誤，請稍後再試。',
        toastKeyInvalid: 'API 金鑰無效，請至設定頁面重新確認。',
        toastMetricSaved: '身體數據已成功儲存！',
        toastMetricFail: '儲存失敗，請重試。',
        toastFeedback: '已記錄體感反饋，將作為下週排表依據。',
        toastExerciseAdded: '動作新增成功！',
        toastExerciseFail: '新增失敗，請確認 API Key。',
        toastNoKeyExercise: '請先至設定頁面綁定 API Key',
        toastRestored: '已還原上一次的課表！',
        toastRestoreFail: '還原失敗，請重試。',
        // Difficulty labels
        diffLow: '減壓恢復期 (低)',
        diffMid: '功能性建構期 (中)',
        diffHigh: '神經適應期 (高)',
        // Language toggle
        langToggle: 'English',
        // Model Selection
        settingsModelTitle: 'AI 模型選擇',
        settingsModelFlash: 'Gemini 2.5 Flash (快速 / 標準)',
        settingsModelPro: 'Gemini 2.5 Pro (進階 / 智慧)',
        settingsModel3Pro: 'Gemini 3.0 Pro (實驗 / 進階)',
    },
    en: {
        // App Title
        appTitle: 'Badminton Functional Fitness',
        // Login
        loginSubtitle: 'Built for badminton players. Sign in and set your API key to let AI plan your fitness training.',
        loginBtn: 'Sign in with Google',
        // Intro
        introTitle: 'Functional Training for Badminton',
        introDesc: 'Not just sweating, but evolving your badminton power and footwork. Let the AI coach customize a scientific weekly training plan for you.',
        introStartBtn: 'Get Started',
        // Header subtitles
        headerAI: 'Chat with your professional AI functional coach to get a customized weekly training plan.',
        headerMetrics: 'Track your body composition, including limb muscle mass, to monitor your training effectiveness.',
        headerExercises: 'Manage your exercise library for the AI coach to select from.',
        headerHistory: 'Consistency is the cornerstone of functional training. Review your monthly progress.',
        headerSettings: 'System settings and BYOK key management.',
        // Nav labels
        navTrain: 'Daily',
        navAI: 'Coach',
        navExercises: 'Library',
        navMetrics: 'Metrics',
        navHistory: 'History',
        navSettings: 'Settings',
        // Week labels
        weekLabel: 'Week',
        weekCompletion: 'Weekly Completion',
        difficultyLabel: 'Level',
        // Train tab
        todaySchedule: "Today's Workout",
        editSchedule: 'Edit Schedule',
        saveEdits: 'Save Edits',
        cancelEdits: 'Cancel',
        addExercise: 'Add exercise to today...',
        coachAdvice: "Coach's Training Tips",
        feedbackTitle: 'Weekly Difficulty Feedback',
        feedbackSubtitle: 'This immediately adjusts your current sets/reps and will inform next week\'s AI plan.',
        feedbackHard: 'Too Hard',
        feedbackHardSub: 'Reduce load',
        feedbackOk: 'Just Right',
        feedbackOkSub: 'Keep structure',
        feedbackEasy: 'Too Easy',
        feedbackEasySub: 'Increase load',
        // Day names
        dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        dayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        // AI tab
        aiCoachTitle: 'AI Coach Diagnostic Room',
        aiGenerateBtn: '✨ Analyze & Generate Plan',
        aiRegenerateBtn: '🔄 Regenerate Plan',
        aiGenerating: 'Processing...',
        aiNoKey: 'No API key detected. Please go to Settings and bind your key to unlock AI coaching features.',
        aiConclusionTitle: "Coach's Weekly Summary & Diagnosis",
        aiTweakBtn: 'Tweak & Regenerate',
        aiEditingHint: "Feel the plan direction is off? Add more details and ask the coach to re-plan. You can always restore the previous plan via the undo button after generating.",
        aiGoalLabel: 'Recent Training Goal',
        aiGoalPlaceholder: 'e.g., Improve backhand clear power, enhance net drop shot speed...',
        aiTimeLabel: 'Max daily workout time (minutes)',
        aiTip: 'After filling in your goal, the AI coach will analyze your body composition trend, diagnose potential issues, and create a precise plan with detailed reasoning.',
        aiMessageLabel: 'Anything else to tell the coach',
        aiMessageLabelEditing: '(Highly recommended: explain why you want changes)',
        aiMessageLabelOptional: '(Optional)',
        aiMessagePlaceholderEditing: 'e.g., The last plan had too many leg exercises, please add more core!',
        aiMessagePlaceholder: 'Any additional info, e.g., feeling extra tired this week, slightly sore knees...',
        aiRestoreBtn: '↩ Restore Previous Plan',
        aiCancelBtn: 'Cancel',
        aiReadyMsg: 'Once set up, click the button above and the coach will comprehensively analyze your data and create a plan.',
        // Exercises tab
        exercisesTitle: 'Custom Exercise Library',
        exercisesSubtitle: 'Add exercises you want to train. AI will automatically categorize them and note coaching tips. Only "enabled" exercises will be selected during planning.',
        exercisesPlaceholder: 'Enter exercise name (e.g., Goblet Squat)',
        exercisesAddBtn: 'Add',
        // Metrics tab
        metricsTitle: 'Add/Update Measurement',
        metricsSaveBtn: 'Save Record',
        metricsTrendTitle: 'Body Data Trends',
        metricsChartWeight: 'Weight & Body Fat',
        metricsChartMuscle: 'Limb Muscle Mass',
        labelDate: 'Measurement Date',
        labelAge: 'Age',
        labelAgePlaceholder: 'yrs',
        labelHeight: 'Height (cm)',
        labelWeight: 'Weight (kg)',
        labelBodyFat: 'Body Fat (%)',
        labelBMR: 'BMR (kcal)',
        labelMuscle: 'Muscle Distribution (kg)',
        labelLArm: 'Left Arm',
        labelRArm: 'Right Arm (Racket Hand)',
        labelLLeg: 'Left Leg',
        labelRLeg: 'Right Leg',
        labelTrunk: 'Trunk (Core)',
        chartWeightName: 'Weight (kg)',
        chartBodyFatName: 'Body Fat (%)',
        chartRArm: 'R.Arm',
        chartLArm: 'L.Arm',
        chartRLeg: 'R.Leg',
        chartLLeg: 'L.Leg',
        // History tab
        historyActiveDays: 'Total Training Days',
        historyDaysUnit: 'days',
        historyCompleted: 'Total Exercises Done',
        historyCompletedUnit: 'reps',
        heatmapTitle: 'Training Activity Grid',
        heatmapEmpty: 'Not enough training records to generate the grid yet.',
        heatmapOldest: 'Oldest',
        heatmapNewest: 'Latest Week',
        heatmapLess: 'Less',
        heatmapMore: 'More',
        heatmapTooltip: 'Day',
        heatmapActions: 'exercises',
        radarTitle: 'Muscle Group Training Radar',
        radarLower: 'Lower Body',
        radarCore: 'Core Anti-Rotation',
        radarUpper: 'Upper Push/Pull',
        radarMobility: 'Mobility',
        radarPower: 'Full-Body Power',
        monthlyTitle: 'Monthly Performance',
        historyEmpty: 'No history records yet.',
        historyTotal: 'Total completed:',
        historyActionsUnit: 'exercises',
        // Settings tab
        settingsTitle: 'AI Coach Key Binding (BYOK)',
        settingsDesc: 'To protect your cloud resources, this system uses Bring Your Own Key mode. Enter your personal Gemini API Key. The key will be',
        settingsDescStrong: 'stored only in your current browser (LocalStorage)',
        settingsDescEnd: ' and will never be uploaded to any cloud database.',
        settingsSaveBtn: 'Save Key',
        settingsGetKey: 'Get key from Google AI Studio',
        settingsKeyBound: 'Key successfully bound locally. You can activate AI planning from the Daily tab anytime.',
        // Toast messages
        toastLoginFail: 'Login failed. Please ensure the popup window is not blocked.',
        toastKeySaved: 'Key securely saved to local browser!',
        toastNoKey: 'Please go to Settings and enter your Gemini API Key first!',
        toastAISuccess: 'AI Coach plan generated successfully!',
        toastAIError: 'An error occurred while generating the AI plan. Please try again.',
        toastKeyInvalid: 'Invalid API key. Please check your key in Settings.',
        toastMetricSaved: 'Body metrics saved successfully!',
        toastMetricFail: 'Save failed. Please try again.',
        toastFeedback: 'Feedback recorded. This will inform next week\'s plan.',
        toastExerciseAdded: 'Exercise added successfully!',
        toastExerciseFail: 'Failed to add exercise. Please check your API Key.',
        toastNoKeyExercise: 'Please bind your API Key in Settings first.',
        toastRestored: 'Previous plan restored successfully!',
        toastRestoreFail: 'Restore failed. Please try again.',
        // Difficulty labels
        diffLow: 'Recovery Phase (Low)',
        diffMid: 'Build Phase (Medium)',
        diffHigh: 'Neural Adaptation (High)',
        // Language toggle
        langToggle: '中文',
        // Model Selection
        settingsModelTitle: 'AI Model Selection',
        settingsModelFlash: 'Gemini 2.5 Flash (Fast / Standard)',
        settingsModelPro: 'Gemini 2.5 Pro (Advanced / Smart)',
        settingsModel3Pro: 'Gemini 3.0 Pro (Experimental / Premium)',
    }
};

// Bilingual exercise pool
export const EXERCISES_I18N = {
    zh: {
        stretch_10m: { name: '10分鐘大腿小腿拉筋伸展', type: 'mobility', tip: '專注於呼吸，每個動作停留至少30秒，感受肌肉與筋膜延展。' },
        bulgarian: { name: '保佳利亞蹲', type: 'lower', tip: '前腳全腳掌踩穩，後腳背輕放，下蹲時保持軀幹直立，感受臀大肌發力。' },
        bear_crawl: { name: '熊爬式', type: 'core', tip: '膝蓋微浮離地，核心收緊，對側手腳同步小步移動，背部保持水平。' },
        dead_bug: { name: '死蟲式', type: 'core', tip: '下背部緊貼地面，四肢延伸時核心絕對不可放鬆或拱腰。' },
        plank_row: { name: '平板啞鈴划船', type: 'upper_pull', tip: '雙腳微張保持骨盆穩定，手肘貼緊軀幹向後拉，極力避免身體翻轉。' },
        thoracic: { name: '胸椎靈活性動作', type: 'mobility', tip: '動作放慢，配合吐氣加深旋轉或下壓幅度，避免下背代償。' },
        pull_up: { name: '引體向上', type: 'upper_pull', tip: '肩胛先下沉收緊，胸口迎向單槓，控制下放速度以建立離心力量。' },
        single_dl: { name: '單腿硬拉', type: 'lower', tip: '支撐腳微彎，髖部向後推，背部打直，感受腿後側張力。' },
        shoulder_press: { name: '肩推', type: 'upper_push', tip: '核心收緊避免過度挺腰，啞鈴推至頭頂正上方，穩定肩關節。' },
        one_arm_plank: { name: '平板稱體 (單手)', type: 'core', tip: '雙腳張開增加底面積，肩膀主動推地，核心出力對抗身體旋轉。' },
        farmer_walk: { name: '農夫行走', type: 'full', tip: '挺胸收腹，視線直視前方，步伐穩健不搖晃，考驗核心抗側屈。' },
        lunge_press: { name: '弓步單側啞鈴上推', type: 'power', tip: '後腳蹬地發力，力量順暢傳導至手部上推，動作需具備爆發與連貫性。' },
        weighted_lunge: { name: '單側負重前弓步蹲', type: 'lower', tip: '保持軀幹抗側屈，下蹲時前腳膝蓋與腳尖同向，強化煞車控制。' },
        finger_pushup: { name: '手指俯臥撐', type: 'upper_push', tip: '十指張開微曲撐地，核心繃緊，動作需極度控制以保護指關節。' },
        squat_jump: { name: '啞鈴快速蹲跳', type: 'power', tip: '落地時保持柔軟緩衝，下肢發力要迅速，強化肌肉彈性與收縮速率。' }
    },
    en: {
        stretch_10m: { name: '10-min Leg & Calf Stretch', type: 'mobility', tip: 'Focus on breathing; hold each position for at least 30 seconds to feel the muscle and fascia lengthen.' },
        bulgarian: { name: 'Bulgarian Split Squat', type: 'lower', tip: 'Plant the front foot firmly, rest the rear foot lightly, keep torso upright while squatting, feel the glutes fire.' },
        bear_crawl: { name: 'Bear Crawl', type: 'core', tip: 'Hover knees slightly off ground, brace core, move opposite hand and foot in small steps, keep back flat.' },
        dead_bug: { name: 'Dead Bug', type: 'core', tip: 'Press lower back firmly into floor; never let your core release or back arch when extending limbs.' },
        plank_row: { name: 'Plank Dumbbell Row', type: 'upper_pull', tip: 'Feet slightly wide to stabilize hips, elbow tight along torso, avoid rotating the body.' },
        thoracic: { name: 'Thoracic Spine Mobility', type: 'mobility', tip: 'Slow down the movement; exhale to deepen rotation or extension range, prevent lower back compensation.' },
        pull_up: { name: 'Pull-Up', type: 'upper_pull', tip: 'Depress and retract scapula first, drive chest toward bar, control the descent to build eccentric strength.' },
        single_dl: { name: 'Single-Leg Deadlift', type: 'lower', tip: 'Slightly bend the standing knee, hinge hips back, keep spine neutral, feel the hamstring tension.' },
        shoulder_press: { name: 'Shoulder Press', type: 'upper_push', tip: 'Brace core to avoid excessive lumbar extension, press dumbbell directly overhead, stabilize the shoulder.' },
        one_arm_plank: { name: 'Single-Arm Plank', type: 'core', tip: 'Widen feet for a bigger base, actively push ground with shoulder, core fights body rotation.' },
        farmer_walk: { name: 'Farmer Carry', type: 'full', tip: 'Chest up, eyes forward, steady stride without swaying, tests anti-lateral flexion core strength.' },
        lunge_press: { name: 'Lunge with Single-Arm Press', type: 'power', tip: 'Drive off the rear foot, transfer power smoothly to the pressing arm, the movement must be explosive and fluid.' },
        weighted_lunge: { name: 'Weighted Lateral Lunge', type: 'lower', tip: 'Maintain anti-lateral trunk, align front knee with toes on descent, reinforce braking control.' },
        finger_pushup: { name: 'Fingertip Push-Up', type: 'upper_push', tip: 'Spread and slightly curl fingers, brace core, extremely controlled movement to protect finger joints.' },
        squat_jump: { name: 'Dumbbell Squat Jump', type: 'power', tip: 'Land softly with cushioned knees, explode quickly on the push, strengthen muscle elasticity and contraction rate.' }
    }
};

const legacyEquipment = {
  stretch_10m: [[]], thoracic: [[]], bear_crawl: [[]], plank_row: [['dumbbell']],
  pull_up: [['pullup_bar']], single_dl: [['dumbbell']], shoulder_press: [['dumbbell']],
  one_arm_plank: [[]], farmer_walk: [['dumbbell']], lunge_press: [['dumbbell']],
  weighted_lunge: [['dumbbell']], finger_pushup: [[]], squat_jump: [['dumbbell']],
};
const legacyDoses = {
  stretch_10m: [1, '5', 'minutes', 0, false], thoracic: [1, '5', 'minutes', 0, false],
  bear_crawl: [2, '15', 'seconds', 60, false], plank_row: [2, '8', 'reps', 90, true],
  pull_up: [2, '6', 'reps', 90, false], single_dl: [2, '8', 'reps', 90, true],
  shoulder_press: [2, '8', 'reps', 90, false], one_arm_plank: [1, '15', 'seconds', 60, true],
  farmer_walk: [2, '20', 'seconds', 60, false], lunge_press: [2, '5', 'reps', 90, true],
  weighted_lunge: [2, '6', 'reps', 90, true], finger_pushup: [2, '5', 'reps', 90, false],
  squat_jump: [2, '3', 'reps', 90, false],
};
for (const lang of ['zh', 'en']) {
  for (const [id, exercise] of Object.entries(EXERCISES_I18N[lang])) Object.assign(exercise, {
    active: false, equipmentOptions: legacyEquipment[id] || [[]],
    ...(legacyDoses[id] ? { prescription: Object.fromEntries(['sets', 'value', 'unit', 'restSeconds', 'perSide'].map((key, index) => [key, legacyDoses[id][index]])) } : {}),
    jumpContacts: id === 'squat_jump' ? 1 : 0,
    shoulderLoaded: id !== 'stretch_10m', advanced: ['finger_pushup', 'squat_jump', 'lunge_press', 'one_arm_plank'].includes(id),
  });
}

// Keep legacy IDs readable for saved plans; add the curated catalog to both languages.
for (const lang of ['zh', 'en']) {
  Object.assign(EXERCISES_I18N[lang], catalogExercises(lang));
}

// Bilingual default weekly schedule
export const LEGACY_DEFAULT_SCHEDULE_I18N = {
    zh: [
        { day: 1, name: '星期一', theme: '單邊穩定與網前急停', concept: '【羽球連結：上網撲球與防守步伐】\n原理：透過單腳支撐與髖關節鉸鏈的訓練，強化大腿後側與臀部煞車能力，讓你在網前迅速急停而不失去平衡。', routine: ['thoracic', 'single_dl', 'bulgarian', 'weighted_lunge', 'stretch_10m'], coachAdvice: '今天是本週的開始，針對下肢的急停煞車會讓你的大腿前側與臀部較有感。明天會進行上半身的抗旋轉訓練，因此今天最後的伸展請務必確實放鬆下半身，避免明天的發力受到代償影響。' },
        { day: 2, name: '星期二', theme: '核心抗旋轉與殺球力量傳導', concept: '【羽球連結：躍起殺球與平抽擋】\n原理：殺球的力量來自於軀幹抗旋轉後的反作用力。此模組強化背部與胸肩力量，讓你在擊球瞬間維持強大的空中核心剛性。', routine: ['dead_bug', 'pull_up', 'plank_row', 'shoulder_press', 'finger_pushup'], coachAdvice: '昨天的大量下肢訓練可能會讓你今天覺得腿部痠痛，因此今天的重點會轉移到上半身與核心。請注意在做平板划船等抗旋轉動作時，不要利用腿部的搖晃來代償。明天是動態恢復日，今天可以盡情發揮上半身的力量！' },
        { day: 3, name: '星期三', theme: '動態恢復與關節活動度', concept: '【羽球連結：救球延展與降低受傷率】\n原理：羽球中常有極端角度的救球動作（如大跨步救球）。主動恢復與胸椎、髖關節活動度能增加救球的安全範圍。', routine: ['thoracic', 'bear_crawl', 'dead_bug', 'stretch_10m'], coachAdvice: '經過前兩天的高強度訓練，你的肌肉現在應該處於輕微疲勞緊繃狀態。今天的目的是疏通筋骨、增加關節活動度。明天會加入不對稱負重的挑戰，所以今天好好把脊椎與髖部打開，為明天的核心耐力戰做好準備。' },
        { day: 4, name: '星期四', theme: '側向轉換與前臂抓握耐力', concept: '【羽球連結：被動防守與反手發力】\n原理：挑戰不對稱負重，全面提升核心抗側屈。前臂抓握力的增強有助於長時間比賽中反手握拍與快速抽擋的穩定度。', routine: ['thoracic', 'one_arm_plank', 'plank_row', 'farmer_walk'], coachAdvice: '昨天關節活動度增加後，今天你的身體應該更靈活了。農夫行走等抓握訓練會讓你的前臂很脹，請在訓練後多按摩前臂。明天是本週最後的爆發力考驗，今天務必保留下肢的神經彈性。' },
        { day: 5, name: '星期五', theme: '下肢爆發力與動力鏈整合', concept: '【羽球連結：起跳殺球與快速敏捷連動】\n原理：將穩定度轉化為力量傳導。透過增強式跳躍與連貫性發力，訓練肌肉的快速收縮，提升場上啟動的第一步速度。', routine: ['bear_crawl', 'squat_jump', 'lunge_press', 'farmer_walk', 'stretch_10m'], coachAdvice: '撐過前面的訓練，今天是收割爆發力的時刻！由於昨天前臂與側腹部有受到刺激，今天在做弓步上推時要把核心鎖得更緊。週末好好的休息，為下週的訓練儲備能量！' }
    ],
    en: [
        { day: 1, name: 'Monday', theme: 'Unilateral Stability & Net Stop', concept: '[Badminton Link: Net Rush & Defensive Footwork]\nPrinciple: Single-leg support and hip-hinge training strengthen the hamstrings and glutes braking ability, enabling quick stops at the net without losing balance.', routine: ['thoracic', 'single_dl', 'bulgarian', 'weighted_lunge', 'stretch_10m'], coachAdvice: 'Today kicks off the week. Lower-body braking work will challenge your quads and glutes. Tomorrow shifts to upper-body anti-rotation, so make sure to fully stretch the lower body today to prevent compensation.' },
        { day: 2, name: 'Tuesday', theme: 'Core Anti-Rotation & Smash Power', concept: '[Badminton Link: Jump Smash & Drive Exchange]\nPrinciple: Smash power comes from the reaction force of trunk anti-rotation. This module strengthens the back and shoulders to maintain strong mid-air core stiffness at the moment of impact.', routine: ['dead_bug', 'pull_up', 'plank_row', 'shoulder_press', 'finger_pushup'], coachAdvice: "Yesterday's lower-body work may leave your legs sore today, so the focus shifts to upper body and core. Be careful not to compensate with leg swaying during anti-rotation movements like plank rows. Tomorrow is active recovery — go all out on upper body today!" },
        { day: 3, name: 'Wednesday', theme: 'Active Recovery & Joint Mobility', concept: '[Badminton Link: Defensive Reach & Injury Prevention]\nPrinciple: Badminton often involves extreme-range defensive movements (e.g., lunging to retrieve). Active recovery and thoracic/hip mobility expand the safe range for retrieval.', routine: ['thoracic', 'bear_crawl', 'dead_bug', 'stretch_10m'], coachAdvice: "After two intense days, your muscles should be in mild fatigue. Today's goal is to loosen up and improve joint mobility. Tomorrow adds asymmetric loading — open up your spine and hips today to prepare for tomorrow's core endurance challenge." },
        { day: 4, name: 'Thursday', theme: 'Lateral Transition & Grip Endurance', concept: '[Badminton Link: Passive Defense & Backhand Power]\nPrinciple: Asymmetric loading challenges full anti-lateral flexion. Increased forearm grip strength supports backhand grip and rapid drives during long matches.', routine: ['thoracic', 'one_arm_plank', 'plank_row', 'farmer_walk'], coachAdvice: "More flexible today after yesterday's mobility work. Farmer carries will pump up your forearms — massage them after training. Tomorrow is the week's final power test, so preserve your lower-body neural elasticity today." },
        { day: 5, name: 'Friday', theme: 'Lower-Body Explosion & Power Chain', concept: '[Badminton Link: Jump Smash & Agile Reaction]\nPrinciple: Converting stability into force transmission. Plyometric jumps and fluid power trains fast-twitch muscles to improve your first-step acceleration on court.', routine: ['bear_crawl', 'squat_jump', 'lunge_press', 'farmer_walk', 'stretch_10m'], coachAdvice: "You made it through the week — today is harvest time for power! Your forearms and obliques were stimulated yesterday, so lock your core even tighter on lunge press. Rest well this weekend and recharge for next week!" }
    ]
};

// Shared controls and data-operation messages used by both responsive layouts.
Object.assign(TRANSLATIONS.zh, {
    login: '登入', logout: '登出', guest: '訪客', guestPreview: '免註冊，進入訪客模式', upgradeGuest: '綁定 Google 並保留紀錄', navigation: '主選單',
    removeExercise: '移除動作', restDay: '今天沒有安排動作，可休息或新增動作。', manualPlan: '使用者自訂課表',
    toastRequireLogin: '請先登入或使用訪客模式。', toastSaveFail: '操作失敗，請重試。', toastPlanSaved: '課表已儲存，完成紀錄已保留。',
    planChanged: '課表已在其他裝置更新，請取消編輯後重新開啟。', invalidMetrics: '請填寫有效日期及至少一個範圍內的測量值。',
    confirmDeleteExercise: '確定刪除此動作？既有課表及訓練歷史仍會保留。', toastExerciseDeleted: '動作已刪除。',
    noActiveExercises: '請先在動作庫啟用至少一個動作。', finishEditing: '請先儲存或取消目前的課表編輯。', dataLoadFailed: '無法載入雲端資料，請確認網路後重新載入。',
    metricsUpdateHint: '選擇日期可載入既有紀錄。儲存時空白欄位會保留原值。', loadMore: '載入更早紀錄',
    historyScope: '統計目前已載入的紀錄；有更早資料時可繼續載入。新紀錄的活躍網格使用實際完成日期，舊紀錄使用課表日期。月完成率依課表日期及當週實際動作數計算。',
    allDayNames: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    setsUnit: '組', minutes: '分鐘', seconds: '秒', reps: '下',
    type_mobility: '活動度', type_lower: '下肢肌力', type_core: '核心穩定', type_upper_pull: '上肢拉', type_upper_push: '上肢推', type_full: '全身複合', type_power: '爆發力',
    clearKey: '清除本機金鑰', keyCleared: '本機金鑰已清除。', storageUnavailable: '瀏覽器無法儲存設定，請確認儲存權限。',
    dataSharingNotice: '金鑰屬於此瀏覽器，登出後仍會保留，可在此清除。排課時會把已載入的身體數據、訓練歷史及輸入訊息傳給 Google Gemini。',
    migrationPending: '訪客紀錄尚未全部匯入 Google 帳號，請重試；現有帳號資料會優先保留。', migrationFailed: '已登入，但訪客紀錄匯入中斷，可點選重試繼續。', retry: '重試匯入',
    radarTitle: '肌群訓練分佈', settingsKeyBound: '本機已綁定金鑰，可前往「教練」排課。', toastKeySaved: '金鑰已儲存於本機瀏覽器。',
});
Object.assign(TRANSLATIONS.en, {
    login: 'Login', logout: 'Logout', guest: 'Guest', guestPreview: 'Continue as guest', upgradeGuest: 'Link Google and keep records', navigation: 'Main navigation',
    removeExercise: 'Remove exercise', restDay: 'No exercises scheduled. Rest or add an exercise.', manualPlan: 'Custom training plan',
    toastRequireLogin: 'Please sign in or continue as a guest.', toastSaveFail: 'Operation failed. Please try again.', toastPlanSaved: 'Schedule saved. Training records were preserved.',
    planChanged: 'The plan changed on another device. Cancel editing and reopen it.', invalidMetrics: 'Enter a valid date and at least one measurement within the allowed range.',
    confirmDeleteExercise: 'Delete this exercise? Existing plans and training history will be preserved.', toastExerciseDeleted: 'Exercise deleted.',
    noActiveExercises: 'Enable at least one exercise in the library first.', finishEditing: 'Save or cancel the current schedule edit first.', dataLoadFailed: 'Cloud data could not be loaded. Check your connection and reload.',
    metricsUpdateHint: 'Select a date to load an existing record. Blank fields preserve previous values when saving.', loadMore: 'Load older records',
    historyScope: 'Statistics cover loaded records; load more when older data is available. New activity uses actual completion dates; legacy records use scheduled dates. Monthly completion uses scheduled dates and actual weekly exercise counts.',
    allDayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    setsUnit: 'sets', minutes: 'min', seconds: 'sec', reps: 'reps',
    type_mobility: 'Mobility', type_lower: 'Lower body', type_core: 'Core', type_upper_pull: 'Upper pull', type_upper_push: 'Upper push', type_full: 'Full body', type_power: 'Power',
    clearKey: 'Clear local key', keyCleared: 'Local key cleared.', storageUnavailable: 'Browser storage is unavailable. Check your storage permissions.',
    dataSharingNotice: 'The key belongs to this browser and remains after logout; you can clear it here. Planning sends loaded body metrics, training history and your messages to Google Gemini.',
    migrationPending: 'Some guest records still need importing. Retry to continue; existing account records take precedence.', migrationFailed: 'Signed in, but guest import was interrupted. Retry to continue.', retry: 'Retry import',
    radarTitle: 'Muscle group distribution', settingsKeyBound: 'Key saved locally. Open Coach to generate a plan.', toastKeySaved: 'Key saved in this browser.',
});

// General bodyweight example; clinical and court-day planning uses Coach inputs.
export const DEFAULT_SCHEDULE_I18N = Object.fromEntries(['zh', 'en'].map(lang => [lang, [
  { day: 1, name: TRANSLATIONS[lang].dayNames[0], theme: lang === 'zh' ? '基本腿力與單腳支撐' : 'Leg strength and single-leg support', concept: lang === 'zh' ? '分腿支撐與髖伸展提供弓步到位、煞車及回位的基礎。先用徒手，維持動作品質。' : 'Build lunge support and hip extension for controlled braking and recovery. Start with bodyweight.', routine: ['bf_A01', 'bf_B01', 'bf_B06', 'bf_B07', 'bf_D09'], coachAdvice: lang === 'zh' ? '健康成人的徒手範例。若明天有激烈球局、今天有症狀或仍在醫囑休息期，縮短或改恢復；到教練頁輸入球日與限制再排個人課表。' : 'A bodyweight example for healthy adults. Reduce or rest before hard court sessions, with symptoms or under treatment restrictions; use Coach for a personal plan.' },
  { day: 2, name: TRANSLATIONS[lang].dayNames[1], theme: lang === 'zh' ? '輕活動與恢復' : 'Light movement and recovery', concept: lang === 'zh' ? '踝髖活動與自然呼吸保留活動習慣；不以疲勞作為效果指標。' : 'Gentle ankle and hip movement with breathing maintains an easy routine.', routine: ['bf_A02', 'bf_H03', 'bf_D09'], coachAdvice: lang === 'zh' ? '可縮成 5–10 分鐘。觀察睡眠、腿部清爽與昨日反應，狀態差時休息也符合計畫。' : 'Keep this to 5–10 minutes if needed. Check sleep, leg freshness and yesterday’s response; rest when appropriate.' },
  { day: 3, name: TRANSLATIONS[lang].dayNames[2], theme: lang === 'zh' ? '到位、急停與回中' : 'Positioning, braking and return', concept: lang === 'zh' ? '短步伐練習重點是順序、煞車與回中；預設方向練步序，有對手線索才涉及判讀。' : 'Short trials develop step order, braking and return. Predetermined directions train movement; opponent cues add decision-making.', routine: ['bf_A01', 'bf_A02', 'bf_F01', 'bf_F02', 'bf_F03', 'bf_D09'], coachAdvice: lang === 'zh' ? '低至中速、每次重置，不加揮拍。若腿重就減次數；不把短協調做成疲勞間歇。' : 'Use controlled speed, reset each trial and omit racket swings. Reduce trials when tired.' },
  { day: 4, name: TRANSLATIONS[lang].dayNames[3], theme: lang === 'zh' ? '側向支撐與髖控制' : 'Lateral support and hip control', concept: lang === 'zh' ? '側弓步、扶物髖鉸鏈與屈膝提踵，建立側移和單腳支撐能力。' : 'Lateral lunges, supported hinges and bent-knee calf raises develop lateral and single-leg control.', routine: ['bf_A01', 'bf_A02', 'bf_B02', 'bf_B05', 'bf_B08', 'bf_D09'], coachAdvice: lang === 'zh' ? '與週一保留間隔；若今天或明天有高強度球局，少做一組或改恢復。不要為完成次數犧牲平衡。' : 'Keep spacing from Monday. Reduce a set or recover around hard court days; preserve balance.' },
  { day: 5, name: TRANSLATIONS[lang].dayNames[4], theme: lang === 'zh' ? '恢復與週末準備' : 'Recovery and weekend preparation', concept: lang === 'zh' ? '以輕活動與舒適拉伸為主，依週末球量調整，保留恢復空間。' : 'Use gentle mobility and comfortable stretching, adjusted to weekend court load.', routine: ['bf_H01', 'bf_H06', 'bf_D09'], coachAdvice: lang === 'zh' ? '可短做或休息。回顧本週球量、完成品質和隔天症狀，再決定下週加、維持或減量。' : 'Keep it short or rest. Review court load, movement quality and next-day symptoms before next week.' },
]]));

Object.assign(TRANSLATIONS.zh, {
  planningInputsTitle: '球日、器材與恢復狀況', planningLocalNotice: '排課時會傳給 Gemini；這些輸入依帳號儲存在此瀏覽器，不會自動同步其他裝置。',
  badmintonDaysLabel: '這週打球日（含週末）', badmintonMinutesLabel: '每場約幾分鐘（可留空）', badmintonIntensityLabel: '球局強度',
  intensity_unknown: '尚未確認', intensity_light: '輕技術練習', intensity_mixed: '技術與對打混合', intensity_hard: '高強度對打',
  experienceLabel: '體能訓練經驗', experience_beginner: '初學／重新開始', experience_intermediate: '規律訓練中', experience_advanced: '有進階訓練經驗',
  competitionDateLabel: '目標比賽日期（選填）', equipmentLabel: '可用器材', bodyweightAlwaysAvailable: '不選器材時使用徒手；牆壁、地墊與平坦空間仍需自行確認。',
  equipment_bodyweight: '徒手', equipment_dumbbell: '啞鈴', equipment_band: '彈力繩', equipment_cable: '纜繩／滑輪', equipment_jump_rope: '跳繩', equipment_foam_roller: '滾筒',
  equipment_platform: '穩固椅凳／平台', equipment_racket: '球拍', equipment_shuttlecock: '羽球', equipment_ball: '小球／軟球', equipment_screen: '手機／影片', equipment_pullup_bar: '單槓',
  partnerAvailableLabel: '體能練習時有搭檔', partnerRequired: '需搭檔', shoulderStatusLabel: '肩部狀態與活動限制',
  health_unrestricted: '無已知肩部限制', health_restricted: '肩部疼痛／治療中', health_unknown: '肩部限制待確認',
  healthNotesLabel: '治療、其他部位症狀與醫囑', healthNotesPlaceholder: '例如：震波日期、治療部位、抬手反應、醫師允許／禁止的活動；沒有可留空。',
  recoveryNotesLabel: '本週恢復與實際球量', recoveryNotesPlaceholder: '例如：睡眠、腿重程度、每場時長與 RPE、訓練當晚／隔天症狀。',
  noEligibleExercises: '沒有符合條件的啟用動作，本次僅能安排休息；可檢查輸入與動作庫。',
  planPermissionDenied: '無法儲存新課表，請確認登入與資料庫權限是否支援動作處方。',
  searchExercises: '搜尋動作或編號', filterCategory: '依訓練分類篩選', allCategories: '全部分類', noMatchingExercises: '沒有符合條件的動作。', advancedExercise: '進階',
  category_warmup: '動態暖身／活動度', category_lower: '下肢肌力／單腳支撐', category_upper: '上肢肌力／肩臂控制', category_core: '核心／呼吸／力量傳遞',
  category_power: '爆發力／彈跳落地', category_footwork: '步伐／急停變向', category_reaction: '反應／丟接球／判讀', category_recovery: '拉伸／滾筒', category_conditioning: '心肺／重複回合',
  starterDoseLabel: '起始參考：', eachSide: '每側', restLabel: '休息', breaths: '次呼吸',
  catalogEligibilityNotice: '84 項分類動作與流程；進階項目預設停用。啟用後仍會依器材、搭檔、經驗與肩部限制篩選。舊動作 ID 保留供歷史使用。',
  exercisesTitle: '羽球訓練動作庫', exercisesSubtitle: '查看分類、提示、器材和起始劑量；可啟用或新增動作。AI 會依你的球量與恢復挑選，不必全做。',
  aiCoachTitle: '羽球體能教練', aiConclusionTitle: '本週安排與調整策略', aiTip: '球日也算訓練負荷；可排短課、恢復或休息。填寫比賽與治療限制，讓課表配合實際狀況。',
  feedbackSubtitle: '反饋會作為下次排課依據。本週 AI 劑量依已儲存的處方顯示；需要調整時到教練頁重新排課。',
});
Object.assign(TRANSLATIONS.en, {
  planningInputsTitle: 'Court days, equipment and recovery', planningLocalNotice: 'Sent to Gemini when planning. Inputs are saved per account in this browser, without automatic cross-device sync.',
  badmintonDaysLabel: 'Court days this week (including weekends)', badmintonMinutesLabel: 'Minutes per session (optional)', badmintonIntensityLabel: 'Court intensity',
  intensity_unknown: 'Not specified', intensity_light: 'Light technical practice', intensity_mixed: 'Mixed practice and games', intensity_hard: 'Hard match play',
  experienceLabel: 'Fitness training experience', experience_beginner: 'Beginner / restarting', experience_intermediate: 'Regular training', experience_advanced: 'Advanced experience',
  competitionDateLabel: 'Target competition date (optional)', equipmentLabel: 'Available equipment', bodyweightAlwaysAvailable: 'No equipment selected means bodyweight; check access to a wall, mat and safe floor.',
  equipment_bodyweight: 'Bodyweight', equipment_dumbbell: 'Dumbbells', equipment_band: 'Resistance band', equipment_cable: 'Cable / pulley', equipment_jump_rope: 'Jump rope', equipment_foam_roller: 'Foam roller',
  equipment_platform: 'Stable bench / platform', equipment_racket: 'Racket', equipment_shuttlecock: 'Shuttlecock', equipment_ball: 'Small / soft ball', equipment_screen: 'Phone / video', equipment_pullup_bar: 'Pull-up bar',
  partnerAvailableLabel: 'A partner is available for fitness drills', partnerRequired: 'Partner required', shoulderStatusLabel: 'Shoulder status and restrictions',
  health_unrestricted: 'No known shoulder restrictions', health_restricted: 'Shoulder symptoms / treatment', health_unknown: 'Restrictions not confirmed',
  healthNotesLabel: 'Treatment, other symptoms and clinician instructions', healthNotesPlaceholder: 'Treatment date and area, movement response, and activities your clinician permits or restricts.',
  recoveryNotesLabel: 'Recovery and actual court load', recoveryNotesPlaceholder: 'Sleep, leg fatigue, session minutes and RPE, symptoms that evening or next morning.',
  noEligibleExercises: 'No eligible exercises are enabled; this plan can only schedule rest. Check your inputs and library.',
  planPermissionDenied: 'Cannot save the new plan. Check your login and database permission for exercise prescriptions.',
  searchExercises: 'Search exercise or code', filterCategory: 'Filter training category', allCategories: 'All categories', noMatchingExercises: 'No matching exercises.', advancedExercise: 'Advanced',
  category_warmup: 'Dynamic warm-up / mobility', category_lower: 'Leg strength / single-leg support', category_upper: 'Upper strength / shoulder control', category_core: 'Core / breathing / force transfer',
  category_power: 'Power / jumping / landing', category_footwork: 'Footwork / braking / turning', category_reaction: 'Reaction / catching / anticipation', category_recovery: 'Stretching / foam rolling', category_conditioning: 'Aerobic / repeated rallies',
  starterDoseLabel: 'Starting reference:', eachSide: 'per side', restLabel: 'rest', breaths: 'breaths',
  catalogEligibilityNotice: '84 categorized exercises and flows. Advanced entries start disabled. Planning also filters equipment, partner, experience and shoulder restrictions. Legacy IDs remain readable.',
  exercisesTitle: 'Badminton exercise library', exercisesSubtitle: 'Browse categories, cues, equipment and starting doses; enable or add exercises. Planning selects for your court load and recovery.',
  aiCoachTitle: 'Badminton fitness coach', aiConclusionTitle: 'Weekly plan and adjustment strategy', aiTip: 'Court sessions count as training load. Short sessions, recovery and rest are valid. Add competition and treatment details.',
  feedbackSubtitle: 'Feedback informs the next plan. Saved AI prescriptions stay fixed this week; open Coach to generate an adjusted plan.',
});

Object.assign(TRANSLATIONS.zh, {
  sessionExerciseLimit: '每堂最多 8 項，包含暖身流程與收尾；可先移除或拆分到其他日。',
  phase_warmup: '暖身與主項準備', phase_skill: '協調、步伐與爆發力', phase_strength: '主要肌力訓練', phase_accessory: '輔助控制與體能', phase_recovery: '輕量恢復活動', phase_cooldown: '收尾與收操',
  estimatedSessionTime: '本次預估', aboutTime: '約', sessionTimingHint: '依區塊順序做，時間包含左右側、準備組、休息與轉換；可依恢復狀況縮短。',
  preparationSetsLabel: '主項準備組', workingSetsLabel: '正式組', preparationTrackingHint: '輕鬆、可控，不做到疲勞；完成主項時一起記錄，不額外增加完成次數。',
  exercisePhaseLabel: '訓練階段', moveUp: '往前移', moveDown: '往後移',
  restSessionTitle: '今天安排休息', restSessionNote: '沒有正式訓練，不必為完成課表額外暖身或收操；依醫囑與恢復狀況休息。',
  legacyPhaseNotice: '舊課表的階段依動作分類顯示；重新排課可取得明確的暖身、準備組與收尾計畫。',
  warmupSequenceNote: '先做下列暖身，再做主項準備組，最後進入正式訓練。', warmupNotPlanned: '目前未列出暖身動作或準備組；可重新排課，或編輯加入當天需要的暖身。',
  recoveryWarmupNote: '今天以輕活動恢復為主，從舒適的小幅度、慢速開始即可。',
  cooldownSequenceNote: '做完主訓練後進入下列收尾，拉伸保持輕拉感，呼吸自然。', cooldownNotPlanned: '目前沒有另列收操動作；短恢復可省略額外拉伸，主要訓練日請確認是否需安排收尾。',
  defaultPreparationAdvice: '先用徒手、小幅度做幾次，確認動作與支撐舒服，再進入正式組。',
});
Object.assign(TRANSLATIONS.en, {
  sessionExerciseLimit: 'Use at most 8 items including warm-up flows and finish. Remove an item or split sessions.',
  phase_warmup: 'Warm-up and preparation', phase_skill: 'Coordination, footwork and power', phase_strength: 'Main strength work', phase_accessory: 'Accessory control and conditioning', phase_recovery: 'Easy recovery activity', phase_cooldown: 'Finish and cool-down',
  estimatedSessionTime: 'Estimated session', aboutTime: 'About', sessionTimingHint: 'Follow section order. Time includes both sides, preparation, rest and transitions; shorten when recovery requires it.',
  preparationSetsLabel: 'Preparation set', workingSetsLabel: 'Working sets', preparationTrackingHint: 'Keep it light and controlled. Record completion with the main exercise; no extra completion count.',
  exercisePhaseLabel: 'Training phase', moveUp: 'Move earlier', moveDown: 'Move later',
  restSessionTitle: 'Rest is planned today', restSessionNote: 'No formal session is scheduled. No extra warm-up or cool-down is needed to complete the plan; follow recovery and clinician instructions.',
  legacyPhaseNotice: 'Legacy sections are inferred from exercise categories. Generate a new plan for explicit warm-up, preparation and finishing instructions.',
  warmupSequenceNote: 'Complete the warm-up and light preparation sets before working sets.', warmupNotPlanned: 'No warm-up or preparation is listed. Generate a new plan or add appropriate warm-up work in the editor.',
  recoveryWarmupNote: 'This is an easy recovery session. Start with comfortable range and slow movement.',
  cooldownSequenceNote: 'Finish with the listed easy movements, mild stretches and natural breathing.', cooldownNotPlanned: 'No separate cool-down is listed. Short recovery may need no extra stretching; check the finish for a main training day.',
  defaultPreparationAdvice: 'Use bodyweight and a small comfortable range first, then move to working sets.',
});

for (const lang of ['zh', 'en']) {
  for (const day of DEFAULT_SCHEDULE_I18N[lang]) {
    day.sessionType = [2, 5].includes(day.day) ? 'recovery' : 'training';
    day.warmupNote = TRANSLATIONS[lang][day.sessionType === 'recovery' ? 'recoveryWarmupNote' : 'warmupSequenceNote'];
    day.cooldownNote = day.sessionType === 'recovery'
      ? lang === 'zh' ? '呼吸與輕拉伸已包含在恢復活動中，不必再加一輪收操。' : 'Breathing and gentle stretches are already part of recovery; no extra finishing circuit is needed.'
      : TRANSLATIONS[lang].cooldownSequenceNote;
    day.prescriptions = day.routine.map(id => ({ id, ...EXERCISES_I18N[lang][id].prescription, phase: exercisePhase(day, id, EXERCISES_I18N[lang][id]) }));
    const first = day.prescriptions.find(dose => dose.phase === 'strength');
    if (first) first.preparation = { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: first.perSide, instruction: TRANSLATIONS[lang].defaultPreparationAdvice };
  }
}
