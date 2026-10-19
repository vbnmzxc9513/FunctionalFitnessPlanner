import { estimateSessionMinutes } from '../domain/sessions.js';

export default function SessionTimeSummary({ day, exercises, availableTime, context = {}, lang = 'zh' }) {
  const en = lang === 'en';
  const minutes = estimateSessionMinutes(day, exercises);
  const available = Number(availableTime);
  const known = Number.isFinite(available) && available >= 5 && available <= 240;
  const recovery = day.sessionType === 'recovery';
  const court = context.badmintonDays?.includes(day.day);
  const reason = !day.routine.length ? (en ? 'No extra conditioning is scheduled today.' : '今天沒有額外體能安排。')
    : recovery ? (court ? en ? 'Court day: this is a short mobility session; court time is counted separately.' : '羽球日：這是短活動度恢復課，球局時間另計。' : en ? 'A recovery session, not a full strength workout. Follow today’s reason; unused time does not need to be filled.' : '這是恢復課，依每日原因保留餘裕，並非完整肌力課；不用補滿時間。')
      : known && minutes < available * 0.8 ? (en ? 'This session has a limited dose. See today’s reason; do not add sets to fill the remaining time.' : '本次採低量或短技術安排，原因見下方；剩餘時間不自行加組。') : null;
  return <div data-testid="session-time-summary" className="text-sm space-y-1"><p>{known ? en ? `Available ${available} min · Planned ${minutes} min` : `可用 ${available} 分鐘 · 安排 ${minutes} 分鐘` : en ? `Planned ${minutes} min` : `預計 ${minutes} 分鐘`}</p>{reason && <p className="text-xs opacity-80">{reason}</p>}</div>;
}
