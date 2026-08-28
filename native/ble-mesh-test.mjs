// Finding the other venue phones, and letting go of the ones that left.
//
// The discovery loop used to be a comment at the bottom of the radio adapter,
// which is the worst place for the part that has actual decisions in it. A scan
// callback fires again and again for the same device. Connections drop when
// somebody walks to the far end of a room. A phone that is switched off will be
// offered by the scanner forever.
//
// None of that needs hardware to get wrong, so none of it needs hardware to
// test: the radio is one object with four methods and this file supplies a fake
// one. What is NOT tested here is the plugin itself — that is device-only, and
// the README says so.
import { startBleMesh } from './ble-mesh.mjs';
import { MeshNode, makeOp } from '../server/src/mesh.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

const key = randomBytes(32);
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const newNode = (id) => new MeshNode({ id, privateKey, publicKey });

// A Bluetooth stack that does what a real one does and nothing more.
function fakeBle({ failOn = new Set() } = {}) {
  const state = { scans: [], advertising: false, connected: new Set(), disconnectCbs: new Map(), initialised: false, notifyCbs: new Map() };
  return {
    state,
    async initialize() { state.initialised = true; },
    async startAdvertising() { state.advertising = true; },
    async stopAdvertising() { state.advertising = false; },
    async requestLEScan(_opts, cb) { state.scans.push(cb); },
    async stopLEScan() { state.scans = []; },
    async connect(deviceId, onDisconnect) {
      if (failOn.has(deviceId)) throw new Error('device is off');
      state.connected.add(deviceId);
      state.disconnectCbs.set(deviceId, onDisconnect);
    },
    async disconnect(deviceId) { state.connected.delete(deviceId); },
    async startNotifications(deviceId, _s, _c, cb) { state.notifyCbs.set(deviceId, cb); },
    async writeWithoutResponse() { /* the air */ },
    // What the room does to it.
    sees(deviceId) { for (const cb of state.scans) cb({ device: { deviceId } }); },
    walksOut(deviceId) {
      state.connected.delete(deviceId);
      state.disconnectCbs.get(deviceId)?.();
    },
  };
}
// The radio adapter is device-only; this stands in for it.
const fakeRadio = () => ({ mtu: 180, writeChunk() {}, onChunk() {} });

console.log('IT ADVERTISES AND SCANS, BECAUSE EITHER PHONE MIGHT BE THE ONE THAT SEES');
{
  const ble = fakeBle(), node = newNode('a');
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio });
  await mesh.start();
  ok(ble.state.initialised, 'the radio is initialised');
  ok(ble.state.advertising, 'this device advertises itself');
  eq(ble.state.scans.length, 1, 'and scans for others — both, so neither has to be the venue machine');
}

console.log('\nA DEVICE IN RANGE BECOMES A LINK IN THE MESH');
{
  const ble = fakeBle(), node = newNode('a');
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio });
  await mesh.start();
  ble.sees('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  eq(mesh.peerCount(), 1, 'it connects');
  eq(node.transports.length, 1, 'and the mesh gains a transport');
  eq(mesh.peers()[0], 'phone-2', 'named by the device it is');
}

console.log('\nTHE SAME DEVICE SEEN FIFTY TIMES IS STILL ONE LINK');
// A scan callback fires repeatedly for a device that is simply sitting there.
// Without a guard that is fifty connections and fifty transports, all to one
// phone, and every broadcast goes out fifty times.
{
  const ble = fakeBle(), node = newNode('a');
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio });
  await mesh.start();
  for (let i = 0; i < 50; i++) ble.sees('phone-2');
  await new Promise((r) => setTimeout(r, 30));
  eq(mesh.peerCount(), 1, 'one peer');
  eq(node.transports.length, 1, 'one transport');
}

console.log('\nWHEN SOMEBODY WALKS OUT, THE MESH LETS GO');
// The one this exists for. addTransport had no opposite, so a link that ended
// stayed in the broadcast list forever, writing into a radio that is not there.
{
  const ble = fakeBle(), node = newNode('a');
  const seen = [];
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio }).onChange((e) => seen.push(e.event));
  await mesh.start();
  ble.sees('phone-2'); ble.sees('phone-3');
  await new Promise((r) => setTimeout(r, 30));
  eq(node.transports.length, 2, 'two phones are carrying the night');
  ble.walksOut('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  eq(mesh.peerCount(), 1, 'one walks out of range');
  eq(node.transports.length, 1, 'and its transport leaves the mesh, rather than being broadcast into forever');
  ok(seen.includes('lost'), 'and the venue screen is told');
}

console.log('\nTHEY COME BACK');
{
  const ble = fakeBle(), node = newNode('a');
  let clock = 0;
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio, retryMs: 5000, now: () => clock });
  await mesh.start();
  ble.sees('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  ble.walksOut('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  eq(mesh.peerCount(), 0, 'gone');
  // Straight away is too soon — they are still out of range and the scanner
  // will keep offering them.
  ble.sees('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  eq(mesh.peerCount(), 0, 'seeing them again immediately does not thrash the radio');
  clock += 6000;
  ble.sees('phone-2');
  await new Promise((r) => setTimeout(r, 20));
  eq(mesh.peerCount(), 1, 'and after the cool-off they are picked back up');
}

console.log('\nA PHONE THAT IS SWITCHED OFF IS NOT RETRIED FOREVER');
{
  const ble = fakeBle({ failOn: new Set(['dead-phone']) }), node = newNode('a');
  let clock = 0, attempts = 0;
  const realConnect = ble.connect.bind(ble);
  ble.connect = async (...a) => { attempts++; return realConnect(...a); };
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio, retryMs: 5000, now: () => clock });
  await mesh.start();
  for (let i = 0; i < 20; i++) ble.sees('dead-phone');
  await new Promise((r) => setTimeout(r, 40));
  eq(attempts, 1, 'twenty sightings, one attempt');
  eq(mesh.peerCount(), 0, 'and no phantom peer');
  clock += 6000;
  ble.sees('dead-phone');
  await new Promise((r) => setTimeout(r, 20));
  eq(attempts, 2, 'it tries again later, in case they switched it on');
}

console.log('\nCLOSING THE APP LEAVES NOTHING BEHIND');
{
  const ble = fakeBle(), node = newNode('a');
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio });
  await mesh.start();
  ble.sees('phone-2'); ble.sees('phone-3');
  await new Promise((r) => setTimeout(r, 30));
  await mesh.stop();
  eq(node.transports.length, 0, 'every transport is out of the mesh');
  eq(mesh.peerCount(), 0, 'no peers are still claimed');
  eq(ble.state.advertising, false, 'the radio stops advertising');
  eq(ble.state.scans.length, 0, 'and stops scanning — a phone in a pocket is not a door');
  eq(ble.state.connected.size, 0, 'and the connections are actually closed');
}

console.log('\nA STOPPED MESH DOES NOT QUIETLY RECONNECT');
{
  const ble = fakeBle(), node = newNode('a');
  const mesh = startBleMesh({ BleClient: ble, node, key, radioFor: fakeRadio });
  await mesh.start();
  await mesh.stop();
  eq(await mesh.connect('phone-9'), false, 'a late scan callback after stop connects nothing');
  eq(node.transports.length, 0, 'and the mesh stays empty');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
