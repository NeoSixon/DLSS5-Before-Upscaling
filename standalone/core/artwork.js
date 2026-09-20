'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const API_BASE = 'https://www.steamgriddb.com/api/v2';
const KEY_FILE = 'steamgriddb-key.bin';
const ARTWORK_VERSION = 1;

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function isNonSteam(record) {
  return String(record?.launcher || '').toLowerCase() !== 'steam';
}

function keyPath(app) {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function readApiKey(app, safeStorage) {
  if (process.env.STEAMGRIDDB_API_KEY) return String(process.env.STEAMGRIDDB_API_KEY).trim();
  const file = keyPath(app);
  try {
    const payload = fs.readFileSync(file);
    if (!payload.length) return null;
    const marker = payload.subarray(0, 6).toString('utf8');
    if (marker === 'plain:') return payload.subarray(6).toString('utf8').trim() || null;
    if (safeStorage?.isEncryptionAvailable?.()) return safeStorage.decryptString(payload).trim() || null;
  } catch {}
  return null;
}

function saveApiKey(app, safeStorage, value) {
  const file = keyPath(app);
  const key = String(value || '').trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!key) {
    fs.rmSync(file, { force: true });
    return { configured: false, protected: false };
  }

  if (safeStorage?.isEncryptionAvailable?.()) {
    fs.writeFileSync(file, safeStorage.encryptString(key));
    return { configured: true, protected: true };
  }

  // Useful for development environments where Electron cannot expose an OS
  // credential store. Production Windows builds normally use safeStorage/DPAPI.
  fs.writeFileSync(file, Buffer.concat([Buffer.from('plain:'), Buffer.from(key, 'utf8')]));
  return { configured: true, protected: false };
}

function hasApiKey(app, safeStorage) {
  return Boolean(readApiKey(app, safeStorage));
}

function requestJson(url, key, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'User-Agent': 'DLSS5-Before-Upscaling/0.1'
      },
      timeout: 12000
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        return resolve(requestJson(new URL(res.headers.location, url).toString(), key, redirects + 1));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(Object.assign(new Error('SteamGridDB API key was rejected.'), { code: 'steamGridDbUnauthorized' }));
        }
        if ((res.statusCode || 500) >= 400) {
          return reject(Object.assign(new Error(`SteamGridDB request failed (${res.statusCode}).`), { code: 'steamGridDbHttp' }));
        }
        try {
          const parsed = JSON.parse(body);
          if (!parsed?.success) {
            const message = Array.isArray(parsed?.errors) ? parsed.errors.join(', ') : 'SteamGridDB request failed.';
            return reject(Object.assign(new Error(message), { code: 'steamGridDbApi' }));
          }
          resolve(parsed.data ?? null);
        } catch (error) {
          reject(Object.assign(new Error('SteamGridDB returned invalid JSON.'), { code: 'steamGridDbJson', cause: error }));
        }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('SteamGridDB request timed out.'), { code: 'steamGridDbTimeout' })));
    req.on('error', reject);
  });
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'DLSS5-Before-Upscaling/0.1' },
      timeout: 15000
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(requestBuffer(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if ((res.statusCode || 500) >= 400) {
        res.resume();
        return reject(Object.assign(new Error(`Artwork download failed (${res.statusCode}).`), { code: 'artworkHttp' }));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: String(res.headers['content-type'] || '').toLowerCase()
      }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Artwork download timed out.'), { code: 'artworkTimeout' })));
    req.on('error', reject);
  });
}

