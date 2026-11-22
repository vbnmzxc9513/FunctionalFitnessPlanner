const messages = {
  zh: {
    previewBrowseHint: '長按動作或按「查看詳情」，閱讀操作說明。', browseHint: '長按動作查看詳情與填寫紀錄，也可按右側「詳細／記錄」。', detailsLog: '詳細／記錄', details: '查看詳情', returnList: '返回課表', previous: '上一個動作', markedDone: '已標記完成', hasPreparation: '含主項準備組', futureReadonly: '這是預計安排，請於訓練當天記錄。',
    short_warmup: '暖身', short_skill: '協調', short_strength: '肌力', short_accessory: '輔助', short_recovery: '恢復', short_cooldown: '收操',
    movementCount: '個動作', markDone: '完成這個動作', sequence: '今天的訓練順序',
    today: '今天的訓練', week: '本週課表', start: '開始今天訓練', resume: '繼續訓練',
    progress: '已完成 {done}／{total} 個動作', current: '目前動作 · 做完請點圓圈標記完成', next: '查看下一個動作', back: '回到第一個未完成動作',
    nextHint: '查看下一個不會標記完成；尚未完成的暖身與動作仍會保留。',
    full: '查看今日完整課表', collapse: '收起完整課表',
    startHint: '先確認今天狀態，再依序暖身、訓練與收操。實做紀錄可在動作內填寫。',
    summary: '今日完成摘要', finished: '今天安排的動作已全部標記完成。',
    remaining: '尚有 {count} 個動作未標記完成。', records: '查看訓練紀錄',
    summaryHint: '完成勾選代表進度；保存實做才會留下每組的實際表現。翌日可在紀錄頁回報恢復情況。',
    more: '分享與本週回饋', concept: '為什麼這樣安排', advice: '教練補充',
    preparation: '開始主項前的準備', preparationHint: '以下準備組屬於暖身，不另計完成項。進入主項前請先完成。',
    otherDate: '這是 {date} 的課表。當日狀態檢查僅能用於今天；實做會記錄實際訓練日期。',
    unknown: '有動作目前無法顯示，請在課表頁檢查內容。未顯示的動作不會自動算完成。',
    rest: '今天以恢復與休息為主，無需完成訓練動作。',
  },
  en: {
    previewBrowseHint: 'Hold a movement or choose Details to read its instructions.', browseHint: 'Hold a movement to view details and log sets, or use its Details / Log button.', detailsLog: 'Details / Log', details: 'Details', returnList: 'Back to plan', previous: 'Previous exercise', markedDone: 'Marked complete', hasPreparation: 'Includes preparation sets', futureReadonly: 'This is a planned session. Log it when you train.',
    short_warmup: 'Warm-up', short_skill: 'Skill', short_strength: 'Strength', short_accessory: 'Support', short_recovery: 'Recovery', short_cooldown: 'Finish',
    movementCount: 'movements', markDone: 'Complete this exercise', sequence: 'Today’s training sequence',
    today: 'Today’s training', week: 'Weekly plan', start: 'Start today’s session', resume: 'Continue session',
    progress: '{done} of {total} exercises completed', current: 'Current exercise · Tap the circle when done', next: 'View next exercise', back: 'Return to the first unfinished exercise',
    nextHint: 'Viewing the next exercise does not mark anything complete. Unfinished warm-up and exercises remain in the plan.',
    full: 'View the full daily plan', collapse: 'Collapse the full plan',
    startHint: 'Check today’s readiness, then work through warm-up, training and cooldown. Record actual sets within each exercise.',
    summary: 'Session summary', finished: 'All planned exercises are marked complete.',
    remaining: '{count} exercises are not yet marked complete.', records: 'View training records',
    summaryHint: 'Checkmarks track progress. Save actual sets to record performance, and report next-day recovery in Records.',
    more: 'Sharing and weekly feedback', concept: 'Why this session', advice: 'Coach’s notes',
    preparation: 'Preparation before the main work', preparationHint: 'These preparation sets belong to the warm-up, with no separate completion checkbox. Complete them before the main work.',
    otherDate: 'This session is scheduled for {date}. Readiness applies only to today; actual training uses the date performed.',
    unknown: 'Some exercises cannot be displayed. Check the plan; missing exercises will not be marked complete automatically.',
    rest: 'Today is for recovery and rest. There are no training exercises to complete.',
  },
};

export function journeyText(lang, key, values = {}) {
  let value = (messages[lang] || messages.zh)[key] || messages.en[key] || key;
  for (const [name, text] of Object.entries(values)) value = value.replaceAll(`{${name}}`, String(text));
  return value;
}
