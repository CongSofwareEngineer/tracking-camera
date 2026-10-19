using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace CamGuardHelper;

/// <summary>
/// CamGuard helper cho Windows 10 (1903+) / 11.
/// Theo dõi Registry CapabilityAccessManager\ConsentStore\webcam để biết app nào đang dùng camera.
/// In ra stdout mỗi dòng một JSON (giao thức ở design.md mục 3). Log debug ra stderr.
/// </summary>
internal static class Program
{
    private const string WebcamSubPath =
        @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam";

    private static readonly object OutLock = new();
    private static volatile bool _quit;
    private static readonly AutoResetEventWrapper ScanSignal = new();

    private static List<CamApp> _lastApps = new();
    private static List<string> _lastDevices = new();

    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;

        EmitRaw($"{{\"type\":\"ready\",\"platform\":\"win32\",\"version\":\"{Version()}\"}}");

        // Quét ban đầu + gửi state ngay sau ready
        ScanAndEmit(force: true);
        EmitAudio();

        // Thread đọc lệnh từ stdin
        var stdinThread = new Thread(ReadStdinLoop) { IsBackground = true };
        stdinThread.Start();

        // Thiết lập theo dõi thay đổi registry (HKCU + HKLM)
        using var watcherHkcu = new RegistryWatcher(RegistryHiveNative.CurrentUser, WebcamSubPath, ScanSignal);
        using var watcherHklm = new RegistryWatcher(RegistryHiveNative.LocalMachine, WebcamSubPath, ScanSignal);
        watcherHkcu.Start();
        watcherHklm.Start();

        var lastHeartbeat = DateTime.UtcNow;
        var lastAudio = DateTime.UtcNow;

        while (!_quit)
        {
            // Chờ tín hiệu thay đổi, tối đa 5s (quét dự phòng theo chu kỳ).
            bool signaled = ScanSignal.WaitOne(5000);

            if (_quit) break;

            if (signaled)
            {
                // Debounce 300ms: registry thường ghi nhiều giá trị liên tiếp.
                Thread.Sleep(300);
                ScanSignal.Reset(); // gộp các tín hiệu dồn lại
            }

            ScanAndEmit(force: false);

            var now = DateTime.UtcNow;
            if ((now - lastHeartbeat).TotalSeconds >= 30)
            {
                EmitRaw("{\"type\":\"heartbeat\"}");
                lastHeartbeat = now;
            }
            if ((now - lastAudio).TotalMinutes >= 10)
            {
                EmitAudio();
                lastAudio = now;
            }
        }

