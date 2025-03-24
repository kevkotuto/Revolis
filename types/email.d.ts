import { EmailPayload } from '@/types';

declare module 'nodemailer' {
  interface Transporter {
    sendMail(mailOptions: EmailPayload): Promise<{
      messageId: string;
      response: string;
    }>;
  }
} 