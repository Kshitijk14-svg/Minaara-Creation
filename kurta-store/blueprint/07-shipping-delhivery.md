# 07 — Shipping & Fulfillment (Delhivery)

Build the courier integration in one isolated module, `src/lib/delhivery.ts`, so every export degrades to a safe no-op when the courier isn't configured — checkout, admin, and everything else must keep working before the account/warehouse setup is finished. Depends on `orders`/`order_items`/`shipping_addresses`/`products` (file 02), `CacheTags`/`invalidateTags` (file 08), and the email templates (file 08).

> If you integrate a different courier, keep this file's *shape* (two entry points, isolated parse/build functions, graceful degradation, plain-English error translation) — only the endpoint paths and field names change.

## Configuration gate

```ts
export function isDelhiveryConfigured(): boolean {
  return !!process.env.DELHIVERY_API_TOKEN;
}
```
Auth is a single static bearer token (`Authorization: Token <DELHIVERY_API_TOKEN>`) — no login call, no token refresh/cache needed, unlike couriers with an email/password → JWT flow.

## Shipping rate lookup

```ts
export async function getShippingRateINR(params: {
  pincode: string; subtotalINR: number; weightGrams: number; paymentMethod?: 'RAZORPAY' | 'COD';
}): Promise<{ shippingINR: number; source: 'delhivery' | 'flat' }>
```
Free above a threshold (e.g. ₹2000), else attempt the courier's real invoice-charges API (origin pincode from `DELHIVERY_PICKUP_PINCODE`, weight in grams, payment type). **Wrap the entire external call in try/catch and fall back to a flat rate (e.g. ₹150) on any failure, missing config, or missing pickup pincode** — a shipping quote must never block checkout. Sum per-item weight via `getItemsWeightGrams()`, which reads each `products.weightGrams` and falls back to a configured default (`DELHIVERY_DEFAULT_ITEM_WEIGHT_GRAMS`) for products with no recorded weight.

## COD serviceability check

```ts
export async function checkCodServiceability(pincode: string): Promise<{ codAvailable: boolean; source: 'delhivery'|'unconfigured'|'error' }>
```
Defaults to `codAvailable: false` on **any** misconfiguration or failure — never block checkout; the caller simply hides the COD option and falls back to prepaid-only.

## Pickup location — fail loud, not silent

The pickup-location env var (`DELHIVERY_PICKUP_LOCATION`) must **exactly match** (case- and whitespace-sensitive) a warehouse name registered in the courier's seller panel. When building the create-shipment request body:

```ts
function buildCreateShipmentBody(payload: Record<string, unknown>) {
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION?.trim();
  if (!pickupLocation) {
    // An unset/blank var would otherwise silently serialize to
    // `pickup_location: {}` (JSON.stringify drops name: undefined), which the
    // courier rejects with the SAME opaque "warehouse does not exist" error as
    // a genuine name mismatch. Fail loud here instead so this misconfiguration
    // class is actually diagnosable from the logs.
    throw new Error('DELHIVERY_PICKUP_LOCATION is not set — must exactly match a registered warehouse name');
  }
  // ...build the real payload
}
```
This is a general lesson, not Delhivery-specific: **any time an optional-looking config value gets silently dropped by `JSON.stringify` when undefined, and the resulting malformed payload produces the same generic error as a different misconfiguration, add an explicit presence check that fails with a distinguishing message.**

## Push order to courier

```ts
export async function pushOrderToDelhivery(orderId: string): Promise<void>
```
Called once, non-blocking, right after a paid order is created (from the payment-verify route, file 05). If the courier isn't configured, log and return — never throw into the caller. Otherwise:
1. Load the order, its items, its shipping address.
2. Build the shipment payload (name, address, phone, product description, payment mode, COD amount if applicable — **the declared COD amount excludes the advance already captured online**, i.e. `cod_amount = totalAmountINR - codAdvanceINR`, since the courier only needs to know what to actually collect in cash).
3. POST to the courier's create-shipment endpoint.
4. On success: store the returned tracking id(s) on the order row, clear any previous `delhiveryPushError`, invalidate the order's cache tags.
5. **On failure**: catch everything, translate the raw error into a plain-English message (see below), persist it to `orders.delhiveryPushError`, and log both the translated message and the raw courier string — this whole function must never throw out to its caller, since it's invoked fire-and-forget.

### Duplicate-push blocking

Before allowing a manual admin retry-push (`POST /api/admin/delhivery/push`), **check `orders.delhiveryOrderId` first and skip calling the courier entirely if it's already set**:
```ts
if (existing.delhiveryOrderId) {
  return NextResponse.json({
    alreadyPushed: true,
    message: `Order ${existing.orderNumber} was already sent (AWB ${existing.delhiveryOrderId}). No new shipment was created.`,
  });
}
```
Without this check, retrying a push for an order the courier already accepted would mint a second waybill for the same physical parcel.

