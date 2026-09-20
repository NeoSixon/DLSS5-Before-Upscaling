'use strict';

(() => {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = 'library-actions.css';
  document.head.appendChild(sheet);
  let activeDialog = null;

  const copy = () => state.language === 'zh-CN' ? {
    title: '添加游戏',
    help: '选择游戏安装文件夹，自动查找多层目录里的主程序。也可以直接选择 EXE。',
    folder: '选择游戏文件夹', file: '手动选择 EXE', cancel: '取消', add: '添加选中的程序',
    scanning: '正在查找游戏主程序…', adding: '正在读取游戏信息…',
    review: '请选择实际运行游戏的主程序。添加后会继续检查兼容性。',
    recommended: '推荐候选', unknown: '程序信息未识别',
    empty: '未找到候选主程序（最多扫描 8 层，跳过安装器、启动器和反作弊工具）。请换一个文件夹或手动选择 EXE。',
    limited: '此文件夹包含大量 EXE，只分析了前 180 个候选。请缩小到单个游戏文件夹或手动选择 EXE。',
    reasons: { x64: '64 位', graphicsApi: '检测到图形 API', knownGame: '已知游戏名称', shipping: '游戏发行版程序', nameMatch: '名称与文件夹匹配', nearDlss: '靠近 DLSS 文件' }
  } : {
    title: 'Add game',
    help: 'Choose the installation folder to find the main game executable in nested folders, or select an EXE yourself.',
    folder: 'Choose game folder', file: 'Choose EXE manually', cancel: 'Cancel', add: 'Add selected executable',
    scanning: 'Looking for game executables…', adding: 'Reading game information…',
    review: 'Choose the program that runs the game. Compatibility is checked after adding it.',
    recommended: 'Recommended candidate', unknown: 'Executable information not detected',
    empty: 'No candidate found (up to 8 levels; installers, launchers and anti-cheat tools are skipped). Choose another folder or select an EXE manually.',
    limited: 'This folder has many EXEs. Only the first 180 candidates were inspected. Choose a single game folder or select an EXE manually.',
    reasons: { x64: '64-bit', graphicsApi: 'Graphics API detected', knownGame: 'Known game name', shipping: 'Shipping game binary', nameMatch: 'Name matches folder', nearDlss: 'Near DLSS files' }
  };

  window.showAddGameDialog = function() {
    if (busy) return;
    if (activeDialog) { activeDialog.focus(); return; }
    const c = copy();
    const dialog = document.createElement('dialog');
    dialog.className = 'add-game-dialog';
    dialog.setAttribute('tabindex', '-1');
    dialog.setAttribute('aria-labelledby', 'addGameTitle');
    dialog.setAttribute('aria-describedby', 'addGameHelp');
    // Static markup only. All paths and executable names are inserted as text.
    dialog.innerHTML = `<h2 id="addGameTitle"></h2><p id="addGameHelp"></p>
      <div class="add-game-sources"><button id="chooseGameFolderBtn" class="ghost add-game-source" type="button"></button><button id="chooseGameExeBtn" class="ghost add-game-source" type="button"></button></div>
      <p class="add-game-root"></p><p class="add-game-status" role="status" aria-live="polite"></p>
      <div class="exe-candidates" role="radiogroup"></div>
      <div class="add-game-footer"><button id="cancelAddGameBtn" class="ghost" type="button"></button><button id="confirmAddGameBtn" class="primary" type="button" hidden></button></div>`;
    const find = selector => dialog.querySelector(selector);
    find('#addGameTitle').textContent = c.title;
    find('#addGameHelp').textContent = c.help;
    const folder = find('#chooseGameFolderBtn');
    const file = find('#chooseGameExeBtn');
    const cancel = find('#cancelAddGameBtn');
    const confirm = find('#confirmAddGameBtn');
    const status = find('.add-game-status');
    const list = find('.exe-candidates');
    folder.textContent = c.folder;
    file.textContent = c.file;
    cancel.textContent = c.cancel;
    confirm.textContent = c.add;
    list.setAttribute('aria-label', c.review);
    let selection = null;
    let pending = false;
    let committing = false;
    let generation = 0;

    function setPending(value, commit = false) {
      pending = value;
      committing = value && commit;
      folder.disabled = file.disabled = confirm.disabled = value;
      cancel.disabled = committing;
      list.inert = value;
      dialog.setAttribute('aria-busy', String(value));
    }
    function finish(next) {
      if (next.cancelled) return;
      state = next;
      dismiss();
      showPage('game');
    }
    function cleanup() {
      if (!dialog.isConnected) return;
      generation += 1;
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
      document.getElementById('addGameBtn')?.focus();
    }
    function dismiss() { dialog.close(); cleanup(); }
    async function run(work, commit = false) {
      if (pending) return;
      const ticket = generation;
      setPending(true, commit);
      status.textContent = commit ? c.adding : c.scanning;
      try { await work(() => dialog.open && ticket === generation); }
      catch (error) { if (dialog.open && ticket === generation) status.textContent = error.message || String(error); }
      finally { if (dialog.open && ticket === generation) setPending(false); }
    }
    function paintCandidates(result) {
      selection = result;
      list.replaceChildren();
      find('.add-game-root').textContent = result.root;
      status.textContent = !result.candidates.length ? c.empty : result.truncated ? `${c.review} ${c.limited}` : c.review;
      confirm.hidden = !result.candidates.length;
      for (const candidate of result.candidates) {
        const label = document.createElement('label');
        label.className = 'exe-candidate';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'gameExecutable'; radio.value = String(candidate.index);
        radio.checked = candidate.index === 0;
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = candidate.name;
        if (candidate.index === 0 && candidate.supported) {
          const recommended = document.createElement('small');
          recommended.className = 'exe-recommended'; recommended.textContent = c.recommended;
          title.append(' · ', recommended);
        }
        const path = document.createElement('code');
        path.textContent = candidate.relativePath;
        const reasons = document.createElement('small');
        reasons.textContent = [candidate.apiLabel, ...candidate.reasons.filter(key => key !== 'graphicsApi').map(key => c.reasons[key])].filter(Boolean).join(' · ') || c.unknown;
        text.append(title, path, reasons);
        label.append(radio, text);
        list.appendChild(label);
      }
    }
    folder.addEventListener('click', () => run(async alive => {
      selection = null;
      confirm.hidden = true;
      list.replaceChildren();
      find('.add-game-root').textContent = '';
      const result = unwrap(await window.nrApp.chooseGameFolder());
      if (!alive()) return;
      if (result.cancelled) { status.textContent = ''; return; }
      paintCandidates(result);
    }));
    file.addEventListener('click', () => run(async alive => {
      selection = null;
      confirm.hidden = true;
      list.replaceChildren();
      find('.add-game-root').textContent = '';
      const next = unwrap(await window.nrApp.addGame());
      if (alive()) {
        if (next.cancelled) status.textContent = selection ? c.review : '';
        else finish(next);
      }
    }, true));
    confirm.addEventListener('click', () => run(async alive => {
      const radio = list.querySelector('input:checked');
      if (!selection || !radio) return;
      const next = unwrap(await window.nrApp.addGameCandidate(selection.token, Number(radio.value)));
      if (alive()) finish(next);
    }, true));
    cancel.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!committing) dismiss();
    });
    dialog.addEventListener('close', cleanup);
    document.body.appendChild(dialog);
    activeDialog = dialog;
    dialog.showModal();
    // Keep either source neutral until the pointer or keyboard explicitly
    // chooses it; the first action should not look preselected.
    dialog.focus({ preventScroll: true });
  };
})();
