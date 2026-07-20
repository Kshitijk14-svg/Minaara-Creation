/**
 * Delhivery fulfillment integration.
 *
 * Every export here degrades to a safe no-op when DELHIVERY_API_TOKEN isn't
 * configured, so the app (checkout, admin, etc.) works unaffected before the
 * client finishes Delhivery account setup.
 *
 * `pushOrderToDelhivery` and `applyIncomingStatusUpdate` are the two entry
 * points: the former is called once, right after a paid order is created;
 * the latter is the single shared handler for both the inbound webhook and
 * the polling cron fallback, so update/cache/email logic isn't duplicated.
 *
 * ⚠️ Delhivery's exact endpoint paths, request params, and response field
 * names below are based on general documentation knowledge and have NOT been
 * verified against a live account/sandbox. Every "parse this provider's
 * response" step is isolated into its own small `parse*`/`build*` function so
 * a field-name correction is a one-spot fix once real API access exists —
 * cross-check each against Delhivery's Seller Panel / API docs before go-live.
 */
import { db } from '@/db/index';
import { orders, orderItems, shippingAddresses, products } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { invalidateTags, CacheTags } from '@/lib/cache';
import { sendEmail, renderOrderShippedEmail, renderOutForDeliveryEmail, renderOrderDeliveredEmail, renderDeliveryIssueEmail } from '@/lib/email';
import { isSafeHttpUrl } from '@/lib/url-safety';
import type { OrderStatus } from '@/types/schema';

function apiBase(): string {
  return process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com';
}

export function isDelhiveryConfigured(): boolean {
  return !!process.env.DELHIVERY_API_TOKEN;
}

/**
 * Delhivery auth is a single static API token (unlike Shiprocket's
 * email/password → JWT flow), so there's no login call or token cache needed.
 */
function delhiveryFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Content-Type': 'application/json',
      Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
    },
  });
}

// ── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps Delhivery's status vocabulary onto our narrower OrderStatus enum.
 * Unrecognized statuses return null — caller records the raw string only,
 * skips the status transition and email.
 *
 * ⚠️ UNVERIFIED — seeded with plausible Delhivery status strings. Cross-check
 * against a real tracking/webhook payload once the account exists and adjust
 * this table if their wording differs.
 */
export function mapDelhiveryStatus(rawStatus: string): OrderStatus | null {
  const s = rawStatus.trim().toUpperCase();
  const table: Record<string, OrderStatus> = {
    'MANIFESTED': 'CONFIRMED',
    'NOT PICKED': 'PROCESSING',
    'PICKUP SCHEDULED': 'PROCESSING',
    'PICKED UP': 'SHIPPED',
    'DISPATCHED': 'SHIPPED',
    'IN TRANSIT': 'SHIPPED',
    'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
    'DELIVERED': 'DELIVERED',
    'CANCELED': 'CANCELLED',
    'CANCELLED': 'CANCELLED',
    'RTO': 'RTO_INITIATED',
    'RTO INITIATED': 'RTO_INITIATED',
    'RTO IN TRANSIT': 'RTO_INITIATED',
    'UNDELIVERED': 'RTO_INITIATED',
    'DTO': 'RTO_DELIVERED',
    'RTO DELIVERED': 'RTO_DELIVERED',
  };
  return table[s] ?? null;
}

// ── Shipping weight ──────────────────────────────────────────────────────────

/** Total parcel weight for a set of order/cart lines, in grams (falls back to a configured default per item when a product has no recorded weight). */
export async function getItemsWeightGrams(items: Array<{ productId: string | null | undefined; quantity: number }>): Promise<number> {
  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
  const weightMap = new Map<string, number | null>();
  if (productIds.length > 0) {
    const rows = await db.select({ id: products.id, weightGrams: products.weightGrams })
      .from(products).where(inArray(products.id, productIds));
    for (const r of rows) weightMap.set(r.id, r.weightGrams);
  }

  const defaultItemWeightGrams = Number(process.env.DELHIVERY_DEFAULT_ITEM_WEIGHT_GRAMS || 300);
  return items.reduce((sum, item) => {
    const grams = (item.productId && weightMap.get(item.productId)) || defaultItemWeightGrams;
    return sum + grams * item.quantity;
  }, 0);
}

