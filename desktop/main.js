const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let frontendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "KuberKhajana",
    backgroundColor: '#020617', // slate-950
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load local Next.js instance
  mainWindow.loadURL('http://localhost:3000');

  // Intercept new window requests (e.g. external links) and load them in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  console.log('[Electron] Starting Express Backend...');
  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../backend'),
    shell: true
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend Log]: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });
}

function startFrontend() {
  console.log('[Electron] Starting Next.js Frontend...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../frontend'),
    shell: true
  });

  frontendProcess.stdout.on('data', (data) => {
    console.log(`[Frontend Log]: ${data}`);
  });

  frontendProcess.stderr.on('data', (data) => {
    console.error(`[Frontend Error]: ${data}`);
  });
}

app.on('ready', () => {
  // Boot up our local services
  startBackend();
  startFrontend();

  // Give the Next.js server 5 seconds to warm up before opening the Electron frame
  console.log('[Electron] Warming up local servers...');
  setTimeout(createWindow, 5000);
});

function cleanupProcesses() {
  console.log('[Electron] Terminating background processes...');
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
}

app.on('window-all-closed', () => {
  cleanupProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  cleanupProcesses();
});
