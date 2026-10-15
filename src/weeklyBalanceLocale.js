const zh = {
  title: '本週安排覆蓋', hint: '這是課表安排，不是實際完成或訓練成效；每區按有安排的天數計算，同日多個動作只算一天。',
  mobility: '活動度與拉伸', patterns: '訓練模式', hip: '髖／大腿', ankle: '踝／小腿', thoracic: '胸椎／上背活動', shoulder: '肩／胸前活動',
  squat_lunge: '蹲／弓步', hinge: '髖鉸鏈／髖伸展', push: '上肢推', pull: '上肢拉', core: '核心控制／負重', footwork_reaction: '步伐／判讀與反應',
  dayCount: '{count} 天', region: '區域／模式', coverage: '天數', monday: '一', tuesday: '二', wednesday: '三', thursday: '四', friday: '五',
  scheduled: '本週已安排', not_scheduled: '本週未安排；不代表必須補做', limited: '依目前限制未另安排', information_missing: '限制資訊不足，先確認允許活動',
  unavailable: '目前器材／啟用條件沒有可用動作', competition_priority: '本週含賽前／賽後恢復，不為補齊加量', recovery_priority: '恢復優先，不為補齊加量', court_priority: '已有球日；未另排步伐課',
  check_conditions: '已有安排含目前條件未確認的動作，請先檢查', empty: '未安排', planned: '有安排', court: '球日', protected: '賽前／賽後',
  explanation: '肌力、跳躍與呼吸不當成胸椎拉伸；滾筒放鬆不等同活動度訓練。沒有每日全身或全列打勾的要求，也不以總分診斷失衡。',
  purpose: '主肌力可連續數週重複以追蹤；低負荷活動按目標輪替。球局另計負荷，不推定球局已完成上述拉伸或肌力。',
  unclassified: '未分類動作', unknownHint: '自訂／未知動作保留在此，不依名稱猜測覆蓋區域。',
  courtDays: '每週球日：{days}（含週末；不計入上方體能動作覆蓋）', noCourt: '球日未提供；不能推定本週球場負荷。',
};
const en = {
  title: 'Weekly planned coverage', hint: 'Scheduled work, not completed training or results. Each region counts scheduled days; several exercises on one day still count once.',
  mobility: 'Mobility and stretching', patterns: 'Training patterns', hip: 'Hip / thigh', ankle: 'Ankle / calf', thoracic: 'Thoracic / upper-back mobility', shoulder: 'Shoulder / chest mobility',
  squat_lunge: 'Squat / lunge', hinge: 'Hinge / hip extension', push: 'Upper-body push', pull: 'Upper-body pull', core: 'Trunk control / loaded work', footwork_reaction: 'Footwork / reading and reaction',
  dayCount: '{count} days', region: 'Region / pattern', coverage: 'Days', monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F',
  scheduled: 'Scheduled this week', not_scheduled: 'Not scheduled; no requirement to catch up', limited: 'Not added under current restrictions', information_missing: 'Restrictions unclear; confirm permitted activity',
  unavailable: 'No exercise available with current equipment / enabled settings', competition_priority: 'Includes taper / post-event recovery; no work added to fill gaps', recovery_priority: 'Recovery takes priority; no work added to fill gaps', court_priority: 'Court days recorded; no extra footwork session',
  check_conditions: 'Some scheduled exercises need their current conditions checked', empty: 'Not scheduled', planned: 'Scheduled', court: 'Court', protected: 'Taper / post-event',
  explanation: 'Strength, jumps and breathing do not count as thoracic stretching. Foam rolling is not equivalent to mobility training. Daily full-body work and ticking every row are not required; there is no imbalance score.',
  purpose: 'Main lifts may repeat for several weeks to track progress; easy mobility varies with its purpose. Court play is separate load, not assumed completion of these stretches or lifts.',
  unclassified: 'Unclassified exercises', unknownHint: 'Custom / unknown exercises remain here; their names do not determine regional coverage.',
  courtDays: 'Weekly court days: {days}, including weekends; excluded from the coverage above.', noCourt: 'Court days are missing; court load is unknown.',
};
export const WEEKLY_BALANCE_TEXT = { zh, en };
export function weeklyBalanceText(lang, key, parameters = {}) {
  const value = WEEKLY_BALANCE_TEXT[lang]?.[key] ?? zh[key] ?? key;
  return Object.entries(parameters).reduce((result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)), value);
}
