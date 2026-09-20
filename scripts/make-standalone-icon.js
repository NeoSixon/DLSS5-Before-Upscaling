'use strict';
// DLSS5 Before Upscaling standalone icon.
// The approved PNG artwork is the single source of truth for README, app window and EXE icons.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'build');
const SOURCE_ICON = path.join(ROOT, 'standalone', 'renderer', 'icon-source.png');
const WINDOW_ICON = path.join(ROOT, 'standalone', 'renderer', 'app-icon.png');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const RENDER_SIZE = 512;

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(images.length * 16);
  let offset = 6 + directory.length;
  images.forEach((image, i) => {
    const at = i * 16;
    directory[at] = image.size >= 256 ? 0 : image.size;
    directory[at + 1] = image.size >= 256 ? 0 : image.size;
    directory[at + 2] = 0;
    directory[at + 3] = 0;
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(image.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.png.length;
  });

  return Buffer.concat([header, directory, ...images.map(image => image.png)]);
}

app.whenReady().then(async () => {
  const sourceBase64 = fs.readFileSync(SOURCE_ICON).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;overflow:hidden;background:transparent}
    img{display:block;width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;object-fit:contain}
  </style></head><body><img src="data:image/png;base64,${sourceBase64}"></body></html>`;

  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    useContentSize: true,
    resizable: false,
    webPreferences: { offscreen: true }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  win.setContentSize(RENDER_SIZE, RENDER_SIZE);
  await new Promise(resolve => setTimeout(resolve, 100));
  const source = await win.webContents.capturePage({ x: 0, y: 0, width: RENDER_SIZE, height: RENDER_SIZE });
  win.destroy();

  if (source.isEmpty()) throw new Error(`Could not render icon source: ${SOURCE_ICON}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(WINDOW_ICON), { recursive: true });

  const images = ICO_SIZES.map(size => ({
    size,
    png: source.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }));

  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buildIco(images));
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), source.toPNG());
  fs.writeFileSync(WINDOW_ICON, source.resize({ width: 256, height: 256, quality: 'best' }).toPNG());

  console.log('wrote DLSS5 Before Upscaling icon from the approved PNG artwork');
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
