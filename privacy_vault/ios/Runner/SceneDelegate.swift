import Flutter
import UIKit

/// iOS 13+ scene tabanlı yaşam döngüsü: privacy overlay ve native kanal burada
/// yaşar. (AppDelegate'in applicationWillResignActive/DidEnterBackground
/// çağrıları scene kullanan uygulamalarda tetiklenmeYebilir — overlay doğru
/// yer burasıdır.)
class SceneDelegate: FlutterSceneDelegate {

    private var privacyShield: UIView?

    override func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        super.scene(scene, willConnectTo: session, options: connectionOptions)
        setupNativeChannel()
    }

    // ---------- privacy overlay (background snapshot / app switcher) ----------
    override func sceneWillResignActive(_ scene: UIScene) {
        super.sceneWillResignActive(scene)
        showShield()
    }

    override func sceneDidEnterBackground(_ scene: UIScene) {
        super.sceneDidEnterBackground(scene)
        showShield()
    }

    override func sceneDidBecomeActive(_ scene: UIScene) {
        super.sceneDidBecomeActive(scene)
        hideShield()
    }

    private func showShield() {
        guard privacyShield == nil, let window = window ?? UIApplication.shared.windows.first else { return }
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
        blur.frame = window.bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        let label = UILabel()
        label.text = "🛡 PRIVACY VAULT"
        label.textColor = .white
        label.font = .systemFont(ofSize: 14, weight: .bold)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        blur.contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: blur.contentView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: blur.contentView.centerYAnchor),
        ])

        window.addSubview(blur)
        privacyShield = blur
    }

    private func hideShield() {
        privacyShield?.removeFromSuperview()
        privacyShield = nil
    }

    // ---------- native kanal ----------
    private func setupNativeChannel() {
        guard let controller = window?.rootViewController as? FlutterViewController else { return }
        let channel = FlutterMethodChannel(
            name: "privacy_vault/native",
            binaryMessenger: controller.binaryMessenger)
        channel.setMethodCallHandler { call, result in
            switch call.method {
            case "setLauncherIdentity":
                // Dürüstlük: iOS'ta uygulama ADI değişmez; alternatif SİMGE yalnızca
                // build zamanında CFBundleIcons ile yapılandırıldıysa çalışır.
                // Yapılandırma yoksa OS hata verir → false (mock başarı YOK).
                let args = call.arguments as? [String: Any]
                let id = args?["id"] as? String ?? "default"
                UIApplication.shared.setAlternateIconName(id == "default" ? nil : id) { error in
                    result(error == nil)
                }
            default:
                result(FlutterMethodNotImplemented)
            }
        }
    }
}
