# 05 — Cart, Checkout & Payments

This is the highest-stakes subsystem: get the transaction boundaries wrong here and customers get charged for orders that don't exist, or two people buy the last unit of something. Depends on `products`/`product_size_variants`/`stock_reservations`/`orders`/`order_items`/`coupons`/`coupon_usages`/`counters` from file 02.

## 1. Client-side cart (`src/components/providers/CartProvider.tsx`)

Entirely client-side — **no server cart table for active carts**. React Context + `useReducer` with actions `ADD_ITEM` / `REMOVE_ITEM` / `UPDATE_QUANTITY` / `CLEAR` / `HYDRATE`.

- `CartItem = { productId, variantId, title, size, imageUrl, quantity, priceINR }`.
- Persist to `localStorage` (key e.g. `myapp_cart`) on every change; hydrate on mount inside a `try/catch` (a corrupt/foreign localStorage value should just start an empty cart, never crash the page).
- Add/update merges by the `(productId, size)` pair. Setting quantity to `≤ 0` via `UPDATE_QUANTITY` removes the line rather than leaving a zero-quantity row.
- **Abandoned-cart capture**: on `window.beforeunload`, fire `navigator.sendBeacon('/api/cart/sync', new Blob([JSON.stringify({items})], {type:'application/json'}))` if the cart is non-empty. `sendBeacon` is fire-and-forget and survives page teardown, unlike a normal `fetch`. This feeds an abandoned-cart reminder email cron (file 08) — only meaningful for logged-in users, since the sync route needs a way to reach the customer later.
- Memoize the context value (`useMemo`) so consumers (navbar badge, product cards) don't re-render on every provider render — the callbacks are already stable via `useCallback`.

**Stock validation against the cart is advisory, not authoritative**: the cart page periodically `POST`s all cart variant ids to `/api/products/stock` (file 04), builds a live stock map, auto-caps any line exceeding real stock, and disables further quantity increments at the ceiling. The actual enforcement happens server-side inside order creation (§4 below) — never trust the client's idea of "is this in stock."

## 2. The last-unit double-charge race — stock reservations

