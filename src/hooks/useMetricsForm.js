import { useMemo, useRef, useState } from 'react';
import { getDoc } from 'firebase/firestore';
import { auth } from '../services/firebase.js';
import { saveMeasurement, userDoc } from '../services/repository.js';
import { emptyMetrics, fallbackMetricsForDate, mergeMetricsRecord, metricsForm, parseMetrics } from '../domain/metrics.js';

export function useMetricsForm({ user, metrics, today, t, showToast, operation }) {
  const uid = user?.uid || '';
  const [draftState, setDraftState] = useState(() => ({ scope: '', form: emptyMetrics(today) }));
  const [fetchedByKey, setFetchedByKey] = useState({});
  const metricDateRequest = useRef(0);

  const isEditedForScope = draftState.scope === uid && uid !== '';
  const todayRecord = useMemo(
    () => metrics.find(item => item.date === today) || fetchedByKey[`${uid}:${today}`] || null,
    [metrics, today, fetchedByKey, uid],
  );

  // Auto-populate today's saved record on initial view before the user edits or switches dates.
  const metricForm = isEditedForScope
    ? draftState.form
    : (todayRecord ? metricsForm(today, todayRecord) : emptyMetrics(today));

  const sameDateRecord = useMemo(
    () => metrics.find(item => item.date === metricForm.date) || fetchedByKey[`${uid}:${metricForm.date}`] || null,
    [metrics, metricForm.date, fetchedByKey, uid],
  );

  const metricFallback = useMemo(
    () => fallbackMetricsForDate(metricForm.date, metrics, sameDateRecord),
    [metricForm.date, metrics, sameDateRecord],
  );

  const selectMetricDate = async value => {
    const request = ++metricDateRequest.current;
    const record = metrics.find(item => item.date === value) || fetchedByKey[`${uid}:${value}`] || null;
    setDraftState({ scope: uid, form: metricsForm(value, record) });
    if (user && value && !record) {
      try {
        const existing = await getDoc(userDoc(user.uid, 'metrics', value));
        if (request === metricDateRequest.current && auth.currentUser?.uid === user.uid && existing.exists()) {
          const data = existing.data();
          setFetchedByKey(prev => ({ ...prev, [`${user.uid}:${value}`]: data }));
          setDraftState({ scope: user.uid, form: metricsForm(value, data) });
        }
      } catch {
        showToast(t('toastSaveFail'));
      }
    }
  };

  const changeMetric = async event => {
    const { name, value } = event.target;
    if (name !== 'date') {
      ++metricDateRequest.current;
      setDraftState({ scope: uid, form: { ...metricForm, [name]: value } });
      return;
    }
    await selectMetricDate(value);
  };

  const saveMetrics = async event => {
    event.preventDefault();
    ++metricDateRequest.current;
    let merged = null;
    const ok = await operation(async () => {
      const parsed = parseMetrics(metricForm);
      let existingSameDate = sameDateRecord;
      if (user && !existingSameDate) {
        try {
          const snap = await getDoc(userDoc(user.uid, 'metrics', parsed.date));
          if (snap.exists()) existingSameDate = snap.data();
        } catch { /* fall back to loaded history */ }
      }
      const fallback = fallbackMetricsForDate(parsed.date, metrics, existingSameDate);
      merged = mergeMetricsRecord(parsed, fallback);
      await saveMeasurement(user.uid, merged);
    }, 'toastMetricSaved');

    if (ok && merged) {
      setFetchedByKey(prev => ({ ...prev, [`${uid}:${merged.date}`]: merged }));
      setDraftState({ scope: uid, form: metricsForm(merged.date, merged) });
    }
  };

  return { metricForm, metricFallback, changeMetric, selectMetricDate, saveMetrics };
}
