import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import SentEmail from '@/models/SentEmail';
import ReceivedEmail from '@/models/ReceivedEmail';
import connectDB from '@/lib/mongodb';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'sent' or 'received'

    let email = null;

    if (type === 'sent') {
      email = await SentEmail.findOne({ _id: id, userId: user._id })
        .populate('emailAccountId', 'email provider fromName')
        .populate('contactId', 'email firstName lastName company position')
        .populate('campaignId', 'name')
        .lean();

      if (email) {
        email = { ...email, type: 'sent' };
      }
    } else if (type === 'received') {
      email = await ReceivedEmail.findOne({ _id: id, userId: user._id })
        .populate('emailAccountId', 'email provider')
        .populate('contactId', 'email firstName lastName company position')
        .populate('campaignId', 'name')
        .populate('sentEmailId')
        .lean();

      if (email) {
        // Mark as seen when viewing (user opened the email details)
        await ReceivedEmail.updateOne(
          { _id: id },
          { $set: { isSeen: true, isRead: true, readAt: new Date() } }
        );

        email = { ...email, type: 'received', isRead: true, isSeen: true };
      }
    }

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({ email });
  } catch (error) {
    console.error('Get email details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;
    const body = await req.json();
    const { type, action, value } = body; // action: 'markRead', 'star', 'category'

    if (type !== 'received') {
      return NextResponse.json({ error: 'Only received emails can be updated' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    switch (action) {
      case 'markRead':
        updateData.isRead = value;
        if (value) {
          updateData.readAt = new Date();
        }
        break;
      case 'star':
        updateData.isStarred = value;
        break;
      case 'category':
        updateData.category = value;
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const email = await ReceivedEmail.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: updateData },
      { new: true }
    );

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({ email, message: 'Email updated successfully' });
  } catch (error) {
    console.error('Update email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
