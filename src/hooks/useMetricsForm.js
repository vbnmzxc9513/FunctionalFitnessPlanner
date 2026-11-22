import { useRef, useState } from 'react';
import { getDoc } from 'firebase/firestore';
import { auth } from '../services/firebase.js';
import { saveMeasurement, userDoc } from '../services/repository.js';
import { emptyMetrics, metricsForm, parseMetrics } from '../domain/metrics.js';

export function useMetricsForm({ user, metrics, today, t, showToast, operation }) {
  const [metricForm, setMetricForm] = useState(() => emptyMetrics(today));
  const metricDateRequest = useRef(0);

  const changeMetric = async event => {
    const { name, value } = event.target;
    if (name !== 'date') {
      ++metricDateRequest.current;
      setMetricForm(previous => ({ ...previous, [name]: value }));
      return;
    }
    const request = ++metricDateRequest.current;
    const record = metrics.find(item => item.date === value);
    setMetricForm(metricsForm(value, record));
    if (user && value && !record) {
      try {
        const existing = await getDoc(userDoc(user.uid, 'metrics', value));
        if (request === metricDateRequest.current && auth.currentUser?.uid === user.uid && existing.exists()) {
          setMetricForm(metricsForm(value, existing.data()));
        }
      } catch {
        showToast(t('toastSaveFail'));
      }
    }
  };

  const saveMetrics = event => {
    event.preventDefault();
    ++metricDateRequest.current;
    operation(() => saveMeasurement(user.uid, parseMetrics(metricForm)), 'toastMetricSaved');
  };

  return { metricForm, changeMetric, saveMetrics };
}
