import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({
  log: []
});

async function runCouponConcurrencyTest() {
  console.log('\n--- 1. Testing Coupon and Stock Concurrency (With Coupon) ---');

  const testId = Date.now();
  const couponCode = `TESTCOUP${String(testId).slice(-4)}`;

  // Create product with stock: 5
  const product = await db.product.create({
    data: {
      title: 'Concurrency Coupon Test Kurta',
      slug: `concurrency-coupon-test-${testId}`,
      description: 'Test product for concurrent order processing',
      priceINR: 1000,
      isActive: true,
      collection: {
        create: {
          name: `Test Coupon Collection ${testId}`,
          slug: `test-coupon-coll-${testId}`,
        }
      },
      variants: {
        create: {
          size: 'M',
          stock: 5
        }
      }
    },
    include: {
      variants: true
    }
  });

  const variantId = product.variants[0].id;
  console.log(`[Setup] Created test variant ${variantId} with stock: 5`);

  // Create coupon with maxUses: 3
  const coupon = await db.coupon.create({
    data: {
      code: couponCode,
      discountType: 'FIXED',
      discountValue: 100,
      minOrderAmountINR: 100,
      maxUses: 3,
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      isActive: true,
    }
  });
  console.log(`[Setup] Created test coupon ${coupon.code} with maxUses: 3`);

  // Setup 15 unique users
  console.log('[Setup] Creating 15 unique test users...');
  const users = [];
  for (let i = 0; i < 15; i++) {
    users.push(
      await db.user.create({
        data: {
          email: `concurrent-user-${testId}-${i}@example.com`,
          name: `Concurrent User ${i}`,
          role: 'CUSTOMER'
        }
      })
    );
  }

  console.log(`[Test] Launching 15 concurrent checkout requests with FOR UPDATE locking...`);
  const promises = users.map((user, index) => {
    return (async () => {
      const log = (msg) => {
        if (index < 15) {
          console.log(`[Worker ${index}] ${msg}`);
        }
      };

      try {
        const order = await db.$transaction(async (tx) => {
          // 1. Lock the variant row
          const variants = await tx.$queryRaw`
            SELECT id, stock FROM product_size_variants 
            WHERE id = ${variantId} FOR UPDATE
          `;
          const variant = variants[0];
          if (!variant) throw new Error('VARIANT_NOT_FOUND');
          if (variant.stock < 1) {
            log('Locked stock check failed: INSUFFICIENT_STOCK');
            throw new Error('INSUFFICIENT_STOCK');
          }

          // 2. Lock the coupon row
          const coupons = await tx.$queryRaw`
            SELECT id, usedCount, maxUses, perUserLimit, isActive FROM coupons 
            WHERE id = ${coupon.id} FOR UPDATE
          `;
          const dbCoupon = coupons[0];
          if (!dbCoupon) throw new Error('COUPON_INVALID');
          if (!dbCoupon.isActive) throw new Error('COUPON_INACTIVE');
          if (dbCoupon.maxUses !== null && dbCoupon.usedCount >= dbCoupon.maxUses) {
            log('Locked coupon check failed: COUPON_EXHAUSTED');
            throw new Error('COUPON_EXHAUSTED');
          }

          // 3. Create order
          const newOrder = await tx.order.create({
            data: {
              orderNumber: `TNC-${testId}-${index}-${Math.floor(Math.random() * 1000)}`,
              userId: user.id,
              customerEmail: user.email,
              customerPhone: '1234567890',
              subtotalINR: 1000,
              discountAmountINR: 100,
              totalAmountINR: 900,
            }
          });

          // 4. Decrement stock
          await tx.productSizeVariant.update({
            where: { id: variantId },
            data: { stock: { decrement: 1 } }
          });

          // 5. Create coupon usage
          await tx.couponUsage.create({
            data: {
              couponId: coupon.id,
              userId: user.id,
              orderId: newOrder.id,
            }
          });

          // 6. Increment coupon usedCount
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } }
          });

          return newOrder;
        });

        log('Transaction committed successfully!');
        return { success: true, orderId: order.id };
      } catch (err) {
        log(`Transaction failed/rolled back: ${err.message}`);
        return { success: false, error: err.message };
      }
    })();
  });

  const outcomes = await Promise.all(promises);
  const successes = outcomes.filter(o => o.success);
  const failures = outcomes.filter(o => !o.success);

  console.log(`[Results] Successful transactions: ${successes.length}`);
  console.log(`[Results] Failed transactions: ${failures.length}`);

  // Retrieve final DB values
  const finalVariant = await db.productSizeVariant.findUnique({ where: { id: variantId } });
  const finalCoupon = await db.coupon.findUnique({ where: { id: coupon.id } });
  const orderCount = await db.order.count({
    where: {
      orderNumber: { startsWith: `TNC-${testId}-` },
    }
  });

  console.log(`[Verification] Final variant stock in DB: ${finalVariant.stock} (Expected: 2, since only 3 coupon uses were allowed)`);
  console.log(`[Verification] Final coupon usedCount in DB: ${finalCoupon.usedCount} (Expected: 3)`);
  console.log(`[Verification] Actual orders created in DB: ${orderCount} (Expected: 3)`);

  // Cleanup
  console.log('[Cleanup] Removing test data...');
  const userIds = users.map(u => u.id);
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.coupon.delete({ where: { id: coupon.id } });
  await db.productSizeVariant.delete({ where: { id: variantId } });
  await db.product.delete({ where: { id: product.id } });
  await db.collection.delete({ where: { id: product.collectionId } });
  console.log('[Cleanup] Cleanup complete.');

  // Assertions
  if (successes.length !== 3 || orderCount !== 3) {
    throw new Error(`Success count is ${successes.length}, expected exactly 3!`);
  }
  if (finalVariant.stock !== 2) {
    throw new Error(`Final stock is ${finalVariant.stock}, expected exactly 2!`);
  }
  if (finalCoupon.usedCount !== 3) {
    throw new Error(`Final usedCount is ${finalCoupon.usedCount}, expected exactly 3!`);
  }
}

