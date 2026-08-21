(function initStkszNative(global) {
  'use strict';

  const NATIVE_API_ORIGIN = 'https://app.stksz.app';
  const EXTERNAL_APPS = Object.freeze({
    midas: Object.freeze({
      universalLink: 'https://app.getmidas.com/gmih/?af_js_web=true&pid=mobile_web&af_pmod_attribution=false',
      storeUrl: 'itms-apps://apps.apple.com/tr/app/id1554268946',
      webUrl: 'https://www.getmidas.com/'
    }),
    enpara: Object.freeze({
      universalLink: 'https://internetsubesi.enpara.com/OpenBankingAppRedirection.aspx',
      storeUrl: '',
      webUrl: 'https://www.enpara.com/anasayfa'
    })
  });
  const state = {
    native: Boolean(global.Capacitor?.isNativePlatform?.()),
    platform: global.Capacitor?.getPlatform?.() || 'web',
    installPrompt: null,
    updateInfo: null,
    iosWeb: !global.Capacitor?.isNativePlatform?.() && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  };

  if (state.native) global.STKSZ_API_ORIGIN = NATIVE_API_ORIGIN;

  function plugin(name) { return global.Capacitor?.Plugins?.[name] || null; }
  function safePage(value) {
    const page = String(value || '').toLowerCase();
    return ['home', 'portfolio', 'news', 'status', 'risk', 'opportunities', 'settings'].includes(page) ? page : 'home';
  }
  function pageFromUrl(value) {
    try {
      const url = new URL(value, global.location.href);
      return safePage(url.searchParams.get('page') || (url.protocol === 'stksz:' ? url.hostname || url.pathname.replace(/^\//, '') : '') || url.hash.replace(/^#\/?/, ''));
    } catch { return 'home'; }
  }
  function openPage(page) {
    const target = safePage(page);
    const run = () => {
      if (typeof global.showPage !== 'function') return false;
      const button = document.querySelector(`.nav button[data-page="${target}"]`);
      global.showPage(target, button || undefined);
      return true;
    };
    if (!run()) global.addEventListener('load', run, { once: true });
  }

  function secureKey(key) { return `capacitor-storage_stksz_${String(key)}`; }
  async function saveSecret(key, value) {
    const store = plugin('SecureStorage');
    if (!state.native || !store || !value) return false;
    try {
      if (store.internalSetItem) await store.internalSetItem({ prefixedKey: secureKey(key), data: JSON.stringify(String(value)), sync: false, access: 0 });
      else await store.set?.(String(key), String(value));
      return true;
    } catch { return false; }
  }
  async function getSecret(key) {
    const store = plugin('SecureStorage');
    if (!state.native || !store) return '';
    try {
      if (store.internalGetItem) {
        const result = await store.internalGetItem({ prefixedKey: secureKey(key), sync: false });
        return result?.data ? String(JSON.parse(result.data) || '') : '';
      }
      return String((await store.get?.(String(key))) || '');
    } catch { return ''; }
  }
  async function removeSecret(key) {
    const store = plugin('SecureStorage');
    if (!state.native || !store) return false;
    try {
      if (store.internalRemoveItem) await store.internalRemoveItem({ prefixedKey: secureKey(key), sync: false });
      else await store.remove?.(String(key));
      return true;
    } catch { return false; }
  }

  async function share(options = {}) {
    const nativeShare = plugin('Share');
    if (state.native && nativeShare) {
      try { await nativeShare.share({ title: options.title || 'STKSZ', text: options.text || '', url: options.url || undefined, dialogTitle: 'STKSZ ile paylaş' }); return true; } catch (error) { if (error?.message?.toLowerCase().includes('cancel')) return false; }
    }
    if (navigator.share) {
      try { await navigator.share(options); return true; } catch (error) { if (error?.name === 'AbortError') return false; }
    }
    return false;
  }

  async function haptic() {
    const haptics = plugin('Haptics');
    if (!state.native || !haptics) return;
    try { await haptics.impact({ style: 'LIGHT' }); } catch {}
  }

  async function requestNotifications() {
    const notifications = plugin('LocalNotifications');
    if (!state.native || !notifications) return { granted: false, native: false };
    try {
      const permission = await notifications.requestPermissions();
      const granted = permission?.display === 'granted';
      if (granted) {
        await notifications.schedule({ notifications: [{ id: Math.floor(Date.now() / 1000) % 2147483647, title: 'STKSZ', body: 'Yerel bildirim altyapısı hazır.', schedule: { at: new Date(Date.now() + 1200) }, extra: { page: 'status' } }] });
      }
      return { granted, native: true };
    } catch { return { granted: false, native: true }; }
  }

  async function checkBiometry() {
    const biometric = plugin('BiometricAuthNative');
    if (!state.native || !biometric?.checkBiometry) return { native: state.native, isAvailable: false, deviceIsSecure: false, code: 'not_available' };
    try {
      const result = await biometric.checkBiometry();
      return { native: true, ...result, isAvailable: Boolean(result?.isAvailable) };
    } catch { return { native: true, isAvailable: false, deviceIsSecure: false, code: 'check_failed' }; }
  }

  async function authenticateSensitive(reason = 'ENR hassas bilgilerini göstermek için doğrulayın.') {
    const biometric = plugin('BiometricAuthNative');
    if (!state.native || !biometric?.internalAuthenticate) return { authenticated: false, native: state.native, code: 'not_available' };
    const availability = await checkBiometry();
    if (!availability.isAvailable) return { authenticated: false, native: true, code: availability.code || 'not_available' };
    try {
      await biometric.internalAuthenticate({
        reason,
        cancelTitle: 'İptal',
        allowDeviceCredential: false,
        iosFallbackTitle: ''
      });
      return { authenticated: true, native: true, code: '' };
    } catch (error) {
      return { authenticated: false, native: true, code: String(error?.code || 'authentication_failed') };
    }
  }

  function openWebFallback(url) {
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    if (!parsed || parsed.protocol !== 'https:') return false;
    const opened = global.open(parsed.href, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
    return Boolean(opened);
  }

  async function launchApp(target) {
    const config = EXTERNAL_APPS[String(target || '').toLowerCase()];
    if (!config) return { opened: false, target: String(target || ''), reason: 'unsupported_target' };
    const launcher = plugin('STKSZAppLauncher');
    if (state.native && launcher) {
      if (config.universalLink) {
        try {
          const result = await launcher.openUniversalLink({ url: config.universalLink });
          if (result?.opened) return { opened: true, target, destination: 'app' };
        } catch {}
      }
      const fallbackUrl = config.storeUrl || config.webUrl;
      try {
        const result = await launcher.openExternal({ url: fallbackUrl });
        return { opened: Boolean(result?.opened), target, destination: config.storeUrl ? 'app_store' : 'web' };
      } catch { return { opened: false, target, reason: 'open_failed' }; }
    }
    const fallbackUrl = config.universalLink || config.webUrl;
    return { opened: openWebFallback(fallbackUrl), target, destination: 'web' };
  }

  async function checkForUpdate() {
    return null;
  }

  function updateConnectivity() {
    const online = navigator.onLine;
    document.documentElement.dataset.connectivity = online ? 'online' : 'offline';
    global.dispatchEvent(new CustomEvent('stksz-connectivity', { detail: { online } }));
  }

  async function initializeNative() {
    if (!state.native) return;
    document.documentElement.dataset.native = state.platform;
    const statusBar = plugin('StatusBar');
    const splash = plugin('SplashScreen');
    try { await statusBar?.setOverlaysWebView({ overlay: false }); await statusBar?.setBackgroundColor({ color: '#050607' }); await statusBar?.setStyle({ style: 'LIGHT' }); } catch {}

    const app = plugin('App');
    try {
      await app?.addListener('appUrlOpen', event => openPage(pageFromUrl(event.url)));
      await app?.addListener('appStateChange', event => {
        if (event.isActive) {
          updateConnectivity();
          global.dispatchEvent(new CustomEvent('stksz-native-resume'));
        } else {
          global.dispatchEvent(new CustomEvent('stksz-native-pause'));
        }
      });
    } catch {}

    const notifications = plugin('LocalNotifications');
    try { await notifications?.addListener('localNotificationActionPerformed', event => openPage(event.notification?.extra?.page || 'status')); } catch {}

    setTimeout(() => splash?.hide?.().catch?.(() => {}), 450);
  }

  global.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    document.getElementById('pwaInstallBanner')?.removeAttribute('hidden');
  });
  global.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    document.getElementById('pwaInstallBanner')?.setAttribute('hidden', '');
  });
  global.addEventListener('online', updateConnectivity);
  global.addEventListener('offline', updateConnectivity);
  global.addEventListener('load', () => {
    updateConnectivity();
    if (state.iosWeb && !global.matchMedia('(display-mode: standalone)').matches && !navigator.standalone) {
      const banner = document.getElementById('pwaInstallBanner');
      banner?.removeAttribute('hidden');
      const small = banner?.querySelector('small');
      const button = banner?.querySelector('button');
      if (small) small.textContent = 'Safari Paylaş menüsü → Ana Ekrana Ekle';
      if (button) button.textContent = 'NASIL?';
    }
    openPage(pageFromUrl(global.location.href));
    document.getElementById('appBootSplash')?.classList.add('hide');
    setTimeout(() => document.getElementById('appBootSplash')?.remove(), 500);
  });
  document.addEventListener('click', event => {
    if (event.target.closest('button,.nav button,.menu-nav-trigger')) haptic();
  }, { passive: true });

  global.STKSZNative = {
    state,
    isNative: () => state.native,
    openPage,
    share,
    haptic,
    saveSecret,
    getSecret,
    removeSecret,
    checkBiometry,
    authenticateSensitive,
    launchApp,
    requestNotifications,
    checkForUpdate,
    install: async () => {
      if (!state.installPrompt) {
        if (state.iosWeb) alert('Safari’de Paylaş simgesine dokunun ve “Ana Ekrana Ekle” seçeneğini seçin.');
        return false;
      }
      await state.installPrompt.prompt();
      const choice = await state.installPrompt.userChoice;
      state.installPrompt = null;
      return choice?.outcome === 'accepted';
    }
  };

  initializeNative();
})(window);
