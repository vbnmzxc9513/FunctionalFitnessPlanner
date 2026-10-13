import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env || globalThis.process?.env || {};
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDWuhndkvdi3q41hVe8IqV7n9NxV1CKYiM',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'myfitnessapp-c4aba.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'myfitnessapp-c4aba',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'myfitnessapp-c4aba.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '561947598853',
  appId: env.VITE_FIREBASE_APP_ID || '1:561947598853:web:6dc6113a3ea351aa9f3c6c',
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = env.VITE_APP_ID || 'my-fitness-app-yp';
if ((env.DEV || globalThis.process?.env?.NODE_ENV === 'test') && env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, env.VITE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1', Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
}
