const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { exec } = require('child_process');

// Only run on Windows — return empty list otherwise
const IS_WINDOWS = process.platform === 'win32';

// Common Start Menu and user directory locations
const START_MENU_COMMON = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
const START_MENU_USER = () => path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs');
const USER_DIRS = [
  'Desktop',
  'Documents',
  'Downloads',
  'Pictures',
  'Music',
  'Videos'
].map(dir => path.join(process.env.USERPROFILE || '', dir));

function indexFilePath(userDataPath) {
  return path.join(userDataPath, 'app-index.json');
}

// Enhanced walkDir that handles both apps and files
async function walkDir(dir, options = {}) {
  const {
    maxDepth = 5,
    currentDepth = 0,
    includeFiles = false,
    excludeDirs = ['node_modules', '.git', 'AppData']
  } = options;

  const results = [];
  
  if (currentDepth > maxDepth) return results;

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) continue;
        
        const nested = await walkDir(fullPath, {
          ...options,
          currentDepth: currentDepth + 1
        });
        results.push(...nested);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const name = path.parse(entry.name).name;
        
        // Include shortcuts and optionally other files
        if (['.lnk', '.url', '.appref-ms'].includes(ext)) {
          results.push({
            name,
            file: fullPath,
            ext,
            type: 'application'
          });
        } else if (includeFiles) {
          // Filter for common file types
          const allowedExts = [
            '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
            '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif',
            '.mp3', '.mp4', '.wav', '.zip', '.rar'
          ];
          
          if (allowedExts.includes(ext)) {
            results.push({
              name,
              file: fullPath,
              ext,
              type: 'file'
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to read directory: ${dir}`, err);
  }
  
  return results;
}

async function buildIndex(userDataPath) {
  if (!IS_WINDOWS) return [];

  let allItems = [];

  // Index Start Menu (apps only)
  const startMenuDirs = [START_MENU_COMMON, START_MENU_USER()].filter(Boolean);
  for (const dir of startMenuDirs) {
    if (fs.existsSync(dir)) {
      const found = await walkDir(dir, { includeFiles: false });
      allItems.push(...found);
    }
  }

  // Index user directories (including files)
  for (const dir of USER_DIRS) {
    if (fs.existsSync(dir)) {
      const found = await walkDir(dir, { 
        includeFiles: true,
        maxDepth: 3
      });
      allItems.push(...found);
    }
  }

  // Deduplicate and add metadata
  const map = new Map();
  for (const item of allItems) {
    if (!map.has(item.file)) {
      map.set(item.file, {
        ...item,
        launchCount: 0,
        lastUsed: 0
      });
    }
  }
  const indexed = Array.from(map.values());

  // Save to disk
  try {
    const idxPath = indexFilePath(userDataPath);
    await fs.promises.mkdir(path.dirname(idxPath), { recursive: true });
    await fs.promises.writeFile(idxPath, JSON.stringify(indexed, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write index file:', e);
  }

  return indexed;
}

// Add the missing loadOrBuildIndex function
async function loadOrBuildIndex(userDataPath) {
  const idxPath = indexFilePath(userDataPath);
  
  try {
    // Try to load existing index
    if (fs.existsSync(idxPath)) {
      const raw = await fs.promises.readFile(idxPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load index, rebuilding...', e);
  }
  
  // Build fresh index if loading failed
  return buildIndex(userDataPath);
}

function registerIpcHandlers(getUserDataPath) {
  ipcMain.handle('index-apps', async () => {
    const userData = getUserDataPath();
    return loadOrBuildIndex(userData);
  });

  ipcMain.handle('launch-app', async (ev, file) => {
    if (!file) return { ok: false, err: 'no-file' };

    exec(`start "" "${file}"`, (err) => {
      if (err) console.error('Launch error', err);
    });

    // Update metadata
    try {
      const userData = getUserDataPath();
      const idxPath = indexFilePath(userData);
      if (fs.existsSync(idxPath)) {
        const raw = await fs.promises.readFile(idxPath, 'utf8');
        const idx = JSON.parse(raw);
        const item = idx.find(x => x.file === file);
        if (item) {
          item.launchCount = (item.launchCount || 0) + 1;
          item.lastUsed = Date.now();
          await fs.promises.writeFile(idxPath, JSON.stringify(idx, null, 2), 'utf8');
        }
      }
    } catch (e) {
      // ignore update failures
    }

    return { ok: true };
  });
}

module.exports = {
  buildIndex,
  loadOrBuildIndex,
  registerIpcHandlers
};