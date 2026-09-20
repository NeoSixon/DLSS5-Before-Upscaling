'use strict';

// Derived from the minimal PE reader in DLSS5-Swapper by Rakan Alkhaldi.
// Used under the MIT License. Kept behind this boundary so the retained
// upstream-derived code is explicit and auditable.
const fs = require('fs');

function readAt(fd, size, pos) {
  const buf = Buffer.alloc(size);
  const n = fs.readSync(fd, buf, 0, size, pos);
  return n === size ? buf : buf.subarray(0, n);
}

function readHeaders(fd) {
  const dos = readAt(fd, 0x40, 0);
  if (dos.length < 0x40 || dos.readUInt16LE(0) !== 0x5a4d) return null;
  const peOff = dos.readUInt32LE(0x3c);
  const coff = readAt(fd, 24, peOff);
  if (coff.length < 24 || coff.readUInt32LE(0) !== 0x00004550) return null;
  const numSections = coff.readUInt16LE(6);
  const optSize = coff.readUInt16LE(20);
  const optOff = peOff + 24;
  const opt = readAt(fd, optSize, optOff);
  if (opt.length < 2) return null;
  const magic = opt.readUInt16LE(0);
  const is64 = magic === 0x20b;
  const ddOff = is64 ? 112 : 96;
  const dirs = [];
  for (let i = 0; i < 16; i++) {
    const o = ddOff + i * 8;
    if (o + 8 > opt.length) break;
    dirs.push({ rva: opt.readUInt32LE(o), size: opt.readUInt32LE(o + 4) });
  }
  const secTable = readAt(fd, numSections * 40, optOff + optSize);
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const o = i * 40;
    if (o + 40 > secTable.length) break;
    sections.push({
      virtualSize: secTable.readUInt32LE(o + 8),
      virtualAddress: secTable.readUInt32LE(o + 12),
      rawSize: secTable.readUInt32LE(o + 16),
      rawOffset: secTable.readUInt32LE(o + 20)
    });
  }
  return { is64, dirs, sections };
}

function rvaToOffset(h, rva) {
  for (const s of h.sections) {
    const span = Math.max(s.virtualSize, s.rawSize);
    if (rva >= s.virtualAddress && rva < s.virtualAddress + span) {
      return s.rawOffset + (rva - s.virtualAddress);
    }
  }
  return null;
}

function readCString(fd, pos) {
  const buf = readAt(fd, 256, pos);
  const end = buf.indexOf(0);
  return buf.subarray(0, end === -1 ? buf.length : end).toString('latin1');
}

function readNameTable(fd, h, dirIndex, stride, nameFieldOffset) {
  const dir = h.dirs[dirIndex];
  if (!dir || !dir.rva) return [];
  const off = rvaToOffset(h, dir.rva);
  if (off === null) return [];
  const table = readAt(fd, Math.min(dir.size || 4096, 64 * 1024), off);
  const names = [];
  for (let o = 0; o + stride <= table.length; o += stride) {
    const nameRva = table.readUInt32LE(o + nameFieldOffset);
    if (nameRva === 0) break;
    const nameOff = rvaToOffset(h, nameRva);
    if (nameOff !== null) names.push(readCString(fd, nameOff).toLowerCase());
  }
  return names;
}

function getImports(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = readHeaders(fd);
    if (!h) return [];
    const normal = readNameTable(fd, h, 1, 20, 12);
    const delayed = readNameTable(fd, h, 13, 32, 4);
    return [...new Set([...normal, ...delayed])];
  } catch {
    return [];
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function getBitness(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = readHeaders(fd);
    return h ? (h.is64 ? 64 : 32) : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function findMarkers(file, markers) {
  const needles = markers.map(m => ({ text: m, buf: Buffer.from(m, 'latin1') }));
  const longest = Math.max(...needles.map(n => n.buf.length), 1);
  const found = new Set();
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const chunkSize = 4 * 1024 * 1024;
    const overlap = longest;
    const buf = Buffer.alloc(chunkSize + overlap);
    let pos = 0;
    let carry = 0;
    while (pos < size) {
      const read = fs.readSync(fd, buf, carry, chunkSize, pos);
      if (read <= 0) break;
      const view = buf.subarray(0, carry + read);
      for (const n of needles) {
        if (!found.has(n.text) && view.includes(n.buf)) found.add(n.text);
      }
      if (found.size === needles.length) break;
      carry = Math.min(overlap, view.length);
      view.subarray(view.length - carry).copy(buf, 0);
      pos += read;
    }
  } catch {
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
  return found;
}

function getVersionBlob(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const h = readHeaders(fd);
    if (!h || !h.dirs[2] || !h.dirs[2].rva) return null;
    const base = rvaToOffset(h, h.dirs[2].rva);
    if (base === null) return null;

    const entriesOf = dirOff => {
      const hdr = readAt(fd, 16, base + dirOff);
      if (hdr.length < 16) return [];
      const count = hdr.readUInt16LE(12) + hdr.readUInt16LE(14);
      const raw = readAt(fd, count * 8, base + dirOff + 16);
      const out = [];
      for (let i = 0; i < count; i++) {
        const o = i * 8;
        if (o + 8 > raw.length) break;
        out.push({ id: raw.readUInt32LE(o), offset: raw.readUInt32LE(o + 4) });
      }
      return out;
    };

    const type = entriesOf(0).find(e => (e.id & 0x7fffffff) === 16 && (e.offset & 0x80000000));
    if (!type) return null;
    const name = entriesOf(type.offset & 0x7fffffff)[0];
    if (!name || !(name.offset & 0x80000000)) return null;
    const lang = entriesOf(name.offset & 0x7fffffff)[0];
    if (!lang) return null;
    const data = readAt(fd, 16, base + lang.offset);
    if (data.length < 16) return null;
    const dataOff = rvaToOffset(h, data.readUInt32LE(0));
    const dataSize = data.readUInt32LE(4);
    if (dataOff === null || !dataSize) return null;
    return readAt(fd, Math.min(dataSize, 64 * 1024), dataOff);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function getFileVersion(file) {
  const blob = getVersionBlob(file);
  if (!blob) return null;
  const sig = blob.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]));
  if (sig !== -1 && sig + 24 <= blob.length) {
    const ms = blob.readUInt32LE(sig + 8);
    const ls = blob.readUInt32LE(sig + 12);
    const fixed = [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
    if (fixed !== '0.0.0.0') return fixed;
  }
  for (const key of ['FileVersion', 'ProductVersion']) {
    const needle = Buffer.from(key + '\0', 'utf16le');
    const keyAt = blob.indexOf(needle);
    if (keyAt === -1) continue;
    let valueAt = keyAt + needle.length;
    valueAt = (valueAt + 3) & ~3;
    let end = valueAt;
    while (end + 1 < blob.length && blob.readUInt16LE(end) !== 0) end += 2;
    const raw = blob.subarray(valueAt, end).toString('utf16le').trim();
    const match = raw.match(/\d+(?:\s*[.,]\s*\d+){1,3}/);
    if (match) return match[0].replace(/\s*[.,]\s*/g, '.');
  }
  return null;
}

function versionMentions(file, text) {
  const blob = getVersionBlob(file);
  if (!blob) return false;
  return blob.includes(Buffer.from(text, 'utf16le'));
}

module.exports = { getImports, getBitness, getFileVersion, versionMentions, findMarkers };