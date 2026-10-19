using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace CamGuardHelper;

internal enum RegistryHiveNative : uint
{
    CurrentUser = 0x80000001,
    LocalMachine = 0x80000002
}

/// <summary>
/// Theo dõi một key registry bằng RegNotifyChangeKeyValue (async, bWatchSubtree=true).
/// Mỗi lần có thay đổi: báo tín hiệu ScanSignal rồi ĐĂNG KÝ LẠI (notify chỉ bắn một lần).
/// </summary>
internal sealed class RegistryWatcher : IDisposable
{
    private const int KEY_NOTIFY = 0x0010;
    private const int REG_NOTIFY_CHANGE_NAME = 0x00000001;
    private const int REG_NOTIFY_CHANGE_LAST_SET = 0x00000004;
    private const int REG_NOTIFY_THREAD_AGNOSTIC = 0x10000000;

    private readonly RegistryHiveNative _hive;
    private readonly string _subKey;
    private readonly AutoResetEventWrapper _scanSignal;

    private SafeRegistryHandle? _hKey;
    private ManualResetEvent? _changeEvent;
    private ManualResetEvent? _stopEvent;
    private Thread? _thread;

    public RegistryWatcher(RegistryHiveNative hive, string subKey, AutoResetEventWrapper scanSignal)
    {
        _hive = hive;
        _subKey = subKey;
        _scanSignal = scanSignal;
    }

    public void Start()
    {
        int rc = RegOpenKeyEx((UIntPtr)(uint)_hive, _subKey, 0, KEY_NOTIFY, out var handle);
        if (rc != 0)
        {
            // Không mở được (vd HKLM không có nhánh) — bỏ qua watcher này.
            return;
        }
        _hKey = handle;
        _changeEvent = new ManualResetEvent(false);
        _stopEvent = new ManualResetEvent(false);
        _thread = new Thread(Loop) { IsBackground = true };
        _thread.Start();
    }

    private void Loop()
    {
        var handles = new WaitHandle[] { _changeEvent!, _stopEvent! };
        while (true)
        {
            _changeEvent!.Reset();
            int rc = RegNotifyChangeKeyValue(
                _hKey!,
                true,
                REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET | REG_NOTIFY_THREAD_AGNOSTIC,
                _changeEvent!.SafeWaitHandle,
                true);
            if (rc != 0) break;

            int idx = WaitHandle.WaitAny(handles);
            if (idx == 1) break; // stop
            // thay đổi registry → báo app chính quét lại
            _scanSignal.Set();
        }
    }

    public void Dispose()
    {
        _stopEvent?.Set();
        _thread?.Join(500);
        _changeEvent?.Dispose();
        _stopEvent?.Dispose();
        _hKey?.Dispose();
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int RegOpenKeyEx(
        UIntPtr hKey, string subKey, int ulOptions, int samDesired, out SafeRegistryHandle hkResult);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern int RegNotifyChangeKeyValue(
        SafeRegistryHandle hKey, bool bWatchSubtree, int dwNotifyFilter, SafeWaitHandle hEvent, bool fAsynchronous);
}

/// <summary>Wrapper mỏng quanh ManualResetEvent để dùng làm tín hiệu quét.</summary>
internal sealed class AutoResetEventWrapper
{
    private readonly ManualResetEvent _evt = new(false);

    public void Set() => _evt.Set();
    public void Reset() => _evt.Reset();
    public bool WaitOne(int ms) => _evt.WaitOne(ms);
}
