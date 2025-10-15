import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { authenticateUser } from '@/lib/auth';
import EmailAccount from '@/models/EmailAccount';
import connectDB from '@/lib/mongodb';
import { testBothConnections } from '@/lib/email-test';

const emailAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  provider: z.enum(['gmail', 'outlook', 'smtp', 'other']),
  fromName: z.string().optional(),
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUsername: z.string().min(1, 'SMTP username is required'),
  smtpPassword: z.string().min(1, 'SMTP password is required'),
  imapHost: z.string().min(1, 'IMAP host is required'),
  imapPort: z.number().min(1).max(65535),
  imapSecure: z.boolean(),
  dailyLimit: z.number().min(1).max(1000).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const emailAccounts = await EmailAccount.find({ userId: user._id }).select('-smtpPassword');

    return NextResponse.json({ emailAccounts });
  } catch (error) {
    console.error('Get email accounts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    const validatedData = emailAccountSchema.parse(data);

    await connectDB();
    
    // Check if email account already exists for this user
    const existingAccount = await EmailAccount.findOne({
      userId: user._id,
      email: validatedData.email,
    });

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Email account already exists' },
        { status: 409 }
      );
    }

    // Test SMTP and IMAP connections before saving
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

    const connectionTests = await testBothConnections(smtpConfig, imapConfig);

    if (!connectionTests.smtp.success) {
      return NextResponse.json(
        { 
          error: 'SMTP connection failed', 
          details: connectionTests.smtp.error,
          smtpTest: connectionTests.smtp
        },
        { status: 400 }
      );
    }

    if (!connectionTests.imap.success) {
      return NextResponse.json(
        { 
          error: 'IMAP connection failed', 
          details: connectionTests.imap.error,
          imapTest: connectionTests.imap
        },
        { status: 400 }
      );
    }

    const emailAccount = new EmailAccount({
      ...validatedData,
      userId: user._id,
    });

    await emailAccount.save();

    // Return account without password
    const accountResponse = await EmailAccount.findById(emailAccount._id).select('-smtpPassword');

    return NextResponse.json({
      message: 'Email account added successfully',
      emailAccount: accountResponse,
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Add email account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}