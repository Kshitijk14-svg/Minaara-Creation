import nodemailer from 'nodemailer';
import type { Order } from '@/types/schema';
import { isSafeHttpUrl } from '@/lib/url-safety';

/** Escapes HTML-significant characters before interpolating into a raw HTML string. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Transport ───────────────────────────────────────────────────────────────

function createTransporter(): { transport: nodemailer.Transporter; from: string } | null {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const gmailUser = process.env.EMAIL_USER;
  const gmailPass = process.env.EMAIL_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    return {
      from: process.env.SMTP_FROM ?? `"Minara Creation" <${smtpUser}>`,
      transport: nodemailer.createTransport({
        host:   smtpHost,
        port:   process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: smtpUser, pass: smtpPass },
        tls:    { rejectUnauthorized: false },
      }),
    };
  }

  if (gmailUser && gmailPass) {
    return {
      from: `"Minara Creation" <${gmailUser}>`,
      transport: nodemailer.createTransport({
        service: 'gmail',
        auth:    { user: gmailUser, pass: gmailPass },
        tls:     { rejectUnauthorized: false },
      }),
    };
  }

  return null;
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const config = createTransporter();

  if (!config) {
    // Dev fallback — print to console when no mail credentials are set
    console.log('\n═══════════ EMAIL (dev) ═══════════');
    console.log(`  To     : ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log('════════════════════════════════════\n');
    return;
  }

  await config.transport.sendMail({ from: config.from, to, subject, html });
}

// ─── Brand Shell ─────────────────────────────────────────────────────────────

function shell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Minara Creation</title></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ede9df;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr style="background:#0f2a5b;">
          <td style="padding:28px 40px;text-align:center;">
            <span style="font-size:22px;font-family:Georgia,serif;font-style:italic;color:#ffffff;letter-spacing:0.08em;">Minara Creation</span>
          </td>
        </tr>
        <!-- Content -->
        <tr><td style="padding:40px;">${content}</td></tr>
        <!-- Footer -->
        <tr style="background:#f4ece1;">
          <td style="padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#888;letter-spacing:0.05em;">
              Minara Creation · Bapu Bazaar, Jaipur 302003, India<br>
              <a href="https://labelminara.com" style="color:#32518c;text-decoration:none;">labelminara.com</a>
              &nbsp;·&nbsp;
              <a href="mailto:support@labelminara.com" style="color:#32518c;text-decoration:none;">support@labelminara.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Order Confirmation ──────────────────────────────────────────────────────

export function renderOrderConfirmationEmail(order: Order): string {
  const itemsHtml = order.items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #ede9df;">
        <div style="font-size:14px;font-weight:600;color:#0f2a5b;">${item.title}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Size: ${item.size} &nbsp;·&nbsp; Qty: ${item.quantity}</div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #ede9df;text-align:right;font-size:14px;font-weight:600;color:#0f2a5b;white-space:nowrap;">
        ₹${(item.priceINR * item.quantity).toLocaleString('en-IN')}
      </td>
    </tr>
  `).join('');

  const addr = order.shippingAddress;
  const addrHtml = addr ? `
    <div style="margin-top:24px;padding:16px;background:#faf8f5;border-radius:8px;border:1px solid #ede9df;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#888;font-weight:600;">Shipping To</p>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#0f2a5b;">
        ${addr.fullName}<br>${addr.line1}${addr.line2 ? `, ${addr.line2}` : ''}<br>
        ${addr.city}, ${addr.state} – ${addr.pincode}<br>${addr.country}
      </p>
    </div>` : '';

  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#0f2a5b;margin:0 0 8px;">
      Order Confirmed ✓
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">
      Thank you for shopping with us! Your order <strong style="color:#0f2a5b;">${escapeHtml(order.orderNumber)}</strong> has been received and is being processed.
    </p>

    <!-- Order Items -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ede9df;">
      <thead>
        <tr>
          <th style="padding:10px 0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;font-weight:600;">Item</th>
          <th style="padding:10px 0;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <!-- Price Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <tr>
        <td style="font-size:13px;color:#888;padding:4px 0;">Subtotal</td>
        <td style="font-size:13px;color:#0f2a5b;text-align:right;padding:4px 0;">₹${order.subtotalINR.toLocaleString('en-IN')}</td>
      </tr>
      ${order.discountAmountINR > 0 ? `
      <tr>
        <td style="font-size:13px;color:#a68026;padding:4px 0;">Discount${order.coupon ? ` (${order.coupon.code})` : ''}</td>
        <td style="font-size:13px;color:#a68026;text-align:right;padding:4px 0;">−₹${order.discountAmountINR.toLocaleString('en-IN')}</td>
      </tr>` : ''}
      <tr>
        <td colspan="2" style="padding:8px 0;border-top:1px solid #ede9df;"></td>
      </tr>
      <tr>
        <td style="font-size:16px;font-weight:700;color:#0f2a5b;padding:4px 0;">Total Paid</td>
        <td style="font-family:Georgia,serif;font-size:22px;color:#0f2a5b;text-align:right;padding:4px 0;">₹${order.totalAmountINR.toLocaleString('en-IN')}</td>
      </tr>
    </table>

    ${addrHtml}

    <div style="margin-top:32px;text-align:center;">
      <a href="https://labelminara.com/order/success/${order.id}" style="display:inline-block;padding:14px 32px;background:#0f2a5b;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">
        View Your Order
      </a>
    </div>

    <p style="margin-top:28px;font-size:12px;color:#888;text-align:center;line-height:1.7;">
      Expected dispatch within 3–5 business days.<br>
      Questions? Reply to this email or WhatsApp us.
    </p>
  `;

  return shell(content);
}

// ─── Low Stock Alert (admin) ─────────────────────────────────────────────────

export function renderLowStockAlertEmail(
  lowStockItems: Array<{ productTitle: string; size: string; stock: number }>
): string {
  const rows = lowStockItems.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #ede9df;font-size:13px;color:#0f2a5b;">${item.productTitle}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #ede9df;font-size:13px;color:#0f2a5b;text-align:center;">${item.size}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #ede9df;font-size:13px;font-weight:700;text-align:center;color:${item.stock === 0 ? '#C0392B' : '#a68026'};">
        ${item.stock === 0 ? 'OUT OF STOCK' : item.stock}
      </td>
    </tr>
  `).join('');

  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#0f2a5b;margin:0 0 8px;">
      ⚠ Low Stock Alert
    </h2>
    <p style="font-size:14px;color:#555;margin:0 0 24px;">
      The following product variants are running low (≤3 units). Please restock soon.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ede9df;border-radius:8px;overflow:hidden;">
      <thead style="background:#f4ece1;">
        <tr>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Size</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">Stock</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:24px;text-align:center;">
      <a href="https://labelminara.com/admin" style="display:inline-block;padding:12px 28px;background:#0f2a5b;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">
        Open Admin Dashboard
      </a>
    </div>
  `;

  return shell(content);
}

// ─── Shipment Status Updates ─────────────────────────────────────────────────

export interface ShipmentEmailOrder {
  orderNumber: string;
  customerEmail: string;
  awbNumber?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
}

function trackingCta(order: ShipmentEmailOrder): string {
  const details = [
    order.courierName ? `<span style="font-size:12px;color:#888;">Courier: <strong style="color:#0f2a5b;">${escapeHtml(order.courierName)}</strong></span>` : '',
    order.awbNumber   ? `<span style="font-size:12px;color:#888;">AWB: <strong style="color:#0f2a5b;">${escapeHtml(order.awbNumber)}</strong></span>` : '',
  ].filter(Boolean).join('<br>');

  // Reject non-http(s) schemes (javascript:, data:, etc.) before use in an href.
  const safeTrackingUrl = isSafeHttpUrl(order.trackingUrl) ? order.trackingUrl : null;

  return `
    ${details ? `<div style="margin:20px 0;padding:14px 16px;background:#faf8f5;border-radius:8px;border:1px solid #ede9df;text-align:center;line-height:1.8;">${details}</div>` : ''}
    ${safeTrackingUrl ? `
    <div style="margin-top:24px;text-align:center;">
      <a href="${escapeHtml(safeTrackingUrl)}" style="display:inline-block;padding:14px 32px;background:#0f2a5b;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">
        Track Package
      </a>
    </div>` : ''}
  `;
}

export function renderOrderShippedEmail(order: ShipmentEmailOrder): string {
  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#0f2a5b;margin:0 0 8px;">
      Your Order Has Shipped
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 8px;">
      Good news — your order <strong style="color:#0f2a5b;">${escapeHtml(order.orderNumber)}</strong> is on its way to you.
    </p>
    ${trackingCta(order)}
  `;
  return shell(content);
}

export function renderOutForDeliveryEmail(order: ShipmentEmailOrder): string {
  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#0f2a5b;margin:0 0 8px;">
      Out for Delivery Today
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 8px;">
      Your order <strong style="color:#0f2a5b;">${escapeHtml(order.orderNumber)}</strong> is out for delivery today. Please be available to receive it.
    </p>
    ${trackingCta(order)}
  `;
  return shell(content);
}

export function renderOrderDeliveredEmail(order: ShipmentEmailOrder): string {
  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#0f2a5b;margin:0 0 8px;">
      Delivered ✓
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 8px;">
      Your order <strong style="color:#0f2a5b;">${escapeHtml(order.orderNumber)}</strong> has been delivered. We hope you love it — thank you for shopping with Minara Creation.
    </p>
  `;
  return shell(content);
}

export function renderDeliveryIssueEmail(order: ShipmentEmailOrder): string {
  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#0f2a5b;margin:0 0 8px;">
      We Couldn't Complete Your Delivery
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 8px;">
      The courier was unable to deliver your order <strong style="color:#0f2a5b;">${escapeHtml(order.orderNumber)}</strong> and it is being returned to us.
      If you'd still like this order, please reach out and we'll help arrange redelivery.
    </p>
    ${trackingCta(order)}
    <p style="margin-top:24px;font-size:12px;color:#888;text-align:center;">
      Questions? Reply to this email or write to support@labelminara.com
    </p>
  `;
  return shell(content);
}

// ─── Abandon Cart ────────────────────────────────────────────────────────────

export function renderAbandonCartEmail(
  items: Array<{ title: string; size: string; quantity: number; priceINR: number; imageUrl?: string }>,
  customerName: string,
): string {
  const total    = items.reduce((acc, i) => acc + i.priceINR * i.quantity, 0);
  const itemsHtml = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #ede9df;">
        <div style="font-size:13px;font-weight:600;color:#0f2a5b;">${item.title}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">Size: ${item.size} &nbsp;·&nbsp; Qty: ${item.quantity}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #ede9df;text-align:right;font-size:13px;font-weight:600;color:#0f2a5b;">
        ₹${(item.priceINR * item.quantity).toLocaleString('en-IN')}
      </td>
    </tr>
  `).join('');

  const content = `
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#0f2a5b;margin:0 0 8px;">
      You left something behind…
    </h2>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">
      Hi ${customerName || 'there'}, your Minara bag is waiting for you.
      These handcrafted pieces are selling fast — complete your order before your size sells out.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ede9df;">
      <tbody>${itemsHtml}</tbody>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="font-size:15px;font-weight:700;color:#0f2a5b;">Bag Total</td>
        <td style="font-family:Georgia,serif;font-size:20px;color:#0f2a5b;text-align:right;">₹${total.toLocaleString('en-IN')}</td>
      </tr>
    </table>
    <div style="margin-top:28px;text-align:center;">
      <a href="https://labelminara.com/cart" style="display:inline-block;padding:14px 36px;background:#0f2a5b;color:#ffffff;text-decoration:none;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">
        Complete My Order
      </a>
    </div>
    <p style="margin-top:24px;font-size:12px;color:#aaa;text-align:center;">
      Free shipping on orders above ₹2,000 &nbsp;·&nbsp; Easy 7-day returns
    </p>
  `;

  return shell(content);
}
