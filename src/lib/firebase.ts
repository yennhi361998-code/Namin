import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCDD57aBU89R5h8vG1yuZH3-d4vlUUOI5Y',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'namin-family.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'namin-family',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'namin-family.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '288862495642',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:288862495642:web:11ffdcc9ed5d8f99b5d023',
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
