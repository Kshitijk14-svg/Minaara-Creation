import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Order } from '@/types/schema';

const ShippingAddressSchema = z.object({
  fullName: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(6).max(10),
  country: z.string().min(1),
});

const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().min(1),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
  priceINR: z.number().positive(),
});

const CreateOrderSchema = z.object({
  customerEmail: z.string().email(),
  customerPhone: z.string().min(10),
  shippingAddress: ShippingAddressSchema,
  items: z.array(OrderItemSchema).min(1),
  totalAmountINR: z.number().positive(),
  currency: z.enum(['INR', 'USD', 'EUR']).default('INR'),
});

function dbOrderToSchema(o: {
  id: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: unknown;
  items: unknown;
  totalAmountINR: number;
  currency: string;
  paymentStatus: string;
  paymentGatewayId: string | null;
  createdAt: Date;
}): Order {
  return {
    id: o.id,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    shippingAddress: o.shippingAddress as Order['shippingAddress'],
    items: o.items as Order['items'],
    totalAmountINR: o.totalAmountINR,
    currency: o.currency as Order['currency'],
    paymentStatus: o.paymentStatus as Order['paymentStatus'],
    paymentGatewayId: o.paymentGatewayId ?? undefined,
    createdAt: o.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid order data', issues: parsed.error.issues }, { status: 400 });
    }

    const { items } = parsed.data;

    // Validate stock availability for each item
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, sizes: true, title: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product "${item.productId}" not found or inactive` },
          { status: 422 },
        );
      }
      const sizeStock = (product.sizes as Record<string, number>)[item.size] ?? 0;
      if (sizeStock < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for "${item.title}" in size ${item.size}. Available: ${sizeStock}`,
          },
          { status: 422 },
        );
      }
    }

    // Create order in PENDING state (stock deducted only on PAID webhook)
    const order = await db.order.create({
      data: {
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone,
        shippingAddress: parsed.data.shippingAddress,
        items: parsed.data.items,
        totalAmountINR: parsed.data.totalAmountINR,
        currency: parsed.data.currency,
        paymentStatus: 'PENDING',
      },
      select: {
        id: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        items: true,
        totalAmountINR: true,
        currency: true,
        paymentStatus: true,
        paymentGatewayId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ orderId: order.id }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[POST /api/orders]', err);
    }
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'email query param required' }, { status: 400 });
    }

    const orders = await db.order.findMany({
      where: { customerEmail: email },
      select: {
        id: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        items: true,
        totalAmountINR: true,
        currency: true,
        paymentStatus: true,
        paymentGatewayId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ orders: orders.map(dbOrderToSchema) });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[GET /api/orders]', err);
    }
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
