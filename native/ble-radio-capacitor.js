// Native radio adapter — maps the `radio` interface BleTransport needs onto the
// @capacitor-community/bluetooth-le plugin. This is the ONLY part that touches
// hardware; everything above it (fragmentation, encryption, mesh convergence)
// is tested without a device in native/ble-test.mjs.
//
// Install in the Capacitor shell:
//   npm i @capacitor-community/bluetooth-le
//
// One 128-bit service + two characteristics: TX (we write) / RX (we notify).
// Every venue device runs BOTH a peripheral (advertises the service) and a
// central (scans + connects) so any two in range form a link — that's the mesh.
export const HVAS_SERVICE = '8f1e0000-b1e5-4a11-9c3a-000000008501';
export const HVAS_TX = '8f1e0001-b1e5-4a11-9c3a-000000008501';
export const HVAS_RX = '8f1e0002-b1e5-4a11-9c3a-000000008501';

// Returns a `radio` for BleTransport once connected to a specific peer deviceId.
export function capacitorRadio(BleClient, deviceId, mtu = 180) {
  const listeners = [];
  // Subscribe to the peer's notify characteristic (their outbound = our inbound).
  BleClient.startNotifications(deviceId, HVAS_SERVICE, HVAS_TX, (value) => {
    const bytes = new Uint8Array(value.buffer);
    for (const cb of listeners) cb(bytes);
  });
  return {
    mtu,
    writeChunk(chunk) {
      const view = new DataView(new Uint8Array(chunk).buffer);
      // writeWithoutResponse for throughput; chunks are already <= MTU
      BleClient.writeWithoutResponse(deviceId, HVAS_SERVICE, HVAS_RX, view).catch(() => {});
    },
    onChunk(cb) { listeners.push(cb); },
  };
}

// Discovery loop sketch: advertise our service, scan for peers advertising it,
// connect, and hand each connection to the mesh as a BleTransport.
//
//   import { BleClient } from '@capacitor-community/bluetooth-le';
//   import { BleTransport } from './ble.mjs';
//   await BleClient.initialize();
//   await BleClient.requestLEScan({ services: [HVAS_SERVICE] }, async (r) => {
//     const dev = r.device.deviceId;
//     await BleClient.connect(dev);
//     node.addTransport(BleTransport(capacitorRadio(BleClient, dev), VENUE_KEY));
//   });
//
// (Peripheral advertising uses a platform BLE-peripheral plugin; iOS/Android
// specifics live in the shell. The mesh code above never changes.)
