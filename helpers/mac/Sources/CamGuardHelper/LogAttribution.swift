import Foundation
import AppKit

/// Gắn tên app đang dùng camera (best-effort) bằng cách đọc `log stream` của Control Center.
/// macOS KHÔNG có API công khai cho việc này → parser phải chịu lỗi, không được làm hỏng phát hiện bật/tắt.
/// Tham khảo cách tiếp cận của OverSight (Objective-See).
final class LogAttribution {
    private var process: Process?
    private let queue = DispatchQueue(label: "com.camguard.logattr")

    /// Danh sách bundle id đang được gắn (cam:<bundle-id>) từ Control Center.
    private(set) var activeBundleIds: [String] = []
    var onUpdate: (() -> Void)?
    private(set) var available = false

    func start() {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/log")
        p.arguments = [
            "stream",
            "--style", "ndjson",
            "--predicate",
            "subsystem == \"com.apple.controlcenter\" AND eventMessage CONTAINS \"attribution\""
        ]
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = Pipe()

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            self?.queue.async { self?.parse(text) }
        }

        p.terminationHandler = { [weak self] _ in
            self?.available = false
            Emit.error(code: "ATTRIBUTION_UNAVAILABLE", message: "log stream kết thúc")
        }

        do {
            try p.run()
            process = p
            available = true
            Emit.log("log stream attribution đã chạy")
        } catch {
            available = false
            Emit.error(code: "ATTRIBUTION_UNAVAILABLE",
                       message: "Không chạy được log stream: \(error.localizedDescription)")
        }
    }

    /// Mỗi dòng ndjson có trường eventMessage dạng:
    ///   "Active activity attributions changed to ["cam:com.apple.Safari", ...]"
    /// Ta trích mọi chuỗi "cam:<bundle-id>".
    private func parse(_ chunk: String) {
        for line in chunk.split(separator: "\n") {
            guard let data = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let msg = obj["eventMessage"] as? String else { continue }
            guard msg.contains("cam:") else { continue }

            var ids: [String] = []
            // tìm các token "cam:..." tới dấu phân cách
            var rest = Substring(msg)
            while let r = rest.range(of: "cam:") {
                let after = rest[r.upperBound...]
                let token = after.prefix { ch in
                    ch != "\"" && ch != "," && ch != "]" && ch != " " && ch != ")"
                }
                let bundle = String(token)
                if !bundle.isEmpty { ids.append(bundle) }
                rest = after[token.endIndex...]
            }
            activeBundleIds = Array(Set(ids))
            DispatchQueue.main.async { [weak self] in self?.onUpdate?() }
        }
    }

    /// bundle id → tên app hiển thị.
    func appName(for bundleId: String) -> String {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
            let name = FileManager.default.displayName(atPath: url.path)
            if name.hasSuffix(".app") { return String(name.dropLast(4)) }
            return name
        }
        return bundleId
    }

    func stop() {
        process?.terminate()
        process = nil
    }
}
