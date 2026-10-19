import Foundation

let VERSION = "1.0.0"

final class Coordinator {
    private let camera = CameraMonitor()
    private let attribution = LogAttribution()
    private var sinceByBundle: [String: String] = [:]
    private var lastInUse = false
    private var lastAppIds: Set<String> = []
    private var lastDevices: [String] = []
    private var debounceItem: DispatchWorkItem?
    private let debounceQueue = DispatchQueue(label: "com.camguard.debounce")

    func run() {
        Emit.ready(version: VERSION)

        camera.onChange = { [weak self] in self?.scheduleEmit() }
        attribution.onUpdate = { [weak self] in self?.scheduleEmit() }

        camera.start()
        attribution.start()

        // state ban đầu ngay sau ready
        emitState(force: true)
        emitAudio()

        startStdinReader()
        startTimers()

        // vòng lặp sự kiện
        dispatchMain()
    }

    private func scheduleEmit() {
        debounceItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.emitState(force: false) }
        debounceItem = item
        debounceQueue.asyncAfter(deadline: .now() + 0.3, execute: item)
    }

    private func emitState(force: Bool) {
        let (inUse, runningDevices) = camera.currentState()

        var apps: [CamApp] = []
        if inUse {
            let bundleIds = attribution.activeBundleIds
            let now = ISO8601DateFormatter.string(from: Date(),
                                                  timeZone: TimeZone(identifier: "UTC")!,
                                                  formatOptions: [.withInternetDateTime, .withFractionalSeconds])
            for b in bundleIds {
                if sinceByBundle[b] == nil { sinceByBundle[b] = now }
                apps.append(CamApp(id: b, name: attribution.appName(for: b), since: sinceByBundle[b]!))
            }
            // dọn since cho bundle không còn
            sinceByBundle = sinceByBundle.filter { bundleIds.contains($0.key) }
        } else {
            sinceByBundle.removeAll()
        }

        let appIds = Set(apps.map { $0.id })
        let changed = force || inUse != lastInUse || appIds != lastAppIds || runningDevices != lastDevices
        guard changed else { return }
        lastInUse = inUse
        lastAppIds = appIds
        lastDevices = runningDevices

        Emit.state(inUse: inUse, apps: apps, devices: runningDevices)
    }

    private func emitAudio() {
        if let (muted, vol) = AudioStatusMac.get() {
            Emit.audio(muted: muted, volume: vol)
        }
    }

    private func startTimers() {
        // heartbeat 30s
        let hb = Timer(timeInterval: 30, repeats: true) { _ in Emit.heartbeat() }
        RunLoop.main.add(hb, forMode: .common)
        // quét dự phòng 5s (phòng sót sự kiện)
        let poll = Timer(timeInterval: 5, repeats: true) { [weak self] _ in self?.emitState(force: false) }
        RunLoop.main.add(poll, forMode: .common)
        // kiểm tra âm thanh mỗi 10 phút
        let audio = Timer(timeInterval: 600, repeats: true) { [weak self] _ in self?.emitAudio() }
        RunLoop.main.add(audio, forMode: .common)
    }

    private func startStdinReader() {
        DispatchQueue.global().async { [weak self] in
            while let line = readLine(strippingNewline: true) {
                if line.contains("\"quit\"") {
                    self?.attribution.stop()
                    exit(0)
                }
                if line.contains("\"rescan\"") {
                    self?.emitAudio()
                    self?.scheduleEmit()
                }
            }
            // stdin đóng → thoát
            self?.attribution.stop()
            exit(0)
        }
    }
}

extension ISO8601DateFormatter {
    static func string(from date: Date, timeZone: TimeZone, formatOptions: Options) -> String {
        let f = ISO8601DateFormatter()
        f.timeZone = timeZone
        f.formatOptions = formatOptions
        return f.string(from: date)
    }
}

Coordinator().run()
