/**
 * Shared order-creation logic.
 *
 * Extracted so it can be invoked in-process (e.g. by the payment/verify route)
 * instead of over an internal HTTP hop. This is the single source of truth for
 * the ACID order transaction: stock check + decrement + coupon claim, with
 * server-side price recomputation and (optionally) payment-amount binding.
 */
import { db } from '@/db/index';
import {
  orders, orderItems, shippingAddresses,
  products, productSizeVariants, productImages,
  coupons, couponUsages, stockReservations, counters,
} from '@/db/schema';
import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// ── Validation schemas (shared with the API route) ────────────────────────────

export const ShippingAddressSchema = z.object({
  fullName: z.string().min(1),
  line1:    z.string().min(1),
  line2:    z.string().optional(),
  city:     z.string().min(1),
  state:    z.string().min(1),
  pincode:  z.string().min(4).max(10),
  country:  z.string().min(1).default('India'),
});

export const OrderItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  size:      z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  quantity:  z.number().int().positive(),
});

export const CreateOrderSchema = z.object({
  customerEmail:   z.string().email(),
  customerPhone:   z.string().min(10).max(15),
  shippingAddress: ShippingAddressSchema,
  items:           z.array(OrderItemInputSchema).min(1),
  currency:        z.enum(['INR', 'USD', 'EUR']).default('INR'),
  couponCode:      z.string().optional(),
  notes:           z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export interface CreateOrderOptions {
  /** Logged-in user id, if any (attached to the order + required for coupons). */
  userId?: string | null;
  paymentStatus?:   'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'COD_PENDING';
  paymentGatewayId?: string | null;
  paymentMethod?:    string | null;
  /**
   * The Razorpay order id this checkout reserved stock under (see
   * create-razorpay-order). When a matching, unexpired reservation row exists
   * for a given item, its hold is committed (stock decremented, row deleted)
   * instead of re-checking availability from scratch. Falls back to the
   * direct guarded decrement when absent or expired — e.g. internal/admin
   * order creation never reserves, and a reservation can expire if the
   * customer takes longer than the hold TTL to complete payment.
   */
  razorpayOrderId?: string | null;
  /**
   * When set, the order's recomputed chargeable total (subtotal − discount +
   * shipping, in paise) must equal this value or the transaction is rejected.
   * Used to bind a recorded order to the amount actually paid at the gateway.
   * For COD orders (see `codAdvanceINR`), this binds to the advance instead.
   */
  expectedAmountPaise?: number;
  /**
   * Shipping charge actually locked in for this order (e.g. read back from the
   * gateway's own record — see /api/payment/verify). Falls back to the flat
   * computeShippingINR rule when omitted, e.g. for internal/admin order creation.
   */
  shippingINR?: number;
  /**
   * Set only for Cash-on-Delivery orders — the fixed advance actually charged
   * online (see COD_ADVANCE_INR). When present, `expectedAmountPaise` is
   * checked against this amount instead of the full order total, since COD
   * intentionally charges less online (the balance is collected as cash on
   * delivery).
   */
  codAdvanceINR?: number;
}

/** Business/validation errors carry a machine-readable `code`. */
export class OrderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

/** Flat ₹150 shipping under ₹2,000, free at or above — mirrors checkout + create-razorpay-order. */
export function computeShippingINR(subtotalINR: number): number {
  return subtotalINR >= 2000 ? 0 : 150;
}

const ORDER_NUMBER_PREFIX = 'LBM';
const ORDER_COUNTER_NAME  = 'order_number';

/** The transaction handle drizzle hands to `db.transaction`, without naming drizzle internals. */
type OrderTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * `ddmmyy` on India's calendar. Deliberately not `toISOString()`, which is UTC:
 * IST is UTC+5:30, so an order placed between midnight and 5:30am IST would be
 * stamped with the previous day's date.
 */
function istDatePart(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('day')}${part('month')}${part('year')}`;
}

/**
 * `LBM-ddmmyy-N`, e.g. `LBM-260726-0`. N is a single lifetime sequence starting
 * at 0 that never resets, so it doubles as a running order count.
 *
 * Must run inside the order transaction: the counter row is locked FOR UPDATE
 * (same pattern as the variant and coupon locks above) so concurrent checkouts
 * serialise on it rather than both reading the same value and colliding on the
 * `orderNumber` unique index. Because the bump is part of the transaction, a
 * rolled-back order releases its number instead of burning a gap.
 */
async function generateOrderNumber(tx: OrderTransaction, now: Date): Promise<string> {
  await tx.execute(sql`SELECT value FROM counters WHERE name = ${ORDER_COUNTER_NAME} FOR UPDATE`);

  const [row] = await tx.select({ value: counters.value })
    .from(counters).where(eq(counters.name, ORDER_COUNTER_NAME)).limit(1);
  if (!row) {
    throw new OrderError('COUNTER_MISSING', 'Order counter row is missing — run scripts/migrate-add-order-counter.mjs');
  }

  await tx.update(counters).set({ value: row.value + 1 }).where(eq(counters.name, ORDER_COUNTER_NAME));

  return `${ORDER_NUMBER_PREFIX}-${istDatePart(now)}-${row.value}`;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerEmail: string;
  customerPhone: string;
  currency: string;
  notes: string | null;
  subtotalINR: number;
  discountAmountINR: number;
  shippingINR: number;
  totalAmountINR: number;
  codAdvanceINR: number;
  paymentStatus: string;
  paymentGatewayId: string | null;
  paymentMethod: string | null;
  items: Array<{ id: string; title: string; size: string; quantity: number; priceINR: number; imageUrl: string | null }>;
  shippingAddress: {
    fullName: string; line1: string; line2: string | null;
    city: string; state: string; pincode: string; country: string;
  };
  coupon: { code: string; discountType: string; discountValue: number } | null;
}

/**
 * Create an order inside a single ACID transaction.
 * Throws {@link OrderError} on any business rule violation (mapped to HTTP by callers).
 */
export async function createOrder(input: CreateOrderInput, opts: CreateOrderOptions = {}): Promise<CreatedOrder> {
  const { items, shippingAddress, couponCode, ...orderData } = input;
  const userId = opts.userId ?? null;

  return db.transaction(async (tx) => {
    const variantIds = items.map((i) => i.variantId);
    const productIds  = [...new Set(items.map((i) => i.productId))];

    // 0. Idempotency guard — a gateway payment id may back at most one order.
    if (opts.paymentGatewayId) {
      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.paymentGatewayId, opts.paymentGatewayId))
        .limit(1);
      if (existing) throw new OrderError('DUPLICATE_PAYMENT', 'This payment has already been recorded');
    }

    // 1. Lock variant rows (pessimistic lock prevents concurrent stock race) — parameterized.
    await tx.execute(
      sql`SELECT id, stock FROM product_size_variants WHERE id IN (${sql.join(variantIds.map((id) => sql`${id}`), sql`, `)}) FOR UPDATE`
    );

    const variantRows = await tx
      .select({
        id:        productSizeVariants.id,
        productId: productSizeVariants.productId,
        size:      productSizeVariants.size,
        stock:     productSizeVariants.stock,
      })
      .from(productSizeVariants)
      .where(inArray(productSizeVariants.id, variantIds));

    if (variantRows.length !== variantIds.length) {
      throw new OrderError('VARIANT_NOT_FOUND', 'One or more product variants not found');
    }

    // 2. Check all products are active
    const activeProducts = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(
        inArray(products.id, productIds),
        eq(products.isActive, true),
        isNull(products.deletedAt),
      ));

    if (activeProducts.length !== productIds.length) {
      throw new OrderError('PRODUCT_INACTIVE', 'One or more products are not available');
    }

    // Product titles / prices / first image for snapshots
    const productRows = await tx
      .select({ id: products.id, title: products.title, priceINR: products.priceINR })
      .from(products)
      .where(inArray(products.id, productIds));

    const imageRows = await tx
      .select({ productId: productImages.productId, url: productImages.url })
      .from(productImages)
      .where(and(inArray(productImages.productId, productIds), eq(productImages.sortOrder, 0)));

    const productMap = new Map(productRows.map((p) => [p.id, p]));
    const imageMap   = new Map(imageRows.map((img) => [img.productId, img.url]));
    const variantMap = new Map(variantRows.map((v) => [v.id, v]));

    // 3. Validate stock
    for (const item of items) {
      const variant = variantMap.get(item.variantId);
      if (!variant) throw new OrderError('VARIANT_NOT_FOUND', `Variant ${item.variantId} not found`);
      if (variant.stock < item.quantity) {
        const prod = productMap.get(item.productId);
        throw new OrderError(
          'INSUFFICIENT_STOCK',
          `"${prod?.title || 'Product'}" size ${item.size} — available: ${variant.stock}, requested: ${item.quantity}`,
        );
      }
    }

    // 4. Validate coupon
    let coupon: any = null;
    let discountAmountINR = 0;
    if (couponCode) {
      if (!userId) throw new OrderError('COUPON_REQUIRES_LOGIN', 'Must be logged in to use a coupon');

      const cleanCode = couponCode.toUpperCase().trim();
      // Lock coupon row — parameterized.
      await tx.execute(sql`SELECT id, usedCount FROM coupons WHERE code = ${cleanCode} FOR UPDATE`);

      const [couponRow] = await tx.select().from(coupons).where(eq(coupons.code, cleanCode)).limit(1);

      if (!couponRow)          throw new OrderError('COUPON_INVALID', 'Coupon not found');
      if (!couponRow.isActive) throw new OrderError('COUPON_INACTIVE', 'Coupon is not active');
      if (couponRow.expiryDate < new Date()) throw new OrderError('COUPON_EXPIRED', 'Coupon has expired');
      if (couponRow.maxUses !== null && couponRow.usedCount >= couponRow.maxUses) {
        throw new OrderError('COUPON_EXHAUSTED', 'Coupon has reached its maximum uses');
      }

      const [{ perUserUsage }] = await tx
        .select({ perUserUsage: count() })
        .from(couponUsages)
        .where(and(eq(couponUsages.couponId, couponRow.id), eq(couponUsages.userId, userId)));

      if (perUserUsage >= couponRow.perUserLimit) {
        throw new OrderError('COUPON_PER_USER_LIMIT', 'You have already used this coupon');
      }

      coupon = couponRow;
    }

    // 5. Calculate totals (server-side, from DB prices)
    const subtotalINR = items.reduce((sum, item) => {
      const product = productMap.get(item.productId)!;
      return sum + product.priceINR * item.quantity;
    }, 0);

    if (coupon) {
      if (subtotalINR < coupon.minOrderAmountINR) {
        throw new OrderError('COUPON_MIN_ORDER', `Minimum order amount for this coupon is ₹${coupon.minOrderAmountINR}`);
      }
      if (coupon.discountType === 'PERCENT') {
        discountAmountINR = (subtotalINR * coupon.discountValue) / 100;
        if (coupon.maxDiscountINR) discountAmountINR = Math.min(discountAmountINR, coupon.maxDiscountINR);
      } else {
        discountAmountINR = Math.min(coupon.discountValue, subtotalINR);
      }
    }

    const shippingINR     = opts.shippingINR ?? computeShippingINR(subtotalINR);
    const totalAmountINR  = subtotalINR - discountAmountINR + shippingINR;

    // 5b. Bind to the amount actually paid at the gateway (tamper/replay protection).
    // For COD orders, `codAdvanceINR` is the fixed advance charged online —
    // deliberately less than `totalAmountINR`, since the balance is cash on delivery.
    if (opts.expectedAmountPaise !== undefined) {
      const chargeableINR   = opts.codAdvanceINR !== undefined ? opts.codAdvanceINR : totalAmountINR;
      const chargeablePaise = Math.round(chargeableINR * 100);
      if (chargeablePaise !== opts.expectedAmountPaise) {
        throw new OrderError(
          'AMOUNT_MISMATCH',
          'Order total does not match the amount paid',
        );
      }
    }

    // 6. Create order
    const orderId     = randomUUID();
    const orderNumber = await generateOrderNumber(tx, new Date());
    await tx.insert(orders).values({
      id: orderId,
      orderNumber,
      userId:           userId ?? null,
      customerEmail:    orderData.customerEmail,
      customerPhone:    orderData.customerPhone,
      currency:         orderData.currency,
      notes:            orderData.notes ?? null,
      paymentStatus:    opts.paymentStatus ?? 'PENDING',
      paymentGatewayId: opts.paymentGatewayId ?? null,
      paymentMethod:    opts.paymentMethod ?? null,
      discountAmountINR,
      subtotalINR,
      shippingINR,
      totalAmountINR,
      codAdvanceINR: opts.codAdvanceINR ?? 0,
    });

    // 7. Shipping address
    await tx.insert(shippingAddresses).values({
      id:      randomUUID(),
      orderId,
      ...shippingAddress,
      line2: shippingAddress.line2 ?? null,
    });

    // 8. Order items
    const itemRecords = items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        id:        randomUUID(),
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        title:     product.title,
        size:      item.size,
        imageUrl:  imageMap.get(item.productId) ?? null,
        quantity:  item.quantity,
        priceINR:  product.priceINR,
      };
    });
    await tx.insert(orderItems).values(itemRecords);

    // 9. Commit the stock hold: decrement stock, and either clear this item's
    // reservation (the checkout-time hold from create-razorpay-order) or, if
    // none exists (expired, or no razorpayOrderId — internal/admin creation),
    // fall back to the direct guarded decrement.
    let reservationRows: Array<{ id: string; variantId: string; quantity: number }> = [];
    if (opts.razorpayOrderId) {
      reservationRows = await tx
        .select({ id: stockReservations.id, variantId: stockReservations.variantId, quantity: stockReservations.quantity })
        .from(stockReservations)
        .where(and(
          eq(stockReservations.razorpayOrderId, opts.razorpayOrderId),
          sql`${stockReservations.expiresAt} > NOW()`,
        ));
    }
    const reservationByVariant = new Map(reservationRows.map((r) => [r.variantId, r]));

    for (const item of items) {
      const reservation = reservationByVariant.get(item.variantId);
      // A reservation only counts as covering this item if it was held for at
      // least as much as we're about to take — otherwise fall through to the
      // guarded decrement, which re-validates real stock from scratch.
      const reservationCovers = reservation && reservation.quantity >= item.quantity;

      const updated = await tx.update(productSizeVariants)
        .set({ stock: sql`stock - ${item.quantity}`, updatedAt: new Date() })
        .where(and(
          eq(productSizeVariants.id, item.variantId),
          gte(productSizeVariants.stock, item.quantity),
        ));

      if ((updated as any)[0]?.affectedRows === 0) {
        const p = productMap.get(item.productId);
        throw new OrderError(
          'CONCURRENT_INSUFFICIENT_STOCK',
          `"${p?.title || 'Product'}" size ${item.size} — stock was reduced concurrently`,
        );
      }

      if (reservationCovers) {
        await tx.delete(stockReservations).where(eq(stockReservations.id, reservation!.id));
      }
    }

    // 10. Record coupon usage
    if (coupon) {
      await tx.insert(couponUsages).values({ id: randomUUID(), couponId: coupon.id, userId: userId!, orderId });
      await tx.update(coupons)
        .set({ usedCount: sql`usedCount + 1`, updatedAt: new Date() })
        .where(and(
          eq(coupons.id, coupon.id),
          coupon.maxUses !== null ? sql`usedCount < ${coupon.maxUses}` : sql`1=1`,
        ));
    }

    return {
      id: orderId,
      orderNumber,
      userId:           userId ?? null,
      customerEmail:    orderData.customerEmail,
      customerPhone:    orderData.customerPhone,
      currency:         orderData.currency,
      notes:            orderData.notes ?? null,
      subtotalINR,
      discountAmountINR,
      shippingINR,
      totalAmountINR,
      codAdvanceINR:    opts.codAdvanceINR ?? 0,
      paymentStatus:    opts.paymentStatus ?? 'PENDING',
      paymentGatewayId: opts.paymentGatewayId ?? null,
      paymentMethod:    opts.paymentMethod ?? null,
      items: itemRecords.map((r) => ({
        id: r.id, title: r.title, size: r.size, quantity: r.quantity, priceINR: r.priceINR, imageUrl: r.imageUrl,
      })),
      shippingAddress: { ...shippingAddress, line2: shippingAddress.line2 ?? null },
      coupon: coupon ? { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } : null,
    };
  });
}

/**
 * Maps an {@link OrderError} code to an HTTP status + client-safe message.
 * Returns null for unexpected (non-business) errors — callers should 500 those.
 */
export function mapOrderError(err: unknown): { status: number; message: string } | null {
  if (!(err instanceof OrderError)) return null;
  switch (err.code) {
    case 'DUPLICATE_PAYMENT': return { status: 409, message: err.message };
    case 'AMOUNT_MISMATCH':   return { status: 400, message: err.message };
    case 'PRODUCT_INACTIVE':
    case 'VARIANT_NOT_FOUND':
    case 'INSUFFICIENT_STOCK':
    case 'CONCURRENT_INSUFFICIENT_STOCK':
    case 'COUPON_INVALID':
    case 'COUPON_INACTIVE':
    case 'COUPON_EXPIRED':
    case 'COUPON_EXHAUSTED':
    case 'COUPON_PER_USER_LIMIT':
    case 'COUPON_MIN_ORDER':
    case 'COUPON_REQUIRES_LOGIN':
      return { status: 422, message: err.message };
    default:
      return { status: 422, message: err.message };
  }
}