### Plain-English error translation

Courier APIs write error strings for an integrator reading their docs, not for the person clicking "Push to Delhivery" in the admin panel. Translate the handful of rejection patterns you'll actually see into actionable messages, and preserve the raw string separately for server logs:

```ts
class DelhiveryPushError extends Error {
  constructor(message: string, readonly raw: string) { super(message); this.name = 'DelhiveryPushError'; }
}

function createShipmentError(raw: string, orderNumber: string): DelhiveryPushError {
  const pickupLocation = process.env.DELHIVERY_PICKUP_LOCATION;
  if (/ClientWarehouse matching query does not exist/i.test(raw)) {
    return new DelhiveryPushError(
      `Pickup location "${pickupLocation}" is not registered on this account. Copy the warehouse name exactly from the seller panel (case-sensitive) and update the env var.`, raw);
  }
  if (/already\s*exist|duplicate/i.test(raw)) {
    return new DelhiveryPushError(`A shipment for order ${orderNumber} already exists — no new one was created.`, raw);
  }
  if (/unauthor|authentication|invalid token|forbidden/i.test(raw)) {
    return new DelhiveryPushError('The courier rejected the API token — it may be revoked or pointed at the wrong environment.', raw);
  }
  if (/serviceab|not\s*servic/i.test(raw)) {
    return new DelhiveryPushError(`The courier does not deliver to this pincode from the "${pickupLocation}" pickup location.`, raw);
  }
  return new DelhiveryPushError(`Shipment rejected: ${raw}`, raw);
}
```
`message` (translated) is what's persisted to `orders.delhiveryPushError` and shown verbatim in the admin UI; `raw` rides along on the error object for the server log, so an unrecognized rejection is still diagnosable without a DB session.

## Status sync — webhook + polling fallback, one shared handler

Build a single function, `applyIncomingStatusUpdate(input)`, used by **both**:
- `POST /api/webhooks/delhivery` — inbound push webhook. No session, no internal-key — this is an open-internet caller — so authenticate with a **constant-time shared-secret header compare** (`safeEqual`, configurable header name via `DELHIVERY_WEBHOOK_HEADER_NAME`). **Always return HTTP 200** past the auth check (even on a processing error) so the courier doesn't retry-storm a webhook it considers delivered.
- `GET /api/cron/delhivery-sync` — polling fallback (many couriers' self-serve/lower tiers don't reliably offer a configurable webhook — build the polling cron as the guaranteed-to-work path and treat the webhook as a bonus).

`applyIncomingStatusUpdate` logic:
1. Look up the order by courier-side id, falling back to your own `orderNumber` if that's what the payload provides.
2. Map the courier's raw status string onto your app's `orderStatus` enum via a lookup table (e.g. `MANIFESTED → CONFIRMED`, `PICKED UP`/`DISPATCHED`/`IN TRANSIT → SHIPPED`, `OUT FOR DELIVERY`, `DELIVERED`, RTO variants `→ RTO_INITIATED`/`RTO_DELIVERED`). **Unrecognized raw statuses store the raw string only and skip the status transition/email** — don't guess.
3. If nothing actually changed (same status, no new AWB), just persist the raw status string for support visibility and return early — no email, no cache invalidation.
4. On a real transition: update the order row (status, raw status, AWB, courier name, tracking URL, `shippedAt`/`deliveredAt` timestamps as appropriate), invalidate order cache tags, and fire the matching transactional email (shipped/out-for-delivery/delivered/delivery-issue) **non-blocking** (`.catch()`-logged).
5. **Sanitize any courier-sourced tracking URL before it can reach an `<a href>`** anywhere (admin UI, customer profile, email template):
   ```ts
   export function isSafeHttpUrl(url?: string | null): url is string {
     if (!url) return false;
     try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
   }
   ```
   This closes off `javascript:`/`data:` URI injection via a compromised or malformed webhook payload.

## Verification

- With `DELHIVERY_API_TOKEN` unset, run through checkout end-to-end — the app must work identically (flat shipping rate, COD hidden or defaulting to unavailable, no push attempted, no error surfaced to the customer).
- Push the same order twice via the admin retry button — the second call returns `alreadyPushed: true` without any outbound courier call.
- Send a malformed/garbage webhook payload — the route still returns 200 and logs the parse failure, rather than 500ing (which would trigger courier retry-storms).
- Feed a tracking URL starting with `javascript:` through `applyIncomingStatusUpdate` — confirm it's dropped (stored as `null`) rather than persisted.
