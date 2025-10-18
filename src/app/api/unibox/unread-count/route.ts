import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import ReceivedEmail from '@/models/ReceivedEmail';
import connectDB from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Count unread received emails for this user
    const unreadCount = await ReceivedEmail.countDocuments({
      userId: user._id,
      isRead: false,
    });

    return NextResponse.json({
      unreadCount,
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
