'use strict';

function splitLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function get(text, section, key) {
  const lines = splitLines(text);
  let current = '';
  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      continue;
    }
    if (current.toLowerCase() !== String(section).toLowerCase()) continue;
    const match = line.match(/^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/);
    if (match && match[1].trim().toLowerCase() === String(key).toLowerCase()) return match[2];
  }
  return null;
}

function set(text, section, key, value) {
  const lines = splitLines(text);
  const sectionName = String(section);
  const keyName = String(key);
  const sectionLower = sectionName.toLowerCase();
  const keyLower = keyName.toLowerCase();
  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (!match) continue;
    if (sectionStart >= 0) {
      sectionEnd = i;
      break;
    }
    if (match[1].trim().toLowerCase() === sectionLower) sectionStart = i;
  }

  if (sectionStart < 0) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`[${sectionName}]`, `${keyName}=${value}`);
    return lines.join('\r\n');
  }

  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const match = lines[i].match(/^\s*([^=;#]+?)\s*=.*$/);
    if (match && match[1].trim().toLowerCase() === keyLower) {
      lines[i] = `${keyName}=${value}`;
      return lines.join('\r\n');
    }
  }

  lines.splice(sectionEnd, 0, `${keyName}=${value}`);
  return lines.join('\r\n');
}

function read(file, fsImpl = require('fs')) {
  try { return fsImpl.readFileSync(file, 'utf8'); } catch { return ''; }
}

module.exports = { get, set, read };