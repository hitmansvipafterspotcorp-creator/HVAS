// Shared bits for the server suites.
//
// Signing in is not membership: a member has to agree to the covenant, say what
// they do, and choose a programme before the venue lets them do anything. Every
// suite that plays a game or spends money therefore has to get its members
// through the door first.
//
// Doing that inline in twenty files would mean twenty chances to write it
// slightly differently, and a suite that quietly skips a step would pass while
// testing something the venue does not actually allow.
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

/**
 * Walk a signed-in member through onboarding.
 *
 * `call` is the suite's own client, in its usual (method, path, body, token)
 * shape. Returns the member's accepted state so a caller can assert on it.
 */
export async function onboard(call, token, { role = 'PATRON', program = 'CORE', tier = 'Monthly' } = {}) {
  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, token);
  await call('POST', '/me/role', { role }, token);
  // CORE is not a programme id — the suites do not care which one, only that a
  // member has stood behind something, so default to the housing programme
  // rather than inventing an id that would fail silently.
  await call('POST', '/me/program', { program: program === 'CORE' ? 'HOUSING' : program }, token);
  // Dues are the fourth and last step of joining. A suite can pass tier:null to
  // get a member who has done everything EXCEPT take a membership, which is the
  // state the sign-up screen has to handle and the door has to refuse.
  if (tier) await call('POST', '/membership/purchase', { tier, payment: 'card' }, token);
  return (await call('GET', '/onboarding', null, token)).body;
}
