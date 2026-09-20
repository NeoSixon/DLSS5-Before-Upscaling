'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256Bytes(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function cached(file, expected) {
  try { return sha256File(file) === expected; } catch { return false; }
}

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

async function fetchBytes(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'DLSS-Neural-Rendering-Manager/0.1' },
      signal: AbortSignal.timeout(120000)
    });
  } catch (cause) {
    throw fail('downloadNetwork', cause.message || 'Download failed');
  }
  if (!response.ok) throw fail('downloadNetwork', `Download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchVerified(url, expectedSha256, file) {
  const data = await fetchBytes(url);
  const received = sha256Bytes(data);
  if (received !== expectedSha256) {
    throw fail('downloadChecksum', `Checksum mismatch: expected ${expectedSha256}, received ${received}`);
  }
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.part';
  await fs.promises.writeFile(temp, data);
  await fs.promises.rename(temp, file);
  if (!cached(file, expectedSha256)) throw fail('downloadWrite', 'Downloaded file could not be verified after writing.');
  return file;
}

module.exports = { sha256Bytes, sha256File, cached, fetchBytes, fetchVerified };