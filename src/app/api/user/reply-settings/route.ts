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

    const { ignoreKeywords } = await req.json();

    await connectDB();

    // Update user's reply settings
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        ignoreKeywords: ignoreKeywords || '',
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Reply settings updated successfully',
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        plan: updatedUser.plan,
        emailsSent: updatedUser.emailsSent,
        emailsLimit: updatedUser.emailsLimit,
        timezone: updatedUser.timezone,
        aiProvider: updatedUser.aiProvider,
        openaiApiKey: updatedUser.openaiApiKey,
        openaiModel: updatedUser.openaiModel,
        deepseekApiKey: updatedUser.deepseekApiKey,
        deepseekModel: updatedUser.deepseekModel,
        ignoreKeywords: updatedUser.ignoreKeywords,
      }
    });
  } catch (error) {
    console.error('Update reply settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
