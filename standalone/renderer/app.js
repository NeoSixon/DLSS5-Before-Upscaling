'use strict';

const I18N = {
  en: {
    productSubtitle: 'Neural Rendering Manager', home: 'Home', games: 'Games', settings: 'Settings', standaloneCore: 'Standalone core',
    homeTitle: 'Find Pre-SR routes', homeBody: 'Scan installed games for DLSS, XeSS, FSR2/FSR3 and FidelityFX temporal inputs that can be routed through DLSS 5.', scanGames: 'Scan games',
    compatibleGames: 'Compatible games', installedGames: 'Neural Rendering installed', openLibrary: 'Open game library', scanningGames: 'Scanning installed game libraries…',
    addFirstGameTitle: 'Add your first game', addFirstGameBody: "Choose the game's main executable. The app will detect its rendering API and temporal upscaler route.", addGame: 'Add game',
    gameDetected: 'Game detected', neuralRendering: 'DLSS5 Neural Rendering', nrDescription: '',
    runBeforeSr: 'Pre-SR', runBeforeSrBody: 'Choose whether Neural Rendering runs before or after DLSS Super Resolution.', howItWorks: 'How it works',
    passes: 'Passes', passesLabel: 'Pass count', passesBody: 'Choose how many Neural Rendering passes are used.', passStyles: 'Per-pass styles', passStylesHelp: 'Each active pass can use its own style.',
    pass1: 'Pass 1', pass2: 'Pass 2', pass3: 'Pass 3', style: 'Style', backendDefault: 'Default', inheritPass1: 'Inherit Pass 1',
    standard: 'Standard', natural: 'Natural', cinematic: 'Cinematic', activeLayer: 'Active', inactiveLayer: 'Inactive',
    runtime: 'Neural Runtime', runtimeBody: 'Shared across games. Import nvngx_dlssnr.dll once; managed games receive a local copy during backend installation.', runtimeShared: 'Shared cache', runtimeGameCopy: 'Game copy', installRuntimeTitle: 'Installation & runtime', install: 'Install / update backend', importRuntime: 'Import runtime', openGameFolder: 'Open game folder', restoreTitle: 'Original game files', restoreBody: 'Restore the backup created before installation.', restore: 'Restore original', advanced: 'Advanced details', overlayTuneTitle: 'Tune the image in the in-game panel', overlayTuneBody: 'Image-dependent controls are easier to tune while looking at the actual game. Press Insert in game to open the panel.',
    inGame: 'In game:', keepDlssOn: 'keep the game\'s temporal upscaler enabled. Native DLSS stays native; FSR/XeSS inputs are routed to managed DLSS Super Resolution.',
    gamesBody: 'Compatible games found on this PC.', settingsBody: 'Keep the interface in one language at a time.', language: 'Language', creditsTitle: 'Credits',
    steamGridDbTitle: 'SteamGridDB artwork', steamGridDbBody: 'Used only for non-Steam games. Add your SteamGridDB API key once; covers and hero art download in the background and are cached locally.', steamGridDbKeyPlaceholder: 'SteamGridDB API key', save: 'Save', getApiKey: 'Get API key', steamGridDbConfigured: 'Configured · non-Steam artwork will update in the background.', steamGridDbNotConfigured: 'Not configured · Steam games still use Steam artwork.', steamGridDbSaved: 'SteamGridDB artwork enabled.',
    creditsBody: 'With thanks to the DLSS5-Swapper and OptiScaler projects.',
    supportTitle: 'Support development', supportBody: 'If this tool is useful to you, you can support continued development on Buy Me a Coffee.',
    supportHint: 'Scan the QR code or open the page directly.',
    ready: 'Ready', installed: 'Installed', missing: 'Missing', runtimeReady: 'Ready', preSr: 'Pre-SR enabled', afterSr: 'After-SR placement',
    preSrLine: 'Neural Rendering runs before managed DLSS Super Resolution.', afterSrLine: 'Neural Rendering runs after DLSS Super Resolution.',
    preSrPipeline: 'Render → Neural Rendering → DLSS Super Resolution → Output', afterSrPipeline: 'Render → DLSS Super Resolution → Neural Rendering → Output',
    preSrExplain: "Pre-SR usually lowers GPU cost because Neural Rendering works on the lower internal render resolution. Your in-game DLSS quality setting still controls Super Resolution.",
    afterSrExplain: 'With Pre-SR off, Neural Rendering runs after the game has already upscaled the frame and therefore processes a higher-resolution image.',
    backend: 'Backend', executable: 'Executable', route: 'Pre-SR route', upscalerInputs: 'Detected inputs', nativePreSr: 'Native DLSS Pre-SR', temporalPreSr: 'Temporal → DLSS Pre-SR', probePreSr: 'Experimental temporal probe', noPreSrRoute: 'No Pre-SR route', notDetected: 'Not detected', noGames: 'No games yet.', remove: 'Remove', select: 'Open',
    installComplete: 'Neural Rendering installed successfully.', restoreComplete: 'Original files restored.', settingsSaved: 'Settings saved.', runtimeImported: 'Runtime imported.',
    whereWindsMeet: 'Where Winds Meet', scanFailed: 'Scan failed', working: 'Working…'
  },
  'zh-CN': {
    productSubtitle: '神经渲染管理器', home: '主页', games: '游戏', settings: '设置', standaloneCore: '独立核心',
    homeTitle: '扫描可用的 Pre-SR 路线', homeBody: '扫描已安装游戏中的 DLSS、XeSS、FSR2/FSR3 与 FidelityFX 时域输入，并自动选择 DLSS 5 路线。', scanGames: '扫描游戏',
    compatibleGames: '兼容游戏', installedGames: '已安装神经渲染', openLibrary: '打开游戏库', scanningGames: '正在扫描已安装的游戏库…',
    addFirstGameTitle: '添加你的第一个游戏', addFirstGameBody: '选择游戏主程序，应用会自动检测渲染 API 和可用的时域超分输入。', addGame: '添加游戏',
    gameDetected: '已检测到游戏', neuralRendering: 'DLSS5 神经渲染', nrDescription: '',
    runBeforeSr: 'Pre-SR', runBeforeSrBody: '决定神经渲染在 DLSS 超分之前还是之后运行。', howItWorks: '工作原理',
    passes: '层数', passesLabel: '叠加层数', passesBody: '选择神经渲染使用 1、2 或 3 层。', passStyles: '每层风格', passStylesHelp: '每个启用的层都可以独立选择风格。',
    pass1: '第 1 层', pass2: '第 2 层', pass3: '第 3 层', style: '风格', backendDefault: '默认', inheritPass1: '继承第 1 层',
    standard: '标准', natural: '自然', cinematic: '电影', activeLayer: '已启用', inactiveLayer: '未启用',
    runtime: '神经渲染运行库', runtimeBody: '运行库在游戏间共享。只需导入一次 nvngx_dlssnr.dll；安装后端时会自动复制到对应游戏目录。', runtimeShared: '共享缓存', runtimeGameCopy: '游戏内副本', installRuntimeTitle: '安装与运行库', install: '安装 / 更新后端', importRuntime: '导入运行库', openGameFolder: '打开游戏目录', restoreTitle: '原始游戏文件', restoreBody: '恢复安装前创建的备份。', restore: '恢复原文件', advanced: '高级信息', overlayTuneTitle: '具体画面调节放在游戏内面板', overlayTuneBody: '强度、模型分辨率、局部结构、局部色调、皮肤结构和遮罩等参数需要看着实际画面实时调整。进入游戏后按 Insert 打开。',
    inGame: '游戏内：', keepDlssOn: '保持游戏原有的时域超分开启。原生 DLSS 直接使用；FSR/XeSS 输入会自动改走托管的 DLSS 超分。',
    gamesBody: '本机扫描到的兼容游戏。', settingsBody: '界面在同一时间只显示一种语言。', language: '语言', creditsTitle: '鸣谢',
    steamGridDbTitle: 'SteamGridDB 游戏图片', steamGridDbBody: '仅用于非 Steam 游戏。填入一次 SteamGridDB API Key 后，封面与横幅会在后台下载并缓存到本机。', steamGridDbKeyPlaceholder: 'SteamGridDB API Key', save: '保存', getApiKey: '获取 API Key', steamGridDbConfigured: '已配置 · 非 Steam 游戏图片会在后台自动补齐。', steamGridDbNotConfigured: '未配置 · Steam 游戏仍会正常使用 Steam 官方图片。', steamGridDbSaved: '已启用 SteamGridDB 游戏图片。',
    creditsBody: '感谢 DLSS5-Swapper 与 OptiScaler 项目。',
    supportTitle: '支持开发', supportBody: '如果这个工具对你有帮助，可以通过 Buy Me a Coffee 支持后续开发。',
    supportHint: '扫码或直接打开页面。',
    ready: '就绪', installed: '已安装', missing: '缺失', runtimeReady: '已就绪', preSr: 'Pre-SR 已开启', afterSr: '超分后运行',
    preSrLine: '神经渲染会在托管的 DLSS 超分之前运行。', afterSrLine: '神经渲染会在 DLSS 超分之后运行。',
    preSrPipeline: '渲染 → 神经渲染 → DLSS 超分 → 输出', afterSrPipeline: '渲染 → DLSS 超分 → 神经渲染 → 输出',
    preSrExplain: 'Pre-SR 通常能降低 GPU 开销，因为神经渲染处理的是较低的内部渲染分辨率；游戏内的 DLSS 档位仍然控制超分。',
    afterSrExplain: '关闭 Pre-SR 后，神经渲染会处理已经完成 DLSS 超分的较高分辨率画面。',
    backend: '后端', executable: '主程序', route: 'Pre-SR 路线', upscalerInputs: '检测到的输入', nativePreSr: '原生 DLSS Pre-SR', temporalPreSr: '时域输入 → DLSS Pre-SR', probePreSr: '实验性时域探测', noPreSrRoute: '没有 Pre-SR 路线', notDetected: '未检测到', noGames: '还没有游戏。', remove: '移除', select: '打开',
    installComplete: '神经渲染安装成功。', restoreComplete: '已恢复原文件。', settingsSaved: '设置已保存。', runtimeImported: '运行库已导入。',
    whereWindsMeet: '燕云十六声', scanFailed: '扫描失败', working: '处理中…'
  }
};

