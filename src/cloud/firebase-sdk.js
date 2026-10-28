// The slice of the Firebase SDK that cloud.js uses. cloud.js loads this file
// with import() from start() at boot, so Firebase lands in its own lazy chunk,
// the game boots without waiting for it, and it is in memory before any tap on
// "Sign in with Google" (the popup must open inside the tap). Named imports
// keep the chunk tree-shaken.

export { initializeApp, getApp, deleteApp } from 'firebase/app';

export {
  initializeAuth,
  getAuth,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  signInAnonymously,
  signInWithCredential,
  linkWithPopup,
  signOut,
  deleteUser,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';

// Firestore Lite: plain REST calls with no offline cache or live listeners,
// which nothing here needs, and this chunk is about 100 kB smaller gzipped.
// Every read goes to the server, which is what the sync rules want anyway.
// writeBatch sends player feedback together with its rate-limit stamp.
export {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  getCount,
  serverTimestamp,
  terminate,
} from 'firebase/firestore/lite';