function chooseGame(games, title) {
  if (!Array.isArray(games) || !games.length) return null;
  const wanted = normalizeTitle(title);
  const ranked = games.map((game, index) => {
    const candidate = normalizeTitle(game?.name);
    let score = 0;
    if (candidate === wanted) score += 1000;
    else if (candidate.startsWith(wanted) || wanted.startsWith(candidate)) score += 350;
    else {
      const wantedWords = new Set(wanted.split(' ').filter(Boolean));
      const words = candidate.split(' ').filter(Boolean);
      score += words.filter(word => wantedWords.has(word)).length * 20;
    }
    if (game?.verified) score += 120;
    score -= index;
    return { game, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.game || null;
}

function tagText(image) {
  return (Array.isArray(image?.tags) ? image.tags : [])
    .map(tag => typeof tag === 'string' ? tag : (tag?.name || tag?.slug || ''))
    .join(' ')
    .toLowerCase();
}

function acceptableImage(image) {
  const tags = tagText(image);
  if (/adult|nsfw|humou?r|epilep/.test(tags)) return false;
  if (image?.nsfw === true || image?.humor === true) return false;
  return Boolean(image?.url || image?.thumb);
}

function imageScore(image, kind) {
  if (!acceptableImage(image)) return -Infinity;
  // Community score is useful, but style is more important here: a highly
  // upvoted blurred/material redesign should not outrank a normal cover-like
  // image when the goal is to stay close to official storefront artwork.
  let score = Math.min(100, Math.max(-20, Number(image?.score || 0))) * 1.2;
  const style = String(image?.style || '').toLowerCase();
  if (style === 'alternate') score += 80;
  if (style === 'no_logo') score += kind === 'hero' ? 22 : -6;
  if (style === 'white_logo') score -= 12;
  if (style === 'material') score -= 30;
  if (style === 'blurred') score -= 42;
  if (image?.mime === 'image/jpeg' || image?.mime === 'image/png' || image?.mime === 'image/webp') score += 5;
  if (image?.width && image?.height) {
    const ratio = Number(image.width) / Math.max(1, Number(image.height));
    if (kind === 'cover') score += Math.max(0, 24 - Math.abs(ratio - (2 / 3)) * 50);
    if (kind === 'hero') score += Math.max(0, 24 - Math.abs(ratio - 3.0) * 10);
  }
  return score;
}

function chooseImage(images, kind) {
  if (!Array.isArray(images) || !images.length) return null;
  return images
    .map((image, index) => ({ image, score: imageScore(image, kind) - index * 0.01 }))
    .filter(row => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score)[0]?.image || null;
}

function cacheBase(app, record, gameId) {
  const seed = [record?.launcher, record?.storeId, record?.displayName, gameId].join('|');
  const id = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
  return path.join(app.getPath('userData'), 'artwork-cache', 'steamgriddb', id);
}

function extensionFor(url, contentType) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  return '.jpg';
}

async function saveImage(url, base, stem) {
  if (!url) return null;
  const result = await requestBuffer(url);
  if (!result.buffer || result.buffer.length < 4096) throw Object.assign(new Error('SteamGridDB artwork was unexpectedly small.'), { code: 'artworkInvalid' });
  fs.mkdirSync(base, { recursive: true });
  const ext = extensionFor(url, result.contentType);
  const file = path.join(base, `${stem}${ext}`);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, result.buffer);
  fs.renameSync(temp, file);
  return file;
}

async function fetchForRecord(app, safeStorage, record, options = {}) {
  if (!isNonSteam(record) && !options.allowSteamFallback) return null;
  const key = readApiKey(app, safeStorage);
  if (!key) return null;

  const query = encodeURIComponent(String(record.displayName || path.basename(record.exePath || '', path.extname(record.exePath || ''))));
  const games = await requestJson(`${API_BASE}/search/autocomplete/${query}`, key);
  const game = chooseGame(games, record.displayName);
  if (!game?.id) return null;

  const base = cacheBase(app, record, game.id);
  const metadataFile = path.join(base, 'metadata.json');
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    const cover = metadata.coverPath && fs.existsSync(metadata.coverPath) ? metadata.coverPath : null;
    const banner = metadata.bannerPath && fs.existsSync(metadata.bannerPath) ? metadata.bannerPath : null;
    if (metadata.version === ARTWORK_VERSION && (cover || banner)) {
      return { coverPath: cover, bannerPath: banner, steamGridDbGameId: game.id, cached: true };
    }
  } catch {}

  const [grids, heroes] = await Promise.all([
    requestJson(`${API_BASE}/grids/game/${game.id}?dimensions=600x900&types=static`, key).catch(() => []),
    requestJson(`${API_BASE}/heroes/game/${game.id}?types=static`, key).catch(() => [])
  ]);
  const coverCandidate = chooseImage(grids, 'cover');
  const heroCandidate = chooseImage(heroes, 'hero');

  const [coverPath, bannerPath] = await Promise.all([
    coverCandidate ? saveImage(coverCandidate.url || coverCandidate.thumb, base, 'cover').catch(() => null) : Promise.resolve(null),
    heroCandidate ? saveImage(heroCandidate.url || heroCandidate.thumb, base, 'hero').catch(() => null) : Promise.resolve(null)
  ]);

  if (!coverPath && !bannerPath) return null;
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(metadataFile, JSON.stringify({
    version: ARTWORK_VERSION,
    gameId: game.id,
    gameName: game.name,
    coverPath,
    bannerPath,
    fetchedAt: new Date().toISOString()
  }, null, 2), 'utf8');

  return { coverPath, bannerPath, steamGridDbGameId: game.id, cached: false };
}

module.exports = {
  API_BASE,
  normalizeTitle,
  isNonSteam,
  keyPath,
  readApiKey,
  saveApiKey,
  hasApiKey,
  chooseGame,
  acceptableImage,
  imageScore,
  chooseImage,
  fetchForRecord
};
