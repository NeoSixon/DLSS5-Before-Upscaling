'use strict';

// Runs the real renderer with a fixture bridge: no game files, native dialogs or launches.
async function runLibraryUISmoke() {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async predicate => {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`UI wait timed out: ${predicate}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const card = id => document.querySelector(`[data-game-id="${id}"]`);
  const menu = async (id, action) => {
    card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
    await waitFor(() => document.querySelector('#gameContextMenu.show'));
    document.querySelector(`#gameContextMenu [data-context-action="${action}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 60));
  };
  showPage('games');
  await waitFor(() => currentPage === 'games' && card('a') && card('b'));
  check(document.querySelector('.library-game-card').dataset.gameId === 'b', 'Favorites must be first');
  check(!card('c'), 'Hidden game leaked into All');
  await menu('a', 'favorite');
  check(Boolean(card('a').querySelector('.library-favorite-mark')), 'Favorite marker missing');
  await menu('a', 'hidden');
  check(!card('a'), 'Hide did not remove the card');
  document.querySelector('[data-filter="hidden"]').click();
  check(Boolean(card('a') && card('c')), 'Hidden filter cannot recover cards');
  await menu('a', 'hidden');
  check(!card('a'), 'Unhide did not update the hidden filter');
  document.querySelector('[data-filter="all"]').click();
  await menu('a', 'launch');
  await menu('a', 'folder');
  check(window.nrTest.stats().launches === 1 && window.nrTest.stats().folders === 1, 'Context actions missing');
  check(currentPage === 'games', 'Right-click unexpectedly opened game detail');

  const target = card('a');
  target.click(); target.click();
  check(currentPage === 'game' && document.getElementById('gameTitle').textContent === 'Game a', 'Detail must open before selection IPC resolves');
  check(document.getElementById('gameDetail').inert, 'Stale detail must not allow changes during refresh');
  check(window.nrTest.stats().selections === 1, 'Repeated click sent duplicate selection');
  window.nrTest.completeSelection();
  await waitFor(() => !busy);
  check(!document.getElementById('gameDetail').inert, 'Controls stayed blocked after refresh');
  document.getElementById('gameBackBtn').click();

  document.getElementById('addGameBtn').click();
  check(Boolean(document.querySelector('dialog[open]')), 'Add game dialog did not open');
  document.getElementById('chooseGameFolderBtn').click();
  await waitFor(() => document.querySelectorAll('.exe-candidate').length === 2);
  check(document.querySelector('.exe-candidate code').textContent.includes('Client/Binaries/Win64'), 'Candidate path not shown');
  const dialog = document.querySelector('dialog');
  check(dialog.scrollWidth <= dialog.clientWidth + 1, 'Long executable paths overflow the dialog');
  document.querySelector('input[name="gameExecutable"][value="1"]').click();
  document.getElementById('confirmAddGameBtn').click();
  await waitFor(() => currentPage === 'game' && selectedGame()?.id === 'new');
  check(window.nrTest.stats().adds === 1, 'Selected candidate not added');
  document.getElementById('gameBackBtn').click();

  document.getElementById('addGameBtn').click();
  document.getElementById('chooseGameExeBtn').click();
  await waitFor(() => !document.getElementById('cancelAddGameBtn').disabled);
  check(window.nrTest.stats().adds === 1, 'Cancelling native EXE picker added a game');
  document.getElementById('cancelAddGameBtn').click();
  await waitFor(() => !document.querySelector('dialog'));

  window.nrTest.delayFolder(true);
  document.getElementById('addGameBtn').click();
  document.getElementById('chooseGameFolderBtn').click();
  document.getElementById('cancelAddGameBtn').click();
  window.nrTest.completeFolder();
  await new Promise(resolve => setTimeout(resolve, 50));
  check(!document.querySelector('dialog'), 'Late scan reopened a cancelled dialog');
  check(window.nrTest.stats().adds === 1, 'Cancelled folder scan changed the library');
  window.nrTest.delayFolder(false);
  const languageSelect = document.getElementById('languageSelect');
  languageSelect.value = 'zh-CN';
  languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => state.language === 'zh-CN' && !languageSelect.disabled);
  document.getElementById('addGameBtn').click();
  check(document.getElementById('addGameTitle').textContent === '添加游戏', 'Add dialog is not localized');
  document.getElementById('chooseGameFolderBtn').click();
  await waitFor(() => document.querySelector('.exe-recommended'));
  check(document.querySelector('.exe-recommended').textContent === '推荐候选', 'EXE candidate explanation is not localized');
  document.getElementById('cancelAddGameBtn').click();
  return 'PASS: favorites, hide/unhide, context actions, immediate detail, duplicate-click guard, EXE choice and cancellation';
}

module.exports = runLibraryUISmoke;

// Electron's default app imports the entry file, so require.main is not this
// CommonJS module. Keep the browser test export usable from ordinary Node too.
if (process.versions.electron && process.type === 'browser') {
  const { app, BrowserWindow } = require('electron');
  const path = require('path');
  let stage = 'waiting for Electron';
  const timeout = setTimeout(() => {
    console.error(`Library UI test timed out while ${stage}`);
    app.exit(1);
  }, 20000);
  app.whenReady().then(async () => {
    // Keep Electron alive between the two fresh fixture windows.
    app.on('window-all-closed', () => {});
    for (const width of [1280, 980]) {
      stage = `loading the renderer at ${width}px`;
      console.log(stage);
      const win = new BrowserWindow({ show: false, width, height: 820, webPreferences: {
        preload: path.resolve(__dirname, '../test/fixtures/standalone-library-preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false
      } });
      const errors = [];
      win.webContents.on('preload-error', (_event, file, error) => {
        errors.push(`${file}: ${error.message}`);
        console.error(errors.at(-1));
      });
      win.webContents.on('console-message', (_event, level, message) => {
        if (level >= 3) { errors.push(message); console.error('[renderer]', message); }
      });
      win.webContents.on('render-process-gone', (_event, details) => {
        console.error('Renderer exited:', details.reason);
        app.exit(1);
      });
      await win.loadFile(path.resolve(__dirname, '../standalone/renderer/index.html'));
      if (errors.length) throw new Error(errors.join('\n'));
      stage = `checking library actions at ${width}px`;
      console.log(stage);
      console.log(await win.webContents.executeJavaScript(`(${runLibraryUISmoke.toString()})()`));
      if (errors.length) throw new Error(errors.join('\n'));
      win.destroy();
    }
    clearTimeout(timeout);
    app.exit(0);
  }).catch(error => {
    console.error(`Library UI test failed while ${stage}:`, error);
    app.exit(1);
  });
}
