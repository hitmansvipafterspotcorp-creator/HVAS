# HVAS Native Shell — real Bluetooth mesh

The web app can't do Bluetooth (browsers can't advertise as a BLE peripheral or
form a mesh). Wrapping the exact same web build in a **Capacitor** shell adds a
native BLE radio, so venue phones and door tablets mesh **phone-to-phone over
Bluetooth with no Wi-Fi and no cell towers**.

Nothing about the mesh, encryption, or crypto passes changes — the shell only
adds one transport (`BleTransport`) against the same `{ onMessage, send }`
interface the LAN/WebRTC transports use.

## Layers (only the bottom one needs hardware)

```
MeshNode (op-log, CRDT merge, gossip)        ← server/src/mesh.mjs   (tested)
  └─ BleTransport (seal → fragment → radio)   ← native/ble.mjs        (tested, no HW)
       └─ radio adapter (GATT read/write)     ← native/ble-radio-capacitor.js
            └─ @capacitor-community/bluetooth-le  (device only)
```

- **Encryption:** every message is AES-256-GCM sealed under the shared venue key
  before it hits the radio — a Bluetooth sniffer sees only ciphertext.
- **Fragmentation:** messages are chunked to the BLE MTU (~180 B) and reassembled
  with loss/reorder tolerance (`native/ble.mjs`, proven in `native/ble-test.mjs`).
- **Convergence:** the mesh's flood + anti-entropy recovers dropped BLE chunks on
  the next sync round, so a flaky radio still converges.

## Build the shell

```bash
# from repo root — build the web app first
cd hitmans_vip_membership_app && npm run build && cd ..

# scaffold Capacitor around the built web app (one time)
npm i -D @capacitor/cli
npx cap init "HVAS" "com.hvas.app" --web-dir hitmans_vip_membership_app/dist
npm i @capacitor/core @capacitor/android @capacitor/ios @capacitor-community/bluetooth-le
npx cap add android          # and/or: npx cap add ios
npx cap sync

# open the native project to run on a device
npx cap open android         # or: npx cap open ios
```

Wire the BLE discovery loop (see the sketch at the bottom of
`ble-radio-capacitor.js`) into the app's startup so each device advertises the
HVAS service, scans for peers, and hands every connection to the mesh as a
`BleTransport(radio, VENUE_KEY)`.

## Permissions

- **Android:** `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`
  (and location on older APIs) in `AndroidManifest.xml`.
- **iOS:** `NSBluetoothAlwaysUsageDescription` in `Info.plist`; enable the
  *Uses Bluetooth LE accessories* + *Acts as a Bluetooth LE accessory*
  background modes for always-on meshing.

## What's tested here vs. on-device

| Piece | Where | Tested |
|---|---|---|
| Fragment / reassemble (loss + reorder) | `native/ble.mjs` | ✅ `ble-test.mjs` |
| Encrypt + mesh convergence over BLE-shaped link | `native/ble.mjs` + mesh | ✅ `ble-test.mjs` |
| GATT read/write/notify, scan/advertise | `ble-radio-capacitor.js` | device only |

```bash
node native/ble-test.mjs   # fragmentation + encrypted mesh over a simulated radio
```
