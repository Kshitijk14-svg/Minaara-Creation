// Reproduces exactly what POST /api/payment/create-razorpay-order does, outside
// Next, so a failure prints the real error instead of collapsing into a 500
// "Failed to create payment order". Read-only apart from creating one ₹1
// Razorpay order (unpaid orders cost nothing and expire on their own).
//
// Usage: node scripts/diagnose-payment.mjs [--skip-gateway]
//
// No build needed — plain node against deps already installed.
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in `.env.local`. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
// (`quiet` suppresses dotenv's own banner so the report is the only output;
// it is ignored by older dotenv versions, which is harmless.)
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const skipGateway = process.argv.includes('--skip-gateway');
const failures = [];

function ok(label, detail = '')   { console.log(`  ok     ${label}${detail ? '  ' + detail : ''}`); }
function bad(label, detail, fix)  { console.log(`  FAIL   ${label}${detail ? '  ' + detail : ''}`); failures.push({ label, detail, fix }); }
function section(title)           { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`); }

/** Never print a secret. Key ids show prefix + last 4 (mode is the useful part); secrets show length only. */
function maskKeyId(v)  { return `${v.slice(0, 9)}…${v.slice(-4)}`; }
function maskSecret(v) { return `<${v.length} chars>`; }

// ── 1. Environment ───────────────────────────────────────────────────────────

section('Environment');
console.log(`  cwd    ${process.cwd()}`);

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  try {
    fs.accessSync(envPath, fs.constants.R_OK);
    ok('.env.local', `${envPath} (readable)`);
  } catch {
    bad('.env.local', `${envPath} exists but is NOT readable by ${process.getuid ? `uid ${process.getuid()}` : 'this user'}`,
        'chown it to the user pm2 runs as, then: pm2 restart minaara');
  }
} else {
  bad('.env.local', `not found at ${envPath}`,
      'Create it (see OVH-deploy.md Step 9) — it is gitignored and never arrives via git pull.');
}

const { DATABASE_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

if (DATABASE_URL) ok('DATABASE_URL', `<set, ${DATABASE_URL.length} chars>`);
else bad('DATABASE_URL', 'not set', 'Add it to .env.local.');

if (!RAZORPAY_KEY_ID) {
  bad('RAZORPAY_KEY_ID', 'not set',
      `Add RAZORPAY_KEY_ID to ${envPath} (dashboard.razorpay.com > Settings > API Keys), then: pm2 restart minaara`);
} else {
  const mode = RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'LIVE'
             : RAZORPAY_KEY_ID.startsWith('rzp_test_') ? 'TEST'
             : 'UNRECOGNISED PREFIX';
  if (mode === 'LIVE') ok('RAZORPAY_KEY_ID', `${maskKeyId(RAZORPAY_KEY_ID)} (${mode})`);
  else bad('RAZORPAY_KEY_ID', `${maskKeyId(RAZORPAY_KEY_ID)} (${mode})`,
           'A live site needs an rzp_live_ key id. A test key returns 401 from the live API.');
}

if (RAZORPAY_KEY_SECRET) {
  // Razorpay secrets are 24 chars — a different length means the value was
  // truncated, quoted, or has stray whitespace, which is a distinct fault
  // from "the pair is simply wrong".
  const suffix = RAZORPAY_KEY_SECRET.length === 24 ? '' : ' — expected 24, value looks malformed';
  if (suffix) bad('RAZORPAY_KEY_SECRET', maskSecret(RAZORPAY_KEY_SECRET) + suffix,
                  `Re-paste the secret into ${envPath} with no surrounding spaces, then: pm2 restart minaara`);
  else ok('RAZORPAY_KEY_SECRET', maskSecret(RAZORPAY_KEY_SECRET));
} else {
  bad('RAZORPAY_KEY_SECRET', 'not set',
      `Add RAZORPAY_KEY_SECRET to ${envPath}, then: pm2 restart minaara`);
}

// ── 2. Database ──────────────────────────────────────────────────────────────
// The payment path's queries verbatim, so a missing column surfaces as the real
// ER_BAD_FIELD_ERROR rather than a generic 500.

section('Database');

const QUERIES = [
  { label: 'products (price/active)',   sql: 'SELECT id, priceINR, isActive, deletedAt FROM products LIMIT 1',
    used: 'create-razorpay-order price verification' },
  { label: 'products.weightGrams',      sql: 'SELECT id, weightGrams FROM products LIMIT 1',
    used: 'getItemsWeightGrams (src/lib/delhivery.ts)', fix: 'node scripts/migrate-add-shiprocket.mjs' },
  { label: 'product_size_variants',     sql: 'SELECT id, stock FROM product_size_variants LIMIT 1',
    used: 'create-razorpay-order stock check' },
  { label: 'orders.shippingINR',        sql: 'SELECT id, shippingINR, paymentGatewayId FROM orders LIMIT 1',
    used: '/api/payment/verify order insert', fix: 'node scripts/migrate-add-shipping-rate.mjs' },
  { label: 'orders.delhivery* columns', sql: 'SELECT id, delhiveryOrderId, delhiveryShipmentId, delhiveryStatus, delhiveryPushError FROM orders LIMIT 1',
    used: 'pushOrderToDelhivery', fix: 'node scripts/migrate-rename-shiprocket-to-delhivery.mjs' },
  { label: 'coupons (all columns)',     sql: 'SELECT * FROM coupons LIMIT 1',
    used: 'create-razorpay-order coupon lookup' },
];

let conn = null;
if (DATABASE_URL) {
  try {
    conn = await mysql.createConnection(DATABASE_URL);
    ok('connection', 'connected');
  } catch (err) {
    bad('connection', `${err.code || ''} ${err.message}`, 'Check DATABASE_URL in .env.local and that MySQL is running.');
  }
}

if (conn) {
  for (const q of QUERIES) {
    try {
      await conn.execute(q.sql);
      ok(q.label);
    } catch (err) {
      bad(q.label, `${err.code || ''} ${err.sqlMessage || err.message}  [used by: ${q.used}]`,
          q.fix ?? 'Inspect the table definition — the payment path expects this column.');
    }
  }
  await conn.end();
} else {
  console.log('  skip   column checks (no DB connection)');
}

// ── 3. Gateway ───────────────────────────────────────────────────────────────
// The one call the route makes. Everything else about "is Razorpay working" is
// inference; this is the actual answer.

section('Razorpay gateway');

if (skipGateway) {
  console.log('  skip   --skip-gateway passed');
} else if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.log('  skip   keys not set (see Environment above)');
} else {
  try {
    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount:   100, // ₹1 — Razorpay's minimum
      currency: 'INR',
      receipt:  `diag_${Date.now()}`,
      notes:    { diagnostic: 'true' },
    });
    ok('orders.create', `created ${order.id} (unpaid, expires on its own)`);
  } catch (err) {
    const status = err?.statusCode;
    const inner  = err?.error ?? {};
    bad('orders.create',
        `status=${status ?? 'n/a'} code=${inner.code ?? 'n/a'} reason=${inner.reason ?? 'n/a'} description=${inner.description ?? err?.message ?? String(err)}`,
        status === 401
          ? `The secret does not match this key id, or the pair was revoked/regenerated. Confirm the Live key id in dashboard.razorpay.com > Settings > API Keys still matches the one above; if not, regenerate the pair. Then update both values in ${envPath} and: pm2 restart minaara`
          : 'Read the description above — it is Razorpay\'s own wording (account not activated, feature disabled, network unreachable, etc.).');
    if (!status) {
      // No HTTP status at all means the request never completed — network, not auth.
      console.log('\n  No HTTP status returned — the request may not have left the server.');
      console.log('  Check outbound 443:  curl -sS -o /dev/null -w \'%{http_code}\\n\' https://api.razorpay.com/v1/orders');
      console.log('  That should print 401 (auth rejected but reachable), not hang.');
      console.log('  Raw error:', err);
    }
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────

section('Verdict');

if (failures.length === 0) {
  console.log('  All checks passed — env, database and gateway are all healthy.');
  console.log('  If checkout still fails, the fault is elsewhere: capture it with');
  console.log('    grep -h -A 20 \'create-razorpay-order\' ~/.pm2/logs/minaara-error-*.log | tail -60');
  process.exit(0);
}

console.log(`  ${failures.length} check(s) failed:\n`);
for (const f of failures) {
  console.log(`  • ${f.label} — ${f.detail}`);
  console.log(`    fix: ${f.fix}\n`);
}
process.exit(1);
