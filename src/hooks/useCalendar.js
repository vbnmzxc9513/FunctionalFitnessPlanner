import { useEffect, useState } from 'react';
import { getWeekString, localDate } from '../domain/dates.js';

export function useCalendar() {
  const [today, setToday] = useState(() => localDate());
  useEffect(() => {
    const update = () => setToday(localDate());
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const date = new Date(`${today}T12:00:00`);
  return { today, currentWeek: getWeekString(date), lastWeek: getWeekString(date, -1) };
}