// ── Shipping rate lookup ─────────────────────────────────────────────────────

const FLAT_SHIPPING_INR = 150;
const FREE_SHIPPING_THRESHOLD_INR = 2000;

export interface ShippingRateResult {
  shippingINR: number;
  source: 'delhivery' | 'flat';
}

/**
 * ⚠️ UNVERIFIED endpoint shape — Delhivery's "Invoice Charges" rate
 * calculator is typically `GET /api/kinko/v1/invoice/charges/.json` with
 * origin/destination pincode, weight (grams), mode, and payment-type query
 * params, returning an array with a total-charge field. Confirm exact param
 * names and the charge field name against real docs/sandbox before go-live.
 */
function parseInvoiceChargesResponse(data: any): number | null {
  const entry = Array.isArray(data) ? data[0] : data;
  const charge = Number(entry?.total_amount ?? entry?.charge ?? entry?.gross_amount);
  return Number.isFinite(charge) ? charge : null;
}

/**
 * Real, location-based delivery charge via Delhivery's invoice-charges API.
 * Falls back to the flat ₹150 rate (free ≥ ₹2,000) whenever Delhivery isn't
 * configured, the pickup pincode is missing, or the API call fails for any
 * reason — a shipping quote must never block checkout.
 */
export async function getShippingRateINR(params: { pincode: string; subtotalINR: number; weightGrams: number }): Promise<ShippingRateResult> {
  const { pincode, subtotalINR, weightGrams } = params;
  if (subtotalINR >= FREE_SHIPPING_THRESHOLD_INR || subtotalINR === 0) {
    return { shippingINR: 0, source: 'flat' };
  }

  const flatFallback: ShippingRateResult = { shippingINR: FLAT_SHIPPING_INR, source: 'flat' };
  const pickupPincode = process.env.DELHIVERY_PICKUP_PINCODE;
  if (!isDelhiveryConfigured() || !pickupPincode) return flatFallback;

  try {
    const qs = new URLSearchParams({
      o_pin: pickupPincode,
      d_pin: pincode,
      cgm: String(Math.max(weightGrams, 1)),
      md: 'S',
      ss: 'Delivered',
      pt: 'Pre-paid',
    });
    const res = await delhiveryFetch(`/api/kinko/v1/invoice/charges/.json?${qs.toString()}`);
    if (!res.ok) return flatFallback;

    const data = await res.json();
    const charge = parseInvoiceChargesResponse(data);
    if (charge === null) return flatFallback;

    return { shippingINR: Math.ceil(charge), source: 'delhivery' };
  } catch (err) {
    console.error('[delhivery] rate lookup failed:', err);
    return flatFallback;
  }
}

// ── Push order to Delhivery ──────────────────────────────────────────────────

/**
 * ⚠️ UNVERIFIED body shape — Delhivery's `cmu/create.json` shipment-creation
 * endpoint is commonly documented as expecting a form-encoded body
 * (`format=json&data=<url-encoded JSON>`) rather than a raw JSON POST body.
 * Isolated here so it's a one-spot fix if the real API expects something else.
 */
