// Electron main process: creates window, starts backend, injects API base, and cleans up.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
// Optional modules (exist if installed)
let initAutoUpdater; try { ({ initAutoUpdater } = require('./main/updater')); } catch (_) {}
let LicenseManager; try { ({ LicenseManager } = require('./main/license')); } catch (_) {}

const PORT = process.env.HORARY_PORT ? Number(process.env.HORARY_PORT) : 52525;
const API_BASE_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let backendProc = null;
let closed = false;
let licenseManager = null;

function resolveBackendCommand() {
  // Prefer packaged exe under resources/backend
  const candidates = [];
  const resources = process.resourcesPath || path.join(__dirname);
  candidates.push(path.join(resources, 'backend', process.platform === 'win32' ? 'horary_backend.exe' : 'horary_backend'));
  // Some workflows place exe directly in resources
  candidates.push(path.join(resources, process.platform === 'win32' ? 'horary_backend.exe' : 'horary_backend'));
  // Dev fallback: python app.py from repo backend folder
  candidates.push(path.join(__dirname, '..', 'backend', 'app.py'));

  console.log('=== Backend Resolution Debug ===');
  console.log('process.resourcesPath:', process.resourcesPath);
  console.log('__dirname:', __dirname);
  console.log('resources path:', resources);
  console.log('Platform:', process.platform);
  console.log('Candidates to check:');
  candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  for (const p of candidates) {
    console.log(`Checking candidate: ${p}`);
    try {
      require('fs').accessSync(p);
      console.log(`✓ Found backend executable: ${p}`);
      if (p.endsWith('.py')) {
        const result = { cmd: process.platform === 'win32' ? 'python' : 'python3', args: [p], cwd: path.dirname(p) };
        console.log('Using Python:', result);
        return result;
      }
      const result = { cmd: p, args: [], cwd: path.dirname(p) };
      console.log('Using executable:', result);
      return result;
    } catch (e) { 
      console.log(`✗ Not found: ${p} (${e.message})`);
    }
  }
  console.log('No backend executable found in any candidate location');
  return null;
}

function startBackend(logDir) {
  console.log('=== Starting Backend ===');
  const resolved = resolveBackendCommand();
  if (!resolved) {
    console.warn('Backend executable not found. Assuming an external backend is running.');
    return null;
  }
  const env = { ...process.env, HORARY_PORT: String(PORT) };
  if (logDir) env.HORARY_LOG_DIR = logDir;
  console.log(`Starting backend: ${resolved.cmd} ${resolved.args.join(' ')} on ${API_BASE_URL}`);
  console.log(`Working directory: ${resolved.cwd}`);
  console.log(`Environment PORT: ${env.HORARY_PORT}`);
  
  try {
    const child = spawn(resolved.cmd, resolved.args, {
      cwd: resolved.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    
    console.log(`Backend process spawned with PID: ${child.pid}`);
    // Pipe stdout/stderr to log file
    try {
      if (logDir && !fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logPath = logDir ? path.join(logDir, 'backend.log') : path.join(resolved.cwd, 'backend.log');
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });
      
      child.stdout.on('data', (d) => {
        console.log('Backend stdout:', d.toString().trim());
        logStream.write(d);
      });
      child.stderr.on('data', (d) => {
        console.log('Backend stderr:', d.toString().trim());
        logStream.write(d);
      });
      child.on('exit', () => logStream.end());
      console.log(`Backend logs: ${logPath}`);
    } catch (e) {
      console.warn('Failed to initialize backend log stream:', e);
    }
    
    child.on('exit', (code, signal) => {
      console.log(`Backend exited: code=${code} signal=${signal}`);
      if (!closed) console.log(`Backend process terminated unexpectedly`);
    });
    
    child.on('error', (error) => {
      console.error('Backend process error:', error);
    });
    
    return child;
  } catch (error) {
    console.error('Failed to spawn backend process:', error);
    return null;
  }
}

function waitForHealth(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      if (Date.now() > deadline) return resolve(false);
      const req = http.get(`${API_BASE_URL}/api/health?skip_network=true`, { timeout: 1500 }, (res) => {
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        setTimeout(attempt, 400);
      });
      req.on('error', () => setTimeout(attempt, 400));
      req.on('timeout', () => { req.destroy(); setTimeout(attempt, 300); });
    };
    attempt();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // Inject API base early via preload (window.API_BASE_URL)
  process.env.API_BASE_URL = API_BASE_URL;

  if (!app.isPackaged) {
    // Dev: load Vite dev server or local file
    await mainWindow.loadURL('http://localhost:3000');
  } else {
    // Prod: load built files
    await mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  let logDir = null;
  try {
    logDir = path.join(app.getPath('userData'), 'logs');
  } catch (_) {}
  // Expose packaged flag to preload/renderer via env
  process.env.APP_IS_PACKAGED = app.isPackaged ? '1' : '0';

  if (app.isPackaged) {
    backendProc = startBackend(logDir);
    const ok = await waitForHealth(12000);
    console.log(`Backend health: ${ok ? 'OK' : 'Timeout — UI will retry'}`);
  } else {
    // Dev: point to dev backend default port
    process.env.API_BASE_URL = 'http://localhost:5000';
  }
  await createWindow();

  // Initialize licensing IPC
  try {
    if (LicenseManager) {
      if (app.isPackaged) {
        licenseManager = new LicenseManager(app);
        ipcMain.handle('license:get-status', async () => licenseManager.getStatus());
        ipcMain.handle('license:activate', async (_e, payload) => licenseManager.activate(payload || {}));
        ipcMain.handle('license:deactivate', async () => licenseManager.deactivate());
      } else {
        // Dev mode: expose permissive stubs so features are unlocked during development
        ipcMain.handle('license:get-status', async () => ({ active: true, plan: 'dev', exp: null }));
        ipcMain.handle('license:activate', async () => ({ ok: true, status: { active: true, plan: 'dev' } }));
        ipcMain.handle('license:deactivate', async () => ({ ok: true }));
      }
    }
  } catch (e) {
    console.warn('License manager init failed:', e);
  }

  // Initialize auto-updater IPC (no-op if module not installed)
  try { if (initAutoUpdater) initAutoUpdater(ipcMain, mainWindow); } catch (e) { console.warn('Updater init failed:', e); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function shutdownBackend() {
  closed = true;
  if (backendProc && !backendProc.killed) {
    try {
      if (process.platform === 'win32') {
        // First try a graceful kill
        backendProc.kill('SIGTERM');
        // Ensure the whole tree is terminated
        const { spawn } = require('child_process');
        setTimeout(() => {
          try { spawn('taskkill', ['/PID', String(backendProc.pid), '/T', '/F'], { windowsHide: true }); } catch (_) {}
        }, 1200);
      } else {
        backendProc.kill('SIGTERM');
        setTimeout(() => { try { backendProc.kill('SIGKILL'); } catch (_) {} }, 1200);
      }
    } catch (_) { /* ignore */ }
  }
}

app.on('before-quit', shutdownBackend);
app.on('will-quit', shutdownBackend);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    shutdownBackend();
    app.quit();
  }
});

// Extra safety: kill backend on process exit or signals
process.on('exit', shutdownBackend);
process.on('SIGINT', shutdownBackend);
process.on('SIGTERM', shutdownBackend);
process.on('uncaughtException', shutdownBackend);
process.on('unhandledRejection', shutdownBackend);
