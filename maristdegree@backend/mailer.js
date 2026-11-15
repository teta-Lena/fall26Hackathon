// Sends email through SMTP (e.g. a Gmail account with an app password).
// Without SMTP settings in .env it uses Ethereal, a fake inbox for testing:
// nothing is delivered, and the log prints a link to view the message.
import "dotenv/config";
import nodemailer from "nodemailer";

let transportPromise;

function getTransport() {
  transportPromise ??= (async () => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      const port = Number(SMTP_PORT) || 465;
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
    }
    console.warn("SMTP not configured: using an Ethereal test inbox (no real delivery).");
    const test = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: test.smtp.host,
      port: test.smtp.port,
      secure: test.smtp.secure,
      auth: { user: test.user, pass: test.pass },
    });
  })();
  return transportPromise;
}

// Returns { messageId, previewUrl } (previewUrl only for Ethereal).
export async function sendMail({ to, cc, subject, text, attachments }) {
  const transport = await getTransport();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "SmartDegree <no-reply@example.com>";
  const info = await transport.sendMail({ from, to, cc, subject, text, attachments });
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) console.log(`Email preview: ${previewUrl}`);
  return { messageId: info.messageId, previewUrl };
}
