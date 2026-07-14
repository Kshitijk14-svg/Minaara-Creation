/**
 * Shiprocket fulfillment integration.
 *
 * Every export here degrades to a safe no-op when SHIPROCKET_EMAIL/PASSWORD
 * aren't configured, so the app (checkout, admin, etc.) works unaffected
 * before the client finishes Shiprocket account setup.
 *
 * `pushOrderToShiprocket` and `applyIncomingStatusUpdate` are the two entry
 * points: the former is called once, right after a paid order is created;
 * the latter is the single shared handler for both the inbound webhook and
 * the polling cron fallback, so update/cache/email logic isn't duplicated.
 */
import { db } from '@/db/index';
import { orders, orderItems, shippingAddresses, products } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { cacheGet, cacheSet, invalidateTags, CacheTags } from '@/lib/cache';
import { sendEmail, renderOrderShippedEmail, renderOutForDeliveryEmail, renderOrderDeliveredEmail, renderDeliveryIssueEmail } from '@/lib/email';
import type { OrderStatus } from '@/types/schema';

const TOKEN_CACHE_KEY = 'shiprocket:token';
const TOKEN_TTL_SECONDS = 9 * 24 * 60 * 60; // Shiprocket JWTs are valid ~10 days

let cachedToken: { token: string; expiresAt: number } | null = null;

function apiBase(): string {
  return process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
}

export function isShiprocketConfigured(): boolean {
  return !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

/** Logs in and caches the JWT (module-level + Redis, both best-effort). Re-logs-in on demand. */
async function login(): Promise<string> {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Shiprocket login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const token = data.token as string;
  if (!token) throw new Error('Shiprocket login response missing token');

  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 };
  await cacheSet(TOKEN_CACHE_KEY, token, [], TOKEN_TTL_SECONDS);
  return token;
}

export async function getShiprocketToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const fromCache = await cacheGet<string>(TOKEN_CACHE_KEY);
  if (fromCache) {
    cachedToken = { token: fromCache, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 };
    return fromCache;
  }

  return login();
}

/** Wraps an authenticated Shiprocket call, retrying once with a fresh token on 401. */
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getShiprocketToken();
  const doFetch = (t: string) => fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  });

  let res = await doFetch(token);
  if (res.status === 401) {
    const fresh = await login();
    res = await doFetch(fresh);
  }
  return res;
}

// ── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps Shiprocket's status vocabulary onto our narrower OrderStatus enum.
 * Unrecognized statuses return null — caller records the raw string only,
 * skips the status transition and email.
 *
 * NOTE: the exact status strings Shiprocket sends should be cross-checked
 * against a real webhook payload once the account exists — this is the one
 * place to adjust if their wording differs.
 */
export function mapShiprocketStatus(rawStatus: string): OrderStatus | null {
  const s = rawStatus.trim().toUpperCase();
  const table: Record<string, OrderStatus> = {
    'NEW': 'CONFIRMED',
    'INVOICED': 'PROCESSING',
    'READY TO SHIP': 'PROCESSING',
    'PICKUP SCHEDULED': 'PROCESSING',
    'PICKUP GENERATED': 'PROCESSING',
    'PICKUP QUEUED': 'PROCESSING',
    'PICKED UP': 'SHIPPED',
    'SHIPPED': 'SHIPPED',
    'IN TRANSIT': 'SHIPPED',
    'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
    'DELIVERED': 'DELIVERED',
    'CANCELED': 'CANCELLED',
    'CANCELLED': 'CANCELLED',
    'RTO INITIATED': 'RTO_INITIATED',
    'RTO IN TRANSIT': 'RTO_INITIATED',
    'UNDELIVERED': 'RTO_INITIATED',
    'RTO DELIVERED': 'RTO_DELIVERED',
  };
  return table[s] ?? null;
}

// ── Push order to Shiprocket ─────────────────────────────────────────────────

