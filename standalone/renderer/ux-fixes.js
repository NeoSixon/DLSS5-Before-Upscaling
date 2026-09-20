'use strict';

(() => {
  const polish = document.createElement('link');
  polish.rel = 'stylesheet';
  polish.href = 'compact-ui.css';
  document.head.appendChild(polish);
  const nvidiaTheme = document.createElement('link');
  nvidiaTheme.rel = 'stylesheet';
  nvidiaTheme.href = 'nvidia-ui.css';
  document.head.appendChild(nvidiaTheme);

  document.querySelector('.sidebar-foot')?.remove();
  document.querySelector('#page-settings .page-heading p')?.remove();
  document.title = 'DLSS5 Before Upscaling';

  const brandDlss = document.querySelector('.brand-dlss');
  const brandFive = document.querySelector('.brand-five');
  if (brandDlss) brandDlss.textContent = 'DLSS';
  if (brandFive) brandFive.textContent = '5';

  const homePage = document.getElementById('page-home');
  if (homePage) {
    homePage.innerHTML = `
      <div class="home-v20-heading"><h1 id="homeHeadline">Home</h1></div>
      <section class="home-v20-section">
        <div class="home-v20-section-head">
          <h2 id="homeCurrentTitle">Current game</h2>
          <button class="home-view-all" id="homeOpenGamesBtn">Library <span>→</span></button>
        </div>
        <div class="home-game-grid home-v20-grid" id="homeCurrentGrid"></div>
      </section>
      <section class="home-v20-section">
        <div class="home-v20-section-head"><h2 id="homeFavoriteTitle">Favorites</h2></div>
        <div class="home-game-grid home-v20-grid" id="homeFavoriteGrid"></div>
      </section>`;
    document.getElementById('homeOpenGamesBtn')?.addEventListener('click', () => showPage('games'));
  }

  // Do not redraw a switch from stale state before a non-blocking IPC update lands.
  act = async function(work, lock = true) {
    if (lock && busy) return;
    if (lock) { busy = true; render(); }
    try { await work(); }
    catch (error) { toast(error.message || String(error)); }
    finally { if (lock) busy = false; render(); }
  };

  scanGames = async function() {
    await act(async () => {
      const result = unwrap(await window.nrApp.rescanGames());
      state = result.state;
      const count = Number(result.added || 0);
      scanMessage = state.language === 'zh-CN'
        ? (count ? `扫描完成，新增 ${count} 个已安装游戏。` : '扫描完成，游戏库已是最新。')
        : (count ? `Scan complete. Added ${count} installed game${count === 1 ? '' : 's'}.` : 'Scan complete. Your library is up to date.');
      toast(scanMessage);
    });
  };

  const strings = () => state.language === 'zh-CN' ? {
    subtitle: 'Before Upscaling', homeHeadline: '主页',
    homeDescription: '',
    currentGame: '当前游戏', favorites: '收藏',
    library: '游戏库', viewAll: '游戏库',
    libraryMeta: (all, compatible, configured) => `${all} 个游戏 · ${compatible} 个兼容 · ${configured} 个已配置`,
    emptyLibrary: '还没有检测到游戏，先扫描或手动添加。',
    master: '启用 DLSS5', masterBody: '控制该游戏是否启用 DLSS5 神经渲染。',
    sectionTitle: 'DLSS5 神经渲染', detected: '已检测到现有安装', detectedButton: '迁移并安装',
    info: 'Pre-SR 工作原理', rescan: '扫描游戏', saved: '设置已保存。', launch: '开始游戏', launching: '正在启动游戏…',
    compatible: '兼容', notCompatible: '不兼容', checking: '检查中…', configured: '已配置', all: '全部', compatibleFilter: '兼容 DLSS 5', configuredFilter: '已配置',
    unsupportedTitle: '未检测到可用的 DLSS 5 路径',
    unsupportedBody: '这个已安装游戏会保留在游戏库里，但当前没有检测到原生 DLSS、64 位主程序和受支持渲染 API 的完整组合。',
    overlayTitle: '游戏内面板', overlayBody: '',
    overlayEnabled: '启用游戏内面板', hotkey: '打开快捷键', scale: '缩放', opacity: '透明度', position: '位置',
    positions: ['左上', '右上', '左下', '右下'],
    overlayNote: '快捷键和显示参数会写入已安装游戏。更改快捷键后请重新启动游戏。'
  } : {
    subtitle: 'Before Upscaling', homeHeadline: 'Home',
    homeDescription: '',
    currentGame: 'Current game', favorites: 'Favorites',
    library: 'Library', viewAll: 'Library',
    libraryMeta: (all, compatible, configured) => `${all} games · ${compatible} compatible · ${configured} configured`,
    emptyLibrary: 'No installed games detected yet. Scan or add one manually.',
    master: 'Enable Neural Rendering', masterBody: 'Turn Neural Rendering off without removing OptiScaler or runtime files.',
    sectionTitle: 'DLSS 5 Neural Rendering', detected: 'Existing NR detected', detectedButton: 'Migrate & install',
    info: 'How Pre-SR works', rescan: 'Scan games', saved: 'Settings saved.', launch: 'Play', launching: 'Launching game…',
    compatible: 'Compatible', notCompatible: 'Not compatible', checking: 'Checking…', configured: 'Configured', all: 'All', compatibleFilter: 'DLSS 5 compatible', configuredFilter: 'Configured',
    unsupportedTitle: 'No usable DLSS 5 path detected',
    unsupportedBody: 'This installed game stays in your library, but the app did not detect the full combination of native DLSS, a 64-bit main executable and a supported rendering API.',
    overlayTitle: 'In-game overlay', overlayBody: 'Use the compact DLSS 5 panel instead of the full OptiScaler menu.',
    overlayEnabled: 'Enable compact overlay', hotkey: 'Open shortcut', scale: 'Scale', opacity: 'Opacity', position: 'Position',
    positions: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
    overlayNote: 'Shortcut and display preferences are written to installed games. Restart the game after changing the shortcut; old OptiScaler setups can be migrated from the game page.'
  };

  const isCompatible = game => Boolean(game?.compatible || (game?.chosen && game?.dlss && game.chosen.bitness === 64 && game.chosen.api));
  const isConfigured = game => Boolean(game?.installed || game?.existingSetup);

  function paintBrand() {
    const subtitle = document.querySelector('.brand-subtitle');
    if (subtitle) subtitle.textContent = 'Before Upscaling';
  }

  // Keep the language control as the native dropdown from index.html.


  function ensureMasterRow() {
    let row = document.getElementById('nrMasterRow');
    if (row) return row;
    const placement = document.getElementById('presrToggle')?.closest('.setting-row');
    if (!placement?.parentElement) return null;
    row = document.createElement('div'); row.id = 'nrMasterRow'; row.className = 'setting-row main-setting nr-master-setting';
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.id = 'nrMasterTitle';
    const body = document.createElement('p'); body.id = 'nrMasterBody'; text.append(title, body);
    const label = document.createElement('label'); label.className = 'switch';
    const input = document.createElement('input'); input.id = 'nrEnabledToggle'; input.type = 'checkbox';
    label.append(input, document.createElement('span')); row.append(text, label); placement.parentElement.insertBefore(row, placement);
    input.addEventListener('change', async event => {
      const game = selectedGame(); if (!game) return;
      await act(async () => { state = unwrap(await window.nrApp.setGameSettings(game.id, { enabled: event.target.checked })); toast(strings().saved); }, false);
    });
    return row;
  }

  let infoPopover = null;
  let infoButton = null;
  function positionInfoPopover() {
    if (!infoPopover || !infoButton || infoPopover.classList.contains('hidden')) return;
    const rect = infoButton.getBoundingClientRect(); const margin = 12; const width = Math.min(460, window.innerWidth - margin * 2);
    infoPopover.style.width = `${width}px`;
    let left = rect.right + 10; if (left + width > window.innerWidth - margin) left = Math.max(margin, rect.left - width - 10);
    let top = rect.top - 10; const height = infoPopover.offsetHeight || 180;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
    infoPopover.style.left = `${Math.round(left)}px`; infoPopover.style.top = `${Math.round(top)}px`;
  }

  function ensureInfoPopover() {
    if (document.getElementById('nrInfoButton')) return;
    const placement = document.getElementById('presrToggle')?.closest('.setting-row');
    const title = placement?.querySelector('strong');
    const details = document.querySelector('#gameDetail .presr-explainer');
    const content = details?.querySelector('.details-content');
    if (!placement || !title || !details || !content) return;
    const wrap = document.createElement('span'); wrap.className = 'nr-info-wrap presr-info-wrap';
    const button = document.createElement('button'); button.id = 'nrInfoButton'; button.type = 'button'; button.className = 'nr-info-button'; button.textContent = 'i';
    const popover = document.createElement('div'); popover.className = 'nr-info-popover hidden'; popover.appendChild(content);
    wrap.append(button); title.after(wrap); document.body.appendChild(popover); details.remove();
    infoPopover = popover; infoButton = button;
    button.addEventListener('click', event => { event.stopPropagation(); popover.classList.toggle('hidden'); if (!popover.classList.contains('hidden')) requestAnimationFrame(positionInfoPopover); });
    document.addEventListener('click', event => { if (!wrap.contains(event.target) && !popover.contains(event.target)) popover.classList.add('hidden'); });
    window.addEventListener('resize', positionInfoPopover); document.querySelector('.content')?.addEventListener('scroll', positionInfoPopover, { passive: true });
  }

  function decorateHero(game) {
    const hero = document.querySelector('#gameDetail .hero'); if (!hero) return;
    const primary = game.bannerDataUrl; const fallback = game.coverDataUrl; const key = `${primary || ''}|${fallback || ''}`;
    if (hero.dataset.artKey === key) return; hero.dataset.artKey = key;
    const apply = url => {
      const safe = String(url).replace(/"/g, '%22');
      hero.style.setProperty('background-image', `linear-gradient(90deg,rgba(5,7,9,.95) 0%,rgba(5,7,9,.80) 28%,rgba(5,7,9,.38) 58%,rgba(5,7,9,.10) 100%),url("${safe}")`, 'important');
      hero.classList.add('has-banner');
    };
    const clear = () => {
      hero.style.removeProperty('background-image');
      hero.classList.remove('has-banner');
    };
    if (!primary && !fallback) return clear();
    const image = new Image(); image.onload = () => apply(primary || fallback);
    image.onerror = () => {
      if (!primary || !fallback || primary === fallback) return clear();
      const backup = new Image(); backup.onload = () => apply(fallback); backup.onerror = clear; backup.src = fallback;
    };
    image.src = primary || fallback;
  }

  function ensureLaunchButton() {
    let button = document.getElementById('launchGameBtn'); if (button) return button;
    const copy = document.querySelector('#gameDetail .hero-copy'); if (!copy) return null;
    button = document.createElement('button'); button.id = 'launchGameBtn'; button.className = 'primary hero-launch-button'; button.type = 'button';
    button.addEventListener('click', async event => {
      event.stopPropagation(); const game = selectedGame(); if (!game) return; const label = button.textContent;
      button.disabled = true; button.textContent = strings().launching;
      try { const response = await window.nrApp.launchGame(game.id); if (!response?.ok) throw new Error(response?.message || 'Unable to launch game'); }
      catch (error) { toast(error.message || String(error)); }
      finally { button.disabled = false; button.textContent = label; }
    });
    copy.appendChild(button); return button;
  }

  function ensureCompatibilityNotice() {
    let notice = document.getElementById('compatibilityNotice'); if (notice) return notice;
    const hero = document.querySelector('#gameDetail .hero'); if (!hero?.parentElement) return null;
    notice = document.createElement('section'); notice.id = 'compatibilityNotice'; notice.className = 'compatibility-notice hidden';
    const title = document.createElement('strong'); title.id = 'compatibilityNoticeTitle';
    const body = document.createElement('p'); body.id = 'compatibilityNoticeBody'; notice.append(title, body); hero.after(notice); return notice;
  }

  function decorateGameRows() {
    const rows = [...document.querySelectorAll('#gameList .game-row')];
    state.games.forEach((game, index) => {
      const row = rows[index]; if (!row) return; row.dataset.gameId = game.id;
      row.classList.toggle('is-compatible', isCompatible(game)); row.classList.toggle('is-configured', isConfigured(game));
      const avatar = row.querySelector('.game-avatar'); if (!avatar) return;
      if (game.iconDataUrl) { avatar.textContent = ''; avatar.style.backgroundImage = `url(${game.iconDataUrl})`; avatar.classList.add('has-art'); }
      else { avatar.style.backgroundImage = ''; avatar.textContent = gameTitle(game).slice(0, 1).toUpperCase(); avatar.classList.remove('has-art'); }
    });
  }

  function openGame(game) {
    act(async () => { state = unwrap(await window.nrApp.selectGame(game.id)); showPage('game'); }, false);
  }

  function homeCard(game) {
    const card = document.createElement('button'); card.className = 'home-game-card'; card.type = 'button';
    const art = document.createElement('img'); art.className = 'home-game-art'; art.alt = '';
    const primary = game.tileDataUrl || game.bannerDataUrl || game.coverDataUrl || game.iconDataUrl || ''; const fallback = game.bannerDataUrl || game.coverDataUrl || game.iconDataUrl || '';
    if (primary) art.src = primary;
    art.addEventListener('error', () => {
      if (fallback && art.src !== fallback) art.src = fallback;
      else {
        art.classList.add('hidden-art');
      }
    });
    const shade = document.createElement('span'); shade.className = 'home-game-shade';
    const text = document.createElement('span'); text.className = 'home-game-card-copy';
    const title = document.createElement('b'); title.textContent = gameTitle(game);
    const meta = document.createElement('small');
    const copy = strings();
    meta.textContent = [game.launcher, game.cachedOnly ? copy.checking : (isConfigured(game) ? copy.configured : (isCompatible(game) ? copy.compatible : copy.notCompatible))].filter(Boolean).join(' · ');
    text.append(title, meta); card.append(art, shade, text);
    card.addEventListener('click', () => openGame(game));
    return card;
  }

  function renderHomeCards() {
    const currentGrid = document.getElementById('homeCurrentGrid');
    const favoriteGrid = document.getElementById('homeFavoriteGrid');
    if (!currentGrid || !favoriteGrid) return;
    currentGrid.replaceChildren(); favoriteGrid.replaceChildren();
    const copy = strings();
    const current = selectedGame() || state.games.find(game => !game.hidden) || null;
    if (current && !current.hidden) currentGrid.appendChild(homeCard(current));
    else {
      const empty = document.createElement('div'); empty.className = 'home-game-empty';
      empty.textContent = state.language === 'zh-CN' ? '还没有当前游戏。' : 'No current game yet.';
      currentGrid.appendChild(empty);
    }
    const favorites = state.games.filter(game => game.favorite && !game.hidden);
    if (favorites.length) favorites.slice(0, 4).forEach(game => favoriteGrid.appendChild(homeCard(game)));
    else {
      const empty = document.createElement('div'); empty.className = 'home-game-empty';
      empty.textContent = state.language === 'zh-CN' ? '还没有收藏的游戏。在游戏库里右键游戏卡即可添加收藏。' : 'No favorites yet. Right-click a library card to add one.';
      favoriteGrid.appendChild(empty);
    }
  }

  function paintHomeCopy() {
    const copy = strings();
    const pairs = [
      ['homeHeadline', copy.homeHeadline],
      ['homeCurrentTitle', copy.currentGame || (state.language === 'zh-CN' ? '当前游戏' : 'Current game')],
      ['homeFavoriteTitle', copy.favorites || (state.language === 'zh-CN' ? '收藏' : 'Favorites')]
    ];
    for (const [id, value] of pairs) { const node = document.getElementById(id); if (node) node.textContent = value; }
    const viewAll = document.getElementById('homeOpenGamesBtn');
    if (viewAll) viewAll.innerHTML = `${copy.viewAll} <span>→</span>`;
  }

  // Replaces the old dashboard renderer: the new Home intentionally has no legacy counter nodes.
  renderHome = function() {
    const open = document.getElementById('homeOpenGamesBtn');
    if (open) open.disabled = busy || !state.games.length;
    paintHomeCopy(); renderHomeCards();
  };

  let gamesFilter = 'all';
  function ensureGamesFilters() {
    let bar = document.getElementById('gamesFilterBar'); if (bar) return bar;
    const heading = document.querySelector('#page-games .page-heading'); if (!heading) return null;
    bar = document.createElement('div'); bar.id = 'gamesFilterBar'; bar.className = 'games-filter-bar';
    for (const filter of ['all', 'compatible', 'configured']) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.filter = filter;
      button.addEventListener('click', () => { gamesFilter = filter; renderGames(); }); bar.appendChild(button);
    }
    heading.after(bar); return bar;
  }

  function paintGamesFilters() {
    const bar = ensureGamesFilters(); if (!bar) return; const copy = strings(); const labels = { all: copy.all, compatible: copy.compatibleFilter, configured: copy.configuredFilter };
    for (const button of bar.querySelectorAll('button')) { button.textContent = labels[button.dataset.filter]; button.classList.toggle('active', button.dataset.filter === gamesFilter); }
    for (const row of document.querySelectorAll('#gameList .game-row[data-game-id]')) {
      const game = state.games.find(item => item.id === row.dataset.gameId);
      const visible = gamesFilter === 'all' || (gamesFilter === 'compatible' && isCompatible(game)) || (gamesFilter === 'configured' && isConfigured(game));
      row.classList.toggle('filtered-out', !visible);
    }
  }

  function ensureScanButton() {
    if (document.getElementById('rescanGamesBtn')) return;
    const add = document.getElementById('addGameBtn'); if (!add?.parentElement) return;
    const scan = document.createElement('button'); scan.id = 'rescanGamesBtn'; scan.type = 'button'; scan.className = 'ghost compact scan-button'; add.parentElement.insertBefore(scan, add); scan.addEventListener('click', () => scanGames());
  }

  let overlayPrefs = { enabled: true, hotkey: 45, scale: 1, opacity: 0.82, position: 1 };
  function ensureOverlaySettings() {
    if (document.getElementById('overlaySettingsCard')) return;
    const settingsCard = document.querySelector('#page-settings .settings-page-card'); const about = settingsCard?.querySelector('.about-copy'); if (!settingsCard) return;
    const card = document.createElement('section'); card.id = 'overlaySettingsCard'; card.className = 'overlay-settings-card';
    card.innerHTML = `<div class="overlay-settings-head"><div><strong id="overlayTitle"></strong><p id="overlayBody"></p></div></div><div class="overlay-settings-grid"><div class="overlay-enabled-row"><span id="overlayEnabledLabel"></span><label class="switch"><input id="overlayEnabled" type="checkbox"><span></span></label></div><label class="field"><span id="overlayHotkeyLabel"></span><select id="overlayHotkey"><option value="45">Insert</option><option value="119">F8</option><option value="120">F9</option><option value="121">F10</option><option value="36">Home</option></select></label><label class="field"><span id="overlayScaleLabel"></span><select id="overlayScale"><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label><label class="field overlay-opacity-field"><span><span id="overlayOpacityLabel"></span><b id="overlayOpacityValue">82%</b></span><input id="overlayOpacity" type="range" min="0.5" max="0.95" step="0.05"></label><label class="field"><span id="overlayPositionLabel"></span><select id="overlayPosition"></select></label></div><p class="overlay-settings-note" id="overlayNote"></p>`;
    if (about) settingsCard.insertBefore(card, about); else settingsCard.appendChild(card);
    const save = async patch => { overlayPrefs = { ...overlayPrefs, ...patch }; const response = await window.nrApp.setOverlayPreferences(overlayPrefs); if (!response?.ok) throw new Error(response?.message || 'Unable to save overlay preferences'); overlayPrefs = { ...overlayPrefs, ...response.value }; paintOverlaySettings(); toast(strings().saved); };
    document.getElementById('overlayEnabled').addEventListener('change', event => act(() => save({ enabled: event.target.checked }), false));
    document.getElementById('overlayHotkey').addEventListener('change', event => act(() => save({ hotkey: Number(event.target.value) }), false));
    document.getElementById('overlayScale').addEventListener('change', event => act(() => save({ scale: Number(event.target.value) }), false));
    document.getElementById('overlayPosition').addEventListener('change', event => act(() => save({ position: Number(event.target.value) }), false));
    document.getElementById('overlayOpacity').addEventListener('input', event => { document.getElementById('overlayOpacityValue').textContent = `${Math.round(Number(event.target.value) * 100)}%`; });
    document.getElementById('overlayOpacity').addEventListener('change', event => act(() => save({ opacity: Number(event.target.value) }), false));
  }

  function paintOverlaySettings() {
    const card = document.getElementById('overlaySettingsCard'); if (!card) return; const copy = strings();
    for (const [id, value] of [['overlayTitle', copy.overlayTitle], ['overlayBody', copy.overlayBody], ['overlayEnabledLabel', copy.overlayEnabled], ['overlayHotkeyLabel', copy.hotkey], ['overlayScaleLabel', copy.scale], ['overlayOpacityLabel', copy.opacity], ['overlayPositionLabel', copy.position], ['overlayNote', copy.overlayNote]]) { const node = document.getElementById(id); if (node) node.textContent = value; }
    document.getElementById('overlayEnabled').checked = overlayPrefs.enabled !== false;
    document.getElementById('overlayHotkey').value = String(overlayPrefs.hotkey || 45); document.getElementById('overlayScale').value = String(overlayPrefs.scale || 1);
    document.getElementById('overlayOpacity').value = String(overlayPrefs.opacity ?? 0.82); document.getElementById('overlayOpacityValue').textContent = `${Math.round((overlayPrefs.opacity ?? 0.82) * 100)}%`;
    const position = document.getElementById('overlayPosition'); position.replaceChildren(...copy.positions.map((label, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = label; return option; })); position.value = String(overlayPrefs.position ?? 1);
    const disabled = overlayPrefs.enabled === false; for (const control of card.querySelectorAll('select,input[type="range"]')) control.disabled = disabled;
  }

  const originalRenderGame = renderGame;
  renderGame = function() {
    originalRenderGame(); ensureInfoPopover(); const game = selectedGame(); if (!game) return; const copy = strings(); const compatible = isCompatible(game);
    document.getElementById('gameDetail')?.classList.toggle('not-compatible', !compatible);
    const heading = document.querySelector('#gameDetail .neural-config-section .game-config-head h2'); if (heading) heading.textContent = copy.sectionTitle;
    const row = ensureMasterRow();
    if (row) { document.getElementById('nrMasterTitle').textContent = copy.master; document.getElementById('nrMasterBody').textContent = copy.masterBody; const enabled = document.getElementById('nrEnabledToggle'); enabled.checked = game.settings?.enabled !== false; enabled.disabled = busy || !compatible; }
    const info = document.getElementById('nrInfoButton'); if (info) info.title = copy.info;
    const pre = document.getElementById('presrToggle');
    if (pre) {
      const masterEnabled = game.settings?.enabled !== false;
      pre.disabled = busy || !compatible || !masterEnabled;
      pre.closest('.setting-row')?.classList.toggle('setting-disabled', !masterEnabled);
    }
    const notice = ensureCompatibilityNotice(); if (notice) { notice.classList.toggle('hidden', compatible); document.getElementById('compatibilityNoticeTitle').textContent = copy.unsupportedTitle; document.getElementById('compatibilityNoticeBody').textContent = copy.unsupportedBody; }
    const launch = ensureLaunchButton(); if (launch) launch.textContent = copy.launch;
    if (game.existingSetup && !game.installed) { const chip = document.getElementById('installState'); const install = document.getElementById('installBtn'); if (chip) chip.textContent = copy.detected; if (install) { install.textContent = copy.detectedButton; install.disabled = busy || !compatible; } }
    decorateHero(game);
  };

  const originalRenderGames = renderGames;
  renderGames = function() {
    originalRenderGames(); ensureScanButton(); const scan = document.getElementById('rescanGamesBtn'); if (scan) { scan.textContent = strings().rescan; scan.disabled = busy; } decorateGameRows(); paintGamesFilters();
  };

  document.getElementById('supportGithubBtn')?.addEventListener('click', async () => {
    try {
      const response = await window.nrApp.openGithub();
      if (!response?.ok) throw new Error(response?.message || 'Unable to open GitHub');
    } catch (error) { toast(error.message || String(error)); }
  });

  const originalRender = render;
  render = function() { originalRender(); paintBrand(); ensureOverlaySettings(); paintOverlaySettings(); };

  const scroller = document.querySelector('.content');
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { if (scroller) scroller.scrollTop = 0; }));
  document.getElementById('gameBackBtn')?.addEventListener('click', () => { if (scroller) scroller.scrollTop = 0; });

  window.nrApp.getOverlayPreferences?.().then(response => { if (response?.ok) overlayPrefs = { ...overlayPrefs, ...response.value }; render(); }).catch(() => {});
  render();
})();
