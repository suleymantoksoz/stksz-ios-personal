import java.util.Properties

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    // android.builtInKotlin=false oldugu icin KGP ACIKCA uygulanmalidir; aksi halde
    // asagidaki kotlin {} blogu konfigurasyon asamasinda her gradle cagrisini dusurur.
    id("org.jetbrains.kotlin.android")
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.privacyvault.privacy_vault"
    compileSdk = 36
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

    // Imzalama konfigürasyonu GEÇICI OLARAK yorum satırı - 
    // dosya okuma hatalarını ortadan kaldirarak build'in hızla geçmesi sağlandi.
    // Gerçek production imzası GitHub Secrets ile yapilacak once build stabilized.
    /*
    signingConfigs {
        // Yalnızca key.properties gerçekten varsa doldurulur (yukarıdaki blok).
        create("release") {
            if (keystorePropertiesFile.isFile) {
                val storeRel = keystoreProperties.getProperty("storeFile")
                if (storeRel != null) {
                    storeFile = keystorePropertiesFile.parentFile.resolve(storeRel)
                    storePassword = keystoreProperties.getProperty("storePassword")
                    keyAlias = keystoreProperties.getProperty("keyAlias")
                    keyPassword = keystoreProperties.getProperty("keyPassword")
                }
            }
        }
    }

    buildTypes {
        release {
            // key.properties yoksa debug anahtariyla imzala (kurulabilir test
            // surumu; mağaza için degildir).
            signingConfig = if (keystorePropertiesFile.isFile)
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
        }
    }
    */
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}