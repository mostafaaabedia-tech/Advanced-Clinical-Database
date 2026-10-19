// Electron main process — one program, six station builds (admin / stock / reception / doctor / pharmacy / lab).
// The Admin build also runs the clinic server (database + API + live events) for the local network.
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const http = require('http');
const pkg = require('./package.json');

const STATIONS = { admin: 'مدیریت (Admin)', stock: 'انبار و حسابات', reception: 'پذیرش و نوبت', doctor: 'داکتر', pharmacy: 'دواخانه', lab: 'لابراتوار' };
const argStation = (process.argv.find(a => a.startsWith('--station=')) || '').split('=')[1];
const STATION = STATIONS[argStation] ? argStation : STATIONS[process.env.ACDB_STATION] ? process.env.ACDB_STATION : STATIONS[pkg.station] ? pkg.station : 'admin';
const DEFAULT_PORT = 8750, DISCOVERY_PORT = 41234;

app.setName(`Clinic ${STATION[0].toUpperCase() + STATION.slice(1)}`);
let win = null, server = null, cfg = {};
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const dataDir = () => process.env.ACDB_DATA || cfg.dataDir || path.join(app.getPath('userData'), 'data');
function loadCfg() { try { cfg = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (_) { cfg = {}; } }
function saveCfg() { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); }
function wasmPath() { return path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); }

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------------- server discovery (stations) ----------------
const found = new Map();
let udp = null;
function startDiscovery() {
  if (udp) return;
  try {
    udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('message', (m, rinfo) => {
      try { const j = JSON.parse(String(m)); if (j.app === 'ACDB') found.set(rinfo.address + ':' + j.port, { url: `http://${rinfo.address}:${j.port}`, name: j.name, host: j.host, version: j.version, seen: Date.now() }); } catch (_) { }
    });
    udp.on('error', () => { });
    udp.bind(DISCOVERY_PORT + 1, () => { try { udp.setBroadcast(true); } catch (_) { } query(); });
  } catch (_) { }
}
function query() { try { udp && udp.send(Buffer.from('ACDB?'), DISCOVERY_PORT, '255.255.255.255'); } catch (_) { } }
function ping(url, timeout = 2500) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url.replace(/\/+$/, '') + '/api/ping', { timeout }, (res) => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const j = JSON.parse(d); resolve(j.ok && j.data.app === 'ACDB' ? j.data : null); } catch (_) { resolve(null); } });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); }); req.on('error', () => resolve(null));
    } catch (_) { resolve(null); }
  });
}

// ---------------- window ----------------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 680, show: false, autoHideMenuBar: true, backgroundColor: '#f4f6f9',
    title: `${STATIONS[STATION]} — سیستم جامع کلینیک`, icon: path.join(__dirname, 'assets', `icon-${STATION}.png`),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false, additionalArguments: ['--station=' + STATION] }
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F5') win.webContents.reload();
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && STATION !== 'admin' && !String(url).startsWith('file:')) showConnect('اتصال به سرور ممکن نشد: ' + desc); });
  win.on('page-title-updated', (e) => e.preventDefault());
  if (process.env.ACDB_SHOT) {   // automated smoke test: save a screenshot after the page loads, then quit
    win.webContents.on('did-finish-load', () => setTimeout(async () => {
      try { fs.writeFileSync(process.env.ACDB_SHOT, (await win.webContents.capturePage()).toPNG()); } catch (e) { console.error(e); }
      win.__closing = true; app.quit();
    }, Number(process.env.ACDB_SHOT_DELAY || 3000)));
  }
  win.on('close', async (e) => {
    if (STATION !== 'admin' || win.__closing) return;
    e.preventDefault();
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['بستن برنامه', 'انصراف'], defaultId: 1, cancelId: 1, title: 'بستن سرور',
      message: 'این کمپیوتر سرور کلینیک است.', detail: 'با بستن این برنامه، همه ایستگاه‌ها (پذیرش، داکتر، دواخانه، لابراتوار، انبار) قطع می‌شوند. ادامه می‌دهید؟' });
    if (r.response === 0) { win.__closing = true; win.close(); }
  });
}
function showConnect(msg) {
  startDiscovery(); query();
  win.loadFile(path.join(__dirname, 'renderer', 'connect.html'), { query: { station: STATION, msg: msg || '', server: cfg.server || '' } });
}
async function openStation() {
  if (STATION === 'admin') return win.loadURL(`http://127.0.0.1:${server.port}/?station=admin`);
  if (cfg.server && await ping(cfg.server)) return win.loadURL(`${cfg.server.replace(/\/+$/, '')}/?station=${STATION}`);
  // try to find the server automatically for a few seconds
  startDiscovery();
  for (let i = 0; i < 8; i++) {
    query(); await new Promise(r => setTimeout(r, 500));
    for (const s of found.values()) if (await ping(s.url)) { cfg.server = s.url; saveCfg(); return win.loadURL(`${s.url}/?station=${STATION}`); }
  }
  showConnect(cfg.server ? 'سرور قبلی (' + cfg.server + ') پاسخ نمی‌دهد. کمپیوتر مدیر روشن است؟' : '');
}

