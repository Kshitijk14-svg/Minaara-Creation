/** Fixed advance charged online for a Cash-on-Delivery order; the remaining
 * balance is collected as cash by the courier on delivery. Zero-import so
 * it's safe to pull into client components (unlike src/lib/delhivery.ts,
 * which imports the DB layer). */
export const COD_ADVANCE_INR = 200;
