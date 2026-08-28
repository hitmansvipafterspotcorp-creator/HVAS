// Finding the other venue phones, and keeping the mesh honest about which of
// them are still there.
//
// This was a commented sketch at the bottom of the radio adapter, which is the
// worst place for it: it is the part with actual decisions in it. A scan
// callback fires repeatedly for the same device, connections drop when somebody
// walks to the other end of a room, and a link that has gone must leave the
// mesh or every broadcast keeps writing into a radio that is not there.
//
// So it lives here, as real code, testable against a simulated BleClient — the
// hardware is one object with four methods, and none of the logic below needs a
// phone to be wrong on.
import { BleTransport } from './ble.mjs';
import { HVAS_SERVICE, capacitorRadio } from './ble-radio-capacitor.js';

/**
 * Keep a mesh node connected to every venue device in Bluetooth range.
 *
 * `BleClient` is the plugin (or a stand-in). `node` is the MeshNode. `key` is
 * the shared venue key every message is sealed under before it reaches the air.
 */
export function startBleMesh({ BleClient, node, key, radioFor = capacitorRadio,
                               retryMs = 5000, now = () => Date.now() } = {}) {
  // deviceId -> { transport, connectedAt }
  const links = new Map();
  // Devices we tried and could not reach, and when to try them again. Without
  // this a phone that is off, or refusing, is retried on every single scan hit
  // — which on a busy scan is several times a second, forever.
  const cooling = new Map();
  // Devices with a connect in flight right now. See connect().
  const pending = new Set();
  let stopped = false;

  const drop = (deviceId, why) => {
    const link = links.get(deviceId);
    if (!link) return;
    links.delete(deviceId);
    node.removeTransport?.(link.transport);
    cooling.set(deviceId, now() + retryMs);
    onChange({ event: 'lost', deviceId, why, peers: links.size });
  };

  let onChange = () => {};

  const connect = async (deviceId) => {
    if (stopped) return false;
    // Already linked, already being connected, or cooling off after a failure.
    //
    // `pending` is not belt-and-braces on top of `links` — it is the whole
    // guard. Connecting is async, so a scan callback firing fifty times for a
    // phone sitting on a bar gets fifty callers past the links check before the
    // first await resolves, and the mesh ends up with fifty transports to one
    // device and every broadcast going out fifty times. The claim has to be
    // staked synchronously, before anything yields.
    if (links.has(deviceId) || pending.has(deviceId)) return false;
    const until = cooling.get(deviceId);
    if (until && now() < until) return false;
    cooling.delete(deviceId);
    pending.add(deviceId);
    try {
      // Told about the disconnect BEFORE connecting, because a device that
      // drops during the connect itself would otherwise never be cleaned up.
      await BleClient.connect(deviceId, () => drop(deviceId, 'disconnected'));
      const transport = BleTransport(radioFor(BleClient, deviceId), key);
      node.addTransport(transport);
      links.set(deviceId, { transport, connectedAt: now() });
      // Ask the new peer for anything we have not seen. Two phones that have
      // been apart have both moved on, and neither is "the" source.
      node.syncWith?.(transport);
      onChange({ event: 'found', deviceId, peers: links.size });
      return true;
    } catch (e) {
      cooling.set(deviceId, now() + retryMs);
      onChange({ event: 'failed', deviceId, why: e?.message || 'could not connect', peers: links.size });
      return false;
    } finally {
      pending.delete(deviceId);
    }
  };

  const start = async () => {
    await BleClient.initialize?.();
    // Every venue device both advertises and scans, so any two in range link up
    // without one of them having to be "the" venue machine.
    await BleClient.startAdvertising?.({ services: [HVAS_SERVICE] });
    await BleClient.requestLEScan({ services: [HVAS_SERVICE] }, (result) => {
      const id = result?.device?.deviceId;
      if (id) connect(id);
    });
    return api;
  };

  const api = {
    start,
    async stop() {
      stopped = true;
      try { await BleClient.stopLEScan?.(); } catch { /* already stopped */ }
      try { await BleClient.stopAdvertising?.(); } catch { /* already stopped */ }
      for (const [id, link] of links) {
        node.removeTransport?.(link.transport);
        try { await BleClient.disconnect?.(id); } catch { /* gone anyway */ }
      }
      links.clear();
      return true;
    },
    // What the venue screen shows: how many devices are carrying the night.
    peers: () => [...links.keys()],
    peerCount: () => links.size,
    onChange(cb) { onChange = cb || (() => {}); return api; },
    // Exposed for the shell to call on a lifecycle event, and for tests.
    connect,
    drop,
  };
  return api;
}
