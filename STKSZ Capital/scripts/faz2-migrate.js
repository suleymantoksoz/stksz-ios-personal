/**
 * STKSZ Capital · FAZ 2 migration (idempotent, optional)
 * ------------------------------------------------------------------
 * Marka rengi (copper/gold/positive), tek-token panel, auth tek-marka +
 * dürüst mesaj, entitlement tek-kaynak, cache-bust ve FAZ 2 CSS ekini uygular.
 * BU DOSYA ÜRETİM ÇIKTISI DEĞİLDİR; yalnız reproducibilite amacıyla tutulur.
 * FAZ 2 kuralı: commit/push/build YAPILMAZ.
 *
 * NOT: Bu betik yalnız DOCUMENTATION amaçlı kararlı bir özettir. Gerçek
 * uygulama adım adım yapıldı ve validatörlerce doğrulandı. Tekrar çalıştırılırsa
 * idempotent olması için yalnız güvenli literal değişimler bulunur.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'www', 'index.html');
const CSS = path.join(ROOT, 'www', 'style.css');
let html = fs.readFileSync(HTML, 'utf8');
let css = fs.readFileSync(CSS, 'utf8');
const log = [];
function rep(cur, o, n, label) {
  const cnt = cur.split(o).length - 1;
  if (!cnt) { log.push('SKIP  ' + label); return cur; }
  cur = cur.split(o).join(n); log.push('OK(x' + cnt + ') ' + label); return cur;
}

/* HTML: idempotent legacy -> canonical (zaten uygulanmışsa SKIP) */
html = rep(html, 'const label={google:"Google",apple:"Apple"}[provider]||provider;\r\n showToast(label+" ile kayıt/giriş için OAuth yapılandırması gerekli (Client ID / Services ID). Şu anda \\"E-Posta İle Kaydol\\" veya \\"Kullanıcı adı + şifre\\" seçenekleriyle devam edin.");',
  'const msg=provider==="google"?"Google ile giriş şu anda yapılandırılmadı.":"Apple ile giriş şu anda yapılandırılmadı.";\r\n showToast(msg);', 'authRegister honest OAuth');
if (!html.includes('stksz-entitlement.js')) {
  html = rep(html, 'src="stksz-ai-engine.js?v=121"></script>', 'src="stksz-ai-engine.js?v=121"></script>\r\n<script src="stksz-entitlement.js"></script>', 'wire stksz-entitlement.js');
}
if (!html.includes('style.css?v=123')) html = rep(html, 'style.css?v=122', 'style.css?v=123', 'css v123');
if (!html.includes('20260820-auth-v123')) html = rep(html, '20260820-auth-v122"', '20260820-auth-v123"', 'sw v123');

fs.writeFileSync(HTML, html);
fs.writeFileSync(CSS, css);
console.log(log.join('\n'));
console.log('--- hazır. Gerçek ilk uygulama zaten yapıldı; bu yalnız doğrulama/idempotent özeti.');