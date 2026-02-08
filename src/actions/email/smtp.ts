import config from '../../config.js';

export async function sendEmailSmtp(to: string, subject: string, body: string): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: (config as any).SMTP_HOST ?? 'smtp.gmail.com',
    port: (config as any).SMTP_PORT ?? 587,
    secure: false,
    auth: { user: (config as any).SMTP_USER, pass: (config as any).SMTP_PASS },
  });

  await transporter.sendMail({
    from: (config as any).SMTP_FROM ?? (config as any).SMTP_USER,
    to, subject, html: body,
  });
}
