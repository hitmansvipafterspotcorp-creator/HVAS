import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.HVAS_DATA_DIR || resolve(__dirname, '..', 'data');
const port = Number(process.env.PORT || 8787);

const { server } = createApp({ dataDir });
server.listen(port, () => console.log(`HVAS backend on :${port} (data: ${dataDir})`));
