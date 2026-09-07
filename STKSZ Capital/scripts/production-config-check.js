#!/usr/bin/env node
/**
 * STKSZ Capital - Production Config Check
 * Üretim/release öncesi dış bağımlılık ve ortam yapılandırması kontrolü.
 *
 * İki mod:
 *   Varsayılan (geliştirme)      -> eksik yapılandırma uyarısı verir, exit 0
 *   PRODUCTION_RELEASE=true      -> eksik yapılandırma varsa exit 1 (release bloke)
 *
 * Kontroller:
 *   1. GEMINI_API_KEY     (AI backend · yalnız sunucu ortam değişkeni)
 *   2. ENV_GOOGLE_CLIENT_ID  (Google Sign-In)
 *   3. ENV_APPLE_CLIENT_ID   (Apple Sign-In)
 *   4. .env gizliliği (repo'da .env dosyası commit edilmemeli, .env.example var)
 *   5. Legal placeholder yokluğu + destek e-posta tutarlılığı
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function log(msg) { console.log('[PROD-CONFIG]', msg); }
function pass(msg) { console.log('[PROD-CONFIG] ✅', msg); }
function warn(msg) { console.warn('[PROD-CONFIG] ⚠️', msg); }
function fail(msg) { console.error('[PROD-CONFIG] ❌', msg); }

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function listFiles(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).map(name => path.join(dir, name));
}

function main() {
  const isRelease = process.env.PRODUCTION_RELEASE === 'true';
  const mode = isRelease ? 'RELEASE' : 'DEV (varsayılan)';
  log(`STKSZ Capital Production Config Check başlıyor... (mod: ${mode})`);
  log(`Kaynak kök: ${ROOT}`);

  // 1..3. Zorunlu ortam değişkenleri
  log('\n1) Zorunlu ortam değişkenleri (yalnız sunucu/barındırma ortamı)...');
  const requiredEnv = [
    ['GEMINI_API_KEY', 'Google Gemini AI backend anahtarı (server/stksz-ai-server.js)'],
    ['ENV_GOOGLE_CLIENT_ID', 'Google Sign-In OAuth Client ID (Web)'],
    ['ENV_APPLE_CLIENT_ID', 'Apple Sign-In Services ID (Web)']
  ];
  const missingEnv = [];
  for (const [name, desc] of requiredEnv) {
    const value = process.env[name] || '';
    if (value && value.trim().length > 0) {
      pass(`${name} tanımlı (${desc})`);
    } else {
      const msg = `${name} TANIMLI DEĞİL (${desc}) — .env veya barındırma panelinde tanımlayın`;
      if (isRelease) fail(msg); else warn(msg);
      missingEnv.push(name);
    }
  }

  // 4. .env gizliliği ve .env.example şablonu
  log('\n2) .env gizliliği ve şablon dosyası...');
  let envError = false;
  const dotEnv = path.join(ROOT, '.env');
  if (fs.existsSync(dotEnv)) {
    const isGitIgnored = readFile('.gitignore') || '';
    if (!/^\.env([\s.].*)?$/m.test(isGitIgnored) && !isGitIgnored.includes('!.env.example')) {
      const msg = 'DEPO İÇİNDE .env VAR ve .gitignore koruması doğrulanamadı — sızıntı riski!';
      if (isRelease) fail(msg); else warn(msg);
      envError = true;
    } else {
      pass('.env mevcut ve .gitignore ile korunuyor (commit edilmez)');
    }
  } else {
    pass('.env repo içinde YOK (doğru yaklaşım — değerler barındırma panelinde saklanır)');
  }

  const example = readFile('.env.example');
  if (example) {
    const envNames = (example.match(/^[A-Z][A-Z0-9_]+=/gm) || []).map(line => line.replace('=', ''));
    pass('.env.example mevcut ve şu değişkenleri tanımlıyor: ' + (envNames.join(', ') || '(yok)'));
    if (isRelease && missingEnv.length) {
      const exampleMissing = missingEnv.filter(n => !envNames.includes(n));
      if (exampleMissing.length) {
        fail(`${exampleMissing.join(', ')} .env.example içinde eksik`);
        envError = true;
      }
    }
  } else {
    const msg = '.env.example dosyası eksik';
    if (isRelease) fail(msg); else warn(msg);
    envError = true;
  }

  // 5. Legal placeholder + destek e-posta tutarlılığı
  log('\n3) Legal tutarlılık (placeholder + destek e-posta)...');
  let legalError = false;
  const FORBIDDEN_PLACEHOLDERS = [
    '[ŞİRKET UNVANI]',
    '[ADRES]',
    '[DESTEK E-POSTA]',
    '[DPO/KVKK E-POSTA]',
    '[LİSANS DURUMU]',
    '[ÖDEME SAĞLAYICISI]'
  ];
  const CANONICAL_EMAIL = 'stksz-capital@outlook.com';
  const legalFiles = listFiles('www/legal').filter(name => name.endsWith('.html'));

  if (!legalFiles.length) {
    const msg = 'www/legal/ altında hiçbir legal dosya yok';
    if (isRelease) fail(msg); else warn(msg);
    legalError = true;
  }

  for (const rel of legalFiles) {
    const content = readFile(rel);
    if (!content) continue;
    for (const ph of FORBIDDEN_PLACEHOLDERS) {
      if (content.includes(ph)) {
        const msg = `Placeholder bulundu: ${ph} (${rel})`;
        if (isRelease) fail(msg); else warn(msg);
        legalError = true;
      }
    }
    const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const bad = emails.filter(e => e.toLowerCase() !== CANONICAL_EMAIL);
    if (bad.length) {
      const msg = `Farklı e-posta referansı (${rel}): ${bad.join(', ')} — kanonik ${CANONICAL_EMAIL} olmalı`;
      if (isRelease) fail(msg); else warn(msg);
      legalError = true;
    } else {
      pass(`${rel}: placeholder yok, e-posta tutarlı (${emails.length ? CANONICAL_EMAIL : 'e-posta yok — FAQ sayfası olabilir'})`);
    }
  }

  const indexContent = readFile('www/index.html') || '';
  if (indexContent.includes(CANONICAL_EMAIL)) {
    pass(`Destek e-postası index.html içinde mevcut (${CANONICAL_EMAIL})`);
  } else {
    const msg = `Destek e-postası index.html içinde bulunamadı (${CANONICAL_EMAIL})`;
    if (isRelease) fail(msg); else warn(msg);
    legalError = true;
  }

  // Sonuç
  const hasError = envError || legalError || (isRelease && missingEnv.length > 0);
  log('\n=== SONUÇ ===');
  if (isRelease) {
    if (hasError) {
      fail(`PRODUCTION RELEASE BLOKE — gereken dış değerler/legal değerler eksik (${missingEnv.join(', ')}${missingEnv.length ? ' ' : ''}dahil). Barındırma panelinde ve .env içinde tanımlayın.`);
      process.exit(1);
    }
    pass('PRODUCTION RELEASE READY — tüm zorunlu üretim yapılandırması tamam');
    process.exit(0);
  }
  if (hasError) {
    warn('Geliştirme modu: eksik yapılandırma var, ancak build bloke edilmedi. Yayın öncesi PRODUCTION_RELEASE=true ile doğrulayın.');
  } else {
    pass('Tüm yapılandırma kontrolleri geçti');
  }
  process.exit(0);
}

main();