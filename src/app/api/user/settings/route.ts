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

    const { timezone } = await req.json();

    console.log('🔄 User Settings Update Request:');
    console.log('- User ID:', user._id);
    console.log('- Timezone:', timezone);

    // Validate timezone if provided
    if (timezone && typeof timezone !== 'string') {
      return NextResponse.json({ error: 'Invalid timezone format' }, { status: 400 });
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

    console.log('💾 Update data to be saved:');
    console.log(JSON.stringify(updateData, null, 2));

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