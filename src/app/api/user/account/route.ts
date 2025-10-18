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

    const { firstName, lastName, email } = await req.json();

    // Validate inputs
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if email is already taken by another user
    if (email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: user._id }
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email is already in use' },
          { status: 400 }
        );
      }
    }

    // Update user's account information
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
      },
      { new: true }
    ).select('-password').lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Account information updated successfully',
      user: {
        id: updatedUser._id?.toString(),
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
    console.error('Update account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
