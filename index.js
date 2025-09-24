const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const indexer = require('./AppIndexer');
const path = require('path');

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
}

app.whenReady().then(async () => { 
  createWindow(); 
  indexer.registerIpcHandlers(() => app.getPath('userData'));
  // Index List Console Logger
    try {
    const idx = await indexer.loadOrBuildIndex(app.getPath('userData'));
    
    // Simple console log of all items
    console.log('\n=== Index Summary ===');
    console.log(`Total Items: ${idx.length}`);
    
    // console.log('\n=== Applications ===');
    // idx.filter(item => item.type === 'application')
    //    .forEach(app => console.log(`- ${app.name}`));
    
    // console.log('\n=== Files ===');
    // idx.filter(item => item.type === 'file')
    //    .forEach(file => console.log(`- ${file.name}${file.ext}`));

  } catch (e) {
    console.warn('Index build failed', e);
  }

  try {
    // Force a fresh index build by deleting the old one
    const indexPath = path.join(app.getPath('userData'), 'app-index.json');
    try {
      require('fs').unlinkSync(indexPath);
    } catch (e) {
      // File might not exist, ignore
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

    // Count items by extension
    idx.forEach(item => {
      if (!stats.byExtension[item.ext]) {
        stats.byExtension[item.ext] = 0;
      }
      stats.byExtension[item.ext]++;
    });

    // console.log('Index Statistics:', JSON.stringify(stats, null, 2));

  } catch (e) {
    console.warn('Index build failed', e);
    console.error(e);
  }

  const success = globalShortcut.register('Control+Space', () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
  
  if (!success) {
    console.error('Global shortcut registration failed!');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});