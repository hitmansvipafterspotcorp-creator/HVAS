# PayPal Subscriptions — pay HVAS memberships to your PayPal

Membership tiers bill as **PayPal subscription plans** (recurring), and the money
goes to **your** PayPal account. The app is already wired — you just create the
plans in PayPal and paste the IDs into the build config.

## 1. Get your Client ID
1. Sign in at **developer.paypal.com** with your PayPal **Business** account.
2. **Apps & Credentials → Live → Create App.**
3. Copy the app's **Client ID** (the live one, not sandbox).

## 2. Create one subscription plan per tier
You need a **product**, then a **plan** per tier. Easiest is the REST API
(replace `ACCESS_TOKEN` from *Get token*, and set your amounts / cycles):

```bash
# a) product (once)
curl -v POST https://api-m.paypal.com/v1/catalogs/products \
 -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" \
 -d '{ "name": "HVAS Membership", "type": "SERVICE", "category": "NIGHTCLUBS" }'

# b) a plan (repeat per tier — change name, interval, and price)
curl -v POST https://api-m.paypal.com/v1/billing/plans \
 -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" \
 -d '{
   "product_id": "PROD-XXXX",
   "name": "HVAS Monthly",
   "billing_cycles": [{
     "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
     "tenure_type": "REGULAR", "sequence": 1, "total_cycles": 0,
     "pricing_scheme": { "fixed_price": { "value": "300", "currency_code": "USD" } }
   }],
   "payment_preferences": { "auto_bill_outstanding": true }
 }'
```

Suggested tier → billing cycle (adjust to taste):

| Tier | Price | Interval |
|---|---|---|
| Daily | $20 | DAY / 1 |
| Weekly | $100 | WEEK / 1 |
| Monthly | $300 | MONTH / 1 |
| Yearly | $1850 | YEAR / 1 |
| VIP | $5000 | YEAR / 1 |

Each plan returns an id like `P-5ML4271244454362WXNWU5NQ`.

> Prefer clicking? developer.paypal.com → **Subscriptions** does the same via UI.

## 3. Put the IDs in the build config
Copy `.env.example` to `.env` and fill in:

```
VITE_PAYPAL_CLIENT_ID=your_live_client_id
VITE_PAYPAL_PLAN_DAILY=P-...
VITE_PAYPAL_PLAN_WEEKLY=P-...
VITE_PAYPAL_PLAN_MONTHLY=P-...
VITE_PAYPAL_PLAN_YEARLY=P-...
VITE_PAYPAL_PLAN_VIP=P-...
```

Then `npm run build` and redeploy. On the buy screen, choosing **PayPal** now
shows the real PayPal subscribe button for any tier that has a plan id; tiers
left blank keep the demo button. On approval the membership activates and (if a
backend is configured) mirrors to the server.

## Notes
- A blank `VITE_PAYPAL_CLIENT_ID` = the whole app stays demo (no PayPal), so the
  current live build is unaffected until you add these.
- For **verified** activation (only grant membership after PayPal confirms the
  subscription), add a PayPal **webhook** to the backend that flips membership
  status — a follow-up once the backend is deployed. The current flow activates
  on the browser `onApprove`.
