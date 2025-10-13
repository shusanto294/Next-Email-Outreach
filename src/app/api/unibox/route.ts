import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import SentEmail from '@/models/SentEmail';
import ReceivedEmail from '@/models/ReceivedEmail';
import connectDB from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type') || 'all'; // 'all', 'sent', 'received'
    const category = searchParams.get('category'); // For received emails: 'inbox', 'spam', 'trash', 'archive'
    const isRead = searchParams.get('isRead'); // 'true', 'false', or null for all
    const search = searchParams.get('search'); // Search in subject, from, to

    const skip = (page - 1) * limit;

    // Build filters
    const baseFilter: any = { userId: user._id };

    // Prepare queries for sent and received emails
    let sentEmails: any[] = [];
    let receivedEmails: any[] = [];
    let totalSent = 0;
    let totalReceived = 0;

    if (type === 'all' || type === 'sent') {
      const sentFilter = { ...baseFilter };

      if (search) {
        sentFilter.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { to: { $regex: search, $options: 'i' } },
          { from: { $regex: search, $options: 'i' } },
        ];
      }

      const sentQuery = SentEmail.find(sentFilter)
        .populate('emailAccountId', 'email provider')
        .populate('contactId', 'email firstName lastName company')
        .populate('campaignId', 'name')
        .sort({ sentAt: -1 })
        .select('-content -htmlContent'); // Exclude full content for list view

      if (type === 'sent') {
        sentEmails = await sentQuery.skip(skip).limit(limit).lean();
        totalSent = await SentEmail.countDocuments(sentFilter);
      } else {
        sentEmails = await sentQuery.limit(limit).lean();
      }

      // Add type identifier
      sentEmails = sentEmails.map(email => ({
        ...email,
        type: 'sent',
        date: email.sentAt,
      }));
    }

    if (type === 'all' || type === 'received') {
      const receivedFilter = { ...baseFilter };

      if (category) {
        receivedFilter.category = category;
      }

      if (isRead !== null && isRead !== undefined) {
        receivedFilter.isRead = isRead === 'true';
      }

      if (search) {
        receivedFilter.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { from: { $regex: search, $options: 'i' } },
          { to: { $regex: search, $options: 'i' } },
        ];
      }

      const receivedQuery = ReceivedEmail.find(receivedFilter)
        .populate('emailAccountId', 'email provider')
        .populate('contactId', 'email firstName lastName company')
        .populate('campaignId', 'name')
        .sort({ receivedAt: -1 })
        .select('-content -htmlContent -rawHeaders'); // Exclude full content for list view

      if (type === 'received') {
        receivedEmails = await receivedQuery.skip(skip).limit(limit).lean();
        totalReceived = await ReceivedEmail.countDocuments(receivedFilter);
      } else {
        receivedEmails = await receivedQuery.limit(limit).lean();
      }

      // Add type identifier
      receivedEmails = receivedEmails.map(email => ({
        ...email,
        type: 'received',
        date: email.receivedAt,
      }));
    }

    // Combine and sort by date
    let combinedEmails = [...sentEmails, ...receivedEmails];

    if (type === 'all') {
      combinedEmails.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Descending order (newest first)
      });

      // Paginate combined results
      combinedEmails = combinedEmails.slice(skip, skip + limit);

      // Get totals for all
      totalSent = await SentEmail.countDocuments(baseFilter);
      totalReceived = await ReceivedEmail.countDocuments(baseFilter);
    }

    const total = type === 'sent' ? totalSent : type === 'received' ? totalReceived : totalSent + totalReceived;

    return NextResponse.json({
      emails: combinedEmails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        totalSent,
        totalReceived,
      },
    });
  } catch (error) {
    console.error('Get unibox emails error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
