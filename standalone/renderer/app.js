'use strict';

const I18N = {
  en: {
    productSubtitle: 'Neural Rendering Manager', home: 'Home', games: 'Games', settings: 'Settings', standaloneCore: 'Standalone core',
    homeTitle: 'Find compatible games', homeBody: 'Scan your installed game libraries for native DLSS titles that can use Neural Rendering.', scanGames: 'Scan games',
    compatibleGames: 'Compatible games', installedGames: 'Neural Rendering installed', openLibrary: 'Open game library', scanningGames: 'Scanning installed game libraries…',
    addFirstGameTitle: 'Add your first game', addFirstGameBody: "Choose the game's main executable. The app will detect DLSS and the rendering API.", addGame: 'Add game',
    gameDetected: 'Game detected', neuralRendering: 'DLSS5 Neural Rendering', nrDescription: '',
    runBeforeSr: 'Pre-SR', runBeforeSrBody: 'Choose whether Neural Rendering runs before or after DLSS Super Resolution.', howItWorks: 'How it works',
    passes: 'Passes', passesLabel: 'Pass count', passesBody: 'Choose how many Neural Rendering passes are used.', passStyles: 'Per-pass styles', passStylesHelp: 'Later passes can use their own style. Inherit keeps them linked to Pass 1.',
    pass1: 'Pass 1', pass2: 'Pass 2', pass3: 'Pass 3', style: 'Style', backendDefault: 'Default', inheritPass1: 'Inherit Pass 1',
    standard: 'Standard', natural: 'Natural', cinematic: 'Cinematic', activeLayer: 'Active', inactiveLayer: 'Inactive',
    runtime: 'Neural Runtime', runtimeBody: 'Choose or import the Neural Rendering runtime used by this game.', installRuntimeTitle: 'Installation & runtime', install: 'Install / update backend', importRuntime: 'Import runtime', openGameFolder: 'Open game folder', restoreTitle: 'Original game files', restoreBody: 'Restore the backup created before installation.', restore: 'Restore original', advanced: 'Advanced details', overlayTuneTitle: 'Tune the image in the in-game panel', overlayTuneBody: 'Image-dependent controls are easier to tune while looking at the actual game. Press Insert in game to open the panel.',
    inGame: 'In game:', keepDlssOn: 'keep DLSS Super Resolution enabled. Quality / Balanced / Performance remains a game setting.',
    gamesBody: 'Compatible games found on this PC.', settingsBody: 'Keep the interface in one language at a time.', language: 'Language', creditsTitle: 'Credits',
    creditsBody: 'With thanks to the DLSS5-Swapper and OptiScaler projects.',
    supportTitle: 'Support development', supportBody: 'If this tool is useful to you, you can support continued development on Buy Me a Coffee.',
    supportHint: 'Scan the QR code or open the page directly.',
    ready: 'Ready', installed: 'Installed', missing: 'Missing', runtimeReady: 'Ready', preSr: 'Pre-SR enabled', afterSr: 'After-SR placement',
    preSrLine: "Neural Rendering runs before the game's DLSS upscaling.", afterSrLine: 'Neural Rendering runs after DLSS Super Resolution.',
    preSrPipeline: 'Render → Neural Rendering → DLSS Super Resolution → Output', afterSrPipeline: 'Render → DLSS Super Resolution → Neural Rendering → Output',
    preSrExplain: "Pre-SR usually lowers GPU cost because Neural Rendering works on the lower internal render resolution. Your in-game DLSS quality setting still controls Super Resolution.",
    afterSrExplain: 'With Pre-SR off, Neural Rendering runs after the game has already upscaled the frame and therefore processes a higher-resolution image.',
    backend: 'Backend', executable: 'Executable', notDetected: 'Not detected', noGames: 'No games yet.', remove: 'Remove', select: 'Open',
    installComplete: 'Neural Rendering installed successfully.', restoreComplete: 'Original files restored.', settingsSaved: 'Settings saved.', runtimeImported: 'Runtime imported.',
    whereWindsMeet: 'Where Winds Meet', scanFailed: 'Scan failed', working: 'Working…'
  },
  'zh-CN': {
    productSubtitle: '神经渲染管理器', home: '主页', games: '游戏', settings: '设置', standaloneCore: '独立核心',
    homeTitle: '扫描支持神经渲染的游戏', homeBody: '扫描已安装的游戏库，查找带原生 DLSS、可使用神经渲染的游戏。', scanGames: '扫描游戏',
    compatibleGames: '兼容游戏', installedGames: '已安装神经渲染', openLibrary: '打开游戏库', scanningGames: '正在扫描已安装的游戏库…',
    addFirstGameTitle: '添加你的第一个游戏', addFirstGameBody: '选择游戏主程序，应用会自动检测 DLSS 和渲染 API。', addGame: '添加游戏',
    gameDetected: '已检测到游戏', neuralRendering: 'DLSS5 神经渲染', nrDescription: '',
    runBeforeSr: 'Pre-SR', runBeforeSrBody: '决定神经渲染在 DLSS 超分之前还是之后运行。', howItWorks: '工作原理',
    passes: '层数', passesLabel: '叠加层数', passesBody: '选择神经渲染使用 1、2 或 3 层。', passStyles: '每层风格', passStylesHelp: '后续层可以使用不同风格；选择继承时会跟随第 1 层。',
    pass1: '第 1 层', pass2: '第 2 层', pass3: '第 3 层', style: '风格', backendDefault: '默认', inheritPass1: '继承第 1 层',
    standard: '标准', natural: '自然', cinematic: '电影', activeLayer: '已启用', inactiveLayer: '未启用',
    runtime: '神经渲染运行库', runtimeBody: '选择或导入这个游戏使用的神经渲染运行库。', installRuntimeTitle: '安装与运行库', install: '安装 / 更新后端', importRuntime: '导入运行库', openGameFolder: '打开游戏目录', restoreTitle: '原始游戏文件', restoreBody: '恢复安装前创建的备份。', restore: '恢复原文件', advanced: '高级信息', overlayTuneTitle: '具体画面调节放在游戏内面板', overlayTuneBody: '强度、模型分辨率、局部结构、局部色调、皮肤结构和遮罩等参数需要看着实际画面实时调整。进入游戏后按 Insert 打开。',
    inGame: '游戏内：', keepDlssOn: '保持 DLSS 超分开启；质量、平衡、性能等档位仍由游戏设置决定。',
    gamesBody: '本机扫描到的兼容游戏。', settingsBody: '界面在同一时间只显示一种语言。', language: '语言', creditsTitle: '鸣谢',
    creditsBody: '感谢 DLSS5-Swapper 与 OptiScaler 项目。',
    supportTitle: '支持开发', supportBody: '如果这个工具对你有帮助，可以通过 Buy Me a Coffee 支持后续开发。',
    supportHint: '扫码或直接打开页面。',
    ready: '就绪', installed: '已安装', missing: '缺失', runtimeReady: '已就绪', preSr: 'Pre-SR 已开启', afterSr: '超分后运行',
    preSrLine: '神经渲染会在游戏的 DLSS 超分之前运行。', afterSrLine: '神经渲染会在 DLSS 超分之后运行。',
    preSrPipeline: '渲染 → 神经渲染 → DLSS 超分 → 输出', afterSrPipeline: '渲染 → DLSS 超分 → 神经渲染 → 输出',
    preSrExplain: 'Pre-SR 通常能降低 GPU 开销，因为神经渲染处理的是较低的内部渲染分辨率；游戏内的 DLSS 档位仍然控制超分。',
    afterSrExplain: '关闭 Pre-SR 后，神经渲染会处理已经完成 DLSS 超分的较高分辨率画面。',
    backend: '后端', executable: '主程序', notDetected: '未检测到', noGames: '还没有游戏。', remove: '移除', select: '打开',
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
  $('languageSelect').value = state.language;
}

function badge(text, good = false) {
  const node = document.createElement('span');
  node.className = 'badge' + (good ? ' good' : '');
  node.textContent = text;
  return node;
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
    select.value = String(game.settings?.[key] ?? 'auto');
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
  badges.appendChild(badge(game.installed ? t('installed') : t('ready'), true));

  $('installState').textContent = game.installed ? t('installed') : t('ready');
  renderMode(game);

  $('runtimeStatus').textContent = game.runtime
    ? `${t('runtimeReady')}${game.runtime.version ? ` · ${game.runtime.version}` : ''}`
    : t('missing');

  $('installBtn').textContent = game.installed ? t('installed') : t('install');
  $('installBtn').disabled = busy || game.installed || !game.chosen || !game.dlss;
  $('restoreBtn').disabled = busy || !game.hasBackup;
  $('runtimeBtn').disabled = busy;
  $('passesSelect').disabled = busy;
  $('presrToggle').disabled = busy;

  const statusBits = [];
  if (!game.chosen) statusBits.push(t('notDetected'));
  if (game.scanError) statusBits.push(t('scanFailed'));
  $('inlineStatus').textContent = busy ? t('working') : statusBits.join(' · ');

  const tech = $('techGrid');
  tech.replaceChildren(
    techItem(t('backend'), game.optiscaler?.version || 'OptiScaler DLSS-NR 0.7.7-preSR'),
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
  state = unwrap(await window.nrApp.getState());
  render();
}

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
