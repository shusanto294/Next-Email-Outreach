import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import EmailAccount from '@/models/EmailAccount';
import connectDB from '@/lib/mongodb';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const emailAccount = await EmailAccount.findOneAndDelete({
      _id: params.id,
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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();
    console.log('🔄 Updating email account:', params.id);
    console.log('📊 Update data:', { ...data, smtpPassword: data.smtpPassword ? '[PROVIDED]' : '[NOT PROVIDED]' });
    
    await connectDB();
    
    // If password is empty, don't update it (keep existing one)
    const updateData = { ...data };
    if (!updateData.smtpPassword || updateData.smtpPassword.trim() === '') {
      delete updateData.smtpPassword;
      console.log('🔒 Password not provided, keeping existing password');
    }
    
    const emailAccount = await EmailAccount.findOneAndUpdate(
      { _id: params.id, userId: user._id },
      { $set: updateData },
      { new: true }
    ).select('-smtpPassword');

    if (!emailAccount) {
      console.log('❌ Email account not found');
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    console.log('✅ Email account updated successfully');
    return NextResponse.json({
      message: 'Email account updated successfully',
      emailAccount,
    });
  } catch (error) {
    console.error('Update email account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}