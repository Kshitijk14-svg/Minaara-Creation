import { notFound, redirect } from 'next/navigation';
import OrderSuccessClient from './OrderSuccessClient';
import type { Order } from '@/types/schema';

async function getOrder(id: string): Promise<Order | null> {
  if (process.env.DATABASE_URL?.includes('password@localhost')) return null;

  try {
    const { db } = await import('@/db/index');
    const { orders, orderItems, shippingAddresses, coupons, couponUsages } = await import('@/db/schema');
    const { and, eq } = await import('drizzle-orm');

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return null;

    const [items, [address], [couponRow]] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, id)),
      db.select().from(shippingAddresses).where(eq(shippingAddresses.orderId, id)).limit(1),
      db.select({
        code: coupons.code,
        discountType: coupons.discountType,
        discountValue: coupons.discountValue,
      })
        .from(couponUsages)
        .leftJoin(coupons, eq(couponUsages.couponId, coupons.id))
        .where(eq(couponUsages.orderId, id))
        .limit(1),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId ?? undefined,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      status: order.status as Order['status'],
      paymentStatus: order.paymentStatus as Order['paymentStatus'],
      paymentGatewayId: order.paymentGatewayId ?? undefined,
      paymentMethod: order.paymentMethod ?? undefined,
      discountAmountINR: order.discountAmountINR,
      subtotalINR: order.subtotalINR,
      totalAmountINR: order.totalAmountINR,
      currency: order.currency as Order['currency'],
      notes: order.notes ?? undefined,
      cancelledAt: order.cancelledAt?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString(),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map((i) => ({
        id: i.id, orderId: i.orderId, productId: i.productId ?? undefined,
        variantId: i.variantId ?? undefined, title: i.title,
        size: i.size, imageUrl: i.imageUrl ?? undefined,
        quantity: i.quantity, priceINR: i.priceINR,
      })),
      shippingAddress: address
        ? { id: address.id, orderId: address.orderId, fullName: address.fullName, line1: address.line1, line2: address.line2 ?? undefined, city: address.city, state: address.state, pincode: address.pincode, country: address.country }
        : undefined,
      coupon: couponRow?.code && couponRow.discountType && couponRow.discountValue != null
        ? { code: couponRow.code, discountType: couponRow.discountType as 'PERCENT' | 'FIXED', discountValue: couponRow.discountValue }
        : undefined,
    };
  } catch {
    return null;
  }
}

export default async function OrderSuccessPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order  = await getOrder(id);
  if (!order) notFound();

  return <OrderSuccessClient order={order} />;
}
