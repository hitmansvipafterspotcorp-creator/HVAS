// Art intake: mirrors raw sheets from the local Downloads folders into
// public/assets/catalog/ and writes public/data/asset-catalog.json.
//
// The generated tree is NOT committed. It was ~480MB sitting inside the
// deployable public/ folder, no app or runtime code ever loaded it, and all
// but one file was byte-identical to art already tracked under assets/. Run
// this only when you want to re-stage new sheets from Downloads; the paths
// below are Windows-local, so it does nothing useful anywhere else.
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const imagePattern = /\.(png|jpg|jpeg|webp)$/i;

const sources = [
  {
    id: 'characters',
    label: 'Playable member characters',
    source: 'C:/Users/bullo/Downloads/first CHARACTERS',
    publicDir: 'assets/catalog/characters',
  },
  {
    id: 'ops_bosses',
    label: 'Ops, staff, security, hosts, bosses',
    source: 'C:/Users/bullo/Downloads/OPS AND BOSSES',
    publicDir: 'assets/catalog/ops_bosses',
  },
  {
    id: 'venues',
    label: 'Venue maps and modular venue sheets',
    source: 'C:/Users/bullo/Downloads/VENUES',
    publicDir: 'assets/catalog/venues',
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listImages(full));
    } else if (entry.isFile() && imagePattern.test(entry.name)) {
      files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function roleFor(sourceId, index) {
  if (sourceId === 'characters') return index === 0 ? 'default-avatar-sheet' : 'avatar-sheet';
  if (sourceId === 'ops_bosses') return index < 8 ? 'door-ops-npc-sheet' : 'boss-or-staff-sheet';
  if (sourceId === 'venues') return index === 0 ? 'starting-venue-sheet' : 'venue-sheet';
  return 'asset';
}

async function catalogSource(source) {
  const files = await listImages(source.source);
  const outputDir = path.join(root, 'public', source.publicDir);
  await mkdir(outputDir, { recursive: true });

  const assets = [];
  for (const [index, file] of files.entries()) {
    const ext = path.extname(file).toLowerCase();
    const name = `${String(index + 1).padStart(3, '0')}-${slugify(path.basename(file))}${ext}`;
    const target = path.join(outputDir, name);
    await copyFile(file, target);
    assets.push({
      id: `${source.id}-${String(index + 1).padStart(3, '0')}`,
      name: path.basename(file, ext),
      sourceCategory: source.id,
      role: roleFor(source.id, index),
      originalPath: file,
      url: `/${source.publicDir}/${name}`.replaceAll('\\', '/'),
    });
  }

  return {
    id: source.id,
    label: source.label,
    count: assets.length,
    publicDir: `/${source.publicDir}`,
    assets,
  };
}

const catalog = {
  schema: 'hvas.membership.asset_catalog.v1',
  generatedAt: new Date().toISOString(),
  mandatorySources: {},
};

for (const source of sources) {
  catalog.mandatorySources[source.id] = await catalogSource(source);
}

await mkdir(path.join(root, 'public', 'data'), { recursive: true });
await writeFile(
  path.join(root, 'public', 'data', 'asset-catalog.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);

console.log('Catalog complete');
for (const source of Object.values(catalog.mandatorySources)) {
  console.log(`${source.id}: ${source.count}`);
}