let state = { language: 'en', selectedGameId: null, games: [] };
let currentPage = 'home';
let busy = false;
let scanMessage = '';

const $ = id => document.getElementById(id);
const t = key => (I18N[state.language] || I18N.en)[key] || key;

const styledSelects = new Map();
let activeStyledSelect = null;

function closeStyledSelect() {
  if (!activeStyledSelect) return;
  activeStyledSelect.wrapper.classList.remove('open');
  activeStyledSelect.menu.classList.remove('open');
  activeStyledSelect = null;
}

function positionStyledSelect(entry) {
  const rect = entry.trigger.getBoundingClientRect();
  const estimatedHeight = Math.min(entry.select.options.length * 38 + 8, 240);
  const openAbove = rect.bottom + estimatedHeight + 8 > window.innerHeight && rect.top > estimatedHeight + 8;
  entry.menu.style.left = `${Math.round(rect.left)}px`;
  entry.menu.style.width = `${Math.round(rect.width)}px`;
  entry.menu.style.top = openAbove
    ? `${Math.max(8, Math.round(rect.top - estimatedHeight - 4))}px`
    : `${Math.round(rect.bottom + 4)}px`;
}

function syncStyledSelect(select) {
  const entry = styledSelects.get(select.id);
  if (!entry) return;
  const selected = select.options[select.selectedIndex] || select.options[0] || null;
  entry.value.textContent = selected?.textContent || '';
  entry.wrapper.classList.toggle('disabled', Boolean(select.disabled));
  entry.trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
  entry.menu.replaceChildren();
  for (const option of select.options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'app-select-option' + (option.value === select.value ? ' selected' : '');
    item.textContent = option.textContent;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
    item.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (select.disabled) return;
      select.value = option.value;
      closeStyledSelect();
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncStyledSelect(select);
    });
    entry.menu.appendChild(item);
  }
  if (select.disabled && activeStyledSelect === entry) closeStyledSelect();
}

