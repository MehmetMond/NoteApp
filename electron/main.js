const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- Protokoll & Notfall-Modus ----------
// Protokoll: %APPDATA%\Notizen\notizen-log.txt
const dataDir = app.getPath('userData');
const logPath = path.join(dataDir, 'notizen-log.txt');
const pendingPath = path.join(dataDir, 'start-pending');      // existiert, solange ein Start nicht fertig ist
const softwarePath = path.join(dataDir, 'ohne-grafikbeschleunigung');
function log(...a) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 512 * 1024) fs.renameSync(logPath, logPath + '.alt');
    fs.appendFileSync(logPath, new Date().toISOString() + ' ' + a.map(String).join(' ') + '\n');
  } catch (e) {}
}
const exists = p => { try { return fs.existsSync(p); } catch (e) { return false; } };
const touch = p => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(p, String(Date.now())); } catch (e) {} };
const remove = p => { try { fs.unlinkSync(p); } catch (e) {} };
// Merkt sich, unter welcher Version die Software-Darstellung nötig wurde
const markSoftware = () => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(softwarePath, app.getVersion() + ' ' + Date.now()); } catch (e) {} };

const gotLock = app.requestSingleInstanceLock();
// Ohne Grafikbeschleunigung zeichnet die CPU alles, das kostet viel Akku. Deshalb gilt die Software-Darstellung nur für
// die Version, unter der sie nötig wurde: eine neue Version (meist mit neuerem Electron) versucht es einmal wieder mit
// Grafikbeschleunigung. Hängt auch die, greift wieder der Notfall-Modus.
const swOld = (() => { try { return fs.readFileSync(softwarePath, 'utf8').split(' ')[0]; } catch (e) { return null; } })();
if (gotLock && swOld !== null && swOld !== app.getVersion()) { log('Software-Darstellung von', swOld, '-> neue Version, wieder mit Grafikbeschleunigung'); remove(softwarePath); }
// Ist der letzte Start hängen geblieben, läuft die App ab jetzt ohne Grafikbeschleunigung.
if (gotLock && exists(pendingPath)) { log('letzter Start wurde nicht fertig -> Software-Darstellung'); markSoftware(); }
const software = exists(softwarePath) || process.argv.includes('--software');
if (gotLock && software) app.disableHardwareAcceleration();
// Unter Windows kann die Verdeckungsberechnung neue Fenster als "verdeckt" einstufen und das erste Zeichnen verhindern
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
log('Start', app.getVersion(), process.platform, process.arch, 'Electron', process.versions.electron, software ? '(Software-Darstellung)' : '', gotLock ? '' : '(zweiter Start)');

process.on('uncaughtException', e => {
  log('Fehler:', e && e.stack || e);
  try { dialog.showErrorBox('Notizen – Fehler', String(e && e.message || e) + '\n\nProtokoll: ' + logPath); } catch (x) {}
});

let win = null, quitting = false, loaded = false, createdAt = 0;
// Wie die Grafik läuft (steht im Protokoll, sobald der Grafikprozess sie meldet, nur bei Änderung): schaltet ein neues
// Electron den Grafiktreiber ab, zeichnet die CPU alles (viel Akku)
let gpuLogged = '';
app.on('gpu-info-update', () => {
  let s = '';
  try { const f = app.getGPUFeatureStatus(); s = ['gpu_compositing', '2d_canvas', 'rasterization'].map(k => k + '=' + f[k]).join(' '); } catch (e) {}
  if (s && s !== gpuLogged) { gpuLogged = s; log('Grafik:', s); }
});

function restartInSoftwareMode(reason) {
  if (software) { log('Neustart nicht möglich, schon im Software-Modus:', reason); return; }
  log('Neustart ohne Grafikbeschleunigung:', reason);
  markSoftware(); remove(pendingPath);
  app.relaunch(); app.exit(0);
}

function createWindow() {
  loaded = false; createdAt = Date.now();
  touch(pendingPath);
  win = new BrowserWindow({
    width: 1400, height: 900, show: true,
    title: 'Notizen',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#151618',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.maximize();
  Menu.setApplicationMenu(null);
  const wc = win.webContents;
  wc.on('did-finish-load', () => { loaded = true; remove(pendingPath); log('Seite geladen'); });
  wc.on('did-fail-load', (e, code, desc) => log('Laden fehlgeschlagen:', code, desc));
  wc.on('render-process-gone', (e, d) => {
    log('Seite abgestürzt:', d.reason, d.exitCode);
    if (!loaded) restartInSoftwareMode('Seite beim Start abgestürzt');
    else if (!quitting && win && !win.isDestroyed()) wc.reload();
  });
  wc.on('unresponsive', () => log('Seite reagiert nicht'));
  wc.on('console-message', e => { if (e.level === 'error') log('Seite:', e.message); });
  win.loadFile(path.join(__dirname, 'app', 'index.html')).catch(e => log('loadFile:', e.message));
  // Nach 20 s immer noch nicht geladen: ohne Grafikbeschleunigung neu starten
  setTimeout(() => { if (!loaded && !quitting) restartInSoftwareMode('Seite nach 20 s nicht geladen'); }, 20000);
  // Nichts anderes als die App selbst im Fenster öffnen
  wc.on('will-navigate', e => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  Promise.resolve(wc.setVisualZoomLevelLimits(1, 1)).catch(() => {});
  // F11 = Vollbild, F12 = Entwicklertools
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {   // dasselbe Vollbild wie „⋯ → Vollbild“ in der Seite (Esc beendet es); geht das nicht, das Fenster selbst
      e.preventDefault();
      const self = () => win.setFullScreen(!win.isFullScreen());
      wc.executeJavaScript('typeof toggleFullscreen === "function" && toggleFullscreen()', true).then(ok => { if (!ok) self(); }, self);
    }
    if (input.key === 'F12') { wc.toggleDevTools(); e.preventDefault(); }
  });
  // Vor dem Schließen alles speichern (höchstens 4 s warten)
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault(); quitting = true;
    const flush = loaded ? wc.executeJavaScript('window.__flush ? window.__flush() : null', true).catch(() => {}) : Promise.resolve();
    Promise.race([flush, new Promise(r => setTimeout(r, 4000))]).then(() => { remove(pendingPath); if (win && !win.isDestroyed()) win.destroy(); });
  });
  win.on('closed', () => { win = null; });
}

if (!gotLock) {
  log('läuft schon, gebe an das offene Fenster ab');
  app.quit();
} else {
  app.on('second-instance', () => {
    log('zweiter Start');
    if (!win || win.isDestroyed()) { if (!quitting) createWindow(); return; }
    // Fenster hängt beim Start: ohne Grafikbeschleunigung neu starten. Erst wenn die Seite schon länger lädt; sonst schaltete
    // ein zweites Antippen des Symbols während des Ladens dauerhaft auf Software-Darstellung (viel Akku)
    if (!loaded) {
      if (Date.now() - createdAt > 8000) restartInSoftwareMode('zweiter Start, Seite nach 8 s noch nicht geladen');
      else { win.show(); win.focus(); }
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.on('child-process-gone', (e, d) => {
    log('Prozess beendet:', d.type, d.reason, d.exitCode);
    if (d.type === 'GPU' && !loaded) restartInSoftwareMode('Grafikprozess beim Start abgestürzt');
  });
  app.whenReady().then(createWindow).catch(e => log('whenReady:', e && e.stack || e));
  app.on('window-all-closed', () => { log('beendet'); app.quit(); });
}