// ---------------- IPC for the page ----------------
function registerIpc() {
  ipcMain.handle('native:info', () => ({ station: STATION, version: app.getVersion(), server: cfg.server || null, isServer: STATION === 'admin' }));
  ipcMain.handle('native:printers', async (e) => { try { return await e.sender.getPrintersAsync(); } catch (_) { return []; } });
  ipcMain.handle('native:print', (e, o = {}) => new Promise((resolve) => {
    const opts = { silent: !!o.silent, printBackground: true, margins: { marginType: 'none' } };
    if (o.deviceName) opts.deviceName = o.deviceName;
    if (o.pageSize) opts.pageSize = o.pageSize;
    e.sender.print(opts, (success, reason) => resolve({ success, reason }));
  }));
  ipcMain.handle('native:pdf', async (e, o = {}) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: String(o.name || 'document').replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    const pdf = await e.sender.printToPDF({ pageSize: o.pageSize || 'A4', printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true });
    fs.writeFileSync(r.filePath, pdf); shell.openPath(r.filePath); return r.filePath;
  });
  ipcMain.handle('native:changeServer', () => { showConnect(''); return true; });
  ipcMain.handle('native:openData', () => { if (STATION === 'admin') shell.openPath(dataDir()); return dataDir(); });
  ipcMain.handle('native:discover', async () => { startDiscovery(); query(); await new Promise(r => setTimeout(r, 1200)); return [...found.values()].filter(s => Date.now() - s.seen < 15000); });
  ipcMain.handle('native:connect', async (_e, url) => {
    let u = String(url || '').trim(); if (!u) throw new Error('آدرس سرور را وارد کنید');
    if (!/^https?:\/\//.test(u)) u = 'http://' + u;
    if (!/:\d+/.test(u.replace(/^https?:\/\//, ''))) u = u.replace(/\/+$/, '') + ':' + DEFAULT_PORT;
    const p = await ping(u, 4000);
    if (!p) throw new Error('سرور در این آدرس پیدا نشد: ' + u);
    cfg.server = u.replace(/\/+$/, ''); saveCfg();
    win.loadURL(`${cfg.server}/?station=${STATION}`);
    return p;
  });
}

app.whenReady().then(async () => {
  loadCfg();
  registerIpc();
  createWindow();
  if (STATION === 'admin') {
    try {
      const { createServer } = require('./server');
      server = await createServer({ dataDir: dataDir(), port: Number(cfg.port || process.env.ACDB_PORT || DEFAULT_PORT), wasmPath: wasmPath(), staticDir: path.join(__dirname, 'renderer'), version: app.getVersion() });
    } catch (e) {
      dialog.showErrorBox('خطای سرور کلینیک', (e.code === 'EADDRINUSE' ? `پورت ${cfg.port || DEFAULT_PORT} مشغول است. احتمالاً برنامه مدیر دو بار باز شده.\n\n` : '') + String(e && e.stack || e));
      app.quit(); return;
    }
  }
  await openStation();
});
app.on('window-all-closed', async () => { try { server && await server.close(); } catch (_) { } app.quit(); });
app.on('before-quit', () => { try { server && server.db && server.db.saveNow(); } catch (_) { } });
