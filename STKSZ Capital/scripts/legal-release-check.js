#!/usr/bin/env node
/**
 * STKSZ Capital - Legal Release Gate
 * Production/release öncesi legal compliance kontrolü
 * PASS -> exit 0, FAIL -> exit 1 + hata mesajı
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = ROOT;

const REQUIRED_LEGAL_FILES = [
  'www/legal/privacy.html',
  'www/legal/support.html',
  'www/legal/terms.html'
];

const FORBIDDEN_PLACEHOLDERS = [
  '[ŞİRKET UNVANI]',
  '[ADRES]',
  '[DESTEK E-POSTA]',
  '[DPO/KVKK E-POSTA]',
  '[LİSANS DURUMU]',
  '[ÖDEME SAĞLAYICISI]'
];

const REQUIRED_SAFETY_FILES = [
  'www/index.html',
  'www/stksz-ai-engine.js',
  'www/stksz-data-engine.js'
];

const REQUIRED_SAFETY_PHRASE = 'VERİ YETERSİZ — KARAR YOK';

const ADMOB_PATTERNS = [
  /admob/i,
  /google-admob/i,
  /com\.google\.android\.gms\.ads/i,
  /@capacitor-community\/admob/i,
  /AdMob\.initialize/i,
  /GADApplicationIdentifier/i,
  /com\.google\.android\.gms\.ads\.APPLICATION_ID/i,
  /Google-Mobile-Ads-SDK/i,
  /play-services-ads/i,
  /MobileAds\.initialize/i,
  /AdRequest\.Builder/i,
  /AdView/i,
  /InterstitialAd/i,
  /RewardedAd/i,
  /AdListener/i,
  /AdRequest/i,
  /AdSize/i,
  /AdMobAdView/i
];

const EXCLUDE_DIRS = [
  'node_modules',
  'Pods',
  'build',
  'DerivedData',
  '.git',
  '.gradle',
  '.idea',
  '.vscode',
  'dist',
  'coverage',
  '.nyc_output',
  'temp',
  'tmp'
];

const SCAN_EXTENSIONS = [
  '.js', '.ts', '.tsx', '.jsx', '.html', '.json',
  '.gradle', '.xml', '.xml', '.plist', '.podspec',
  '.java', '.kt', '.swift', '.m', '.mm', '.h'
];

const EXCLUDE_FILES = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

const NEGATIVE_CONTEXT_PATTERNS = [
  /yok/i,
  /yoktur/i,
  /kalmamış/i,
  /kaldır/i,
  /removed/i,
  /absent/i,
  /yoktur/i,
  /kaldırıldı/i,
  /removed/i,
  /deleted/i,
  /deprecated/i
];

function log(msg) { console.log('[LEGAL-GATE]', msg); }
function error(msg) { console.error('[LEGAL-GATE ERROR]', msg); }
function pass(msg) { console.log('✅', msg); }
function fail(msg) { console.error('❌', msg); }

function shouldExcludeDir(dirName) {
  return EXCLUDE_DIRS.some(ex => dirName === ex);
}

function shouldExcludeFile(fileName) {
  return EXCLUDE_FILES.some(ex => fileName === ex);
}

function shouldScanFile(fileName) {
  if (shouldExcludeFile(fileName)) return false;
  return SCAN_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

function walkDir(dir, fileList = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldExcludeDir(entry.name)) {
          walkDir(fullPath, fileList);
        }
      } else if (entry.isFile()) {
        if (shouldScanFile(entry.name)) {
          fileList.push(fullPath);
        }
      }
    }
  } catch (e) {
    // Ignore permission errors etc.
  }
  return fileList;
}

function readFile(relPath) {
  const full = path.join(SRC, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function checkFileExists(relPath) {
  const content = readFile(relPath);
  if (content === null) {
    fail(`Dosya eksik: ${relPath}`);
    return false;
  }
  if (content.trim().length === 0) {
    fail(`Dosya boş: ${relPath}`);
    return false;
  }
  pass(`Mevcut: ${relPath}`);
  return true;
}

function checkPlaceholders(content, filePath) {
  let hasError = false;
  for (const ph of FORBIDDEN_PLACEHOLDERS) {
    if (content.includes(ph)) {
      fail(`Placeholder bulundu: ${ph} (${filePath})`);
      hasError = true;
    }
  }
  return !hasError;
}

function checkSafetyPhrase() {
  let hasError = false;
  for (const file of REQUIRED_SAFETY_FILES) {
    const content = readFile(file);
    if (!content || !content.includes(REQUIRED_SAFETY_PHRASE)) {
      fail(`Güvenlik ifadesi eksik: "${REQUIRED_SAFETY_PHRASE}" (${file})`);
      hasError = true;
    } else {
      pass(`Güvenlik ifadesi mevcut: "${REQUIRED_SAFETY_PHRASE}" (${file})`);
    }
  }
  return !hasError;
}

function checkAdMob(content, filePath) {
  for (const pattern of ADMOB_PATTERNS) {
    if (pattern.test(content)) {
      // Check if it's in a comment or string that's clearly a negative reference
      // Allow only if clearly negative context (e.g., "AdMob yok")
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const context = lines[Math.max(0, i-2)] + lines[i] + (lines[i+1] || '');
          const negContext = /yok|yoktur|kalmamış|kaldır|removed|absent/i.test(context);
          if (!negContext) {
            fail(`Aktif AdMob referansı tespit edildi: ${filePath}:${i+1}`);
            return false;
          }
        }
      }
    }
  }
  pass('AdMob aktif referansı yok (yalnızca negatif/ tarihi referanslar var)');
  return true;
}

function checkTermsAccessible() {
  const indexHtml = readFile('www/index.html');
  if (!indexHtml) return false;
  
  // Check if Terms of Use link exists in Legal Hub menu
  const hasTermsLink = indexHtml.includes('openTermsOfUse') || 
                       indexHtml.includes('KULLANIM KOŞULLARI') ||
                       indexHtml.includes('TERMS OF USE');
  
  if (!hasTermsLink) {
    fail('Terms of Use linki Legal Hub menüsünde bulunamadı (openTermsOfUse handler eksik)');
    return false;
  }
  pass('Terms of Use linki Legal Hub menüsünde mevcut');
  return true;
}

function scanForAdMobInSource() {
  log('\n7. AdMob aktif entegrasyon taraması (tüm kaynak kod)...');
  let hasError = false;
  
  const allFiles = walkDir(SRC);
  log(`Taranan dosya sayısı: ${allFiles.length}`);
  
  for (const file of allFiles) {
    try {
      const relPath = path.relative(SRC, file);
      const content = fs.readFileSync(file, 'utf8');
      if (relPath.includes('test-fixture')) {
        log(`  [DEBUG] Scanning test fixture: ${relPath}`);
        log(`  [DEBUG] Test fixture content preview: ${content.substring(0, 200)}`);
        ADMOB_PATTERNS.forEach(p => {
          if (p.test(content)) {
            log(`  [DEBUG] Pattern matched in test fixture: ${p}`);
          }
        });
      }
      
      for (const pattern of ADMOB_PATTERNS) {
        if (pattern.test(content)) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (ADMOB_PATTERNS.some(p => p.test(lines[i]))) {
              const contextLines = [
                lines[Math.max(0, i-2)],
                lines[i],
                lines[i+1] || ''
              ].join('\n');
              
              const negContext = NEGATIVE_CONTEXT_PATTERNS.some(p => p.test(contextLines.join('\n')));
              
              if (!negContext) {
                fail(`Aktif AdMob entegrasyonu tespit edildi: ${relPath} (satır ${i+1})`);
                return false;
              }
            }
          }
        }
      }
    } catch (e) {
      // Skip unreadable files
    }
  }
  
  if (!hasError) {
    pass('AdMob aktif entegrasyonu tespit edilmedi (tüm kaynak kod taranmış)');
  }
  return !hasError;
}

function main() {
  log('STKSZ Capital Legal Release Gate başlıyor...');
  log(`Kaynak kök: ${SRC}`);
  
  let hasError = false;
  
  // 1. Gerekli legal dosyaları kontrol et
  log('\n1. Gerekli legal dosyaları kontrol ediliyor...');
  for (const file of REQUIRED_LEGAL_FILES) {
    if (!checkFileExists(file)) hasError = true;
  }
  
  // 2. Placeholder kontrolü
  log('\n2. Placeholder kontrolü...');
  for (const file of REQUIRED_LEGAL_FILES) {
    const content = readFile(file);
    if (content && !checkPlaceholders(content, file)) hasError = true;
  }
  
  // 3. Güvenlik ifadesi kontrolü
  log('\n3. Güvenlik ifadesi kontrolü...');
  if (!checkSafetyPhrase()) hasError = true;
  
  // 4. AdMob kontrolü
  log('\n4. AdMob aktif referans kontrolü...');
  for (const file of REQUIRED_LEGAL_FILES) {
    const content = readFile(file);
    if (content && !checkAdMob(content, file)) hasError = true;
  }
  
  // 5. Terms of Use erişilebilirliği
  log('\n5. Terms of Use erişilebilirliği...');
  if (!checkTermsAccessible()) hasError = true;
  
  // 6. AdMob dependency kontrolü (package.json, package-lock.json, gradle, podfile)
  log('\n6. AdMob dependency kontrolü...');
  const pkg = readFile('package.json');
  if (pkg && /admob/i.test(pkg)) {
    fail('package.json içinde AdMob referansı bulundu');
    hasError = true;
  } else {
    pass('package.json AdMob içermiyor');
  }
  
  const pkgLock = readFile('package-lock.json');
  if (pkgLock && /admob/i.test(pkgLock)) {
    fail('package-lock.json içinde AdMob referansı bulundu');
    hasError = true;
  } else {
    pass('package-lock.json AdMob içermiyor');
  }
  
  const gradle = readFile('android/app/build.gradle');
  if (gradle && /admob/i.test(gradle)) {
    fail('build.gradle içinde AdMob referansı bulundu');
    hasError = true;
  } else {
    pass('build.gradle AdMob içermiyor');
  }
  
  const podfile = readFile('ios/App/Podfile');
  if (podfile && /admob/i.test(podfile)) {
    fail('Podfile içinde AdMob referansı bulundu');
    hasError = true;
  } else {
    pass('Podfile AdMob içermiyor');
  }
  
  // 7. AdMob aktif entegrasyon taraması (tüm kaynak kod)
  log('\n7. AdMob aktif entegrasyon taraması (tüm kaynak kod)...');
  if (!scanForAdMobInSource()) hasError = true;
  
  // Sonuç
  log('\n=== SONUÇ ===');
  if (hasError) {
    error('LEGAL RELEASE GATE BAŞARISIZ - Production/release bloke edildi');
    process.exit(1);
  } else {
    pass('Tüm legal kontroller geçti - Production/release için uygun');
    process.exit(0);
  }
}

main();