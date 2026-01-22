// ============================================================================
// TNA Desktop - Electron Main Process
// ============================================================================

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const config = require('config');
const treeKill = require('tree-kill');

// ============================================================================
// Configuration
// ============================================================================

const APP_CONFIG = {
  name: config.get('app.name') || 'TNA',
  version: config.get('app.version') || '2.0.0'
};

const R_CONFIG = {
  url: config.get('R.url') || 'http://127.0.0.1:',
  port: config.get('R.port') || 9193,
  app: config.get('R.app') || 'app.R',
  isPortable: config.get('R.path.isPortable') !== false,
  fixHome: config.get('R.path.fixHome') !== false
};

const WINDOW_CONFIG = {
  delay: config.get('window.delay') || 3000,
  poll: config.get('window.poll') || 500,
  width: config.get('window.config.width') || 1400,
  height: config.get('window.config.height') || 900,
  title: config.get('window.config.title') || 'TNA - Transition Network Analysis'
};

// ============================================================================
// Global State
// ============================================================================

let mainWindow = null;
let loadingWindow = null;
let rProcess = null;
let isQuitting = false;

// ============================================================================
// R Process Management
// ============================================================================

function getRPath() {
  const platform = process.platform;
  const isPackaged = app.isPackaged;

  let basePath;
  if (isPackaged) {
    // In packaged app, R-Portable is in resources
    basePath = path.join(process.resourcesPath, 'R-Portable');
  } else {
    // In development, R-Portable is in app directory
    const platformDir = platform === 'win32' ? 'R-Portable-Win'
                      : platform === 'darwin' ? 'R-Portable-Mac'
                      : 'R-Portable-Linux';
    basePath = path.join(__dirname, platformDir);
  }

  let rBinary;
  if (platform === 'win32') {
    rBinary = path.join(basePath, 'bin', 'Rscript.exe');
  } else {
    rBinary = path.join(basePath, 'bin', 'Rscript');
  }

  console.log(`R binary path: ${rBinary}`);
  console.log(`R binary exists: ${fs.existsSync(rBinary)}`);

  return { basePath, rBinary };
}

function getAppPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return __dirname;
}

