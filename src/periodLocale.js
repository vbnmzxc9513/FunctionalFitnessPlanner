const copy = {
  zh: {
    competitionDay: '比賽日', taper: '賽前減量', postCompetition: '賽後恢復', fitnessRest: '體能休息',
    minutesScope: '以下分鐘僅估計額外體能，球局與比賽時間另計。0 分鐘表示這天沒有額外體能安排。',
    rangeTitle: '先選擇規劃日期', rangeHint: '起訖日都包含在內，可規劃今天起的 1–28 天。接著回答三步問題，預覽後再套用。', from: '開始日期', to: '結束日期', days: '天', next: '繼續設定訓練條件', invalid: '請選擇有效日期；開始日不能早於今天，結束日不能早於開始日，總長最多 28 天。',
    trainingDays: '每週可安排體能的星期', trainingHint: '預設週一至五，可取消或加入週末。勾選代表有空，不代表每天都要練；羽球日請在下方另選。全部取消就不排體能。',
    title: '這段日期的課表預覽', overview: '已儲存的日期課表', previewHint: '這是預計安排，尚未套用，也不代表已完成訓練。點選日期可查看內容。', savedHint: '點選實際日期查看預計安排；實際完成紀錄以訓練紀錄為準。',
    scope: '確認只更新所選日期內的安排；已有紀錄的受保護日期與範圍外課表會保留。', stale: '條件或日期已變更，請返回重新產生預覽後再套用。', back: '返回修改條件', apply: '確認套用這段課表', applying: '套用中…', protected: '已有紀錄，保留原安排', planned: '預計安排', training: '體能訓練', recovery: '恢復', rest: '休息', court: '羽球日', missing: '此日期尚無安排，請重新產生預覽。', minutes: '分鐘', count: '次體能訓練', summary: '每週規劃摘要', goal: '目標', strength: '肌力主項', conclusion: '規劃說明', readonly: '唯讀預覽；完成與紀錄請到當日訓練頁。', replan: '重新規劃日期', today: '前往今天訓練',
    warmup: '暖身與準備', skill: '協調與步序', accessory: '輔助訓練', cooldown: '收操', preparation: '準備組', sets: '組', reps: '次', seconds: '秒', breaths: '次呼吸', eachSide: '每側', restLabel: '休息', balanced: '均衡體能', coordination: '協調與步序', stability: '穩定與控制',
  },
  en: {
    competitionDay: 'Competition day', taper: 'Pre-event taper', postCompetition: 'Post-event recovery', fitnessRest: 'Rest from conditioning',
    minutesScope: 'Minutes estimate additional conditioning only; court play and competition time are separate. 0 minutes means no additional conditioning that day.',
    rangeTitle: 'Choose your planning dates', rangeHint: 'Both dates are included. Choose 1–28 days starting today or later, then answer three steps and review before applying.', from: 'Start date', to: 'End date', days: 'days', next: 'Continue to training preferences', invalid: 'Choose valid dates: start today or later, end on or after the start, and include at most 28 days.',
    trainingDays: 'Weekly availability for fitness', trainingHint: 'Monday–Friday are selected by default; remove days or add weekends. Availability does not mean training every day. Set court days separately below. Deselect all for no fitness sessions.',
    title: 'Plan preview for these dates', overview: 'Saved plan by date', previewHint: 'These are proposed sessions, not applied or completed workouts. Select a date to read its details.', savedHint: 'Select an actual date to view its planned session. Training logs record what you actually completed.', scope: 'Applying updates only the selected dates. Protected dates with existing records and plans outside this range are preserved.', stale: 'Dates or preferences changed. Go back and generate a fresh preview before applying.', back: 'Back to preferences', apply: 'Apply this date-range plan', applying: 'Applying…', protected: 'Existing records · arrangement preserved', planned: 'Planned', training: 'Fitness training', recovery: 'Recovery', rest: 'Rest', court: 'Court day', missing: 'No session for this date. Generate a new preview.', minutes: 'min', count: 'fitness sessions', summary: 'Weekly planning summary', goal: 'Goal', strength: 'Main strength', conclusion: 'Planning notes', readonly: 'Read-only preview. Complete and log workouts on the daily training page.', replan: 'Plan new dates', today: 'Go to today’s training', warmup: 'Warm-up and preparation', skill: 'Coordination and footwork', accessory: 'Accessory work', cooldown: 'Cool-down', preparation: 'Preparation sets', sets: 'sets', reps: 'reps', seconds: 'seconds', breaths: 'breaths', eachSide: 'each side', restLabel: 'Rest', balanced: 'Balanced fitness', coordination: 'Coordination and footwork', stability: 'Stability and control',
  },
};
export const periodText = (lang = 'zh') => key => copy[lang === 'en' ? 'en' : 'zh'][key] || key;

