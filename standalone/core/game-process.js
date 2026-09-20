'use strict';

const path = require('path');
const { execFile } = require('child_process');

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function tasklist(args) {
  return new Promise((resolve, reject) => {
    execFile('tasklist.exe', args, { windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(fail('processCheckFailed', stderr?.trim() || error.message || 'Unable to check whether the game is running.'));
        return;
      }
      resolve(String(stdout || ''));
    });
  });
}

async function isRunning(exePath, runTasklist = tasklist) {
  if (process.platform !== 'win32') return false;
  const image = path.basename(String(exePath || '')).trim();
  if (!image || !image.toLowerCase().endsWith('.exe')) return false;
  const output = await runTasklist(['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH']);
  const expected = `"${image.toLowerCase()}"`;
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase())
    .some(line => line.startsWith(expected));
}

async function assertNotRunning(exePath, language = 'en', runTasklist = tasklist) {
  if (!(await isRunning(exePath, runTasklist))) return true;
  const zh = language === 'zh-CN';
  throw fail(
    'gameRunning',
    zh
      ? '游戏仍在运行。请完全退出游戏后再安装或更新游戏内后端。'
      : 'The game is still running. Close it completely before installing or updating the in-game backend.'
  );
}

module.exports = { isRunning, assertNotRunning };
