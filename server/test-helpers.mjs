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

/**
 * A NAMED member of staff. The shared venue code can run a night but cannot
 * approve money or vouch for anybody, so anything testing those needs a person
 * with a name on the rota rather than a code taped to the till.
 */
export async function namedStaff(call, venueToken, name = 'Kenya', role = 'host') {
  const inv = await call('POST', '/staff/invite', { name, role }, venueToken);
  const code = inv?.body?.code ?? inv?.code;
  const claimed = await call('POST', '/auth/staff/claim', { code });
  return claimed?.body?.token ?? claimed?.token;
}

/**
 * A sign-in code for somebody who is ALREADY a member.
 *
 * /auth/member/start deliberately refuses to hand a code back for a contact
 * that belongs to an existing member: echoing one to whoever typed the number
 * is account takeover, and until a venue can actually send mail there is no
 * safe way to do it over a wire. The safe way is a named member of staff,
 * looking at the person, issuing one — which is what this is.
 *
 * Suites that sign a member in twice have to go this way, and two of them did
 * not: they created a member over the API and then asked for a fresh code as
 * if they were a stranger, which stopped working the day that guard went in.
 * Both sat outside the gate, so both failed silently for weeks.
 */
export async function doorSignInCode(call, namedStaffToken, contact) {
  const r = await call('POST', '/staff/signin-code', { contact }, namedStaffToken);
  return r?.body?.code ?? r?.code;
}
