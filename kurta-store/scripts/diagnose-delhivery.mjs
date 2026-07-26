// Diagnoses the Delhivery fulfillment config — specifically the class of failure
// that shows up in the admin as:
//
//   Delhivery order create failed (pickup_location="Primary"):
//   {"rmk":"ClientWarehouse matching query does not exist.","error":true,...}
//
// That error means DELHIVERY_PICKUP_LOCATION does not exactly match a warehouse
// registered on the account behind DELHIVERY_API_TOKEN. Delhivery matches the
// name verbatim (case-sensitive, whitespace-sensitive), and "Primary" is the
// placeholder shipped in .env.local.example — not a real warehouse.
//
// READ-ONLY by default. This script never calls /api/cmu/create.json: that
// endpoint creates a real, billable shipment. The only write it can perform is
// warehouse registration, and only behind an explicit --create-warehouse flag.
//
// Usage:
//   node scripts/diagnose-delhivery.mjs
//   node scripts/diagnose-delhivery.mjs --skip-api          # env + DB only
//   node scripts/diagnose-delhivery.mjs --create-warehouse \
//        --address "12 Some Road, Area" --city "Jaipur" --state "Rajasthan" \
//        --phone "9876543210" --email "ops@labelminara.com"
//
// No build needed — plain node against deps already installed.
// Bare `dotenv/config` only loads `.env`, not `.env.local` — but production
// (per OVH-deploy.md) keeps everything in `.env.local`. Load both, mirroring
// Next.js's own precedence (.env.local wins; dotenv's config() never
// overrides a var that's already set, so calling .env.local first is enough).
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
/** Reads `--flag value`; returns undefined when the flag is absent or has no value. */
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const skipApi        = has('--skip-api');
const skipDb         = has('--skip-db');
const createWarehouse = has('--create-warehouse');

const failures = [];

function ok(label, detail = '')   { console.log(`  ok     ${label}${detail ? '  ' + detail : ''}`); }
function bad(label, detail, fix)  { console.log(`  FAIL   ${label}${detail ? '  ' + detail : ''}`); failures.push({ label, detail, fix }); }
function info(label, detail = '') { console.log(`  note   ${label}${detail ? '  ' + detail : ''}`); }
function section(title)           { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`); }

/** Never print the token. Length is the only useful signal for "was it truncated". */
function maskSecret(v) { return `<${v.length} chars>`; }

/** Renders a value so trailing/leading whitespace and empty strings are visible. */
function show(v) { return JSON.stringify(v); }

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

const {
  DATABASE_URL,
  DELHIVERY_API_TOKEN,
  DELHIVERY_PICKUP_LOCATION,
  DELHIVERY_PICKUP_PINCODE,
} = process.env;

// Same default as apiBase() in src/lib/delhivery.ts.
const apiBase = process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com';

if (DELHIVERY_API_TOKEN) ok('DELHIVERY_API_TOKEN', maskSecret(DELHIVERY_API_TOKEN));
else bad('DELHIVERY_API_TOKEN', 'not set',
         `Add it to ${envPath} (Delhivery Seller Panel > API token). Without it the whole integration no-ops — isDelhiveryConfigured() returns false and orders are never pushed.`);

info('DELHIVERY_API_BASE_URL', `${apiBase}${process.env.DELHIVERY_API_BASE_URL ? '' : '  (default)'}`);
if (/staging/i.test(apiBase)) {
  info('', 'staging base URL — warehouses registered in production do NOT exist here (and vice versa)');
} else {
  info('', 'production base URL — a STAGING token here will not see your production warehouses.');
  info('', 'If the token came from Delhivery\'s staging/UAT panel, set DELHIVERY_API_BASE_URL="https://staging-express.delhivery.com".');
}

// This is the check that would have caught the "ClientWarehouse matching query
// does not exist" failure before it cost a real order push.
if (!DELHIVERY_PICKUP_LOCATION) {
  bad('DELHIVERY_PICKUP_LOCATION', 'not set',
      `Set it in ${envPath} to the warehouse name exactly as it appears in Delhivery's Seller Panel > Settings > Pickup Locations, then: pm2 restart minaara`);
} else if (DELHIVERY_PICKUP_LOCATION !== DELHIVERY_PICKUP_LOCATION.trim()) {
  bad('DELHIVERY_PICKUP_LOCATION', `${show(DELHIVERY_PICKUP_LOCATION)} — has leading/trailing whitespace`,
      `Delhivery matches the name verbatim. Re-paste it into ${envPath} with no surrounding spaces, then: pm2 restart minaara`);
} else if (DELHIVERY_PICKUP_LOCATION === 'Primary') {
  bad('DELHIVERY_PICKUP_LOCATION', '"Primary" — this is the placeholder from .env.local.example, not a warehouse name',
      `Replace it in ${envPath} with the real warehouse name from Delhivery's Seller Panel > Settings > Pickup Locations (case-sensitive), then: pm2 restart minaara`);
} else {
  ok('DELHIVERY_PICKUP_LOCATION', `${show(DELHIVERY_PICKUP_LOCATION)} — must match the Seller Panel entry exactly (case-sensitive)`);
}

