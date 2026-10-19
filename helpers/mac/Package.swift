// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "camguard-helper-mac",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "CamGuardHelper",
            path: "Sources/CamGuardHelper"
        )
    ]
)
