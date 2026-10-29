// YH Launcher yardımcı süreci (sadece Windows, sadece ilgili seçenek açıkken çalışır).
// İlk gerektiğinde Windows'un kendi .NET derleyicisi (csc.exe) ile derlenir.
//
//   yh-helper.exe [--win] [--wins] [--search] [--fs]   olayları stdout'a yazar:
//       WIN      Windows tuşu tek başına basıldı (--win), Win+S (--wins) ya da Windows
//                araması açıldı (--search: görev çubuğundaki arama kutusu/düğmesi, Win+S;
//                arama paneli kapatılır, yerine YH Launcher açılır)
//       FS 1/0   ön plandaki pencere tam ekran oldu / çıktı (--fs)
//   yh-helper.exe --broadcast                 görev çubuğuna ayar değişti mesajı gönderir
//
// stdin kapanınca (YH Launcher kapandığında) kendini sonlandırır.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class YhHelper
{
    delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    delegate void WinEventProc(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint evtMin, uint evtMax, IntPtr hmod, WinEventProc fn, uint pid, uint tid, uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public UIntPtr extra; }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public UIntPtr dwExtraInfo; }

    // 64-bit'te INPUT 40 bayttır (birleşimin en büyüğü MOUSEINPUT, 32 bayt); boyut yanlışsa
    // SendInput 87 (geçersiz parametre) hatası verir. Dolgu alanı 32. bayta kadar uzanır.
    [StructLayout(LayoutKind.Explicit, Size = 40)]
    struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KEYBDINPUT ki; [FieldOffset(32)] public long pad; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, UIntPtr w, string l, uint flags, uint timeout, out UIntPtr res);

    const int WH_KEYBOARD_LL = 13;
    const int WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
    const uint VK_LWIN = 0x5B, VK_RWIN = 0x5C, VK_S = 0x53, VK_MASK = 0xFF;
    // Kendi gönderdiğimiz tuşları tanımak için işaret ("YHL")
    static readonly UIntPtr MARK = new UIntPtr(0x59484C);

    static bool optWin, optWinS, optFs, optSearch;
    static IntPtr hook = IntPtr.Zero;
    static LowLevelKeyboardProc proc = Hook; // çöp toplayıcı silmesin diye alan olarak tutulur
    static WinEventProc fgProc = OnForeground;
    const uint EVENT_SYSTEM_FOREGROUND = 3, VK_ESCAPE = 0x1B;
    // Windows 11: SearchHost, Windows 10: SearchApp / SearchUI (Cortana)
    static readonly string[] SEARCH_PROCS = { "SearchHost", "SearchApp", "SearchUI" };
    static DateTime lastRedirect = DateTime.MinValue;

    // Ön plana Windows araması geldiyse kapat ve YH Launcher'ı aç
    static void OnForeground(IntPtr h, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        if (!optSearch || hwnd == IntPtr.Zero) return;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        string name;
        try { name = Process.GetProcessById((int)pid).ProcessName; } catch { return; }
        foreach (var s in SEARCH_PROCS)
        {
            if (!string.Equals(name, s, StringComparison.OrdinalIgnoreCase)) continue;
            var esc = new[] { Key(VK_ESCAPE, false), Key(VK_ESCAPE, true) };
            SendInput((uint)esc.Length, esc, Marshal.SizeOf(typeof(INPUT)));
            // Tek açılışta birden çok olay gelebilir: bir kez tetikle
            if ((DateTime.Now - lastRedirect).TotalMilliseconds > 600) { lastRedirect = DateTime.Now; Emit("WIN"); }
            return;
        }
    }
    static bool winDown, comboUsed, suppressStart;
    static readonly object outLock = new object();

    static void Emit(string s)
    {
        lock (outLock) { Console.Out.WriteLine(s); Console.Out.Flush(); }
    }

    static INPUT Key(uint vk, bool up)
    {
        var i = new INPUT { type = 1 };
        i.ki.wVk = (ushort)vk;
        i.ki.dwFlags = up ? 2u : 0u;
        i.ki.dwExtraInfo = MARK;
        return i;
    }

    // Win tuşu bırakılmadan önce "maske" tuşu gönderilir; Windows bunu bir kısayol sanar ve
    // Başlat menüsünü açmaz (AutoHotkey / PowerToys'un kullandığı yöntem).
    static void ReleaseWinWithoutStart(uint winVk)
    {
        var seq = new[] { Key(VK_MASK, false), Key(VK_MASK, true), Key(winVk, true) };
        SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT)));
    }

    static IntPtr Hook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            if (k.extra != MARK)
            {
                int msg = wParam.ToInt32();
                bool down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                bool up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
                bool isWin = k.vkCode == VK_LWIN || k.vkCode == VK_RWIN;

                if (isWin && down)
                {
                    if (!winDown) { winDown = true; comboUsed = false; suppressStart = false; }
                }
                else if (isWin && up)
                {
                    winDown = false;
                    bool alone = optWin && !comboUsed;
                    if (alone || suppressStart)
                    {
                        ReleaseWinWithoutStart(k.vkCode);
                        if (alone) Emit("WIN");
                        return (IntPtr)1; // asıl Win bırakma olayını yut
                    }
                }
                else if (winDown && down)
                {
                    comboUsed = true; // Win+E, Win+D… normal çalışsın
                    if (optWinS && k.vkCode == VK_S)
                    {
                        suppressStart = true;
                        Emit("WIN");
                        return (IntPtr)1; // Windows aramasını açmasın
                    }
                }
            }
        }
        return CallNextHookEx(hook, nCode, wParam, lParam);
    }

    static bool IsFullscreen()
    {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero) return false;
        var cls = new StringBuilder(64);
        GetClassName(fg, cls, cls.Capacity);
        string c = cls.ToString();
        if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
        RECT r;
        if (!GetWindowRect(fg, out r)) return false;
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
        if (!GetMonitorInfo(MonitorFromWindow(fg, 2), ref mi)) return false;
        return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
    }

    [STAThread]
    public static int Main(string[] args)
    {
        foreach (var a in args)
        {
            if (a == "--win") optWin = true;
            else if (a == "--wins") optWinS = true;
            else if (a == "--fs") optFs = true;
            else if (a == "--search") optSearch = true;
            else if (a == "--broadcast")
            {
                UIntPtr res;
                SendMessageTimeout((IntPtr)0xFFFF, 0x1A, UIntPtr.Zero, "TraySettings", 2, 1000, out res);
                return 0;
            }
        }

        // Ana uygulama kapanınca (stdin EOF) çık
        new Thread(() => { try { while (Console.In.Read() != -1) { } } catch { } Environment.Exit(0); }) { IsBackground = true }.Start();

        if (optFs)
        {
            new Thread(() =>
            {
                bool last = false;
                Emit("FS 0");
                while (true)
                {
                    bool fs = false;
                    try { fs = IsFullscreen(); } catch { }
                    if (fs != last) { last = fs; Emit(fs ? "FS 1" : "FS 0"); }
                    Thread.Sleep(1000);
                }
            }) { IsBackground = true }.Start();
        }

        // Olay tabanlı: ön plan değişmedikçe hiç çalışmaz (yoklama yok)
        if (optSearch) SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, fgProc, 0, 0, 0);

        if (optWin || optWinS)
        {
            hook = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(null), 0);
            Emit(hook == IntPtr.Zero ? "ERR hook " + Marshal.GetLastWin32Error() : "READY");
        }
        else Emit("READY");

        Application.Run(); // düşük seviyeli kanca bir mesaj döngüsü ister
        return 0;
    }
}
