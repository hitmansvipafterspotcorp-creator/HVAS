// HVAS Hub controller — makes the app its own backend. One WebMesh node per
// device; transports plug into its universal peer socket (addPeer/recvFromPeer):
//   • BroadcastChannel — same device / tabs (built into WebMesh)
//   • WebRTC data channel — cross-device browser (here), bootstrapped by QR
//   • BLE — cross-device with no wifi, wired in the native shell (native/ble.mjs
//     BleTransport → hub.addPeer), same node, no changes
//
// No server, no terminal, no cloud.
import { WebMesh } from './meshweb.js';

let hub = null;
export const hubOn = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_hub') === '1');
export function hubNode() { return hub; }

export async function startHub(room = 'venue') {
  if (hub) return hub;
  hub = new WebMesh(room);
  await hub.init();
  localStorage.setItem('hvas_hub', '1');
  return hub;
}
export function stopHub() { localStorage.removeItem('hvas_hub'); hub = null; }

// ── WebRTC transport (cross-device, serverless) ──────────────────────────────
// Manual signaling: the hub shows an OFFER (as a QR / code), the joiner returns
// an ANSWER. Once connected, ops flow peer-to-peer with no server involved.
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const enc = (o) => btoa(JSON.stringify(o));
const dec = (s) => JSON.parse(atob(s));
const gatherIce = (pc) => new Promise((r) => { if (pc.iceGatheringState === 'complete') return r(); pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && r(); setTimeout(r, 2500); });

function wire(pc, dc) {
  dc.onopen = () => { const send = (m) => dc.readyState === 'open' && dc.send(JSON.stringify(m)); dc._off = hub.addPeer(send); dc._send = send; };
  dc.onmessage = (e) => { try { hub.recvFromPeer(JSON.parse(e.data), dc._send); } catch { /* ignore */ } };
  dc.onclose = () => dc._off?.();
}
// Hub side: create an offer to share.
export async function hubOffer() {
  const pc = new RTCPeerConnection(ICE);
  const dc = pc.createDataChannel('hvas'); wire(pc, dc);
  await pc.setLocalDescription(await pc.createOffer()); await gatherIce(pc);
  return { pc, code: enc(pc.localDescription) };
}
// Joiner side: take the hub's offer, return an answer.
export async function joinAnswer(offerCode) {
  const pc = new RTCPeerConnection(ICE);
  pc.ondatachannel = (e) => wire(pc, e.channel);
  await pc.setRemoteDescription(dec(offerCode));
  await pc.setLocalDescription(await pc.createAnswer()); await gatherIce(pc);
  return { pc, code: enc(pc.localDescription) };
}
// Hub side: accept the joiner's answer → connected.
export async function hubAccept(pc, answerCode) { await pc.setRemoteDescription(dec(answerCode)); }
