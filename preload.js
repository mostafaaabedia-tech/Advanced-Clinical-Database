// Small, safe bridge for the clinic pages (printing, PDF, printers, server selection). No database access here:
// every station talks to the clinic server over the network.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

let info = { station: '' };
try { info = require('./package.json'); info = { station: process.env.ACDB_STATION || (process.argv.find(a => a.startsWith('--station=')) || '').split('=')[1] || info.station, version: info.version }; } catch (_) { }

contextBridge.exposeInMainWorld('native', {
  station: info.station,
  version: info.version,
  info: () => ipcRenderer.invoke('native:info'),
  print: (opts) => ipcRenderer.invoke('native:print', opts),
  pdf: (opts) => ipcRenderer.invoke('native:pdf', opts),
  printers: () => ipcRenderer.invoke('native:printers'),
  changeServer: () => ipcRenderer.invoke('native:changeServer'),
  openData: () => ipcRenderer.invoke('native:openData'),
  discover: () => ipcRenderer.invoke('native:discover'),
  connect: (url) => ipcRenderer.invoke('native:connect', url)
});
