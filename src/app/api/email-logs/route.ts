import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import EmailLog from '@/models/EmailLog';
import connectDB from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get query parameters for pagination and filtering
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Fetch email logs for the user
    const emails = await EmailLog.find({ userId: user._id })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalCount = await EmailLog.countDocuments({ userId: user._id });

    return NextResponse.json({
      success: true,
      emails: emails,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Email logs fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 });
  }
}