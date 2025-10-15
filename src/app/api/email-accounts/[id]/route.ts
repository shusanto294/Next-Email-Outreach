import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { authenticateUser } from '@/lib/auth';
import EmailAccount from '@/models/EmailAccount';
import SentEmail from '@/models/SentEmail';
import connectDB from '@/lib/mongodb';

const updateEmailAccountSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  provider: z.enum(['gmail', 'outlook', 'smtp', 'other']).optional(),
  fromName: z.string().min(1, 'From Name is required').optional(),
  smtpHost: z.string().min(1, 'SMTP host is required').optional(),
  smtpPort: z.number().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().min(1, 'SMTP username is required').optional(),
  smtpPassword: z.string().optional(),
  imapHost: z.string().min(1, 'IMAP host is required').optional(),
  imapPort: z.number().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  dailyLimit: z.number().min(1).max(1000).optional(),
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const { id } = await params;
    
    const emailAccount = await EmailAccount.findOneAndDelete({
      _id: id,
      userId: user._id,
    });

    if (!emailAccount) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Email account deleted successfully' });
  } catch (error) {
    console.error('Delete email account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    const { id } = await params;
    console.log('🔄 Updating email account:', id);
    console.log('📊 Update data:', { ...data, smtpPassword: data.smtpPassword ? '[PROVIDED]' : '[NOT PROVIDED]' });

    // Validate data
    const validatedData = updateEmailAccountSchema.parse(data);

    await connectDB();

    // If password is empty, don't update it (keep existing one)
    const updateData = { ...validatedData };
    if (!updateData.smtpPassword || updateData.smtpPassword.trim() === '') {
      delete updateData.smtpPassword;
      console.log('🔒 Password not provided, keeping existing password');
    }

    const emailAccount = await EmailAccount.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: updateData },
      { new: true }
    ).select('-smtpPassword');

    if (!emailAccount) {
      console.log('❌ Email account not found');
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    // Calculate sentToday count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sentCount = await SentEmail.countDocuments({
      emailAccountId: emailAccount._id,
      sentAt: { $gte: today },
      status: { $nin: ['failed', 'bounced'] }
    });

    const emailAccountWithCount = {
      ...emailAccount.toObject(),
      sentToday: sentCount
    };

    console.log('✅ Email account updated successfully');
    return NextResponse.json({
      message: 'Email account updated successfully',
      emailAccount: emailAccountWithCount,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error('Zod validation error:', error);
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update email account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}