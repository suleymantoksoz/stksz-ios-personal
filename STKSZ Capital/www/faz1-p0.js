/* =====================================================================
   STKSZ CAPITAL · FAZ 2 — P0 runtime güvenlik guard katmanı
   ---------------------------------------------------------------------
   FAZ 1'de kaynak DOM zaten onarıldı (tüm ana .page #appScroll altında);
   bu katman canonical davranışın YERİNE geçmez, yalnız minimum guard:
   1) showPage() sargısı — hedef yoksa sessiz dön, hidden attr'ı koru,
      eski cache/APK'da nested page görülürse yeniden ebeveynle.
   2) Tek active ana sayfa garantisi (eski APK yükleme sıralarında).
   3) Arama modalı klavye/visualViewport — --stksz-vh günceller.
   Legal/AI/veri mantığına dokunmaz; düzenleme yalnız mobil görünüm.
   ===================================================================== */
(function () {
  'use strict';

  function mainEl() { return document.getElementById('appScroll'); }

  /* ---------- 1) showPage() güvenlik sargısı ---------- */
  var origShowPage = window.showPage;
  function wrappedShowPage(id, button) {
    var pageId = (id === 'risk') ? 'status' : id;
    var element = document.getElementById('page-' + pageId);
    if (!element) {
      if (window.console && console.error) console.error('[FAZ2-guard] showPage hedef mevcut değil: page-' + pageId);
      return;
    }
    /* eski cache/APK sigortası: hedef başka .page içindeyse #appScroll altına al */
    if (element.parentElement && element.parentElement !== mainEl()) {
      var ancestorPage = element.parentElement.closest ? element.parentElement.closest('.page') : null;
      if (ancestorPage) {
        try { mainEl().appendChild(element); } catch (e) {}
      }
    }
    element.hidden = false; /* hidden attr taşıyan sayfalar (ör. page-crypto-detail) için */
    if (typeof origShowPage === 'function') {
      return origShowPage.call(window, pageId, button);
    }
  }

  /* ---------- 2) Active ana sayfa tekil garanti ---------- */
  function ensureSingleActiveAfterShow() {
    var main = mainEl();
    if (!main) return;
    var actives = main.getElementsByClassName('active');
    var list = [];
    var k;
    for (k = 0; k < actives.length; k++) {
      if (actives[k].classList.contains('page')) list.push(actives[k]);
    }
    if (list.length > 1) {
      for (k = 1; k < list.length; k++) list[k].classList.remove('active');
    }
  }

  /* ---------- 3) Arama modalı: visualViewport tabanlı yükseklik ---------- */
  function applyVisualViewport() {
    var vv = window.visualViewport;
    var h = (vv && vv.height) ? Math.round(vv.height) : (window.innerHeight || 0);
    if (h > 0) {
      document.documentElement.style.setProperty('--stksz-vh', h + 'px');
    }
  }
  function bindVisualViewport() {
    applyVisualViewport();
    var vv = window.visualViewport;
    if (vv && typeof vv.addEventListener === 'function') {
      vv.addEventListener('resize', applyVisualViewport);
      vv.addEventListener('scroll', applyVisualViewport);
    }
    window.addEventListener('resize', applyVisualViewport);
    window.addEventListener('orientationchange', function () { setTimeout(applyVisualViewport, 120); });
  }

  function boot() {
    bindVisualViewport();
    if (typeof origShowPage === 'function' && !window.__faz2WrappedShowPage) {
      window.showPage = wrappedShowPage;
      window.__faz2WrappedShowPage = true;
    }
    ensureSingleActiveAfterShow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('pageshow', boot);
})();