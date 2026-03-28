import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

/**
 * Replace this with your actual Firebase config object
 * from the Firebase Console (Project Settings > General > Your Apps)
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Initialize App Check (reCAPTCHA v3) — only with a REAL key, never in dev mode
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const isRealKey = recaptchaKey && recaptchaKey.length > 20 && recaptchaKey !== '123456789';

if (isRealKey && typeof window !== 'undefined' && !import.meta.env.DEV) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaKey),
    isTokenAutoRefreshEnabled: true
  });
} else if (import.meta.env.DEV) {
  console.log('[Firebase] App Check skipped in development mode');
}

export default app;