        return 0;
    }

    private static string Version() => "1.0.0";

    // ---------------- stdin ----------------
    private static void ReadStdinLoop()
    {
        string? line;
        try
        {
            while ((line = Console.In.ReadLine()) != null)
            {
                if (line.Contains("\"quit\""))
                {
                    _quit = true;
                    ScanSignal.Set();
                    break;
                }
                if (line.Contains("\"rescan\""))
                {
                    EmitAudio();
                    ScanSignal.Set();
                }
                // setForceVolume: nâng cao, có thể bổ sung sau (ghi nhận, chưa thao tác volume).
            }
        }
        catch
        {
            // stdin đóng → coi như thoát
        }
        _quit = true;
        ScanSignal.Set();
    }

    // ---------------- Scan ----------------
    private static void ScanAndEmit(bool force)
    {
        List<CamApp> apps;
        try
        {
            apps = ScanAll();
        }
        catch (Exception ex)
        {
            EmitError("SCAN_FAILED", ex.Message);
            return;
        }

        var devices = GetCameraDeviceNames();

        bool changed =
            force ||
            !SameApps(apps, _lastApps) ||
            !devices.SequenceEqual(_lastDevices);

        if (!changed) return;

        _lastApps = apps;
        _lastDevices = devices;

        var sb = new StringBuilder();
        sb.Append("{\"type\":\"state\",\"inUse\":");
        sb.Append(apps.Count > 0 ? "true" : "false");
        sb.Append(",\"apps\":[");
        for (int i = 0; i < apps.Count; i++)
        {
            if (i > 0) sb.Append(',');
            var a = apps[i];
            sb.Append('{');
            sb.Append("\"id\":").Append(JsonStr(a.Id)).Append(',');
            sb.Append("\"name\":").Append(JsonStr(a.Name)).Append(',');
            sb.Append("\"since\":").Append(JsonStr(a.Since));
            sb.Append('}');
        }
        sb.Append("],\"devices\":[");
        for (int i = 0; i < devices.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(JsonStr(devices[i]));
        }
        sb.Append("]}");
        EmitRaw(sb.ToString());
    }

    private static bool SameApps(List<CamApp> a, List<CamApp> b)
    {
        if (a.Count != b.Count) return false;
        var ids = new HashSet<string>(b.Select(x => x.Id));
        return a.All(x => ids.Contains(x.Id));
    }

    private static List<CamApp> ScanAll()
    {
        var result = new Dictionary<string, CamApp>();
        ScanHive(RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Default), result);
        try
        {
            ScanHive(RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default), result);
        }
        catch
        {
            // HKLM có thể không truy cập được — bỏ qua
        }
        return result.Values.ToList();
    }

    private static void ScanHive(RegistryKey baseKey, Dictionary<string, CamApp> result)
    {
        using var webcam = baseKey.OpenSubKey(WebcamSubPath);
        if (webcam == null) return;
        WalkKey(webcam, isNonPackaged: false, result);
    }

    private static void WalkKey(RegistryKey key, bool isNonPackaged, Dictionary<string, CamApp> result)
    {
        // Nếu key này có LastUsedTimeStart → là một app-key
        var startObj = key.GetValue("LastUsedTimeStart");
        if (startObj != null)
        {
            long start = ToLong(startObj);
            long stop = ToLong(key.GetValue("LastUsedTimeStop"));
            bool inUse = start != 0 && stop == 0;
            if (inUse)
            {
                string rawName = LastSegment(key.Name);
                var (id, name) = isNonPackaged ? ResolveNonPackaged(rawName) : ResolvePackaged(rawName);
                if (!result.ContainsKey(id))
                {
                    result[id] = new CamApp(id, name, FileTimeToIso(start));
                }
            }
        }

        foreach (var sub in key.GetSubKeyNames())
        {
            bool childNonPackaged = isNonPackaged || sub.Equals("NonPackaged", StringComparison.OrdinalIgnoreCase);
            try
            {
                using var child = key.OpenSubKey(sub);
                if (child != null) WalkKey(child, childNonPackaged, result);
            }
            catch
            {
                // bỏ qua key không đọc được
            }
        }
    }

    private static (string id, string name) ResolveNonPackaged(string keyName)
    {
        // '#' → '\'  để ra đường dẫn exe
        string path = keyName.Replace('#', '\\');
        string name = path;
        try
        {
            if (File.Exists(path))
            {
                var vi = FileVersionInfo.GetVersionInfo(path);
                name = !string.IsNullOrWhiteSpace(vi.FileDescription)
                    ? vi.FileDescription!
                    : !string.IsNullOrWhiteSpace(vi.ProductName)
                        ? vi.ProductName!
                        : Path.GetFileNameWithoutExtension(path);
            }
            else
            {
                name = Path.GetFileNameWithoutExtension(path);
            }
        }
        catch
        {
            name = Path.GetFileNameWithoutExtension(path);
        }
        return (path, name);
    }

    private static (string id, string name) ResolvePackaged(string pfn)
    {
        // PackageFamilyName: 'Microsoft.WindowsCamera_8wekyb3d8bbwe' → 'WindowsCamera'
        string name = pfn;
        int us = pfn.IndexOf('_');
        if (us > 0) name = pfn[..us];
        if (name.StartsWith("Microsoft.", StringComparison.OrdinalIgnoreCase))
            name = name["Microsoft.".Length..];
        name = name.Replace('.', ' ');
        return (pfn, name);
    }

    private static string LastSegment(string fullKeyName)
    {
        int idx = fullKeyName.LastIndexOf('\\');
        return idx >= 0 ? fullKeyName[(idx + 1)..] : fullKeyName;
    }

    private static long ToLong(object? v)
    {
        if (v == null) return 0;
        try
        {
            return Convert.ToInt64(v);
        }
        catch
        {
            return 0;
        }
    }

    private static string FileTimeToIso(long fileTime)
    {
        try
        {
            if (fileTime <= 0) return DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            return DateTime.FromFileTimeUtc(fileTime).ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        }
        catch
        {
            return DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        }
    }

    // ---------------- Camera device names ----------------
    private static List<string> GetCameraDeviceNames()
    {
        // Tên thiết bị camera từ registry DeviceClasses (best-effort). Nếu lỗi → rỗng.
        var names = new List<string>();
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Control\DeviceClasses\{e5323777-f976-4f5b-9b55-b94699c46e44}");
            if (key != null)
            {
                foreach (var subName in key.GetSubKeyNames())
                {
                    using var sub = key.OpenSubKey(subName + @"\#\Device Parameters");
                    var fn = sub?.GetValue("FriendlyName") as string;
                    if (!string.IsNullOrWhiteSpace(fn) && !names.Contains(fn)) names.Add(fn);
                }
            }
        }
        catch
        {
            // bỏ qua
        }
        return names;
    }

    // ---------------- Audio (best-effort) ----------------
    private static void EmitAudio()
    {
        try
        {
            var (muted, volume) = AudioStatus.Get();
            EmitRaw($"{{\"type\":\"audio\",\"muted\":{(muted ? "true" : "false")},\"volume\":{volume.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}");
        }
        catch
        {
            // không hỗ trợ → bỏ qua, không ảnh hưởng phát hiện camera
        }
    }

    // ---------------- Output ----------------
    private static void EmitRaw(string json)
    {
        lock (OutLock)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }
    }

    private static void EmitError(string code, string message)
    {
        EmitRaw($"{{\"type\":\"error\",\"code\":{JsonStr(code)},\"message\":{JsonStr(message)}}}");
    }

    private static string JsonStr(string? s)
    {
        if (s == null) return "\"\"";
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    private readonly record struct CamApp(string Id, string Name, string Since);
}
