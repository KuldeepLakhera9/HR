import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly mailDriver: 'console' | 'smtp';
  private readonly fromAddress: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const configuredDriver = this.configService.get<string>('MAIL_DRIVER');

    // Default to 'console' if in development or if SMTP host is not configured
    if (configuredDriver === 'smtp' || (smtpHost && configuredDriver !== 'console')) {
      this.mailDriver = 'smtp';
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(this.configService.get<number>('SMTP_PORT', 587)),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.configService.get<string>('SMTP_USER', ''),
          pass: this.configService.get<string>('SMTP_PASS', ''),
        },
      });
      this.logger.log(`MailService initialized in SMTP mode (${smtpHost})`);
    } else {
      this.mailDriver = 'console';
      this.logger.log('MailService initialized in CONSOLE / DEV mode (emails logged to stdout)');
    }

    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      '"PeopleOS Security" <no-reply@peopleos.local>';
    this.appUrl =
      this.configService.get<string>('APP_URL') ||
      this.configService.get<string>('CORS_ORIGIN') ||
      'http://localhost:3000';
  }

  /**
   * Returns current mail driver ('console' | 'smtp')
   */
  getDriver(): 'console' | 'smtp' {
    return this.mailDriver;
  }

  /**
   * Generic mail sender supporting console dev mode and standard organization SMTP
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    if (this.mailDriver === 'console' || !this.transporter) {
      this.logger.log(
        `\n======================= [DEV EMAIL DISPATCH] =======================\n` +
          `To: ${options.to}\n` +
          `From: ${this.fromAddress}\n` +
          `Subject: ${options.subject}\n` +
          `--------------------------------------------------------------------\n` +
          `${options.text}\n` +
          `====================================================================\n`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Email dispatched to ${options.to} via organization SMTP`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to} via SMTP: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Dispatches a password reset email with secure token link
   */
  async sendPasswordResetEmail(to: string, rawToken: string, firstName?: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const recipientName = firstName ? firstName : 'Team Member';
    const expirationMinutes = 60;

    const subject = 'Reset Your PeopleOS Password';

    const text = `Hello ${recipientName},

We received a request to reset the password for your PeopleOS account.

To proceed with resetting your password, click the following secure link:
${resetUrl}

This link is valid for ${expirationMinutes} minutes and can only be used once.

Security Notice:
If you did not request a password reset, no action is required and your account remains safe.
If you believe your account has been compromised, contact your internal IT Security team immediately.

Warm regards,
PeopleOS Security Team`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #1C1917; }
    .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E7E2DA; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0ECE4; }
    .brand { font-size: 18px; font-weight: 700; color: #D97706; letter-spacing: -0.02em; }
    .title { font-size: 20px; font-weight: 600; margin: 16px 0 8px 0; color: #1C1917; }
    .text { font-size: 14px; line-height: 1.6; color: #44403C; margin: 0 0 16px 0; }
    .button-container { margin: 28px 0; text-align: center; }
    .button { background-color: #D97706; color: #FFFFFF !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; display: inline-block; }
    .footer { font-size: 12px; color: #78716C; margin-top: 28px; padding-top: 16px; border-top: 1px solid #F0ECE4; line-height: 1.5; }
    .code-box { background: #FAF9F6; border: 1px solid #E7E2DA; border-radius: 6px; padding: 10px 14px; font-size: 12px; word-break: break-all; color: #57534E; margin: 14px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">PeopleOS Enterprise</div>
    <div class="title">Password Reset Request</div>
    <p class="text">Hello ${recipientName},</p>
    <p class="text">We received a request to reset the password for your corporate PeopleOS account. Click the button below to choose a new password:</p>
    
    <div class="button-container">
      <a href="${resetUrl}" class="button" target="_blank" rel="noopener noreferrer">Reset Password</a>
    </div>

    <p class="text">This link is valid for <strong>${expirationMinutes} minutes</strong> and can only be used once.</p>
    
    <p class="text" style="font-size: 13px; color: #78716C;">
      If the button above does not work, copy and paste this secure link into your web browser:
    </p>
    <div class="code-box">${resetUrl}</div>

    <div class="footer">
      <p><strong>Security Notice:</strong> If you did not initiate this request, you can safely ignore this email. Your current password remains active and unchanged.</p>
      <p>&copy; ${new Date().getFullYear()} PeopleOS Enterprise HRMS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    await this.sendMail({
      to,
      subject,
      text,
      html,
    });
  }
}
