import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth';
import { testBothConnections } from '@/lib/email-test';

const testSchema = z.object({
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1, 'SMTP username is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.number().min(1).max(65535),
  imapSecure: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    const validatedData = testSchema.parse(data);

    const smtpConfig = {
      host: validatedData.smtpHost,
      port: validatedData.smtpPort,
      secure: validatedData.smtpSecure,
      username: validatedData.smtpUsername,
      password: validatedData.smtpPassword,
    };

    const imapConfig = {
      host: validatedData.imapHost,
      port: validatedData.imapPort,
      secure: validatedData.imapSecure,
      username: validatedData.smtpUsername, // Use same username as SMTP
      password: validatedData.smtpPassword, // Use same password as SMTP
    };

    const results = await testBothConnections(smtpConfig, imapConfig);

    return NextResponse.json({
      success: results.smtp.success && results.imap.success,
      smtp: results.smtp,
      imap: results.imap,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Test connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}