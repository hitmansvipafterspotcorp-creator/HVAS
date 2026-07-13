import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HVAS_DATA_DIR || resolve(__dirname, '..', 'data');
const port = Number(process.env.PORT || 8787);
// Background mesh: MESH_PORT to accept peer nodes, MESH_PEERS=host:port,host:port
const meshPort = process.env.MESH_PORT ? Number(process.env.MESH_PORT) : null;
const peers = (process.env.MESH_PEERS || '').split(',').map((s) => s.trim()).filter(Boolean);

const { server } = createApp({ dataDir, nodeId: process.env.NODE_ID, meshPort, peers });
server.listen(port, () => console.log(`HVAS backend on :${port} (data: ${dataDir})${meshPort ? ` · mesh :${meshPort}` : ''}${peers.length ? ` · peers ${peers.join(',')}` : ''}`));