function startRProcess() {
  return new Promise((resolve, reject) => {
    const { basePath, rBinary } = getRPath();
    const appPath = getAppPath();
    const appFile = path.join(appPath, R_CONFIG.app);

    if (!fs.existsSync(rBinary)) {
      const error = `R binary not found at: ${rBinary}`;
      console.error(error);
      reject(new Error(error));
      return;
    }

    if (!fs.existsSync(appFile)) {
      const error = `Shiny app not found at: ${appFile}`;
      console.error(error);
      reject(new Error(error));
      return;
    }

    console.log(`Starting R process...`);
    console.log(`  R binary: ${rBinary}`);
    console.log(`  App file: ${appFile}`);
    console.log(`  Port: ${R_CONFIG.port}`);

    // Environment variables for R
    const env = { ...process.env };

    if (R_CONFIG.isPortable) {
      env.R_HOME = basePath;
      env.R_HOME_DIR = basePath;
      // Don't override R_LIBS_USER to allow finding packages in user library
      // For production builds, packages should be in R-Portable/library
      const portableLib = path.join(basePath, 'library');
      const userLib = env.R_LIBS_USER || '';
      env.R_LIBS = userLib ? `${portableLib};${userLib}` : portableLib;
    }

    // Set Shiny port
    env.SHINY_PORT = R_CONFIG.port.toString();

    // Run the app.R file directly
    rProcess = spawn(rBinary, [R_CONFIG.app], {
      cwd: appPath,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    rProcess.stdout.on('data', (data) => {
      console.log(`R stdout: ${data}`);
      // Check if Shiny is ready
      if (data.toString().includes('Listening on')) {
        console.log('Shiny server is ready!');
        resolve();
      }
    });

    rProcess.stderr.on('data', (data) => {
      console.log(`R stderr: ${data}`);
      // Shiny often outputs to stderr
      if (data.toString().includes('Listening on')) {
        console.log('Shiny server is ready!');
        resolve();
      }
    });

    rProcess.on('error', (error) => {
      console.error(`R process error: ${error.message}`);
      reject(error);
    });

    rProcess.on('exit', (code, signal) => {
      console.log(`R process exited with code ${code}, signal ${signal}`);
      rProcess = null;

      if (!isQuitting && mainWindow) {
        dialog.showErrorBox('R Process Ended',
          'The R process has unexpectedly ended. The application will now close.');
        app.quit();
      }
    });

    // Timeout fallback - resolve after delay even if we don't see "Listening on"
    setTimeout(() => {
      resolve();
    }, WINDOW_CONFIG.delay);
  });
}

function stopRProcess() {
  return new Promise((resolve) => {
    if (rProcess && rProcess.pid) {
      console.log(`Stopping R process (PID: ${rProcess.pid})...`);

      treeKill(rProcess.pid, 'SIGTERM', (err) => {
        if (err) {
          console.error(`Error killing R process: ${err}`);
          // Force kill
          treeKill(rProcess.pid, 'SIGKILL', () => {
            rProcess = null;
            resolve();
          });
        } else {
          rProcess = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

// ============================================================================
// Server Health Check
// ============================================================================

function checkServerReady(url, maxAttempts = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let resolved = false;

    const check = () => {
      if (resolved) return;

      attempts++;
      console.log(`Checking server (attempt ${attempts}/${maxAttempts})...`);

      const request = http.get(url, (res) => {
        if (resolved) return;
        console.log(`Server responded with status: ${res.statusCode}`);
        if (res.statusCode === 200 || res.statusCode === 302) {
          resolved = true;
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`Server not ready after ${maxAttempts} attempts`));
        }
      });

      request.on('error', (err) => {
        if (resolved) return;
        console.log(`Server check error: ${err.message}`);
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`Server not ready after ${maxAttempts} attempts: ${err.message}`));
        }
      });

      request.setTimeout(2000, () => {
        if (resolved) return;
        request.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Server timeout'));
        }
      });
    };

    check();
  });
}

// ============================================================================
// Window Management
// ============================================================================

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loadingWindow.loadFile(path.join(__dirname, 'loading.html'));

  loadingWindow.on('closed', () => {
    loadingWindow = null;
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    title: WINDOW_CONFIG.title,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  const serverUrl = `${R_CONFIG.url}${R_CONFIG.port}`;

  mainWindow.loadURL(serverUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (loadingWindow) {
      loadingWindow.close();
      loadingWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const serverUrl = `${R_CONFIG.url}${R_CONFIG.port}`;
    if (!url.startsWith(serverUrl) && !url.startsWith('http://127.0.0.1')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;

      // Clean shutdown
      stopRProcess().then(() => {
        app.quit();
      });
    }
  });
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  console.log('App ready, starting...');
  console.log(`Platform: ${process.platform}`);
  console.log(`Packaged: ${app.isPackaged}`);
  console.log(`App path: ${app.getAppPath()}`);

  // Show loading window
  createLoadingWindow();

  try {
    // Start R process
    await startRProcess();

    // Wait for server to be ready
    const serverUrl = `${R_CONFIG.url}${R_CONFIG.port}`;
    console.log(`Waiting for server at ${serverUrl}...`);

    await checkServerReady(serverUrl);

    console.log('Server is ready, creating main window...');
    createMainWindow();

  } catch (error) {
    console.error('Failed to start:', error);

    if (loadingWindow) {
      loadingWindow.close();
    }

    dialog.showErrorBox('Startup Error',
      `Failed to start the application:\n\n${error.message}\n\nPlease check that all dependencies are installed.`);

    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    stopRProcess().then(() => {
      app.quit();
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', async (event) => {
  if (rProcess && !isQuitting) {
    event.preventDefault();
    isQuitting = true;
    await stopRProcess();
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  stopRProcess().then(() => {
    app.quit();
  });
});
