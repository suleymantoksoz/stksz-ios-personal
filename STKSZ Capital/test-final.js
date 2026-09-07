const testCases = [
  {
    name: 'test-admob-capacitor.ts',
    content: 'import { AdMob } from "@capacitor-community/admob";\nAdMob.initialize();'
  },
  {
    name: 'AndroidManifest.xml',
    content: '<manifest>\n  <application>\n    <meta-data\n      android:name="com.google.android.gms.ads.APPLICATION_ID"\n      android:value="ca-app-pub-1234567890123456~1234567890"/>\n  </application>\n</manifest>'
  },
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

console.log('=== DETAILED DEBUG TEST ===\n');

const testCases = [
  {
    name: 'test-admob-capacitor.ts',
    content: 'import { AdMob } from "@capacitor-community/admob";\nAdMob.initialize();'
  },
  {
    name: 'AndroidManifest.xml',
    content: '<manifest>\n  <application>\n    <meta-data\n      android:name="com.google.android.gms.ads.APPLICATION_ID"\n      android:value="ca-app-pub-1234567890123456~1234567890"/>\n  </application>\n</manifest>'
  },
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

console.log('=== DETAILED DEBUG TEST ===\n');

const testCases = [
  {
    name: 'test-admob-capacitor.ts',
    content: 'import { AdMob } from "@capacitor-community/admob";\nAdMob.initialize();'
  },
  {
    name: 'AndroidManifest.xml',
    content: '<manifest>\n  <application>\n    <meta-data\n      android:name="com.google.android.gms.ads.APPLICATION_ID"\n      android:value="ca-app-pub-1234567890123456~1234567890"/>\n  </application>\n</manifest>'
  },
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

console.log('=== DETAILED DEBUG TEST ===\n');

testCases.forEach((testCase, testIndex) => {
  const lines = testCase.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const contextLines = [
      lines[Math.max(0, i-2)],
      lines[i],
      lines[i+1] || ''
    ];
    const contextText = contextLines.join('\n');
    
    const negContext = [
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
    ].some(p => p.test(contextLines.join('\n')));
    
    console.log('\nTest:', testCases[testIndex].name);
    console.log('Line:', i, ':', lines[i]);
    console.log('Context:', contextText);
    console.log('Negative context:', negContext);
    console.log('Would FAIL:', !negContext);
    console.log('---');
  });
});