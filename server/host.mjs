// HVAS Self-Host — run the venue's backend on THIS device (laptop, mini-PC,
// Raspberry Pi, or an Android via Termux). No cloud, no serverless, no fees.
// Members' phones connect over the venue wifi (LAN) — faster than any cloud and
// works with no internet. Prints the exact address to connect to.
//
//   node host.mjs            (optionally: PORT=8787 MESH_PORT=9944)
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './src/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HVAS_DATA_DIR || resolve(__dirname, 'data');
const port = Number(process.env.PORT || 8787);
const meshPort = process.env.MESH_PORT ? Number(process.env.MESH_PORT) : null;
const peers = (process.env.MESH_PEERS || '').split(',').map((s) => s.trim()).filter(Boolean);

// Find this machine's LAN IPv4 addresses (what phones on the wifi can reach).
const lanIPs = () => {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
};

const { server } = createApp({ dataDir, nodeId: process.env.NODE_ID || os.hostname(), meshPort, peers });
server.listen(port, '0.0.0.0', () => {
  const ips = lanIPs();
  const line = '─'.repeat(48);
  console.log(`\n${line}\n  HVAS is LIVE on this device — the venue is the server.\n${line}`);
  if (ips.length) {
    console.log('  On the venue wifi, open the app → Connect to venue →');
    for (const ip of ips) console.log(`      http://${ip}:${port}`);
  } else {
    console.log(`  Local only: http://127.0.0.1:${port} (no LAN found)`);
  }
  console.log(`\n  Staff code: ${process.env.HVAS_STAFF_CODE || 'DOOR850'}   Host code: ${process.env.HVAS_HOST_CODE || 'HOST850'}`);
  if (meshPort) console.log(`  Mesh: accepting peers on :${meshPort}`);
  console.log(`  Data + venue key: ${dataDir}`);
  console.log(`${line}\n  Keep this window open. Ctrl+C to stop.\n`);
});