if (DELHIVERY_PICKUP_PINCODE) {
  if (/^\d{6}$/.test(DELHIVERY_PICKUP_PINCODE.trim())) ok('DELHIVERY_PICKUP_PINCODE', DELHIVERY_PICKUP_PINCODE);
  else bad('DELHIVERY_PICKUP_PINCODE', `${show(DELHIVERY_PICKUP_PINCODE)} — not a 6-digit pincode`,
           `Set it to the warehouse's own pincode in ${envPath}. It is used only for live rate quotes, separate from the pickup_location name.`);
} else {
  info('DELHIVERY_PICKUP_PINCODE', 'not set — rate quotes fall back to the flat ₹150 rate (this does not affect order push)');
}

// ── 2. Warehouse verification ────────────────────────────────────────────────
// Delhivery's warehouse-read endpoint is not part of their well-documented
// surface, so an unexpected response here is INCONCLUSIVE, not a failure — the
// authoritative answer is the Seller Panel. Print whatever comes back verbatim
// rather than guessing at a verdict.

section('Warehouse');

/** Prints status + body of a Delhivery response without pretending to understand it. */
async function dumpResponse(res) {
  const text = await res.text();
  console.log(`         HTTP ${res.status} ${res.statusText}`);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON — HTML error page, etc. */ }
  const body = parsed ? JSON.stringify(parsed, null, 2) : text;
  console.log(body.split('\n').map((l) => `         ${l}`).join('\n').slice(0, 4000));
  return { text, parsed };
}

if (skipApi) {
  console.log('  skip   --skip-api passed');
} else if (!DELHIVERY_API_TOKEN) {
  console.log('  skip   DELHIVERY_API_TOKEN not set (see Environment above)');
} else if (!DELHIVERY_PICKUP_LOCATION) {
  console.log('  skip   DELHIVERY_PICKUP_LOCATION not set (see Environment above)');
} else {
  const name = DELHIVERY_PICKUP_LOCATION.trim();
  const url = `${apiBase}/api/backend/clientwarehouse/json/?name=${encodeURIComponent(name)}`;
  console.log(`  probe  GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${DELHIVERY_API_TOKEN}` },
    });
    const { parsed } = await dumpResponse(res);

    if (res.status === 401 || res.status === 403) {
      bad('warehouse probe', `HTTP ${res.status} — token rejected`,
          `The token is wrong, revoked, or belongs to a different Delhivery environment than ${apiBase}. Regenerate it in the Seller Panel and update ${envPath}.`);
    } else if (res.ok && parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
      info('warehouse probe', `account reachable — compare the name(s) above against ${show(name)} character-for-character`);
    } else {
      info('warehouse probe', 'inconclusive — this endpoint is not guaranteed to be enabled on every account.');
      info('', 'Read the exact name from Delhivery Seller Panel > Settings > Pickup Locations and compare it to DELHIVERY_PICKUP_LOCATION.');
      info('', 'Or re-run with --create-warehouse: an "already exists" error back from Delhivery confirms the name matches.');
    }
  } catch (err) {
    bad('warehouse probe', `request failed: ${err?.message || String(err)}`,
        `The request never completed — outbound HTTPS from this host may be blocked. Check: curl -sS -o /dev/null -w '%{http_code}\\n' ${apiBase}/api/backend/clientwarehouse/json/`);
  }
}

// ── 3. Warehouse registration (opt-in write) ─────────────────────────────────

