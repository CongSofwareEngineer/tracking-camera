import Foundation
import CoreMediaIO

/// Theo dõi camera bật/tắt bằng CoreMediaIO (nguồn tin cậy, không cần quyền Camera/TCC).
final class CameraMonitor {
    private var deviceListeners: [CMIOObjectID: Bool] = [:]
    private let queue = DispatchQueue(label: "com.camguard.cmio")
    /// Gọi lại khi trạng thái có thể đã đổi (debounce + attribution ở nơi khác).
    var onChange: (() -> Void)?

    private let systemObject = CMIOObjectID(kCMIOObjectSystemObject)

    func start() {
        // Cho phép nhìn thấy mọi thiết bị (tuỳ chọn).
        var allow: UInt32 = 1
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        CMIOObjectSetPropertyData(systemObject, &addr, 0, nil,
                                  UInt32(MemoryLayout<UInt32>.size), &allow)

        registerDeviceListChangeListener()
        refreshDeviceListeners()
    }

    /// Trạng thái hiện tại: có thiết bị nào đang chạy không + tên các thiết bị đang chạy.
    func currentState() -> (inUse: Bool, runningDevices: [String]) {
        let devices = allDevices()
        var running: [String] = []
        for dev in devices where isRunningSomewhere(dev) {
            running.append(deviceName(dev))
        }
        return (!running.isEmpty, running)
    }

    /// Tất cả tên thiết bị camera (để hiện kể cả khi tắt — tuỳ nhu cầu).
    func allDeviceNames() -> [String] {
        allDevices().map { deviceName($0) }
    }

    // MARK: - CoreMediaIO helpers

    private func allDevices() -> [CMIOObjectID] {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var dataSize: UInt32 = 0
        guard CMIOObjectGetPropertyDataSize(systemObject, &addr, 0, nil, &dataSize) == 0,
              dataSize > 0 else { return [] }
        let count = Int(dataSize) / MemoryLayout<CMIOObjectID>.size
        var ids = [CMIOObjectID](repeating: 0, count: count)
        var used: UInt32 = 0
        guard CMIOObjectGetPropertyData(systemObject, &addr, 0, nil, dataSize, &used, &ids) == 0
        else { return [] }
        return ids
    }

    private func isRunningSomewhere(_ dev: CMIOObjectID) -> Bool {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var value: UInt32 = 0
        var used: UInt32 = 0
        let status = CMIOObjectGetPropertyData(
            dev, &addr, 0, nil, UInt32(MemoryLayout<UInt32>.size), &used, &value)
        return status == 0 && value != 0
    }

    private func deviceName(_ dev: CMIOObjectID) -> String {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOObjectPropertyName),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        var name: Unmanaged<CFString>?
        var used: UInt32 = 0
        let status = withUnsafeMutablePointer(to: &name) { ptr -> OSStatus in
            CMIOObjectGetPropertyData(dev, &addr, 0, nil,
                                      UInt32(MemoryLayout<Unmanaged<CFString>?>.size), &used, ptr)
        }
        if status == 0, let cf = name?.takeRetainedValue() {
            return cf as String
        }
        return "Camera"
    }

    // MARK: - Listeners

    private func registerDeviceListChangeListener() {
        var addr = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
        CMIOObjectAddPropertyListenerBlock(systemObject, &addr, queue) { [weak self] _, _ in
            self?.refreshDeviceListeners()
            self?.onChange?()
        }
    }

    private func refreshDeviceListeners() {
        let devices = allDevices()
        for dev in devices where deviceListeners[dev] == nil {
            var addr = CMIOObjectPropertyAddress(
                mSelector: CMIOObjectPropertySelector(kCMIODevicePropertyDeviceIsRunningSomewhere),
                mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
                mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
            CMIOObjectAddPropertyListenerBlock(dev, &addr, queue) { [weak self] _, _ in
                self?.onChange?()
            }
            deviceListeners[dev] = true
        }
    }
}
