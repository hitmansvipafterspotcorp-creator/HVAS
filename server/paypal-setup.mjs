// One-shot PayPal setup — creates the HVAS product + one subscription plan per
// membership tier, then prints the config lines to paste into the app's .env.
// Automates the "Create product" + "Create subscription plan" steps so you
// don't hand-write curl. Runs on YOUR machine with YOUR credentials.
//
//   PAYPAL_CLIENT_ID=... PAYPAL_SECRET=... [PAYPAL_ENV=live|sandbox] \
//     node paypal-setup.mjs
//
// Zero dependencies (Node 22 global fetch). Your secret never leaves your shell.
const CLIENT = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_SECRET;
const ENV = (process.env.PAYPAL_ENV || 'live').toLowerCase();
const BASE = ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

if (!CLIENT || !SECRET) {
  console.error('Set PAYPAL_CLIENT_ID and PAYPAL_SECRET in your environment first.');
  process.exit(1);
}

// Tier → price + billing cycle. Adjust intervals if you want (DAY/WEEK/MONTH/YEAR).
const TIERS = [
  { key: 'DAILY', name: 'HVAS Daily', price: '20', unit: 'DAY', count: 1 },
  { key: 'WEEKLY', name: 'HVAS Weekly', price: '100', unit: 'WEEK', count: 1 },
  { key: 'MONTHLY', name: 'HVAS Monthly', price: '300', unit: 'MONTH', count: 1 },
  { key: 'YEARLY', name: 'HVAS Yearly', price: '1850', unit: 'YEAR', count: 1 },
  { key: 'VIP', name: 'HVAS VIP', price: '5000', unit: 'YEAR', count: 1 },
];

const api = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
};

// 1) access token
const auth = await fetch(`${BASE}/v1/oauth2/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials',
}).then((r) => r.json());
if (!auth.access_token) { console.error('Auth failed:', auth); process.exit(1); }
const token = auth.access_token;
console.error(`✓ authenticated (${ENV})`);

// 2) product
const product = await api('/v1/catalogs/products', {
  name: 'HVAS Membership', type: 'SERVICE', category: 'NIGHTCLUBS',
  description: 'HITMANS VIP After Spot membership',
});
console.error(`✓ product ${product.id}`);

// 3) one plan per tier
const out = { VITE_PAYPAL_CLIENT_ID: CLIENT };
for (const t of TIERS) {
  const plan = await api('/v1/billing/plans', {
    product_id: product.id,
    name: t.name,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: t.unit, interval_count: t.count },
      tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
      pricing_scheme: { fixed_price: { value: t.price, currency_code: 'USD' } },
    }],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 1 },
  });
  out[`VITE_PAYPAL_PLAN_${t.key}`] = plan.id;
  console.error(`✓ ${t.name} → ${plan.id}`);
}

// 4) print the .env block
console.log('\n# Paste into hitmans_vip_membership_app/.env then rebuild:');
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
