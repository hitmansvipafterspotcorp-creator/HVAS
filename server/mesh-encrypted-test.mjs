// Encrypted mesh test — sniff the raw bytes on the socket and prove they carry
// NO plaintext (member numbers, names, op types), while the nodes still
// converge. Confidentiality on the wire + working sync.
import { MeshNode, meshListen, meshDial } from './src/mesh.mjs';
import { seal, open } from './src/crypto.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const KEY = randomBytes(32);                       // shared venue encryption key
const A = new MeshNode({ id: 'A', privateKey, publicKey });
const B = new MeshNode({ id: 'B', privateKey, publicKey });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('SEAL / OPEN ROUND-TRIP');
const box = seal(KEY, { hello: 'HV-1234-5678' });
ok(!box.includes('HV-1234') && !box.includes('hello'), 'sealed blob reveals no plaintext');
ok(open(KEY, box).hello === 'HV-1234-5678', 'open() recovers the message');
ok(open(randomBytes(32), box) === null, 'wrong key fails to open (authenticated)');

console.log('\nENCRYPTED OVER REAL TCP');
const PORT = 9922;
let sniff = Buffer.alloc(0);
const srv = meshListen(A, PORT, '127.0.0.1', { key: KEY });
srv.on('connection', (s) => s.on('data', (d) => { sniff = Buffer.concat([sniff, d]); })); // wiretap
const dial = meshDial(B, '127.0.0.1', PORT, { retryMs: 200, key: KEY });
await wait(150);

A.apply('member.upsert', { id: 'm1', number: 'HV-1234-5678', name: 'Tasha' });
A.apply('decision', { number: 'HV-1234-5678', status: 'granted', at: Date.now() });
await wait(200);

ok(B.state().members.get('m1')?.number === 'HV-1234-5678', 'B decrypted and applied the op');
ok(A.digest() === B.digest(), 'nodes converged over the encrypted link');
const wire = sniff.toString('utf8');
ok(sniff.length > 0, 'bytes actually crossed the wire');
ok(!wire.includes('HV-1234-5678'), 'wire has NO member number in the clear');
ok(!wire.includes('Tasha') && !wire.includes('member.upsert') && !wire.includes('granted'), 'wire has no name / op-type / status in the clear');

console.log(`\n${pass} passed, ${fail} failed`);
dial.stop(); srv.close();
process.exit(fail ? 1 : 0);
