import nodemailer from "nodemailer";

export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Built inside the function, not at module load, so tests that mock the
  // `nodemailer` module never need real SMTP_* env vars to exist.
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  try {
    await transport.sendMail({ from: process.env.SMTP_FROM, to: input.to, subject: input.subject, text: input.body });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
