import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import { env, firebaseConfigured } from "./env";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  if (!app) {
    app = getApps()[0] || initializeApp(env.firebase);
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) return null;
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  firebaseConfigured,
};
export type { FirebaseUser };