function installStyledSelect(select) {
  if (!select || styledSelects.has(select.id)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'app-select';
  const trigger = document.createElement('div');
  trigger.className = 'app-select-trigger';
  trigger.tabIndex = 0;
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-haspopup', 'listbox');
  const value = document.createElement('span');
  value.className = 'app-select-value';
  const arrow = document.createElement('span');
  arrow.className = 'app-select-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(value, arrow);

  const menu = document.createElement('div');
  menu.className = 'app-select-menu';
  menu.setAttribute('role', 'listbox');
  document.body.appendChild(menu);

  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(trigger, select);
  select.classList.add('app-select-native');

  const entry = { select, wrapper, trigger, value, menu };
  styledSelects.set(select.id, entry);

  const toggle = () => {
    if (select.disabled) return;
    if (activeStyledSelect === entry) {
      closeStyledSelect();
      return;
    }
    closeStyledSelect();
    activeStyledSelect = entry;
    wrapper.classList.add('open');
    menu.classList.add('open');
    syncStyledSelect(select);
    positionStyledSelect(entry);
  };
  trigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  trigger.addEventListener('keydown', event => {
    if (select.disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeStyledSelect();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const options = [...select.options];
      const current = Math.max(0, select.selectedIndex);
      const next = event.key === 'ArrowDown'
        ? Math.min(options.length - 1, current + 1)
        : Math.max(0, current - 1);
      if (next !== current) {
        select.selectedIndex = next;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncStyledSelect(select);
      }
    }
  });
  syncStyledSelect(select);
}

function installStyledSelects() {
  ['passesSelect', 'pass1Style', 'pass2Style', 'pass3Style', 'languageSelect']
    .map($)
    .filter(Boolean)
    .forEach(installStyledSelect);
}

function syncStyledSelects() {
  for (const entry of styledSelects.values()) syncStyledSelect(entry.select);
}

document.addEventListener('click', event => {
  if (!activeStyledSelect) return;
  if (activeStyledSelect.wrapper.contains(event.target) || activeStyledSelect.menu.contains(event.target)) return;
  closeStyledSelect();
});
window.addEventListener('resize', closeStyledSelect);
window.addEventListener('scroll', closeStyledSelect, true);

function gameTitle(game) {
  if (game.profileId === 'where-winds-meet') return t('whereWindsMeet');
  return game.displayName || (game.chosen?.name || 'Game').replace(/\.exe$/i, '');
}

function selectedGame() {
  return state.games.find(game => game.id === state.selectedGameId) || state.games[0] || null;
}

function unwrap(response) {
  if (!response || response.ok !== true) throw new Error(response?.message || response?.code || 'Operation failed');
  return response.value;
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  $('languageSelect').value = state.language;
  const artworkStatus = $('steamGridDbStatus');
  if (artworkStatus) artworkStatus.textContent = state.steamGridDbConfigured ? t('steamGridDbConfigured') : t('steamGridDbNotConfigured');
}

function badge(text, good = false) {
  const node = document.createElement('span');
  node.className = 'badge' + (good ? ' good' : '');
  node.textContent = text;
  return node;
}

function routeLabel(game) {
  const id = game?.route?.id;
  if (id === 'native-presr') return t('nativePreSr');
  if (id === 'temporal-presr') return t('temporalPreSr');
  if (id === 'auto-probe') return t('probePreSr');
  return t('noPreSrRoute');
}

function inputLabel(game) {
  const kinds = (game?.route?.inputs || game?.upscalerInputs?.map(item => item.kind) || []).filter(Boolean);
  return kinds.length ? kinds.map(kind => String(kind).toUpperCase()).join(' · ') : t('notDetected');
}

function techItem(label, value) {
  const node = document.createElement('div');
  node.className = 'tech-item';
  const b = document.createElement('b');
  b.textContent = label;
  const p = document.createElement('p');
  p.textContent = value || '—';
  node.append(b, p);
  return node;
}

function renderPassStyles(game) {
  const passes = Number(game.settings?.passes || 1);
  const fields = [[1, 'pass1Style'], [2, 'pass2Style'], [3, 'pass3Style']];
  for (const [pass, key] of fields) {
    const select = $(key);
    const active = pass <= passes;
    const primaryStyle = String(game.settings?.pass1Style ?? '0');
    const rawStyle = String(game.settings?.[key] ?? primaryStyle);
    select.value = ['0', '1', '2'].includes(rawStyle) ? rawStyle : primaryStyle;
    select.disabled = busy || !active;
    const card = document.querySelector(`[data-pass-card="${pass}"]`);
    card?.classList.toggle('inactive', !active);
    const status = $(`pass${pass}State`);
    if (status) status.textContent = active ? t('activeLayer') : t('inactiveLayer');
  }
}

function renderMode(game) {
  const pre = game.settings?.runBeforeSR !== false;
  $('modeBadge').textContent = pre ? t('preSr') : t('afterSr');
  $('modeText').textContent = pre ? t('preSrLine') : t('afterSrLine');
  $('pipeline').textContent = pre ? t('preSrPipeline') : t('afterSrPipeline');
  $('pipelineExplain').textContent = pre ? t('preSrExplain') : t('afterSrExplain');
  $('presrToggle').checked = pre;
  $('passesSelect').value = String(game.settings?.passes || 1);
  renderPassStyles(game);
}

function renderHome() {
  $('homeGameCount').textContent = String(state.games.length);
  $('homeInstalledCount').textContent = String(state.games.filter(game => game.installed || game.existingSetup).length);
  $('homeScanBtn').disabled = busy;
  $('homeAddBtn').disabled = busy;
  $('homeOpenGamesBtn').disabled = busy || !state.games.length;
  $('homeScanStatus').textContent = busy && currentPage === 'home' ? t('scanningGames') : scanMessage;
}

function renderGame() {
  const game = selectedGame();
  $('gameEmptyState').classList.toggle('hidden', Boolean(game));
  $('gameDetail').classList.toggle('hidden', !game);
  if (!game) return;

  $('gameTitle').textContent = gameTitle(game);
  const badges = $('badges');
  badges.replaceChildren();
  if (game.chosen?.apiLabel) badges.appendChild(badge(game.chosen.apiLabel));
  if (game.chosen?.bitness) badges.appendChild(badge(`${game.chosen.bitness}-bit`));
  if (game.dlss?.version) badges.appendChild(badge(`DLSS ${game.dlss.version}`));
  if (game.route) badges.appendChild(badge(routeLabel(game), Boolean(game.route.ready)));
  badges.appendChild(badge(game.installed ? t('installed') : (game.canInstall ? t('ready') : t('notDetected')), Boolean(game.installed || game.canInstall)));

  $('installState').textContent = game.installed ? t('installed') : t('ready');
  renderMode(game);

  const sharedRuntime = state.runtimeCache || null;
  const gameRuntime = game.runtime || null;
  const visibleRuntime = sharedRuntime || gameRuntime;
  const runtimeSource = sharedRuntime ? t('runtimeShared') : (gameRuntime ? t('runtimeGameCopy') : '');
  $('runtimeStatus').textContent = visibleRuntime
    ? `${t('runtimeReady')} · ${runtimeSource}${visibleRuntime.version ? ` · ${visibleRuntime.version}` : ''}`
    : t('missing');

  $('installBtn').textContent = game.installed ? t('installed') : t('install');
  $('installBtn').disabled = busy || game.installed || !game.canInstall;
  $('restoreBtn').disabled = busy || !game.hasBackup;
  $('runtimeBtn').classList.toggle('hidden', Boolean(sharedRuntime));
  $('runtimeBtn').disabled = busy || Boolean(sharedRuntime);
  $('passesSelect').disabled = busy;
  $('presrToggle').disabled = busy;

  const statusBits = [];
  if (!game.chosen) statusBits.push(t('notDetected'));
  if (game.scanError) statusBits.push(t('scanFailed'));
  $('inlineStatus').textContent = busy ? t('working') : statusBits.join(' · ');

  const tech = $('techGrid');
  tech.replaceChildren(
    techItem(t('route'), routeLabel(game)),
    techItem(t('upscalerInputs'), inputLabel(game)),
    techItem(t('backend'), game.optiscaler?.version || 'OptiScaler NR 0.8.5'),
    techItem(t('runtime'), game.runtime?.path || t('missing')),
    techItem(t('executable'), game.exePath)
  );
}

function renderGames() {
  const list = $('gameList');
  list.replaceChildren();
  if (!state.games.length) {
    const empty = document.createElement('div');
    empty.className = 'game-row';
    empty.textContent = t('noGames');
    list.appendChild(empty);
    return;
  }

  for (const game of state.games) {
    const row = document.createElement('div');
    row.className = 'game-row' + (game.id === state.selectedGameId ? ' active' : '');
    const avatar = document.createElement('div');
    avatar.className = 'game-avatar';
    avatar.textContent = gameTitle(game).slice(0, 1).toUpperCase();
    const meta = document.createElement('div');
    meta.className = 'game-meta';
    const name = document.createElement('b');
    name.textContent = gameTitle(game);
    const details = document.createElement('p');
    const bits = [game.chosen?.apiLabel, game.chosen?.bitness ? `${game.chosen.bitness}-bit` : null, game.dlss?.version ? `DLSS ${game.dlss.version}` : null].filter(Boolean);
    details.textContent = bits.join(' · ') || t('notDetected');
    meta.append(name, details);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const remove = document.createElement('button');
    remove.textContent = t('remove');
    remove.addEventListener('click', async event => {
      event.stopPropagation();
      await act(async () => { state = unwrap(await window.nrApp.removeGame(game.id)); });
    });
    actions.appendChild(remove);
    row.append(avatar, meta, actions);
    row.addEventListener('click', async () => {
      await act(async () => {
        state = unwrap(await window.nrApp.selectGame(game.id));
        showPage('game');
      }, false);
    });
    list.appendChild(row);
  }
}

function render() {
  applyLanguage();
  renderHome();
  renderGame();
  renderGames();
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${currentPage}`));
  const navPage = currentPage === 'game' ? 'games' : currentPage;
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === navPage));
  const game = selectedGame();
  $('crumb').textContent = currentPage === 'game' && game ? gameTitle(game) : t(currentPage === 'game' ? 'games' : currentPage);
  syncStyledSelects();
}

function showPage(page) {
  currentPage = page;
  render();
}

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

async function act(work, lock = true) {
  if (lock && busy) return;
  if (lock) busy = true;
  render();
  try { await work(); }
  catch (error) { toast(error.message || String(error)); }
  finally {
    if (lock) busy = false;
    render();
  }
}

async function scanGames() {
  await act(async () => {
    const result = unwrap(await window.nrApp.rescanGames());
    state = result.state;
    const count = Number(result.added || 0);
    scanMessage = state.language === 'zh-CN'
      ? (count ? `扫描完成，新增 ${count} 个兼容游戏。` : '扫描完成，没有发现新的兼容游戏。')
      : (count ? `Scan complete. Added ${count} compatible game${count === 1 ? '' : 's'}.` : 'Scan complete. No new compatible games found.');
    toast(scanMessage);
  });
}

async function refresh() {
  if (window.nrApp.getCachedState) {
    try {
      const cached = unwrap(await window.nrApp.getCachedState());
      if (cached?.games?.length) {
        state = cached;
        render();
      }
    } catch {}
  }
  state = unwrap(await window.nrApp.getState());
  render();
}

installStyledSelects();

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
$('minBtn').addEventListener('click', () => window.nrApp.minimize());
$('maxBtn').addEventListener('click', () => window.nrApp.maximize());
$('closeBtn').addEventListener('click', () => window.nrApp.close());
$('homeScanBtn').addEventListener('click', scanGames);
$('homeOpenGamesBtn').addEventListener('click', () => showPage('games'));
$('gameBackBtn').addEventListener('click', () => showPage('games'));

async function addGame() {
  if (window.showAddGameDialog) return window.showAddGameDialog();
  const beforeId = state.selectedGameId;
  const beforeCount = state.games.length;
  await act(async () => {
    const next = unwrap(await window.nrApp.addGame());
    if (next.cancelled) return;
    const changed = next.games.length !== beforeCount || next.selectedGameId !== beforeId;
    state = next;
    if (changed) showPage('game');
  });
}
$('homeAddBtn').addEventListener('click', addGame);
$('addGameBtn').addEventListener('click', addGame);

async function openSupport() {
  try { unwrap(await window.nrApp.openSupport()); }
  catch (error) { toast(error.message || String(error)); }
}
$('supportOpenBtn').addEventListener('click', openSupport);
$('supportQrBtn').addEventListener('click', openSupport);

$('languageSelect').addEventListener('change', async event => {
  const language = event.target.value;
  await act(async () => {
    state = unwrap(await window.nrApp.setLanguage(language));
    scanMessage = '';
    try { await window.nrApp.setOverlayLanguage(language); } catch {}
  }, false);
});

$('steamGridDbSaveBtn')?.addEventListener('click', async () => {
  const input = $('steamGridDbKey');
  await act(async () => {
    const result = unwrap(await window.nrApp.setSteamGridDbKey(input?.value || ''));
    state.steamGridDbConfigured = Boolean(result.configured);
    if (input) input.value = '';
    toast(result.configured ? t('steamGridDbSaved') : t('steamGridDbNotConfigured'));
  }, false);
});

$('steamGridDbGetKeyBtn')?.addEventListener('click', async () => {
  try { unwrap(await window.nrApp.openSteamGridDbKey()); }
  catch (error) { toast(error.message || String(error)); }
});

window.nrApp.onArtworkUpdated?.(payload => {
  const game = state.games.find(item => item.id === payload?.id);
  if (!game) return;
  if (payload.bannerDataUrl) game.bannerDataUrl = payload.bannerDataUrl;
  if (payload.tileDataUrl) game.tileDataUrl = payload.tileDataUrl;
  if (payload.coverDataUrl) game.coverDataUrl = payload.coverDataUrl;
  render();
});

$('presrToggle').addEventListener('change', async event => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.setGameSettings(game.id, { runBeforeSR: event.target.checked }));
    toast(t('settingsSaved'));
  }, false);
});

$('passesSelect').addEventListener('change', async event => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.setGameSettings(game.id, { passes: Number(event.target.value) }));
    toast(t('settingsSaved'));
  }, false);
});

for (const [id, key] of [['pass1Style', 'pass1Style'], ['pass2Style', 'pass2Style'], ['pass3Style', 'pass3Style']]) {
  $(id).addEventListener('change', async event => {
    const game = selectedGame();
    if (!game) return;
    await act(async () => {
      state = unwrap(await window.nrApp.setGameSettings(game.id, { [key]: event.target.value }));
      toast(t('settingsSaved'));
    }, false);
  });
}

$('runtimeBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.importRuntime(game.id));
    toast(t('runtimeImported'));
  });
});

$('folderBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (game) await window.nrApp.openGameFolder(game.id);
});

$('installBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    const result = unwrap(await window.nrApp.install(game.id));
    if (result.cancelled) return;
    state = result.state;
    toast(t('installComplete'));
  });
});

$('restoreBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    const result = unwrap(await window.nrApp.restore(game.id));
    state = result.state;
    toast(t('restoreComplete'));
  });
});

refresh().catch(error => toast(error.message || String(error)));
