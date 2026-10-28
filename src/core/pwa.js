// Progressive Web App glue (docs/CONTRACT.md): the service worker that makes
// the game work offline (built by vite-plugin-pwa, see vite.config.js), new
// versions that wait for a tap on "Refresh" (registerType 'prompt'), the
// browser's install prompt, and "where are we running?" checks for the
// install hints. The menus decide when to show any of it (never mid-night),
// so this module only reports state and does what it is asked.
//
// Importing it has no side effects: main.js calls createPwa() once and then
// start(), and screens.js imports the pure helpers below.

const CHECK_EVERY_MS = 60 * 60 * 1000; // a long session still hears about a new version
const CHECK_GAP_MS = 60 * 1000; // tab hopping doesn't fetch sw.js every time
const RELOAD_FALLBACK_MS = 4000; // the new version never took over: reload anyway

// Vite swaps this for a literal at build time; under plain Node (scripts)
// import.meta.env can be missing, so the read is guarded (as in cloud/config.js).
function isProductionBuild() {
  try {
    return import.meta.env.PROD === true;
  } catch {
    return false;
  }
}

function userAgent() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  } catch {
    return '';
  }
}

function touchPoints() {
  try {
    return typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints) || 0 : 0;
  } catch {
    return 0;
  }
}

// Google blocks its sign-in in the in-app browsers of social apps (Instagram,
// Facebook, Messenger, TikTok, Snapchat, Line, X/Twitter) and in Android
// WebViews ('; wv)'), and those can't install a web app either.
export function isInAppBrowser(ua = userAgent()) {
  const s = typeof ua === 'string' ? ua : '';
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|Snapchat|Twitter|\bLine\//.test(s) || /TikTok|musical_ly|Bytedance/i.test(s) || /\bAndroid\b.*;\s*wv\)/.test(s);
}

// iPhone, iPod or iPad. iPadOS Safari says "Macintosh" by default, so a Mac
// with a touch screen is an iPad (no Mac has one).
export function isIOS(ua = userAgent(), maxTouchPoints = touchPoints()) {
  const s = typeof ua === 'string' ? ua : '';
  return /\b(iPhone|iPad|iPod)\b/.test(s) || (/\bMacintosh\b/.test(s) && maxTouchPoints > 1);
}

// iPad (its own user agent, or the desktop one with a touch screen): Safari's
// Share button sits at the top right there, not behind •••.
export function isIPad(ua = userAgent(), maxTouchPoints = touchPoints()) {
  const s = typeof ua === 'string' ? ua : '';
  return /\biPad\b/.test(s) || (/\bMacintosh\b/.test(s) && maxTouchPoints > 1);
}

// Safari itself on iPhone / iPad: not Chrome, Firefox, Edge, Opera or the
// Google app for iOS (WebKit too, but their menus differ from the steps we
// show), and not a social app's in-app browser.
export function isIOSSafari(ua = userAgent(), maxTouchPoints = touchPoints()) {
  if (!isIOS(ua, maxTouchPoints) || isInAppBrowser(ua)) return false;
  return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo/.test(ua);
}

// Running as an installed app (Home Screen, dock, app window) rather than in
// a browser tab. navigator.standalone is iOS Safari's own flag.
export function isStandalone(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    if (typeof win.matchMedia !== 'function') return false;
    return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some((m) => win.matchMedia(`(display-mode: ${m})`).matches);
  } catch {
    return false;
  }
}

