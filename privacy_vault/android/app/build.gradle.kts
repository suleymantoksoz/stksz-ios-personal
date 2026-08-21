plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release imzası (opsiyonel): android/key.properties mevcutsa production imzasıyla
// derlenir; YOKSA debug anahtarı kullanılır (CI'da secrets tanımlı değilse bu yol —
// sahte production key ÜRETİLMEZ). key.properties .gitignore ile korunur; alanlar:
//   storeFile=release-key.jks  (key.properties ile AYNI dizin: android/)
//   storePassword=...  keyPassword=...  keyAlias=...
val keystoreProperties = java.util.Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.isFile) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.privacyvault.privacy_vault"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.privacyvault.privacy_vault"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 23 // BiometricPrompt + EncryptedSharedPreferences tabanı
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        // Yalnızca key.properties gerçekten varsa doldurulur (yukarıdaki blok).
        create("release") {
            if (keystorePropertiesFile.isFile) {
                storeFile = keystoreProperties.getProperty("storeFile")
                    ?.let { keystorePropertiesFile.parentFile.resolve(it) }
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // key.properties yoksa debug anahtarıyla imzala (kurulabilir test
            // sürümü; mağaza dağıtımı için gerçek keystore secrets'ları gerekir).
            signingConfig = if (keystorePropertiesFile.isFile)
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