function buildCreateShipmentBody(payload: Record<string, unknown>): { body: string; headers: Record<string, string> } {
  const data = JSON.stringify({ shipments: [payload], pickup_location: { name: process.env.DELHIVERY_PICKUP_LOCATION } });
  const body = new URLSearchParams({ format: 'json', data }).toString();
  return { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
}

/**
 * ⚠️ UNVERIFIED response shape. Structural note: Delhivery's create-shipment
 * response typically returns the AWB/waybill directly (unlike Shiprocket's
 * two-tier order_id/shipment_id) — so it's stored straight into `awbNumber`.
 * `delhiveryShipmentId` is populated only if a secondary reference id is
 * present in the response (e.g. `refnum`), else left null.
 */
function parseCreateShipmentResponse(data: any): { awb: string | null; shipmentRef: string | null; error: string | null } {
  const packet = data?.packages?.[0] ?? data?.package ?? data;
  if (packet?.status === false || packet?.remarks?.length) {
    return { awb: null, shipmentRef: null, error: JSON.stringify(packet?.remarks ?? data) };
  }
  const awb = packet?.waybill ?? packet?.awb ?? null;
  const shipmentRef = packet?.refnum ?? null;
  return { awb: awb ? String(awb) : null, shipmentRef: shipmentRef ? String(shipmentRef) : null, error: awb ? null : JSON.stringify(data) };
}

export async function pushOrderToDelhivery(orderId: string): Promise<void> {
  if (!isDelhiveryConfigured()) {
    console.log(`[delhivery] not configured, skipping push for order ${orderId}`);
    return;
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    const [items, [address]] = await Promise.all([
      db.select({
        title: orderItems.title, size: orderItems.size, quantity: orderItems.quantity,
        priceINR: orderItems.priceINR, variantId: orderItems.variantId, productId: orderItems.productId,
      }).from(orderItems).where(eq(orderItems.orderId, orderId)),
      db.select().from(shippingAddresses).where(eq(shippingAddresses.orderId, orderId)).limit(1),
    ]);
    if (!address) throw new Error('Order has no shipping address');

    const totalWeightGrams = await getItemsWeightGrams(items);

    const payload = {
      order: order.orderNumber,
      order_date: order.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      name: address.fullName,
      add: `${address.line1}${address.line2 ? `, ${address.line2}` : ''}`,
      city: address.city,
      pin: address.pincode,
      state: address.state,
      country: address.country || 'India',
      phone: order.customerPhone,
      products_desc: items.map((item) => item.title).join(', '),
      payment_mode: 'Prepaid',
      total_amount: order.totalAmountINR,
      weight: totalWeightGrams,
      shipment_length: Number(process.env.DELHIVERY_DEFAULT_BOX_LENGTH_CM || 30),
      shipment_width: Number(process.env.DELHIVERY_DEFAULT_BOX_BREADTH_CM || 25),
      shipment_height: Number(process.env.DELHIVERY_DEFAULT_BOX_HEIGHT_CM || 5),
    };

    const { body, headers } = buildCreateShipmentBody(payload);
    const res = await delhiveryFetch('/api/cmu/create.json', { method: 'POST', body, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(`Delhivery order create failed: ${res.status} ${JSON.stringify(data)}`);

    const { awb, shipmentRef, error } = parseCreateShipmentResponse(data);
    if (error && !awb) throw new Error(`Delhivery order create failed: ${error}`);

    // Delhivery is waybill-centric (no separate "order id" the way Shiprocket has
    // order_id + shipment_id) — the AWB doubles as our lookup key for incoming
    // status updates. Revisit if Delhivery's real response includes a distinct id.
    await db.update(orders).set({
      delhiveryOrderId: awb,
      delhiveryShipmentId: shipmentRef,
      awbNumber: awb,
      delhiveryPushError: null,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    const tags = [CacheTags.orderSingle(orderId), CacheTags.orders];
    if (order.userId) tags.push(CacheTags.ordersByUser(order.userId));
    await invalidateTags(tags);

    console.log(`[delhivery] pushed order ${order.orderNumber} -> delhivery waybill ${awb}`);
  } catch (err: any) {
    console.error(`[delhivery] push failed for order ${orderId}:`, err);
    await db.update(orders).set({
      delhiveryPushError: String(err?.message || err),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId)).catch((e) => console.error('[delhivery] failed to record push error:', e));
  }
}

// ── Tracking lookup (used by the cron poller) ────────────────────────────────

export interface TrackingResult {
  rawStatus: string;
  courierName?: string | null;
  trackingUrl?: string | null;
}

/**
 * ⚠️ UNVERIFIED response shape — Delhivery's tracking API is typically
 * `GET /api/v1/packages/json/?waybill=<AWB>` returning a `ShipmentData` array
 * with a nested `Shipment.Status.Status` field and a status history.
 */
function parseTrackingResponse(data: any): TrackingResult | null {
  const shipment = data?.ShipmentData?.[0]?.Shipment;
  const rawStatus = shipment?.Status?.Status;
  if (!rawStatus) return null;
  return {
    rawStatus: String(rawStatus),
    courierName: 'Delhivery',
    trackingUrl: shipment?.AWB ? `https://www.delhivery.com/track/package/${shipment.AWB}` : null,
  };
}

/** Looks up live tracking for one AWB. Returns null on any failure (logged, not thrown). */
export async function trackShipmentByAwb(awb: string): Promise<TrackingResult | null> {
  try {
    const res = await delhiveryFetch(`/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`);
    if (!res.ok) throw new Error(`tracking lookup failed: ${res.status}`);
    const data = await res.json();
    return parseTrackingResponse(data);
  } catch (err) {
    console.error(`[delhivery] tracking lookup failed for AWB ${awb}:`, err);
    return null;
  }
}

// ── Apply an incoming status update (shared by webhook + cron) ──────────────

export interface IncomingStatusUpdate {
  delhiveryOrderId?: string | null;
  orderNumber?: string | null;
  rawStatus: string;
  awb?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
}

export async function applyIncomingStatusUpdate(input: IncomingStatusUpdate): Promise<void> {
  const { delhiveryOrderId, orderNumber, rawStatus, awb, courierName } = input;
  // Reject non-http(s) schemes (javascript:, data:, etc.) before this can ever
  // reach a rendered <a href> in the admin panel, customer profile, or emails.
  const trackingUrl = isSafeHttpUrl(input.trackingUrl) ? input.trackingUrl : null;

  let order;
  if (delhiveryOrderId) {
    [order] = await db.select().from(orders).where(eq(orders.delhiveryOrderId, delhiveryOrderId)).limit(1);
  }
  if (!order && orderNumber) {
    [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  }
  if (!order) {
    console.warn(`[delhivery] status update for unknown order (delhiveryOrderId=${delhiveryOrderId}, orderNumber=${orderNumber})`);
    return;
  }

  const newStatus = mapDelhiveryStatus(rawStatus);
  const newAwb = awb || order.awbNumber;
  const awbIsNew = !!awb && awb !== order.awbNumber;
  const statusChanged = !!newStatus && newStatus !== order.status;

  if (!statusChanged && !awbIsNew) {
    // No meaningful transition — still record the raw status for support/debugging.
    await db.update(orders).set({ delhiveryStatus: rawStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
    return;
  }

  const now = new Date();
  await db.update(orders).set({
    status: newStatus ?? order.status,
    delhiveryStatus: rawStatus,
    awbNumber: newAwb,
    courierName: courierName || order.courierName,
    trackingUrl: trackingUrl || order.trackingUrl,
    shippedAt: newStatus === 'SHIPPED' && !order.shippedAt ? now : order.shippedAt,
    deliveredAt: newStatus === 'DELIVERED' ? now : order.deliveredAt,
    updatedAt: now,
  }).where(eq(orders.id, order.id));

  const tags = [CacheTags.orderSingle(order.id), CacheTags.orders];
  if (order.userId) tags.push(CacheTags.ordersByUser(order.userId));
  await invalidateTags(tags);

  if (!statusChanged) return;

  const emailOrder = {
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    awbNumber: newAwb,
    courierName: courierName || order.courierName,
    trackingUrl: trackingUrl || order.trackingUrl,
  };

  const send = (subject: string, html: string) =>
    sendEmail({ to: emailOrder.customerEmail, subject, html }).catch((err) =>
      console.error(`[delhivery] email send failed for order ${order.orderNumber}:`, err));

  switch (newStatus) {
    case 'SHIPPED':
      send(`Your Order Has Shipped — ${order.orderNumber} | Minara Creation`, renderOrderShippedEmail(emailOrder));
      break;
    case 'OUT_FOR_DELIVERY':
      send(`Out for Delivery Today — ${order.orderNumber} | Minara Creation`, renderOutForDeliveryEmail(emailOrder));
      break;
    case 'DELIVERED':
      send(`Delivered ✓ — ${order.orderNumber} | Minara Creation`, renderOrderDeliveredEmail(emailOrder));
      break;
    case 'RTO_INITIATED':
      send(`Delivery Issue — ${order.orderNumber} | Minara Creation`, renderDeliveryIssueEmail(emailOrder));
      break;
    default:
      break;
  }
}
