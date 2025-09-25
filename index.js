// index.js (main)
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const indexer = require('./AppIndexer'); // keep exact casing/path you used
const path = require('path');
const fs = require('fs');

// Optional watcher (requires indexWatcher.js to exist in project root)
let startWatcher = null;
try {
  startWatcher = require('./indexWatcher').startWatcher;
} catch (e) {
  // watcher is optional — if missing we'll just continue without watching
  startWatcher = null;
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 550,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile('src/index.html');
  win.setMenu(null);

  // When the renderer finishes loading, send initial index snapshot
  win.webContents.on('did-finish-load', async () => {
    try {
      const idx = await indexer.loadOrBuildIndex(app.getPath('userData'));
      // Send index to renderer so UI can render immediately
      win.webContents.send('index-ready', idx);
      console.log(`Sent index to renderer - ${idx.length} items`);
    } catch (e) {
      console.warn('Failed to send index to renderer on did-finish-load', e);
      win.webContents.send('index-ready', []); // still send something
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => { 
  createWindow(); 
  indexer.registerIpcHandlers(() => app.getPath('userData'));

  // Index List Console Logger (preserve your original logging)
  try {
    const idx = await indexer.loadOrBuildIndex(app.getPath('userData'));
    
    console.log('\n=== Index Summary ===');
    console.log(`Total Items: ${idx.length}`);
    

  } catch (e) {
    console.warn('Index build failed', e);
  }

  // Your existing "fresh build" flow (delete old index file then rebuild)
  try {
    // Force a fresh index build by deleting the old one
    const indexPath = path.join(app.getPath('userData'), 'app-index.json');
    try {
      fs.unlinkSync(indexPath);
    } catch (e) {

    }

    // Build fresh index
    const idx = await indexer.loadOrBuildIndex(app.getPath('userData'));
    
    // Log statistics about indexed items
    const stats = {
      total: idx.length,
      applications: idx.filter(item => item.type === 'application').length,
      files: idx.filter(item => item.type === 'file').length,
      byExtension: {}
    };

    idx.forEach(item => {
      const ext = item.ext || '';
      if (!stats.byExtension[ext]) stats.byExtension[ext] = 0;
      stats.byExtension[ext]++;
    });

    // console.log('Index Statistics:', JSON.stringify(stats, null, 2));

  } catch (e) {
    console.warn('Index build failed', e);
    console.error(e);
  }

  // Start file system watcher (if indexWatcher is available)
  try {
    if (typeof startWatcher === 'function') {
      const START_MENU_COMMON = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
      const START_MENU_USER = path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs');

      const startMenuDirs = [START_MENU_COMMON, START_MENU_USER].filter(Boolean);

      const userProfile = process.env.USERPROFILE || '';
      const userFileDirs = [
        path.join(userProfile, 'Documents'),
        path.join(userProfile, 'Desktop')
      ].filter(p => p && fs.existsSync(p));

      // Start the watcher. onChange will reload index & push to renderer
      const watcher = startWatcher({
        userDataPath: app.getPath('userData'),
        startMenuDirs,
        fileDirs: userFileDirs,
        onChange: async () => {
          try {
            const newIdx = await indexer.loadOrBuildIndex(app.getPath('userData'));
            if (win && win.webContents) {
              win.webContents.send('index-ready', newIdx);
              console.log('Watcher: pushed updated index to renderer —', newIdx.length);
            }
          } catch (err) {
            console.warn('Watcher: failed to reload index', err);
          }
        }
      });

      // app lifecycle: close watcher on quit
      app.on('will-quit', () => {
        try { if (watcher && watcher.close) watcher.close(); } catch (e) {}
      });
    } else {
      console.log('indexWatcher not found — file watching disabled.');
    }
  } catch (e) {
    console.warn('Failed to start index watcher', e);
  }

  // Global shortcut registration
  const success = globalShortcut.register('Control+Space', () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
      // notify renderer to focus input if it listens for this event
      try { if (win && win.webContents) win.webContents.send('focus-input'); } catch (e) {}
    }
  });
  
  if (!success) {
    console.error('Global shortcut registration failed!');
  }
});

// Unregister shortcuts on quit
app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (e) {}
});

// Keep unhandled promise rejections visible
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
