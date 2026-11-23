import { useEffect, useState } from 'react';
import { subscribeAiMembership } from '../services/aiMembership.js';

const EMPTY_MEMBERSHIP = Object.freeze({ active: false, loaded: false, tier: null, dailyLimit: null });

export function useAiMembership(uid) {
  const [membership, setMembership] = useState(
    () => (uid ? EMPTY_MEMBERSHIP : { active: false, loaded: true, tier: null, dailyLimit: null }),
  );

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeAiMembership(uid, setMembership);
  }, [uid]);

  return uid ? membership : { active: false, loaded: true, tier: null, dailyLimit: null };
}