if (createWarehouse) {
  section('Warehouse registration (--create-warehouse)');

  const address = arg('--address');
  const city    = arg('--city');
  const state   = arg('--state');
  const phone   = arg('--phone');
  const email   = arg('--email');
  const pin     = DELHIVERY_PICKUP_PINCODE?.trim();
  const name    = DELHIVERY_PICKUP_LOCATION?.trim();

  const missing = Object.entries({ '--address': address, '--city': city, '--state': state, '--phone': phone, '--email': email })
    .filter(([, v]) => !v).map(([k]) => k);

  if (!DELHIVERY_API_TOKEN || !name || !pin) {
    bad('create warehouse', 'DELHIVERY_API_TOKEN, DELHIVERY_PICKUP_LOCATION and DELHIVERY_PICKUP_PINCODE must all be set first',
        `Fill them in ${envPath} — the warehouse is registered under the name and pincode from those vars.`);
  } else if (missing.length) {
    bad('create warehouse', `missing required flag(s): ${missing.join(', ')}`,
        'Pass the real pickup address — this registers a live warehouse on your Delhivery account, so placeholder values would create a broken pickup location.');
  } else {
    // Delhivery's clientwarehouse create takes the pickup address plus a return
    // address; we register the same address for both.
    const body = {
      name, phone, email, address, city, pin, country: 'India',
      registered_name: name,
      return_address: address, return_pin: pin, return_city: city, return_state: state, return_country: 'India',
    };
    console.log(`  post   ${apiBase}/api/backend/clientwarehouse/create/`);
    console.log(`         name=${show(name)} pin=${pin} city=${show(city)}`);
    try {
      const res = await fetch(`${apiBase}/api/backend/clientwarehouse/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token ${DELHIVERY_API_TOKEN}` },
        body: JSON.stringify(body),
      });
      const { text } = await dumpResponse(res);
      if (res.ok && !/error/i.test(text)) {
        ok('create warehouse', `registered ${show(name)} — DELHIVERY_PICKUP_LOCATION now matches`);
      } else if (/exist/i.test(text)) {
        // Not a failure: this is the answer we were looking for.
        ok('create warehouse', `Delhivery says a warehouse named ${show(name)} already exists — the name in DELHIVERY_PICKUP_LOCATION is correct`);
      } else {
        bad('create warehouse', 'Delhivery rejected the registration (response above)',
            'Read Delhivery\'s own wording above — usually a malformed phone/pincode or a non-serviceable pickup pincode.');
      }
    } catch (err) {
      bad('create warehouse', `request failed: ${err?.message || String(err)}`,
          'The request never completed — check outbound HTTPS from this host.');
    }
  }
}

// ── 4. Database ──────────────────────────────────────────────────────────────
// Confirms the columns pushOrderToDelhivery writes exist, and surfaces the error
// actually stored on recent orders so it doesn't need a manual SQL session.

section('Database');

if (skipDb) {
  console.log('  skip   --skip-db passed');
} else if (!DATABASE_URL) {
  bad('DATABASE_URL', 'not set', `Add it to ${envPath}.`);
} else {
  let conn = null;
  try {
    conn = await mysql.createConnection(DATABASE_URL);
    ok('connection', 'connected');
  } catch (err) {
    bad('connection', `${err.code || ''} ${err.message}`, 'Check DATABASE_URL in .env.local and that MySQL is running.');
  }

  if (conn) {
    try {
      await conn.execute('SELECT id, delhiveryOrderId, delhiveryShipmentId, delhiveryStatus, delhiveryPushError FROM orders LIMIT 1');
      ok('orders.delhivery* columns');
    } catch (err) {
      bad('orders.delhivery* columns', `${err.code || ''} ${err.sqlMessage || err.message}  [used by: pushOrderToDelhivery]`,
          'node scripts/migrate-rename-shiprocket-to-delhivery.mjs');
    }

    try {
      const [rows] = await conn.execute(
        'SELECT orderNumber, delhiveryPushError, updatedAt FROM orders WHERE delhiveryPushError IS NOT NULL ORDER BY updatedAt DESC LIMIT 5',
      );
      if (rows.length === 0) {
        ok('recent push errors', 'none recorded');
      } else {
        console.log(`  note   ${rows.length} order(s) with a recorded push error (most recent first):`);
        for (const r of rows) console.log(`         ${r.orderNumber}  ${r.updatedAt?.toISOString?.() ?? r.updatedAt}\n           ${r.delhiveryPushError}`);
      }
    } catch (err) {
      console.log(`  skip   recent push errors (${err.sqlMessage || err.message})`);
    }

    await conn.end();
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────

section('Verdict');

if (failures.length === 0) {
  console.log('  All checks passed — env and database look healthy.');
  console.log('  The warehouse name itself can only be confirmed by Delhivery: retry the push from');
  console.log('  admin > Orders > "Push to Delhivery", then check');
  console.log('    pm2 logs minaara --lines 50 --nostream | grep delhivery');
  process.exit(0);
}

console.log(`  ${failures.length} check(s) failed:\n`);
for (const f of failures) {
  console.log(`  • ${f.label} — ${f.detail}`);
  console.log(`    fix: ${f.fix}\n`);
}
process.exit(1);