// Opened from the iPhone / iPad Home Screen: navigator.standalone, or the
// standalone display mode.
function isIOSHomeScreenApp(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

// createPwa({ onChange }) → see docs/CONTRACT.md. onChange() runs (async,
// never throwing into the caller) whenever anything below changes.
export function createPwa({ onChange } = {}) {
  const hasWindow = typeof window !== 'undefined';
  const state = {
    started: false,
    needRefresh: false, // a new version is installed and waiting
    reloadPending: false, // another tab switched to the new version already
    applying: false, // the player tapped "Refresh"
    offlineReady: false,
    installEvent: null, // the deferred beforeinstallprompt event
    installed: false,
    registration: null,
    lastCheck: 0,
  };
  let updateSW = null;

  const api = {
    onChange: typeof onChange === 'function' ? onChange : null,

    start,

    // A new version is ready: the menus offer "Refresh".
    get updateReady() {
      return state.needRefresh;
    },
    // Activates the waiting version, then reloads (the page is on a menu, so
    // everything is saved). Safe to call twice.
    applyUpdate,

    // The game is cached and plays without a network (set once, on the
    // service worker's first install).
    get offlineReady() {
      return state.offlineReady;
    },

    // Chrome / Edge / Samsung Internet offered to install: our own small
    // "Install" control can open the browser's install dialog.
    get canInstall() {
      // not inside a social app's browser, even if it passed the event on
      return !!state.installEvent && !state.installed && !isStandalone() && !isInAppBrowser();
    },
    // → Promise<'accepted' | 'dismissed' | 'unavailable'>
    promptInstall,

    // iPhone / iPad Safari, in a tab: Safari has no install prompt, so the
    // title offers the "Add to Home Screen" steps instead.
    get canAddToHomeScreen() {
      return !state.installed && !isStandalone() && isIOSSafari();
    },

    // A Home Screen app on iPhone / iPad keeps its own storage, apart from
    // Safari's tabs, so a guest starts fresh there. iOS's own flag (or a
    // standalone display mode on iOS) only: Android and desktop installed apps
    // share the browser's storage, so they need no note.
    get separateAppStorage() {
      return isIOS() && isIOSHomeScreenApp();
    },

    isStandalone: () => isStandalone(),
    isIOS: () => isIOS(),
    isInAppBrowser: () => isInAppBrowser(),
  };

  function notify() {
    const fn = api.onChange;
    if (typeof fn !== 'function') return;
    // async: callers may notify from inside their own handlers
    Promise.resolve().then(() => {
      try {
        fn();
      } catch (err) {
        console.error('[pwa] onChange failed', err);
      }
    });
  }

  // Listen straight away: Chrome can fire beforeinstallprompt right after load.
  if (hasWindow) {
    window.addEventListener('beforeinstallprompt', (e) => {
      // no mini-infobar; the title screen has a quiet "Install" link instead
      e.preventDefault();
      state.installEvent = e;
      notify();
    });
    window.addEventListener('appinstalled', () => {
      state.installEvent = null;
      state.installed = true;
      notify();
    });
  }

  // Registers the service worker (production builds only; the dev server's
  // virtual:pwa-register is an empty stub anyway). workbox-window waits for
  // the page's load event, so the game's own files load first.
  function start() {
    if (state.started || !hasWindow || !isProductionBuild()) return;
    state.started = true;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateSW = registerSW({
          onNeedRefresh() {
            state.needRefresh = true;
            notify();
          },
          // The waiting version took over. After our own "Refresh", reload
          // now; if another tab did it, never reload mid-night: the menus
          // offer "Refresh" again.
          onNeedReload() {
            if (state.applying) {
              reload();
              return;
            }
            state.reloadPending = true;
            state.needRefresh = true;
            notify();
          },
          onOfflineReady() {
            state.offlineReady = true;
            notify();
          },
          onRegisteredSW(_url, registration) {
            if (!registration) return;
            state.registration = registration;
            setInterval(checkForUpdate, CHECK_EVERY_MS);
            document.addEventListener('visibilitychange', () => {
              if (!document.hidden) checkForUpdate();
            });
          },
          onRegisterError(err) {
            console.warn('[pwa] service worker registration failed', err);
          },
        });
      })
      .catch((err) => console.warn('[pwa] could not load the service worker register', err));
  }

  // Asks the server for a newer sw.js. Offline, or already installing one:
  // try again next time.
  function checkForUpdate() {
    const r = state.registration;
    if (!r || r.installing || state.needRefresh) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    if (now - state.lastCheck < CHECK_GAP_MS) return;
    state.lastCheck = now;
    r.update().catch(() => {
      /* offline or the host is down: the next check retries */
    });
  }

  function applyUpdate() {
    if (!state.needRefresh || state.applying) return;
    state.applying = true;
    notify();
    if (state.reloadPending || typeof updateSW !== 'function') {
      reload();
      return;
    }
    // Tells the waiting worker to take over; onNeedReload then reloads.
    Promise.resolve(updateSW()).catch((err) => console.warn('[pwa] update failed', err));
    setTimeout(reload, RELOAD_FALLBACK_MS);
  }

  function reload() {
    try {
      window.location.reload();
    } catch {
      /* nothing else to do */
    }
  }

  async function promptInstall() {
    const e = state.installEvent;
    if (!e || typeof e.prompt !== 'function') return 'unavailable';
    state.installEvent = null; // each event can open the dialog only once
    notify();
    try {
      await e.prompt();
      const choice = await e.userChoice;
      return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch (err) {
      console.warn('[pwa] install prompt failed', err);
      return 'unavailable';
    }
  }

  return api;
}
