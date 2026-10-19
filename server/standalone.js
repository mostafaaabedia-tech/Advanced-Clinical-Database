// Run the clinic server without Electron:  node server/standalone.js [--port 8750] [--data ./data]
'use strict';
const path = require('path');
const { createServer } = require('./index');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
createServer({ port: Number(arg('port', process.env.ACDB_PORT || 8750)), dataDir: path.resolve(arg('data', process.env.ACDB_DATA || path.join(__dirname, '..', 'data'))), discovery: arg('discovery', '1') !== '0' })
  .then(s => {
    console.log(`Clinic server ready: http://localhost:${s.port}  (data: ${s.dataDir})`);
    const stop = () => s.close().then(() => process.exit(0));
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  })
  .catch(e => { console.error(e); process.exit(1); });
