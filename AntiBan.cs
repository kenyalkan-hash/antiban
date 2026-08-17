// ============================================================
//  CBL Anti-Ban - Surveillance par OCR (version compilee .exe)
//  Compile localement avec csc.exe -> pas de blocage AMSI, pas
//  d'admin, pas de certificat. Ne touche jamais a Inflow.
//
//  Lit l'ecran d'Inflow via l'OCR de Windows (WinRT, sans SDK,
//  par reflexion), detecte les mots interdits (liste auto-MAJ
//  depuis GitHub), et envoie une capture annotee sur Telegram
//  (le screenshot montre le client, la model et le message).
// ============================================================
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class AntiBan {
  // ---------- CONFIG ----------
  const string VERSION = "1.0.1";  // <-- doit correspondre a version.txt sur GitHub
  const string TG = "8814355952:AAHhrAsv6cILYUlA7L-3X5tvMnaSd6kyDh4";
  const string CH = "5288669857";
  const string WordsURL = "https://cdn.jsdelivr.net/gh/kenyalkan-hash/antiban@main/words.json";
  const string VersionURL = "https://cdn.jsdelivr.net/gh/kenyalkan-hash/antiban@main/version.txt";
  const string SourceURL = "https://cdn.jsdelivr.net/gh/kenyalkan-hash/antiban@main/AntiBan.cs";
  const int IntervalMs = 1200;   // pause entre deux cycles
  const int CooldownSec = 600;   // ne pas re-alerter le meme mot avant N secondes
  static string DataDir;
  static string Op = "?";

  // ---------- WIN32 ----------
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  // ---------- WinRT (reflexion, sans SDK) ----------
  static Type WT(string name) { return Type.GetType(name + ", Windows.Foundation, ContentType=WindowsRuntime"); }
  static MethodInfo _asTask;
  static object Await(object op, Type tResult) {
    if (_asTask == null) {
      Assembly rt = Assembly.Load("System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089");
      Type ext = rt.GetType("System.WindowsRuntimeSystemExtensions");
      foreach (MethodInfo m in ext.GetMethods()) {
        if (m.Name == "AsTask" && m.IsGenericMethodDefinition) {
          ParameterInfo[] ps = m.GetParameters();
          if (ps.Length == 1 && ps[0].ParameterType.Name == "IAsyncOperation`1") { _asTask = m; break; }
        }
      }
    }
    object task = _asTask.MakeGenericMethod(tResult).Invoke(null, new object[] { op });
    Type tt = task.GetType();
    tt.GetMethod("Wait", Type.EmptyTypes).Invoke(task, null);
    return tt.GetProperty("Result").GetValue(task, null);
  }
  static MethodInfo Method(Type t, string name, int argc) {
    foreach (MethodInfo m in t.GetMethods()) if (m.Name == name && m.GetParameters().Length == argc) return m;
    return null;
  }
  static object _ocrEngine;
  static Type tStorageFile, tStream, tDecoder, tSoftBmp, tOcrResult, tFAM;
  static void InitOcr() {
    Type tOcr = WT("Windows.Media.Ocr.OcrEngine");
    _ocrEngine = tOcr.GetMethod("TryCreateFromUserProfileLanguages").Invoke(null, null);
    if (_ocrEngine == null) throw new Exception("Aucune langue OCR installee.");
    tStorageFile = WT("Windows.Storage.StorageFile");
    tStream = WT("Windows.Storage.Streams.IRandomAccessStream");
    tDecoder = WT("Windows.Graphics.Imaging.BitmapDecoder");
    tSoftBmp = WT("Windows.Graphics.Imaging.SoftwareBitmap");
    tOcrResult = WT("Windows.Media.Ocr.OcrResult");
    tFAM = WT("Windows.Storage.FileAccessMode");
  }
  // OCR d'un fichier PNG -> renvoie l'objet OcrResult (Text + Lines/Words/BoundingRect)
  static object RunOcr(string png) {
    object fileOp = tStorageFile.GetMethod("GetFileFromPathAsync").Invoke(null, new object[] { png });
    object file = Await(fileOp, tStorageFile);
    object readMode = Enum.ToObject(tFAM, 0);
    object openOp = Method(file.GetType(), "OpenAsync", 1).Invoke(file, new object[] { readMode });
    object stream = Await(openOp, tStream);
    object decOp = Method(tDecoder, "CreateAsync", 1).Invoke(null, new object[] { stream });
    object decoder = Await(decOp, tDecoder);
    object sbOp = Method(decoder.GetType(), "GetSoftwareBitmapAsync", 0).Invoke(decoder, null);
    object sbmp = Await(sbOp, tSoftBmp);
    object recOp = Method(_ocrEngine.GetType(), "RecognizeAsync", 1).Invoke(_ocrEngine, new object[] { sbmp });
    object res = Await(recOp, tOcrResult);
    try { ((IDisposable)stream).Dispose(); } catch {}
    return res;
  }
  static string OcrText(object res) { return (string)res.GetType().GetProperty("Text").GetValue(res, null); }

  // ---------- NORMALISATION + DE-OBFUSCATION ----------
  static string Normalize(string s) {
    if (string.IsNullOrEmpty(s)) return "";
    s = s.ToLowerInvariant();
    StringBuilder sb = new StringBuilder();
    foreach (char c in s) {
      switch (c) {
        case '4': case '@': sb.Append('a'); break;
        case '3': sb.Append('e'); break;
        case '1': case '!': sb.Append('i'); break;
        case '0': sb.Append('o'); break;
        case '5': case '$': sb.Append('s'); break;
        case '7': sb.Append('t'); break;
        case '8': sb.Append('b'); break;
        case '9': sb.Append('g'); break;
        default: sb.Append(c); break;
      }
    }
    s = sb.ToString().Normalize(NormalizationForm.FormD);
    StringBuilder sb2 = new StringBuilder();
    foreach (char c in s) if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb2.Append(c);
    s = Regex.Replace(sb2.ToString(), "[^a-z0-9]+", " ");
    return Regex.Replace(s, "\\s+", " ").Trim();
  }

  // ---------- LISTE DE MOTS (auto-update GitHub) ----------
  static Regex BanRegex;      // exact (tous les mots)
  static Regex LooseRegex;    // tolerant : mot (>=4 lettres) + 1 caractere parasite (curseur, artefact OCR)
  static HashSet<string> CritSet = new HashSet<string>();
  static DateTime WordsAt = DateTime.MinValue;
  static string HttpGet(string url) {
    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
    req.Timeout = 8000; req.UserAgent = "AntiBan";
    using (WebResponse resp = req.GetResponse())
    using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
      return sr.ReadToEnd();
  }
  static void LoadWords() {
    if (BanRegex != null && (DateTime.Now - WordsAt).TotalSeconds < 600) return;
    string json = null;
    string local = Path.Combine(DataDir, "words.json");
    try { json = HttpGet(WordsURL); File.WriteAllText(local, json, Encoding.UTF8); }
    catch { if (File.Exists(local)) json = File.ReadAllText(local, Encoding.UTF8); }
    if (json == null) return;
    JavaScriptSerializer ser = new JavaScriptSerializer(); ser.MaxJsonLength = 40000000;
    Dictionary<string, object> obj;
    try { obj = (Dictionary<string, object>)ser.DeserializeObject(json); } catch { return; }
    object[] words = obj.ContainsKey("words") ? (object[])obj["words"] : new object[0];
    object[] crit = obj.ContainsKey("critical") ? (object[])obj["critical"] : new object[0];
    object[] white = obj.ContainsKey("whitelist") ? (object[])obj["whitelist"] : new object[0];
    HashSet<string> whiteN = new HashSet<string>();
    foreach (object w in white) whiteN.Add(Normalize(Convert.ToString(w)));
    List<string> normWords = new List<string>(); HashSet<string> seen = new HashSet<string>();
    foreach (object w in words) {
      string n = Normalize(Convert.ToString(w));
      if (n.Length >= 2 && !whiteN.Contains(n) && seen.Add(n)) normWords.Add(n);
    }
    HashSet<string> critN = new HashSet<string>();
    foreach (object w in crit) { string n = Normalize(Convert.ToString(w)); if (n.Length > 0) critN.Add(n); }
    normWords.Sort(delegate(string a, string b) { return b.Length - a.Length; });
    List<string> esc = new List<string>();
    List<string> esc4 = new List<string>();
    foreach (string n in normWords) { esc.Add(Regex.Escape(n)); if (n.Length >= 4) esc4.Add(Regex.Escape(n)); }
    BanRegex = new Regex("\\b(" + string.Join("|", esc.ToArray()) + ")\\b", RegexOptions.Compiled);
    LooseRegex = esc4.Count > 0 ? new Regex("\\b(" + string.Join("|", esc4.ToArray()) + ")[a-z0-9]?\\b", RegexOptions.Compiled) : null;
    CritSet = critN; WordsAt = DateTime.Now;
  }

  // ---------- FENETRE INFLOW + CAPTURE ----------
  // Toutes les fenetres Inflow visibles (Messages, Home, conversations detachees...).
  static List<IntPtr> EnumInflowWindows() {
    HashSet<int> pids = new HashSet<int>();
    foreach (Process p in Process.GetProcesses())
      try { if (p.ProcessName.ToLowerInvariant().Contains("inflow")) pids.Add(p.Id); } catch {}
    List<IntPtr> res = new List<IntPtr>();
    if (pids.Count == 0) return res;
    EnumWindows(delegate(IntPtr h, IntPtr lp) {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!pids.Contains((int)pid)) return true;
      RECT r; if (!GetWindowRect(h, out r)) return true;
      if ((r.R - r.L) < 200 || (r.B - r.T) < 200) return true;
      res.Add(h);
      return true;
    }, IntPtr.Zero);
    return res;
  }
  static bool IsBlank(Bitmap b) {
    // echantillonne quelques pixels : si tout est (quasi) noir -> PrintWindow a echoue
    int cx = b.Width / 2, cy = b.Height / 2;
    int[,] pts = { { 5, 5 }, { cx, cy }, { b.Width - 6, b.Height - 6 }, { cx, 10 }, { 10, cy } };
    for (int i = 0; i < pts.GetLength(0); i++) {
      Color c = b.GetPixel(pts[i, 0], pts[i, 1]);
      if (c.R > 12 || c.G > 12 || c.B > 12) return false;
    }
    return true;
  }
  static Bitmap Capture(IntPtr h) {
    if (IsIconic(h)) return null;
    RECT r; if (!GetWindowRect(h, out r)) return null;
    int w = r.R - r.L, ht = r.B - r.T;
    if (w < 100 || ht < 100) return null;
    // 1) PrintWindow (PW_RENDERFULLCONTENT=2) -> capture le contenu PROPRE d'Inflow,
    //    meme s'il est derriere une autre fenetre. Ideal pour Electron/Chromium.
    Bitmap bmp = new Bitmap(w, ht, PixelFormat.Format32bppArgb);
    bool ok = false;
    using (Graphics g = Graphics.FromImage(bmp)) {
      IntPtr hdc = g.GetHdc();
      try { ok = PrintWindow(h, hdc, 2); } finally { g.ReleaseHdc(hdc); }
    }
    if (ok && !IsBlank(bmp)) return bmp;
    // 2) Repli : capture de la zone ecran (marche si Inflow est au premier plan)
    bmp.Dispose();
    bmp = new Bitmap(w, ht);
    if (Shield != null) try { Shield.Invoke((MethodInvoker)delegate { Shield.Visible = false; }); } catch {}
    using (Graphics g = Graphics.FromImage(bmp)) g.CopyFromScreen(r.L, r.T, 0, 0, bmp.Size);
    if (Shield != null) try { Shield.Invoke((MethodInvoker)delegate { Shield.Visible = true; }); } catch {}
    return bmp;
  }
  // Entoure en rouge chaque mot a surligner ; renvoie le chemin du PNG annote.
  static string Annotate(Bitmap bmp, object ocr, HashSet<string> tokens) {
    using (Graphics g = Graphics.FromImage(bmp))
    using (Pen pen = new Pen(Color.Red, 4)) {
      object lines = ocr.GetType().GetProperty("Lines").GetValue(ocr, null);
      foreach (object line in (IEnumerable)lines) {
        object ws = line.GetType().GetProperty("Words").GetValue(line, null);
        foreach (object word in (IEnumerable)ws) {
          string nw = Normalize((string)word.GetType().GetProperty("Text").GetValue(word, null));
          bool hit = nw.Length > 0 && (tokens.Contains(nw) || (nw.Length >= 2 && tokens.Contains(nw.Substring(0, nw.Length - 1))));
          if (hit) {
            object rect = word.GetType().GetProperty("BoundingRect").GetValue(word, null);
            Type tr = rect.GetType();
            int x = (int)(double)tr.GetProperty("X").GetValue(rect, null) - 4;
            int y = (int)(double)tr.GetProperty("Y").GetValue(rect, null) - 4;
            int ww = (int)(double)tr.GetProperty("Width").GetValue(rect, null) + 8;
            int hh = (int)(double)tr.GetProperty("Height").GetValue(rect, null) + 8;
            if (x < 0) x = 0; if (y < 0) y = 0;
            g.DrawRectangle(pen, x, y, ww, hh);
          }
        }
      }
    }
    string png = Path.Combine(DataDir, "alert.png");
    bmp.Save(png, ImageFormat.Png);
    return png;
  }
  static string ContextLine(object ocr, string token) {
    object lines = ocr.GetType().GetProperty("Lines").GetValue(ocr, null);
    Regex rx = new Regex("\\b" + Regex.Escape(token) + "[a-z0-9]?\\b");
    foreach (object line in (IEnumerable)lines) {
      string txt = (string)line.GetType().GetProperty("Text").GetValue(line, null);
      if (rx.IsMatch(Normalize(txt))) return txt.Trim();
    }
    return "";
  }

  // ---------- TELEGRAM ----------
  static void TgDocument(string pngPath, string caption) {
    try {
      string url = "https://api.telegram.org/bot" + TG + "/sendDocument";
      string boundary = "----AntiBan" + DateTime.Now.Ticks.ToString("x");
      HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
      req.Method = "POST"; req.Timeout = 40000;
      req.ContentType = "multipart/form-data; boundary=" + boundary;
      byte[] pre = Encoding.UTF8.GetBytes(
        "--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + CH + "\r\n" +
        "--" + boundary + "\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n" + caption + "\r\n" +
        "--" + boundary + "\r\nContent-Disposition: form-data; name=\"document\"; filename=\"alert.png\"\r\n" +
        "Content-Type: image/png\r\n\r\n");
      byte[] fileBytes = File.ReadAllBytes(pngPath);
      byte[] post = Encoding.UTF8.GetBytes("\r\n--" + boundary + "--\r\n");
      req.ContentLength = pre.Length + fileBytes.Length + post.Length;
      using (Stream rs = req.GetRequestStream()) {
        rs.Write(pre, 0, pre.Length); rs.Write(fileBytes, 0, fileBytes.Length); rs.Write(post, 0, post.Length);
      }
      using (WebResponse resp = req.GetResponse()) {}
    } catch {}
  }

  // ---------- AUTO-MISE-A-JOUR (a distance via GitHub) ----------
  static string FindCsc() {
    string a = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework64\v4.0.30319\csc.exe");
    if (File.Exists(a)) return a;
    string b = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework\v4.0.30319\csc.exe");
    if (File.Exists(b)) return b;
    return null;
  }
  static DateTime UpdAt = DateTime.MinValue;
  static void CheckUpdate() {
    if ((DateTime.Now - UpdAt).TotalSeconds < 1800) return; // au plus toutes les 30 min
    UpdAt = DateTime.Now;
    string remote;
    try { remote = HttpGet(VersionURL).Trim(); } catch { return; }
    if (string.IsNullOrEmpty(remote) || remote.Length > 20 || remote == VERSION) return;
    // deja tente cette version ? (evite toute boucle)
    string stamp = Path.Combine(DataDir, "lastupdate.txt");
    try { if (File.Exists(stamp) && File.ReadAllText(stamp).Trim() == remote) return; } catch {}
    // telecharger la nouvelle source
    string src;
    try { src = HttpGet(SourceURL); } catch { return; }
    if (src.Length < 800 || src.IndexOf("class AntiBan") < 0) return; // garde-fou
    string csc = FindCsc(); if (csc == null) return;
    string dir = DataDir;
    string csNew = Path.Combine(dir, "AntiBan.cs");
    File.WriteAllText(csNew, src, Encoding.UTF8);
    string exeNew = Path.Combine(dir, "AntiBan.new.exe");
    try { if (File.Exists(exeNew)) File.Delete(exeNew); } catch {}
    ProcessStartInfo psi = new ProcessStartInfo(csc,
      "-nologo -target:winexe -out:\"" + exeNew + "\" -reference:System.Drawing.dll -reference:System.Windows.Forms.dll -reference:System.Web.Extensions.dll \"" + csNew + "\"");
    psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
    try { Process pc = Process.Start(psi); pc.WaitForExit(); } catch { return; }
    if (!File.Exists(exeNew)) return; // compile echoue -> on garde l'actuelle
    try { File.WriteAllText(stamp, remote); } catch {}
    // updater : attend la fermeture, remplace l'exe, relance
    string exeCur = Path.Combine(dir, "AntiBan.exe");
    string vbs = Path.Combine(dir, "update.vbs");
    string sc = "Set sh = CreateObject(\"WScript.Shell\")\r\n"
              + "Set fso = CreateObject(\"Scripting.FileSystemObject\")\r\n"
              + "WScript.Sleep 1500\r\n" + "On Error Resume Next\r\n"
              + "fso.CopyFile \"" + exeNew + "\", \"" + exeCur + "\", True\r\n"
              + "WScript.Sleep 400\r\n"
              + "sh.Run \"\"\"" + exeCur + "\"\"\", 0, False\r\n";
    File.WriteAllText(vbs, sc, Encoding.ASCII);
    try {
      Process.Start(new ProcessStartInfo("wscript.exe", "\"" + vbs + "\"") { UseShellExecute = false, CreateNoWindow = true });
      Application.Exit();
    } catch {}
  }

  // ---------- BOUCLIER ----------
  static Form Shield; static Label Lbl;
  static readonly Color GREEN = Color.FromArgb(22, 120, 60);
  static readonly Color RED = Color.FromArgb(200, 30, 30);
  static Point _drag; static bool _dragging;
  static void BuildShield() {
    Shield = new Form();
    Shield.FormBorderStyle = FormBorderStyle.None; Shield.TopMost = true; Shield.ShowInTaskbar = false;
    Shield.Width = 138; Shield.Height = 34; Shield.BackColor = GREEN; Shield.StartPosition = FormStartPosition.Manual;
    Rectangle wa = Screen.PrimaryScreen.WorkingArea;
    Shield.Left = wa.Right - Shield.Width - 16; Shield.Top = wa.Top + 16;
    Lbl = new Label();
    Lbl.Dock = DockStyle.Fill; Lbl.TextAlign = ContentAlignment.MiddleCenter; Lbl.ForeColor = Color.White;
    Lbl.Font = new Font("Segoe UI", 9, FontStyle.Bold); Lbl.Text = "  Anti-Ban actif";
    Shield.Controls.Add(Lbl);
    MouseEventHandler down = delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { _dragging = true; _drag = e.Location; } };
    MouseEventHandler up = delegate(object s, MouseEventArgs e) { _dragging = false; };
    MouseEventHandler move = delegate(object s, MouseEventArgs e) {
      if (_dragging) { Shield.Left += e.X - _drag.X; Shield.Top += e.Y - _drag.Y; }
    };
    Shield.MouseDown += down; Shield.MouseUp += up; Shield.MouseMove += move;
    Lbl.MouseDown += down; Lbl.MouseUp += up; Lbl.MouseMove += move;
    // Clic droit -> menu : fermer facilement.
    ContextMenuStrip menu = new ContextMenuStrip();
    ToolStripMenuItem mClose = new ToolStripMenuItem("Fermer Anti-Ban");
    mClose.Click += delegate { Application.Exit(); };
    ToolStripMenuItem mInfo = new ToolStripMenuItem("Anti-Ban actif — surveille Inflow"); mInfo.Enabled = false;
    menu.Items.Add(mInfo); menu.Items.Add(new ToolStripSeparator()); menu.Items.Add(mClose);
    Shield.ContextMenuStrip = menu; Lbl.ContextMenuStrip = menu;
  }
  static void SetShield(bool alert) {
    if (Shield == null) return;
    Shield.Invoke((MethodInvoker)delegate {
      Shield.BackColor = alert ? RED : GREEN;
      Lbl.Text = alert ? "  MOT DETECTE" : "  Anti-Ban actif";
    });
  }

  // ---------- CYCLE ----------
  static Dictionary<string, DateTime> LastAlert = new Dictionary<string, DateTime>();
  static void DoCycle() {
    LoadWords();
    if (BanRegex == null) return;
    List<IntPtr> wins = EnumInflowWindows();
    if (wins.Count == 0) { SetShield(false); return; }
    bool anyOnScreen = false;
    foreach (IntPtr h in wins) {
      Bitmap bmp = Capture(h);
      if (bmp == null) continue;
      try { if (ProcessWindow(bmp)) anyOnScreen = true; }
      catch {}
      finally { bmp.Dispose(); }
    }
    SetShield(anyOnScreen);
  }
  // Capture d'UNE fenetre : OCR, detection, alerte. Renvoie true si un mot est a l'ecran.
  static bool ProcessWindow(Bitmap bmp) {
    string shot = Path.Combine(DataDir, "shot.png");
    bmp.Save(shot, ImageFormat.Png);
    object ocr = RunOcr(shot);
    string norm = Normalize(OcrText(ocr));
    HashSet<string> found = new HashSet<string>();
    foreach (Match m in BanRegex.Matches(norm)) found.Add(m.Value);
    if (LooseRegex != null) foreach (Match m in LooseRegex.Matches(norm)) found.Add(m.Groups[1].Value);
    if (found.Count == 0) return false;

    List<string> newWords = new List<string>(); bool anyCrit = false;
    foreach (string word in found) {
      DateTime now = DateTime.Now;
      if (LastAlert.ContainsKey(word) && (now - LastAlert[word]).TotalSeconds < CooldownSec) continue;
      LastAlert[word] = now;
      newWords.Add(word);
      if (CritSet.Contains(word)) anyCrit = true;
    }
    if (newWords.Count == 0) return true; // present mais deja alerte recemment

    HashSet<string> tokens = new HashSet<string>();
    foreach (string w in newWords) foreach (string t in w.Split(' ')) if (t.Length > 0) tokens.Add(t);
    string apng = Annotate(bmp, ocr, tokens);
    string ctx = ContextLine(ocr, newWords[0]);
    string model, client; ExtractNames(ocr, bmp.Width, bmp.Height, out model, out client);
    string marker = anyCrit ? "🚨🚨 CRITIQUE" : "⚠ Anti-Ban";
    string caption = marker + " | Mot(s): " + string.Join(", ", newWords.ToArray())
                   + "\nModel: " + (model.Length > 0 ? model : "?")
                   + " | Client: " + (client.Length > 0 ? client : "?")
                   + " | Chatteur: " + Op
                   + " | " + DateTime.Now.ToString("HH:mm:ss") + "\n" + ctx;
    TgDocument(apng, caption);
    return true;
  }

  static void Loop() {
    while (true) {
      try { CheckUpdate(); } catch {}
      try { DoCycle(); } catch {}
      Thread.Sleep(IntervalMs);
    }
  }

  // Extrait le nom de la MODEL (entete haut-gauche) et du CLIENT (entete de conversation).
  static void ExtractNames(object ocr, int W, int H, out string model, out string client) {
    model = ""; client = "";
    double bestModelY = double.MaxValue, bestClientX = double.MaxValue;
    object lines = ocr.GetType().GetProperty("Lines").GetValue(ocr, null);
    foreach (object line in (IEnumerable)lines) {
      object ws = line.GetType().GetProperty("Words").GetValue(line, null);
      foreach (object word in (IEnumerable)ws) {
        string txt = (string)word.GetType().GetProperty("Text").GetValue(word, null);
        if (txt == null || txt.Length < 2 || !Regex.IsMatch(txt, "^[A-Za-z0-9_]{2,}$")) continue;
        object rect = word.GetType().GetProperty("BoundingRect").GetValue(word, null);
        Type tr = rect.GetType();
        double x = (double)tr.GetProperty("X").GetValue(rect, null);
        double y = (double)tr.GetProperty("Y").GetValue(rect, null);
        // MODEL : entete en haut a gauche (sous la barre d'onglets)
        if (x < W * 0.16 && y > H * 0.09 && y < H * 0.19 && y < bestModelY) { bestModelY = y; model = txt; }
        // CLIENT : entete de conversation (haut-centre), 1er mot apres la fleche retour
        if (x > W * 0.26 && x < W * 0.62 && y > H * 0.085 && y < H * 0.16 && x < bestClientX) { bestClientX = x; client = txt; }
      }
    }
    // secours : ancrage "Seen ... ago" si le client n'a pas ete trouve
    if (client.Length == 0) {
      Match mc = Regex.Match(OcrText(ocr), "([A-Za-z0-9@_]{2,30})[^A-Za-z0-9\\n]{0,3}Seen\\b", RegexOptions.IgnoreCase);
      if (mc.Success) client = mc.Groups[1].Value.Trim('@');
    }
  }

  [STAThread]
  static void Main() {
    // DPI-aware : capturer la fenetre ENTIERE (barre de saisie comprise) meme
    // avec une mise a l'echelle Windows a 125%/150%.
    try { if (!SetProcessDpiAwarenessContext((IntPtr)(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch {} }
    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
    DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AntiBanOCR");
    if (!Directory.Exists(DataDir)) Directory.CreateDirectory(DataDir);
    string opFile = Path.Combine(DataDir, "op.txt");
    if (File.Exists(opFile)) Op = File.ReadAllText(opFile, Encoding.UTF8).Trim();
    if (string.IsNullOrEmpty(Op)) Op = Environment.UserName;
    try { File.WriteAllText(Path.Combine(DataDir, "running-version.txt"), VERSION); } catch {}

    InitOcr();
    Application.EnableVisualStyles();
    BuildShield();
    Thread t = new Thread(new ThreadStart(Loop)); t.IsBackground = true; t.Start();
    Application.Run(Shield);
  }
}