**The problem this solves**: if you only check stock at the moment you mint a payment-gateway order (read, don't reserve), two buyers racing for the last unit can both get charged by the gateway while only one order can ever be recorded.

**The fix**: reserve stock atomically *before* minting the gateway order, using the `stock_reservations` table (file 02) with a 15-minute TTL.

### `src/app/api/payment/create-razorpay-order/route.ts`

1. Preflight `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` presence — return a clean `503 { code: 'GATEWAY_NOT_CONFIGURED' }` instead of letting the SDK throw an opaque "key_id is mandatory" error.
2. Validate the request body (`items`, `couponCode?`, `pincode`, `paymentMethod: 'RAZORPAY' | 'COD'`) with `zod`.
3. Re-derive `subtotalINR` **from the database**, not from client-sent prices — look up each `productId`'s `priceINR` and each `variantId`'s `stock`, reject with 409 if a product is inactive/deleted or a variant doesn't exist.
4. If a coupon code is given: require a logged-in session (`getSessionUserId()`) — reject guests explicitly with a 422 "Sign in to use a coupon" (see the "guest-coupon trap" note below) — then re-validate active/not-expired/under-limits/min-order-amount and compute the discount from DB state.
5. Get the shipping rate (file 07's `getShippingRateINR`) and, for COD, re-check pincode serviceability server-side even though the client already checked once (trust-but-verify, same posture as the coupon/stock re-validation).
6. Compute `amountPaise`: for COD, only `COD_ADVANCE_INR` (a small fixed advance, e.g. ₹200 — see `src/lib/payment-constants.ts`, kept in its own zero-import file so it's safe to pull into client components without dragging in DB imports) is charged online; for prepaid, the full total. Reject sub-₹1 (`MIN_CHARGEABLE_PAISE = 100`) online charges with a clear message — payment gateways typically reject these with an opaque error otherwise.
7. **Inside one `db.transaction`**:
   - `SELECT ... FOR UPDATE` lock the variant rows for every item in the cart.
   - Sum currently-unexpired reservations per variant (`WHERE expiresAt > NOW()`), subtract from real stock to get "available." If any item's available quantity is insufficient, throw a distinguishable `StockUnavailableError` (mapped to HTTP 409) — **do this check before calling the payment gateway**, not after.
   - Only once availability is confirmed: call `razorpay.orders.create({amount, currency: 'INR', receipt, notes})`. Stash `shippingINR` and (for COD) `paymentMethod`/`codAdvanceINR` in the gateway order's own `notes` field — this lets the verify step (§5) read back the authoritative shipping charge and payment method from Razorpay's own record instead of trusting the client or re-deriving it, which could disagree by the time verify runs.
   - Insert one `stock_reservations` row per item, `expiresAt = now + 15min`, tied to the new `razorpayOrderId`.
8. Return `{razorpayOrderId, amount, currency, keyId, subtotalINR, discountINR, shippingINR, totalINR, paymentMethod, codAdvanceINR?}` to the client for the Razorpay checkout widget.

## 3. Order number generation

Format: **`<PREFIX>-ddmmyy-N`** (e.g. `LBM-260726-0` in the source project — pick your own 2–4 letter prefix). `N` is a **single lifetime sequence starting at 0 that never resets** — it doubles as a running total-orders count, backed by the `counters` table row named `order_number`.

```ts
// ddmmyy on India's local calendar — deliberately NOT toISOString() (UTC), since
// IST is UTC+5:30 and an order placed 00:00–05:30 IST would otherwise be
// stamped with the previous day's date.
function istDatePart(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit',
  }).formatToParts(now);
  const part = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${part('day')}${part('month')}${part('year')}`;
}

// Must run INSIDE the order transaction: locks the counter row FOR UPDATE so
// concurrent checkouts serialize on it instead of both reading the same value
// and colliding on orderNumber's unique index. Because the bump is part of the
// transaction, a rolled-back order releases its number instead of burning a gap.
async function generateOrderNumber(tx, now: Date): Promise<string> {
  await tx.execute(sql`SELECT value FROM counters WHERE name = 'order_number' FOR UPDATE`);
  const [row] = await tx.select({value: counters.value}).from(counters).where(eq(counters.name, 'order_number')).limit(1);
  if (!row) throw new OrderError('COUNTER_MISSING', 'Order counter row is missing — seed it first');
  await tx.update(counters).set({value: row.value + 1}).where(eq(counters.name, 'order_number'));
  return `${PREFIX}-${istDatePart(now)}-${row.value}`;
}
```
Adapt the timezone to wherever your business actually operates, if not India.

## 4. `createOrder` — the single source of truth (`src/lib/orders.ts`)

Extract order creation into one function callable **in-process** (not over an internal HTTP hop) so both the payment-verify route and any future internal/admin creation path share identical logic. Everything runs inside **one `db.transaction`**:

0. **Idempotency guard**: if a `paymentGatewayId` is given, check it's not already attached to an existing order (`OrderError('DUPLICATE_PAYMENT')`, mapped → 409). The `orders.paymentGatewayId` unique index is the DB-level backstop for the same invariant.
1. `SELECT id, stock FROM product_size_variants WHERE id IN (...) FOR UPDATE` — pessimistic lock on every variant referenced by the order, preventing a concurrent race on the same units.
2. Validate every referenced product is `isActive` and not soft-deleted (`OrderError('PRODUCT_INACTIVE')`).
3. Validate stock ≥ requested quantity per item (`OrderError('INSUFFICIENT_STOCK')`, with a customer-facing message naming the product/size/available count).
4. If a coupon code is present: require `userId` (`OrderError('COUPON_REQUIRES_LOGIN')`), `SELECT ... FOR UPDATE` lock the coupon row, validate active/not-expired/under global `maxUses`/under `perUserLimit` (counted via `couponUsages`).
5. **Recompute totals entirely from DB state** — subtotal from `products.priceINR × quantity` (never client-sent prices), discount from the locked coupon row, shipping from `opts.shippingINR` if the caller supplied one (e.g. read back from the gateway) else a flat fallback rule (`subtotalINR >= 2000 ? 0 : 150`, tune to your market).
6. **Amount-binding guard**: if the caller passed `expectedAmountPaise` (the amount the gateway actually captured), the recomputed chargeable total — full total normally, or just `codAdvanceINR` for COD — **must equal it exactly** or throw `OrderError('AMOUNT_MISMATCH')` (mapped → 400). This is the mechanism that prevents price-tampering or a stale cart from ever recording an order that doesn't match what was actually paid.
7. Insert `orders`, `shippingAddresses` (address snapshot), `orderItems` (each row snapshotting `title`/`priceINR`/`imageUrl` **at time of purchase** — order history must never recompute from live product rows).
8. **Commit the stock hold**: if `opts.razorpayOrderId` was supplied, look up unexpired `stockReservations` rows for that gateway order id. For each cart item, if a matching reservation covers at least the requested quantity, decrement stock and delete the reservation row. If no reservation exists or it doesn't cover the quantity (expired mid-payment, or an internal/admin order with no reservation at all), fall back to a **guarded decrement**:
   ```ts
   const updated = await tx.update(productSizeVariants)
     .set({ stock: sql`stock - ${item.quantity}` })
     .where(and(eq(productSizeVariants.id, item.variantId), gte(productSizeVariants.stock, item.quantity)));
   if (updated.affectedRows === 0) throw new OrderError('CONCURRENT_INSUFFICIENT_STOCK', '...');
   ```
   Checking `affectedRows === 0` is what catches a stock change that slipped in between the earlier read and this write.
9. Record `couponUsages` and increment `coupons.usedCount` (guarded so it never exceeds `maxUses` even under a race).

Provide a `mapOrderError(err)` helper translating each `OrderError.code` to an HTTP status: `DUPLICATE_PAYMENT → 409`, `AMOUNT_MISMATCH → 400`, everything else (stock/coupon rule violations) `→ 422`. Non-`OrderError` throws are the caller's problem to turn into a 500.

## 5. Razorpay verify flow (`src/app/api/payment/verify/route.ts`)

1. Recompute the HMAC-SHA256 signature: `createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')`, compare against the client-supplied signature with `crypto.timingSafeEqual` (length-check first).
2. **Re-fetch the order from Razorpay's own API** (`razorpay.orders.fetch(razorpay_order_id)`) and confirm `status === 'paid'`. This re-fetch — not the client's payload — is the actual trust boundary: read `amount`, `notes.shippingINR`, `notes.paymentMethod`, `notes.codAdvanceINR` back from Razorpay's record.
3. Call `createOrder(orderPayload, { userId, paymentStatus: isCod ? 'COD_PENDING' : 'PAID', paymentGatewayId: razorpay_payment_id, paymentMethod, expectedAmountPaise, shippingINR, codAdvanceINR, razorpayOrderId })`.
4. **On `DUPLICATE_PAYMENT`** (double-submit of an already-verified payment): look up the existing order by `paymentGatewayId` and return it as a success response so the client still lands on the confirmation page, instead of erroring on a retry.
5. **On any other `OrderError`** (e.g. a stock reservation expired mid-payment, so `createOrder` can no longer honor it): the money is already captured but no order could be recorded — **auto-refund** via `razorpay.payments.refund(paymentId, {amount: expectedAmountPaise, speed: 'normal', notes: {reason: err.code}})` and tell the customer their payment was refunded. If the refund call itself fails, return a message pointing the customer at support with the payment id attached, and log it loudly (`REFUND_FAILED — needs manual refund`) — this is the one path that needs a human.
6. On success: invalidate order-related cache tags, send the order-confirmation email non-blocking (`.catch()`-logged, never awaited into the response), and push to the courier non-blocking (file 07) — a slow/failing email or courier push must never delay or fail the checkout response to the customer.

## 6. Cash on Delivery (COD)

Only `COD_ADVANCE_INR` (a small fixed amount) is charged online; the balance is collected as cash by the courier. `orders.codAdvanceINR` records the advance; `paymentStatus` becomes `'COD_PENDING'` instead of `'PAID'`. COD availability is re-validated server-side against courier pincode serviceability (file 07) both at gateway-order-creation time and implicitly via the amount-binding check in `createOrder`.

## 7. Coupons — closing the "guest-coupon trap"

A coupon must require a logged-in user **at every layer that touches it** — the pre-charge estimate route (`create-razorpay-order`) *and* the authoritative `createOrder` — because anything the estimate route allows through that `createOrder` later rejects means a customer got charged with no order recorded. Enforce identically in both places: active, not expired, under `maxUses`, under `perUserLimit` (via a `couponUsages` count keyed on `(couponId, userId)`), and `subtotalINR >= minOrderAmountINR`. `PERCENT` discounts cap at `maxDiscountINR` if set; `FIXED` discounts cap at the subtotal itself (never a negative total).

## Verification

- Simulate two near-simultaneous checkout attempts for the last unit of a variant (e.g. two parallel requests to `create-razorpay-order`) — exactly one should succeed with a minted Razorpay order; the other should get a clean 409, **before** any payment is attempted.
- Complete a real (test-mode) Razorpay checkout end to end; confirm the order appears with the correct `orderNumber` format and the stock reservation row is gone (converted into a real stock decrement).
- Manually expire a reservation (backdate `expiresAt`) then attempt to verify that payment — confirm `createOrder` rejects it and the route issues an automatic refund.
- Attempt to apply a coupon while logged out — rejected with a clear "sign in" message at both the estimate and verify stages.
- Place a COD order below the advance threshold — rejected before ever reaching the payment gateway.
