const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

function createTransporter() {
  const secure = process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587') === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });
}

const FROM = `"iBirdOS" <${process.env.SMTP_FROM || 'noreply@ibirdos.com'}>`;

async function sendEmail(to, subject, html, text) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn(`Email not configured. Would have sent to ${to}: ${subject}`);
    logger.info(`Invite link would appear in email body. Configure SMTP_USER/SMTP_PASS to enable real email delivery.`);
    return false;
  }
  try {
    const transporter = createTransporter();
    await transporter.sendMail({ from: FROM, to, subject, html, text });
    logger.info(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
  console.error("❌ EMAIL FULL ERROR:", err); // 👈 FULL ERROR
  logger.error(`Email failed to ${to}`, err.message);
  return false;
}
}

async function sendInviteEmail(toEmail, inviterName, companyName, role, inviteUrl) {
  const roleLabels = { manager: 'Manager', staff: 'Kitchen Staff', customer: 'Customer' };
  const html = `
    <div style="font-family:system-ui,sans-serif;background:#f5f5f0;margin:0;padding:40px 20px;">
      <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;border:1px solid #e5e5e0;">
        <div style="background:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:20px;">iBirdOS</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#0f172a;">You're invited to ${companyName}</h2>
          <p style="color:#475569;line-height:1.6;">
            <strong>${inviterName}</strong> invited you to join <strong>${companyName}</strong> as <strong>${roleLabels[role] || role}</strong>.
          </p>
          <a href="${inviteUrl}" style="display:inline-block;background:#f29722;color:#0d1117;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
            Accept Invitation →
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
            Or copy this link: ${inviteUrl}<br/>
            Expires in 7 days.
          </p>
        </div>
      </div>
    </div>`;
  return sendEmail(toEmail, `You're invited to ${companyName} on iBirdOS`, html, `Accept at: ${inviteUrl}`);
}

async function sendWelcomeEmail(toEmail, fullName, companyName) {
  const html = `
    <div style="font-family:system-ui,sans-serif;background:#f5f5f0;margin:0;padding:40px 20px;">
      <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;border:1px solid #e5e5e0;">
        <div style="background:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;">iBirdOS</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#0f172a;">Welcome, ${fullName}!</h2>
          <p style="color:#475569;">Your workspace <strong>${companyName}</strong> is ready. 30-day free trial started.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="display:inline-block;background:#f29722;color:#0d1117;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            Go to Dashboard →
          </a>
        </div>
      </div>
    </div>`;
  return sendEmail(toEmail, `Welcome to iBirdOS — ${companyName} is ready`, html);
}

async function sendPriceAlertEmail(toEmail, ingredientName, oldPrice, newPrice, changePct) {
  const isUp = newPrice > oldPrice;
  const subject = `${isUp ? '⚠️ Price increase' : '📉 Price decrease'}: ${ingredientName} (${Math.abs(changePct).toFixed(1)}%)`;
  const text = `${ingredientName} changed from $${oldPrice} to $${newPrice}/unit (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%). All recipes recalculated.`;
  return sendEmail(toEmail, subject, `<p>${text}</p>`, text);
}

module.exports = { sendInviteEmail, sendWelcomeEmail, sendPriceAlertEmail };
