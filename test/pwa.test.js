// The "where are we running?" checks behind the install hints (src/core/pwa.js).

import { describe, it, expect } from 'vitest';
import { isIOS, isIPad, isIOSSafari, isInAppBrowser, isStandalone, createPwa } from '../src/core/pwa.js';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  // iPadOS Safari asks for the desktop site by default
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/390.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0',
  iphoneHomeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

describe('isIOS', () => {
  it('spots iPhone, and iPad behind its desktop-site user agent', () => {
    expect(isIOS(UA.iphoneSafari, 5)).toBe(true);
    expect(isIOS(UA.ipadSafari, 5)).toBe(true);
    expect(isIOS(UA.iphoneHomeScreen, 5)).toBe(true);
  });

  it('leaves out Macs (no touch screen) and Android', () => {
    expect(isIOS(UA.macSafari, 0)).toBe(false);
    expect(isIOS(UA.androidChrome, 5)).toBe(false);
  });
});

describe('isIPad', () => {
  it('spots iPad, also behind its desktop-site user agent, but not iPhone or a Mac', () => {
    expect(isIPad(UA.ipadSafari, 5)).toBe(true);
    expect(isIPad('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5)).toBe(true);
    expect(isIPad(UA.iphoneSafari, 5)).toBe(false);
    expect(isIPad(UA.macSafari, 0)).toBe(false);
  });
});

describe('isIOSSafari', () => {
  it('is Safari on iPhone and iPad', () => {
    expect(isIOSSafari(UA.iphoneSafari, 5)).toBe(true);
    expect(isIOSSafari(UA.ipadSafari, 5)).toBe(true);
  });

  it('is not another iOS browser, an in-app browser or a Mac', () => {
    expect(isIOSSafari(UA.iphoneChrome, 5)).toBe(false);
    expect(isIOSSafari(UA.iphoneGoogleApp, 5)).toBe(false);
    expect(isIOSSafari(UA.iphoneInstagram, 5)).toBe(false);
    expect(isIOSSafari(UA.macSafari, 0)).toBe(false);
    expect(isIOSSafari(UA.androidChrome, 5)).toBe(false);
  });
});

describe('isInAppBrowser', () => {
  it('spots social apps and Android WebViews', () => {
    expect(isInAppBrowser(UA.iphoneInstagram)).toBe(true);
    expect(isInAppBrowser(UA.androidWebView)).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/500.0]')).toBe(true);
  });

  it('leaves real browsers alone', () => {
    expect(isInAppBrowser(UA.iphoneSafari)).toBe(false);
    expect(isInAppBrowser(UA.androidChrome)).toBe(false);
    expect(isInAppBrowser(undefined)).toBe(false);
  });
});

describe('isStandalone', () => {
  const fakeWindow = ({ standalone, modes = [] }) => ({
    navigator: { standalone },
    matchMedia: (q) => ({ matches: modes.some((m) => q === `(display-mode: ${m})`) }),
  });

  it('is true for an installed app (display-mode or iOS navigator.standalone)', () => {
    expect(isStandalone(fakeWindow({ modes: ['standalone'] }))).toBe(true);
    expect(isStandalone(fakeWindow({ modes: ['window-controls-overlay'] }))).toBe(true);
    expect(isStandalone(fakeWindow({ standalone: true }))).toBe(true);
  });

  it('is false in a browser tab, and without a window', () => {
    expect(isStandalone(fakeWindow({ standalone: false, modes: ['browser'] }))).toBe(false);
    expect(isStandalone(null)).toBe(false);
  });
});

describe('createPwa', () => {
  it('works without a browser: nothing to offer, nothing thrown', async () => {
    const pwa = createPwa();
    pwa.start();
    expect(pwa.updateReady).toBe(false);
    expect(pwa.offlineReady).toBe(false);
    expect(pwa.canInstall).toBe(false);
    expect(pwa.canAddToHomeScreen).toBe(false);
    expect(pwa.separateAppStorage).toBe(false);
    expect(await pwa.promptInstall()).toBe('unavailable');
    expect(() => pwa.applyUpdate()).not.toThrow();
  });
});
