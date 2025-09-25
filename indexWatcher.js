// indexWatcher.js (updated - safer)
// npm install chokidar if you haven't already

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

function pathIsReadable(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch (e) {
    return false;
  }
}

function startWatcher(opts) {
  const {
    userDataPath,
    startMenuDirs = [],
    fileDirs = [],
    onChange = () => {}
  } = opts;

  // Build watch list and filter out unreadable or non-existent paths
  const rawPaths = [...startMenuDirs, ...fileDirs].filter(Boolean);
  const watchPaths = rawPaths.filter(p => {
    // skip non-existing
    if (!fs.existsSync(p)) return false;
    // skip unreadable (permission denied)
    if (!pathIsReadable(p)) {
      console.warn('indexWatcher: skipping unreadable path', p);
      return false;
    }
    return true;
  });

  if (watchPaths.length === 0) {
    console.log('indexWatcher: no valid paths to watch.');
    return { close: () => {} };
  }

  // chokidar options - tolerate permission errors and ignore initial adds
  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    depth: 6,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    },
    ignorePermissionErrors: true,
    // tuned ignore: skip dotfiles, node_modules, AppData and typical junk folders
    ignored: /(^|[\/\\])(\..|node_modules|AppData|Thumbs.db|desktop\.ini)/
  });

  // Debounce batch
  const changed = new Set();
  let timer = null;
  const flushDelay = 700;

  async function flushChanges() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (changed.size === 0) return;
    const paths = Array.from(changed);
    changed.clear();

    const indexer = require('./AppIndexer');

    for (const p of paths) {
      try {
        // Only handle files; directories may be handled as unlinkDir events
        const st = await fs.promises.stat(p).catch(()=>null);
        if (st && st.isFile()) {
          await indexer.incrementalAdd(userDataPath, p);
        } else {
          await indexer.incrementalRemove(userDataPath, p);
        }
      } catch (e) {
        // ignore per-path errors; log them for debugging
        console.warn('indexWatcher: error processing path', p, e && e.message);
      }
    }

    // Notify caller that index changed (renderer push can happen here)
    try { await onChange(); } catch (e) { console.warn('indexWatcher onChange failed', e); }
  }

  function schedule(p) {
    // Optionally skip unreadable paths that appear in events
    if (!pathIsReadable(path.dirname(p))) {
      // parent unreadable — skip scheduling
      return;
    }
    changed.add(p);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushChanges, flushDelay);
  }

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('unlinkDir', schedule);

  watcher.on('error', (err) => {
    // chokidar emits errors — log and continue. If it's permission-related, ignore.
    console.warn('Watcher error', err && err.message ? err.message : err);
    // Do not throw; we want watcher to keep trying for other paths.
  });

  return {
    close: () => watcher.close().catch(()=>{})
  };
}

module.exports = { startWatcher };