async function runStockConcurrencyTest() {
  console.log('\n--- 2. Testing Pure Stock Concurrency (Without Coupon) ---');

  const testId = Date.now();

  // Create product with stock: 5
  const product = await db.product.create({
    data: {
      title: 'Concurrency Stock Test Kurta',
      slug: `concurrency-stock-test-${testId}`,
      description: 'Test product for concurrent stock processing',
      priceINR: 1000,
      isActive: true,
      collection: {
        create: {
          name: `Test Stock Collection ${testId}`,
          slug: `test-stock-coll-${testId}`,
        }
      },
      variants: {
        create: {
          size: 'M',
          stock: 5
        }
      }
    },
    include: {
      variants: true
    }
  });

  const variantId = product.variants[0].id;
  console.log(`[Setup] Created test variant ${variantId} with stock: 5`);

  // Setup 15 unique users
  console.log('[Setup] Creating 15 unique test users...');
  const users = [];
  for (let i = 0; i < 15; i++) {
    users.push(
      await db.user.create({
        data: {
          email: `concurrent-stock-user-${testId}-${i}@example.com`,
          name: `Concurrent User ${i}`,
          role: 'CUSTOMER'
        }
      })
    );
  }

  console.log(`[Test] Launching 15 concurrent checkout requests with FOR UPDATE locking...`);
  const promises = users.map((user, index) => {
    return (async () => {
      const log = (msg) => {
        if (index < 15) {
          console.log(`[Worker ${index}] ${msg}`);
        }
      };

      try {
        const order = await db.$transaction(async (tx) => {
          // 1. Lock the variant row
          const variants = await tx.$queryRaw`
            SELECT id, stock FROM product_size_variants 
            WHERE id = ${variantId} FOR UPDATE
          `;
          const variant = variants[0];
          if (!variant) throw new Error('VARIANT_NOT_FOUND');
          if (variant.stock < 1) {
            log('Locked stock check failed: INSUFFICIENT_STOCK');
            throw new Error('INSUFFICIENT_STOCK');
          }

          // 2. Create order
          const newOrder = await tx.order.create({
            data: {
              orderNumber: `TNS-${testId}-${index}-${Math.floor(Math.random() * 1000)}`,
              userId: user.id,
              customerEmail: user.email,
              customerPhone: '1234567890',
              subtotalINR: 1000,
              discountAmountINR: 0,
              totalAmountINR: 1000,
            }
          });

          // 3. Decrement stock
          await tx.productSizeVariant.update({
            where: { id: variantId },
            data: { stock: { decrement: 1 } }
          });

          return newOrder;
        });

        log('Transaction committed successfully!');
        return { success: true, orderId: order.id };
      } catch (err) {
        log(`Transaction failed/rolled back: ${err.message}`);
        return { success: false, error: err.message };
      }
    })();
  });

  const outcomes = await Promise.all(promises);
  const successes = outcomes.filter(o => o.success);
  const failures = outcomes.filter(o => !o.success);

  console.log(`[Results] Successful transactions: ${successes.length}`);
  console.log(`[Results] Failed transactions: ${failures.length}`);

  // Retrieve final DB values
  const finalVariant = await db.productSizeVariant.findUnique({ where: { id: variantId } });
  const orderCount = await db.order.count({
    where: {
      orderNumber: { startsWith: `TNS-${testId}-` },
    }
  });

  console.log(`[Verification] Final variant stock in DB: ${finalVariant.stock} (Expected: 0, since starting stock was 5 and 15 requests were made)`);
  console.log(`[Verification] Actual orders created in DB: ${orderCount} (Expected: 5)`);

  // Cleanup
  console.log('[Cleanup] Removing test data...');
  const userIds = users.map(u => u.id);
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.productSizeVariant.delete({ where: { id: variantId } });
  await db.product.delete({ where: { id: product.id } });
  await db.collection.delete({ where: { id: product.collectionId } });
  console.log('[Cleanup] Cleanup complete.');

  // Assertions
  if (successes.length !== 5 || orderCount !== 5) {
    throw new Error(`Success count is ${successes.length}, expected exactly 5!`);
  }
  if (finalVariant.stock !== 0) {
    throw new Error(`Final stock is ${finalVariant.stock}, expected exactly 0!`);
  }
}

async function main() {
  try {
    await runCouponConcurrencyTest();
    await runStockConcurrencyTest();
    console.log('\n=======================================');
    console.log('CONCURRENCY TESTS PASSED SUCCESSFULLY!');
    console.log('=======================================');
    process.exit(0);
  } catch (err) {
    console.error('\n=======================================');
    console.error('CONCURRENCY TESTS FAILED!', err.message);
    console.error('=======================================');
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
