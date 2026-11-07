const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const next = require('next');

function listener(host, port, certificate, key) {
  port = Number(port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(certificate) !== Boolean(key)) {
    throw new Error('Invalid Listener');
  }
  return { host, port, certificate, key };
}
function credentials(record) {
  const directory = fs.realpathSync(record.certificate.substring(0, record.certificate.lastIndexOf('/')));
  const value = { cert: fs.readFileSync(directory + '/fullchain.pem'), key: fs.readFileSync(directory + '/privkey.pem'), minVersion: 'TLSv1.2' };
  tls.createSecureContext(value);
  return value;
}
async function main() {
  const directory = process.env.TLS_DIRECTORY || '/tls/current';
  const host = process.env.BIND_ADDRESS || '0.0.0.0';
  const records = [listener(host, process.env.PORT || 3000), listener(host, process.env.TLS_PORT || 3443, directory + '/fullchain.pem', directory + '/privkey.pem')];
  const app = next({ dev: false, hostname: host, port: records[0].port });
  const handler = app.getRequestHandler();
  const servers = [];
  let stopping = false;
  let preparation = Promise.resolve();
  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), Number(process.env.DRAIN_SECONDS || 300) * 1000);
    try {
      await preparation.catch(() => {});
      await Promise.all(servers.map(server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
      await app.close();
      process.exitCode = code;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally { clearTimeout(timer); }
  }
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
  process.on('SIGHUP', () => {
    try {
      const value = credentials(records[1]);
      servers[1].setSecureContext(value);
      console.log('TLS_RELOAD_OK');
    } catch (error) { console.error('TLS_RELOAD_FAILED', error.message); }
  });
  try {
    const value = credentials(records[1]);
    preparation = app.prepare();
    await preparation;
    const upgrade = app.getUpgradeHandler();
    if (stopping) return;
    for (const record of records) {
      const server = record.certificate ? https.createServer(value, handler) : http.createServer(handler);
      servers.push(server);
      server.on('upgrade', upgrade);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(record.port, record.host, resolve); });
      server.on('error', error => { console.error(error); void stop(1); });
    }
  } catch (error) { console.error(error); await stop(1); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
