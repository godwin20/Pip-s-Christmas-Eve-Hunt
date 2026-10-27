// Which Firebase project cloud saves and the leaderboard talk to (docs/CLOUD.md).
// With no project configured the game runs exactly as before, saving only on
// this device.

// The web app config from the Firebase console (Project settings > Your apps >
// SDK setup and configuration). These values are public by design: anyone can
// read them from the page, and firestore.rules is what protects the data.
// Set to null to run without the cloud.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD4nXihPPpJHcmqrxlw7-XIYlYAArqyqLA',
  authDomain: 'pip-s-christmas-eve-hunt.firebaseapp.com',
  projectId: 'pip-s-christmas-eve-hunt',
  storageBucket: 'pip-s-christmas-eve-hunt.firebasestorage.app',
  messagingSenderId: '166881905096',
  appId: '1:166881905096:web:fb3492d2d6d1e5d1ef18fd',
};

// Where grown-ups can ask about, or ask us to delete, their saved data. The
// privacy screen shows it (an email address becomes a mailto: link, a web page
// opens in a new tab). The owner may change it at any time.
export const PRIVACY_CONTACT = 'keithstack1@gmail.com';

export const EMULATOR_PROJECT_ID = 'demo-pips-hunt';
export const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
export const EMULATOR_FIRESTORE_HOST = '127.0.0.1';
export const EMULATOR_FIRESTORE_PORT = 8080;

// Vite swaps this exact expression for a literal at build time. Under Node
// (Vitest, scripts) import.meta.env can be missing, so the read is guarded.
function emulatorFlag() {
  try {
    return import.meta.env.VITE_FIREBASE_EMULATOR;
  } catch {
    return undefined;
  }
}

// `npm run dev:cloud` builds with --mode emulator, which loads .env.emulator.
export const USE_EMULATOR = emulatorFlag() === '1';

// The emulators accept any config; a demo- project id keeps them from ever
// reaching a real project.
const EMULATOR_CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT_ID,
  appId: 'demo-app',
};

export function cloudConfig() {
  if (USE_EMULATOR) return EMULATOR_CONFIG;
  return FIREBASE_CONFIG || null;
}
