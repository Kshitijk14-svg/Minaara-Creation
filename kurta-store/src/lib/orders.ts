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
  coupons, couponUsages,
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
  paymentStatus?:   'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentGatewayId?: string | null;
  paymentMethod?:    string | null;
  /**
   * When set, the order's recomputed chargeable total (subtotal − discount +
   * shipping, in paise) must equal this value or the transaction is rejected.
   * Used to bind a recorded order to the amount actually paid at the gateway.
   */
  expectedAmountPaise?: number;
  /**
   * Shipping charge actually locked in for this order (e.g. read back from the
   * gateway's own record — see /api/payment/verify). Falls back to the flat
   * computeShippingINR rule when omitted, e.g. for internal/admin order creation.
   */
  shippingINR?: number;
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

function generateOrderNumber(): string {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase();
  return `MNC-${date}-${random}`;
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
    if (opts.expectedAmountPaise !== undefined) {
      const chargeablePaise = Math.round(totalAmountINR * 100);
      if (chargeablePaise !== opts.expectedAmountPaise) {
        throw new OrderError(
          'AMOUNT_MISMATCH',
          'Order total does not match the amount paid',
        );
      }
    }

    // 6. Create order
    const orderId     = randomUUID();
    const orderNumber = generateOrderNumber();
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

    // 9. Decrement stock (DB-level guard via WHERE stock >= quantity)
    for (const item of items) {
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
