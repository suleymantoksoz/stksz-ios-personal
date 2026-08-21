import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {

    /// Privacy overlay + native kanal SceneDelegate'te yaşar (iOS 13+ scene
    /// yaşam döngüsü — bkz. SceneDelegate.swift). AppDelegate yalnızca plugin
    /// kaydını yapar.
    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GeneratedPluginRegistrant.register(with: self)
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }
}
