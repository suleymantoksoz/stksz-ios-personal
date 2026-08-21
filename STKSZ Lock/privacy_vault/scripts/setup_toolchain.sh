#!/usr/bin/env bash
# Privacy Vault — sandbox toolchain kurulumu (Flutter SDK + Android SDK + JDK17).
# UYARI: ~3 GB indirir. İş bitince RUNBOOK'taki temizlik komutunu çalıştır —
# araç zinciri workspace snapshot limitine GİRMEMELİDİR.
set -e
cd /home/user

echo "== Flutter SDK =="
if [ ! -d flutter ]; then
  URL=$(curl -s https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json \
    | python3 -c "import json,sys; d=json.load(sys.stdin); h=d['current_release']['stable']; r=[x for x in d['releases'] if x['hash']==h][0]; print(d['base_url']+'/'+r['archive'])")
  curl -sL -o flutter.tar.xz "$URL"
  tar -xf flutter.tar.xz && rm flutter.tar.xz
  git config --global --add safe.directory /home/user/flutter || true
fi

echo "== JDK 17 =="
if [ ! -d jdk17 ]; then
  curl -sL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p jdk17 && tar -xzf jdk17.tar.gz -C jdk17 --strip-components=1 && rm jdk17.tar.gz
fi

echo "== Android SDK =="
if [ ! -d android-sdk ]; then
  curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  mkdir -p android-sdk/cmdline-tools && unzip -q cmdtools.zip -d android-sdk/cmdline-tools
  mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest && rm cmdtools.zip
  export JAVA_HOME=/home/user/jdk17 PATH=/home/user/jdk17/bin:$PATH
  yes | android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/home/user/android-sdk --licenses >/dev/null 2>&1 || true
  android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/home/user/android-sdk \
    "platform-tools" "platforms;android-34" "build-tools;34.0.0"
fi

echo "HAZIR — kullanım:"
echo '  export PATH=/home/user/flutter/bin:/home/user/jdk17/bin:$PATH'
echo '  export JAVA_HOME=/home/user/jdk17 ANDROID_HOME=/home/user/android-sdk'