export async function pushOrderToShiprocket(orderId: string): Promise<void> {
  if (!isShiprocketConfigured()) {
    console.log(`[shiprocket] not configured, skipping push for order ${orderId}`);
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

    const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
    const weightMap = new Map<string, number | null>();
    if (productIds.length > 0) {
      const rows = await db.select({ id: products.id, weightGrams: products.weightGrams })
        .from(products).where(inArray(products.id, productIds));
      for (const r of rows) weightMap.set(r.id, r.weightGrams);
    }

    const defaultItemWeightGrams = Number(process.env.SHIPROCKET_DEFAULT_ITEM_WEIGHT_GRAMS || 300);
    const totalWeightGrams = items.reduce((sum, item) => {
      const grams = (item.productId && weightMap.get(item.productId)) || defaultItemWeightGrams;
      return sum + grams * item.quantity;
    }, 0);

    const [firstName, ...rest] = address.fullName.trim().split(' ');
    const payload = {
      order_id: order.orderNumber,
      order_date: order.createdAt.toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
      billing_customer_name: firstName || address.fullName,
      billing_last_name: rest.join(' '),
      billing_address: address.line1,
      billing_address_2: address.line2 || '',
      billing_city: address.city,
      billing_pincode: address.pincode,
      billing_state: address.state,
      billing_country: address.country || 'India',
      billing_email: order.customerEmail,
      billing_phone: order.customerPhone,
      shipping_is_billing: true,
      order_items: items.map((item) => ({
        name: item.title,
        sku: item.variantId || item.productId || item.title,
        units: item.quantity,
        selling_price: item.priceINR,
      })),
      payment_method: 'Prepaid',
      sub_total: order.totalAmountINR,
      length: Number(process.env.SHIPROCKET_DEFAULT_BOX_LENGTH_CM || 30),
      breadth: Number(process.env.SHIPROCKET_DEFAULT_BOX_BREADTH_CM || 25),
      height: Number(process.env.SHIPROCKET_DEFAULT_BOX_HEIGHT_CM || 5),
      weight: totalWeightGrams / 1000,
    };

    const res = await authedFetch('/orders/create/adhoc', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(`Shiprocket order create failed: ${res.status} ${JSON.stringify(data)}`);

    await db.update(orders).set({
      shiprocketOrderId: String(data.order_id ?? ''),
      shiprocketShipmentId: String(data.shipment_id ?? ''),
      shiprocketPushError: null,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    const tags = [CacheTags.orderSingle(orderId), CacheTags.orders];
    if (order.userId) tags.push(CacheTags.ordersByUser(order.userId));
    await invalidateTags(tags);

    console.log(`[shiprocket] pushed order ${order.orderNumber} -> shiprocket order ${data.order_id}`);
  } catch (err: any) {
    console.error(`[shiprocket] push failed for order ${orderId}:`, err);
    await db.update(orders).set({
      shiprocketPushError: String(err?.message || err),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId)).catch((e) => console.error('[shiprocket] failed to record push error:', e));
  }
}

// ── Tracking lookup (used by the cron poller) ────────────────────────────────

export interface TrackingResult {
  rawStatus: string;
  courierName?: string | null;
  trackingUrl?: string | null;
}

/** Looks up live tracking for one AWB. Returns null on any failure (logged, not thrown). */
export async function trackShipmentByAwb(awb: string): Promise<TrackingResult | null> {
  try {
    const res = await authedFetch(`/courier/track/awb/${encodeURIComponent(awb)}`);
    if (!res.ok) throw new Error(`tracking lookup failed: ${res.status}`);
    const data = await res.json();
    const track = data?.tracking_data;
    const rawStatus = track?.shipment_track?.[0]?.current_status || track?.shipment_status;
    if (!rawStatus) return null;
    return {
      rawStatus: String(rawStatus),
      courierName: track?.shipment_track?.[0]?.courier_name ?? null,
      trackingUrl: track?.track_url ?? null,
    };
  } catch (err) {
    console.error(`[shiprocket] tracking lookup failed for AWB ${awb}:`, err);
    return null;
  }
}

// ── Apply an incoming status update (shared by webhook + cron) ──────────────

export interface IncomingStatusUpdate {
  shiprocketOrderId?: string | null;
  orderNumber?: string | null;
  rawStatus: string;
  awb?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
}

export async function applyIncomingStatusUpdate(input: IncomingStatusUpdate): Promise<void> {
  const { shiprocketOrderId, orderNumber, rawStatus, awb, courierName, trackingUrl } = input;

  let order;
  if (shiprocketOrderId) {
    [order] = await db.select().from(orders).where(eq(orders.shiprocketOrderId, shiprocketOrderId)).limit(1);
  }
  if (!order && orderNumber) {
    [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  }
  if (!order) {
    console.warn(`[shiprocket] status update for unknown order (shiprocketOrderId=${shiprocketOrderId}, orderNumber=${orderNumber})`);
    return;
  }

  const newStatus = mapShiprocketStatus(rawStatus);
  const newAwb = awb || order.awbNumber;
  const awbIsNew = !!awb && awb !== order.awbNumber;
  const statusChanged = !!newStatus && newStatus !== order.status;

  if (!statusChanged && !awbIsNew) {
    // No meaningful transition — still record the raw status for support/debugging.
    await db.update(orders).set({ shiprocketStatus: rawStatus, updatedAt: new Date() }).where(eq(orders.id, order.id));
    return;
  }

  const now = new Date();
  await db.update(orders).set({
    status: newStatus ?? order.status,
    shiprocketStatus: rawStatus,
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
      console.error(`[shiprocket] email send failed for order ${order.orderNumber}:`, err));

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
