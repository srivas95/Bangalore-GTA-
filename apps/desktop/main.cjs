// Namma Bengaluru desktop app: the web build in an Electron window.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Safe mode (after a crash): lighter world detail, and software rendering if the GPU itself failed.
const safe = process.argv.includes('--safe-graphics');
const noGpu = process.argv.includes('--no-gpu');
if (noGpu) app.disableHardwareAcceleration();
// Use the GPU even on drivers Chromium is wary of, but if WebGL can't start on the GPU at all,
// fall back to software rendering rather than no WebGL.
if (!noGpu) app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
// Room for the city build on machines where the default renderer heap is small.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// Crashes go to a log next to the save data, so they can be reported.
const logFile = () => path.join(app.getPath('userData'), 'crash-log.txt');
function log(line) {
  try { fs.appendFileSync(logFile(), `${new Date().toISOString()} ${line}\n`); } catch { /* ignore */ }
}

let win = null;
let offered = false;

// Something crashed: say what, and offer a restart with lighter graphics instead of just vanishing.
async function crashed(what, details) {
  log(`${what}: ${JSON.stringify(details)}`);
  if (offered) return;
  offered = true;
  const gpu = what === 'gpu';
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: 'error',
    title: 'Namma Bengaluru',
    message: gpu ? 'The graphics driver stopped responding.' : 'The game stopped unexpectedly.',
    detail: `Reason: ${details.reason || 'unknown'}${details.exitCode != null ? ` (code ${details.exitCode})` : ''}\n\n`
      + 'Restart with lighter graphics? A log was saved to:\n' + logFile(),
    buttons: ['Restart with lighter graphics', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    const args = process.argv.slice(1).filter((a) => a !== '--safe-graphics' && a !== '--no-gpu');
    args.push('--safe-graphics');
    if (gpu || safe) args.push('--no-gpu'); // second crash, or the GPU process died: software rendering
    app.relaunch({ args });
  }
  app.exit(0);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    title: 'Namma Bengaluru',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'web', 'index.html'), safe ? { query: { detail: 'lite' } } : undefined);
  // F11 toggles full screen, F12 opens the developer tools.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });
  // Links (if any) open in the system browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('render-process-gone', (e, d) => crashed('renderer', d));
  win.webContents.on('console-message', (e, level, message) => { if (level >= 3) log(`console error: ${message}`); });
}

// Chromium restarts a crashed GPU process (the page reloads itself); only a second crash within a
// minute means the driver can't cope.
let gpuCrashAt = 0;
app.on('child-process-gone', (e, d) => {
  if (d.type !== 'GPU' || d.reason === 'clean-exit') return;
  log(`gpu: ${JSON.stringify(d)}`);
  const now = Date.now();
  if (now - gpuCrashAt < 60000) crashed('gpu', d);
  gpuCrashAt = now;
});

app.whenReady().then(() => {
  log(`start ${app.getVersion()} ${process.platform} safe=${safe} noGpu=${noGpu}`);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