const questionnaireCopy = {
  zh: {
    quizGoalTitle: '這段期間，想把什麼練得更好？', plannerFocus: '這段期間優先改善', weeklyTargetRegions: '這段期間優先加強',
    badmintonDaysLabel: '每週打羽球的星期（另外計入負荷）', quizChoicesTitle: '這段期間，想做哪些動作？',
    choiceSelected: '排課候選', choiceSelect: '選入候選', choiceRemove: '移出候選', choiceRecommendation: '符合目前條件；依目標、部位與常用排序。',
    choiceGoal: '符合重點部位', choiceCoverageHint: '這是候選方向，實際日期分配請看預覽；系統仍會搭配其他需要的動作。',
    choicePreview: '預覽日期課表', choiceOpenQuiz: '檢視候選並規劃日期', choiceLibraryHint: '候選動作用來規劃所選日期；常用收藏另行保留。',
    choice_reason_competition: '這段期間含賽前或賽後恢復，優先維持熟悉動作與恢復安排。', choice_reason_recovery: '這段期間採恢復優先，沒有為候選再加訓練。',
    choice_reason_capacity: '時間、體能可用日、球日與相同目的的槽位未能容納；沒有額外加課。', choice_reason_omitted: '這份安排沒有採用；可返回換動作，或查看規劃說明。',
    choiceDraftNotice: '尚未套用的選擇保存在此瀏覽器；常用收藏不會因此改變。',
    plannerStorageNotice: '未登入的日期課表與實際紀錄保存在此瀏覽器，不會自動跨裝置同步。登入後需重新預覽並套用；本機實際紀錄會保留，可另外匯出。',
  },
  en: {
    quizGoalTitle: 'What would you like to improve during these dates?', plannerFocus: 'Priority for these dates', weeklyTargetRegions: 'Priority areas for these dates',
    badmintonDaysLabel: 'Weekly badminton days (counted separately as load)', quizChoicesTitle: 'Which movements would you like during these dates?',
    choiceSelected: 'Planning candidates', choiceSelect: 'Choose for planning', choiceRemove: 'Remove from candidates', choiceRecommendation: 'Eligible choices, ranked by goals, priority areas and favorites.',
    choiceGoal: 'Matches a priority area', choiceCoverageHint: 'These are candidate purposes. Preview shows the actual date distribution; the planner can add other appropriate movements.',
    choicePreview: 'Preview date plan', choiceOpenQuiz: 'Review choices & plan dates', choiceLibraryHint: 'Candidates guide your selected dates. Favorites remain a separate collection.',
    choice_reason_competition: 'These dates include taper or post-event recovery, prioritizing familiar movements and recovery.', choice_reason_recovery: 'Recovery takes priority; no extra training was added to fit a preference.',
    choice_reason_capacity: 'Available time, fitness days, court days and compatible slots could not fit this movement; no extra session was added.', choice_reason_omitted: 'This plan did not use the movement. Choose another or review the planning notes.',
    choiceDraftNotice: 'Unapplied choices are kept in this browser. Your favorites stay separate.',
    plannerStorageNotice: 'Without sign-in, date plans and actual records stay in this browser without cross-device sync. After signing in, preview and apply again; local actual records are retained and can be exported separately.',
  },
};
export const periodQuestionnaireText = (lang, fallback) => key => questionnaireCopy[lang === 'en' ? 'en' : 'zh'][key] || fallback(key);
