const env = import.meta.env || globalThis.process?.env || {};

export const trialEnabled = () => env.VITE_AI_TRIAL_ENABLED === 'true';
