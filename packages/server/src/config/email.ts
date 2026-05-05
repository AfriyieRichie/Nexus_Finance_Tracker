import nodemailer from 'nodemailer';
import { config } from './index';

export const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false,
  ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } } : {}),
});

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({ from: config.SMTP_FROM, to, subject, html });
}
