import Foundation

/// Ghi JSON Lines ra stdout (an toàn luồng), log debug ra stderr.
enum Emit {
    private static let lock = NSLock()

    static func line(_ json: String) {
        lock.lock()
        defer { lock.unlock() }
        FileHandle.standardOutput.write((json + "\n").data(using: .utf8)!)
    }

    static func ready(version: String) {
        line("{\"type\":\"ready\",\"platform\":\"darwin\",\"version\":\"\(version)\"}")
    }

    static func heartbeat() {
        line("{\"type\":\"heartbeat\"}")
    }

    static func error(code: String, message: String) {
        line("{\"type\":\"error\",\"code\":\(str(code)),\"message\":\(str(message))}")
    }

    static func state(inUse: Bool, apps: [CamApp], devices: [String]) {
        var s = "{\"type\":\"state\",\"inUse\":\(inUse ? "true" : "false"),\"apps\":["
        s += apps.enumerated().map { (i, a) in
            "{\"id\":\(str(a.id)),\"name\":\(str(a.name)),\"since\":\(str(a.since))}"
        }.joined(separator: ",")
        s += "],\"devices\":["
        s += devices.map { str($0) }.joined(separator: ",")
        s += "]}"
        line(s)
    }

    static func audio(muted: Bool, volume: Float) {
        line("{\"type\":\"audio\",\"muted\":\(muted ? "true" : "false"),\"volume\":\(volume)}")
    }

    static func log(_ msg: String) {
        FileHandle.standardError.write(("[mac-helper] " + msg + "\n").data(using: .utf8)!)
    }

    /// Chuỗi JSON đã escape.
    static func str(_ v: String) -> String {
        var out = "\""
        for c in v.unicodeScalars {
            switch c {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if c.value < 0x20 {
                    out += String(format: "\\u%04x", c.value)
                } else {
                    out.unicodeScalars.append(c)
                }
            }
        }
        out += "\""
        return out
    }
}

struct CamApp {
    let id: String
    let name: String
    let since: String
}
