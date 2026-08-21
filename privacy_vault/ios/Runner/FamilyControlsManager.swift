import Foundation

// ╔══════════════════════════════════════════════════════════════════╗
// ║  FAZ 6 (iOS) — SCREEN TIME APP LOCK MODÜLÜ (YOL HARİTASI)          ║
// ║                                                                    ║
// ║  Bu dosya kasıtlı olarak AppDelegate'e BAĞLANMAMIŞTIR.             ║
// ║  iOS'ta başka uygulamaları kilitlemenin TEK resmi yolu şunlardır:  ║
// ║    • FamilyControls (yetkilendirme + uygulama seçici)              ║
// ║    • ManagedSettings (uygulama kalkanı)                            ║
// ║    • DeviceActivity (izleme/zamanlama)                             ║
// ║                                                                    ║
// ║  AKTİVE ETMEK İÇİN GEREKENLER:                                     ║
// ║    1. Ücretli Apple Developer hesabı                               ║
// ║    2. Apple'a Family Controls entitlement başvurusu + ONAY         ║
// ║       (developer.apple.com/contact/request/family-controls)        ║
// ║    3. Xcode Signing sekmesinden entitlement'ı ekleme               ║
// ║  Entitlement onaylandıktan sonra aşağıdaki kodun yorumlarını       ║
// ║  kaldır ve AppDelegate'ten MethodChannel "privacy_vault/native"    ║
// ║  üzerinden "syncLockState" çağrısını buraya yönlendir.             ║
// ╚══════════════════════════════════════════════════════════════════╝

/*
import FamilyControls
import ManagedSettings
import DeviceActivity

final class FamilyControlsManager: NSObject {

    static let shared = FamilyControlsManager()
    private let store = ManagedSettingsStore(named: .init("privacy_vault_shields"))
    private let center = AuthorizationCenter.shared

    /// Adım 1 — Kullanıcıdan Screen Time yetkisi iste (Apple bunun kullanıcı onaylı
    /// olmasını şart koşar; bireysel kullanım için .individual).
    func requestAuthorization() async throws {
        try await center.requestAuthorization(for: .individual)
    }

    var isAuthorized: Bool {
        center.authorizationStatus == .approved
    }

    /// Adım 2 — Korunacak uygulamaları Apple'ın seçici arayüzünde seçtir.
    /// Uygulama İÇERİĞİNE erişemezsin; yalnızca ApplicationToken seti alırsın (gizlilik by-design).
    /// UI tarafında: FamilyActivityPicker(isPresented: $shown, selection: $selection)
    var selection = FamilyActivitySelection()

    /// Adım 3 — Seçili uygulamalara kalkan (shield) uygula: kilit etkisi budur.
    /// Kullanıcı kalkan ekranında "biyometrik/PIN ile aç" akışını ShieldConfiguration
    /// extension'ı ile özelleştirebilir.
    func applyShields() {
        store.shield.applications = selection.applicationTokens
        store.shield.applicationCategories = ShieldSettings.ActivityCategoryPolicy.specific(
            selection.categoryTokens
        )
    }

    func removeShields() {
        store.clearAllSettings()
    }

    /// Per-app yöntem eşleşmesi, kalkan ekranındaki özel aksiyon üzerinden
    /// ShieldActionDelegate extension'ında işlenir; PIN doğrulaması
    /// uygulamamızın Flutter tarafındaki aynı PBKDF2 hash'iyle yapılır
    /// (App Group üzerinden paylaşılan KeyChain ile).
}
*/
