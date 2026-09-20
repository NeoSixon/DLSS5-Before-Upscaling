'use strict';

function createLibraryFixture() {
  const clone = value => JSON.parse(JSON.stringify(value));
  const art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#244554"/></svg>');
  const game = (id, extra = {}) => ({ id, displayName: `Game ${id}`, exePath: `C:/Games/${id}/Game.exe`, launcher: 'Manual', chosen: { bitness: 64, api: 'dxgi', apiLabel: 'DirectX 12' }, compatible: true, dlss: { version: '4.0' }, settings: { enabled: true, runBeforeSR: true, passes: 2 }, coverDataUrl: art, ...extra });
  const state = { language: 'en', selectedGameId: 'a', games: [game('a'), game('b', { favorite: true }), game('c', { hidden: true })] };
  const ok = value => ({ ok: true, value: clone(value) });
  let menuAction = null;
  let finishSelection = null;
  let finishFolder = null;
  let delayFolder = false;
  const stats = { selections: 0, launches: 0, folders: 0, adds: 0 };
  const folderResult = { token: 'fixture-token', root: 'C:/Games/Wuthering Waves', maxDepth: 8, truncated: false, candidates: [
    { index: 0, name: 'Client-Win64-Shipping.exe', relativePath: 'Wuthering Waves Game/Client/Binaries/Win64/Client-Win64-Shipping.exe', reasons: ['x64', 'shipping'], supported: true, apiLabel: 'DirectX 12' },
    { index: 1, name: 'Game_dx11.exe', relativePath: 'Client/Binaries/Win64/Game_dx11.exe', reasons: ['x64'], supported: true, apiLabel: 'DirectX 11' }
  ] };
  return {
    api: {
      getState: async () => ok(state),
      getOverlayPreferences: async () => ok({ enabled: true, hotkey: 121, scale: 1, opacity: .82, position: 1 }),
      setOverlayLanguage: async () => ok({}),
      setLanguage: async language => { state.language = language; return ok(state); },
      rescanGames: async () => ok({ added: 0, state }),
      selectGame: id => {
        stats.selections++;
        state.selectedGameId = id;
        return new Promise(resolve => { finishSelection = () => resolve(ok(state)); });
      },
      showGameMenu: async () => { const action = menuAction; menuAction = null; return ok(action); },
      setGameFavorite: async (id, favorite) => { state.games.find(game => game.id === id).favorite = favorite; return ok(state); },
      setGameHidden: async (id, hidden) => { state.games.find(game => game.id === id).hidden = hidden; return ok(state); },
      launchGame: async () => { stats.launches++; return ok(true); },
      openGameFolder: async () => { stats.folders++; return ok(true); },
      addGame: async () => ok({ cancelled: true }),
      chooseGameFolder: async () => {
        if (delayFolder) return new Promise(resolve => { finishFolder = () => resolve(ok(folderResult)); });
        return ok(folderResult);
      },
      addGameCandidate: async (token, index) => {
        if (token !== 'fixture-token' || index !== 1) throw new Error('Unexpected executable selection');
        stats.adds++;
        state.games.push(game('new')); state.selectedGameId = 'new'; return ok(state);
      },
      minimize() {}, maximize() {}, close() {}
    },
    control: {
      menu: action => { menuAction = action; },
      stats: () => clone(stats),
      completeSelection: () => finishSelection?.(),
      delayFolder: value => { delayFolder = value; },
      completeFolder: () => finishFolder?.()
    }
  };
}

if (typeof module !== 'undefined') module.exports = createLibraryFixture;
