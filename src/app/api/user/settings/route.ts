import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import User from '@/models/User';
import connectDB from '@/lib/mongodb';

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { timezone, openaiApiKey, ignoreKeywords, emailCheckDelay, emailSendDelay } = await req.json();

    console.log('🔄 User Settings Update Request:');
    console.log('- User ID:', user._id);
    console.log('- Timezone:', timezone);
    console.log('- OpenAI API Key:', openaiApiKey ? '***' : 'Not provided');
    console.log('- Ignore Keywords:', ignoreKeywords);
    console.log('- Email Check Delay:', emailCheckDelay);
    console.log('- Email Send Delay:', emailSendDelay);

    // Validate timezone if provided
    if (timezone && typeof timezone !== 'string') {
      return NextResponse.json({ error: 'Invalid timezone format' }, { status: 400 });
    }

    // Validate openaiApiKey if provided
    if (openaiApiKey !== undefined && typeof openaiApiKey !== 'string') {
      return NextResponse.json({ error: 'Invalid OpenAI API key format' }, { status: 400 });
    }

    // Validate ignoreKeywords if provided
    if (ignoreKeywords !== undefined && typeof ignoreKeywords !== 'string') {
      return NextResponse.json({ error: 'Invalid ignore keywords format' }, { status: 400 });
    }

    // Validate emailCheckDelay if provided
    if (emailCheckDelay !== undefined && (typeof emailCheckDelay !== 'number' || emailCheckDelay < 1)) {
      return NextResponse.json({ error: 'Invalid email check delay. Must be a positive number.' }, { status: 400 });
    }

    // Validate emailSendDelay if provided
    if (emailSendDelay !== undefined && (typeof emailSendDelay !== 'number' || emailSendDelay < 1)) {
      return NextResponse.json({ error: 'Invalid email send delay. Must be a positive number.' }, { status: 400 });
    }

    // Validate timezone exists
    if (timezone) {
      try {
        // Test if timezone is valid by trying to format a date with it
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
    }

    await connectDB();

    // Prepare update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (timezone !== undefined) {
      updateData.timezone = timezone.trim();
    }

    if (openaiApiKey !== undefined) {
      updateData.openaiApiKey = openaiApiKey.trim();
    }

    if (ignoreKeywords !== undefined) {
      updateData.ignoreKeywords = ignoreKeywords.trim();
    }

    if (emailCheckDelay !== undefined) {
      updateData.emailCheckDelay = emailCheckDelay;
    }

    if (emailSendDelay !== undefined) {
      updateData.emailSendDelay = emailSendDelay;
    }

    console.log('💾 Update data to be saved:');
    console.log(JSON.stringify({
      ...updateData,
      openaiApiKey: updateData.openaiApiKey ? '***' : undefined
    }, null, 2));

    // Update user settings
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true }
    ).select('-password'); // Exclude password from response

    if (!updatedUser) {
      console.error('❌ User not found after update');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User settings updated successfully:');
    console.log('- Timezone:', updatedUser.timezone);
    console.log('- OpenAI API Key:', updatedUser.openaiApiKey ? '***' : 'Not set');
    console.log('- Ignore Keywords:', updatedUser.ignoreKeywords);
    console.log('- Email Check Delay:', updatedUser.emailCheckDelay);
    console.log('- Email Send Delay:', updatedUser.emailSendDelay);

    return NextResponse.json({
      message: 'User settings updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update user settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const userData = await User.findById(user._id).select('-password');
    
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: userData,
    });
  } catch (error) {
    console.error('Get user settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}