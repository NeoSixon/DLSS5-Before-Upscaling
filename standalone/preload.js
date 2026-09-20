'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nrApp', Object.freeze({
  getState: () => ipcRenderer.invoke('app:get-state'),
  getCachedState: () => ipcRenderer.invoke('app:get-cached-state'),
  setLanguage: language => ipcRenderer.invoke('app:set-language', language),
  setOverlayLanguage: language => ipcRenderer.invoke('app:set-overlay-language', language),
  getOverlayPreferences: () => ipcRenderer.invoke('app:get-overlay-preferences'),
  setOverlayPreferences: preferences => ipcRenderer.invoke('app:set-overlay-preferences', preferences),
  openSupport: () => ipcRenderer.invoke('app:open-support'),
  openGithub: () => ipcRenderer.invoke('app:open-github'),
  setSteamGridDbKey: key => ipcRenderer.invoke('artwork:set-steamgriddb-key', key),
  openSteamGridDbKey: () => ipcRenderer.invoke('artwork:open-steamgriddb-key'),
  refreshNonSteamArtwork: () => ipcRenderer.invoke('artwork:refresh-non-steam'),
  repairArtwork: id => ipcRenderer.invoke('artwork:repair-game', id),
  onArtworkUpdated: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('artwork:updated', (_event, payload) => callback(payload));
  },
  rescanGames: () => ipcRenderer.invoke('games:rescan'),
  addGame: () => ipcRenderer.invoke('games:add'),
  chooseGameFolder: () => ipcRenderer.invoke('games:choose-folder'),
  addGameCandidate: (token, index) => ipcRenderer.invoke('games:add-candidate', token, index),
  selectGame: id => ipcRenderer.invoke('games:select', id),
  showGameMenu: id => ipcRenderer.invoke('games:context-menu', id),
  setGameFavorite: (id, favorite) => ipcRenderer.invoke('games:set-favorite', id, favorite),
  setGameHidden: (id, hidden) => ipcRenderer.invoke('games:set-hidden', id, hidden),
  removeGame: id => ipcRenderer.invoke('games:remove', id),
  launchGame: id => ipcRenderer.invoke('game:launch', id),
  openGameFolder: id => ipcRenderer.invoke('game:open-folder', id),
  setGameSettings: (id, settings) => ipcRenderer.invoke('game:set-settings', id, settings),
  importRuntime: id => ipcRenderer.invoke('runtime:import', id),
  install: id => ipcRenderer.invoke('game:install', id),
  updateBackend: id => ipcRenderer.invoke('game:update-backend', id),
  restore: id => ipcRenderer.invoke('game:restore', id),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
}));
