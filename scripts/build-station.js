// Build the Windows installer of one station (or all):  node scripts/build-station.js doctor   |   node scripts/build-station.js all
// Each station is a separate program (own name, icon, shortcut and settings) — install the right one on each PC.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const NAMES = { admin: 'Admin', stock: 'Stock', reception: 'Reception', doctor: 'Doctor', pharmacy: 'Pharmacy', lab: 'Lab' };
const arg = process.argv[2] || 'all';
const list = arg === 'all' ? Object.keys(NAMES) : arg.split(',');
const extra = process.argv.slice(3);
for (const st of list) {
  if (!NAMES[st]) throw new Error('Unknown station ' + st);
  const N = NAMES[st];
  const args = ['electron-builder', '--win', '--publish', 'never',
    `-c.extraMetadata.station=${st}`, `-c.extraMetadata.productName=Clinic ${N}`, `-c.productName=Clinic ${N}`, `-c.appId=af.clinic.acdb.${st}`,
    `-c.win.icon=assets/icon-${st}.png`, `-c.nsis.shortcutName=Clinic ${N}`, `-c.nsis.artifactName=Clinic-${N}-Setup-\${version}.\${ext}`, ...extra];
  console.log('\n=== building', st, '===');
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', cwd: path.join(__dirname, '..'), shell: process.platform === 'win32' });
}
