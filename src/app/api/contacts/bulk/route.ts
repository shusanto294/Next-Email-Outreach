import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import Campaign from '@/models/Campaign';
import connectDB from '@/lib/mongodb';

// POST bulk operations on contacts
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, filters, campaignId } = await req.json();

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    await connectDB();

    // Build query based on filters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { userId: user._id };

    if (filters) {
      if (filters.campaignId) {
        query.campaignId = filters.campaignId;
      }

      if (filters.sent) {
        if (filters.sent === 'sent') {
          query.sent = { $gt: 0 };
        } else if (filters.sent === 'not-sent') {
          query.sent = 0;
        }
      }

      if (filters.search) {
        query.$or = [
          { email: { $regex: filters.search, $options: 'i' } },
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
          { company: { $regex: filters.search, $options: 'i' } },
        ];
      }
    }

    if (action === 'delete') {
      // Find all matching contacts first to get their IDs and campaignIds
      const contactsToDelete = await Contact.find(query).select('_id campaignId');
      const contactIds = contactsToDelete.map(c => c._id);

      // Remove contacts from their campaigns
      const campaignIds = [...new Set(contactsToDelete.map(c => c.campaignId).filter(Boolean))];
      for (const campId of campaignIds) {
        await Campaign.findByIdAndUpdate(
          campId,
          { $pull: { contactIds: { $in: contactIds } } }
        );
      }

      // Delete the contacts
      const result = await Contact.deleteMany(query);

      return NextResponse.json({
        message: `Successfully deleted ${result.deletedCount} contact(s)`,
        count: result.deletedCount
      });
    }

    if (action === 'move') {
      if (!campaignId) {
        return NextResponse.json({ error: 'Campaign ID is required for move action' }, { status: 400 });
      }

      // Find all matching contacts
      const contactsToMove = await Contact.find(query).select('_id campaignId');
      const contactIds = contactsToMove.map(c => c._id);

      // Group contacts by their old campaign
      const oldCampaignIds = [...new Set(contactsToMove.map(c => c.campaignId).filter(Boolean))];

      // Remove from old campaigns
      for (const oldCampId of oldCampaignIds) {
        if (!oldCampId) continue;
        const contactIdsInThisCampaign = contactsToMove
          .filter(c => c.campaignId?.toString() === oldCampId.toString())
          .map(c => c._id);

        await Campaign.findByIdAndUpdate(
          oldCampId,
          { $pull: { contactIds: { $in: contactIdsInThisCampaign } } }
        );
      }

      // Update contacts to new campaign
      const result = await Contact.updateMany(
        query,
        { $set: { campaignId: campaignId } }
      );

      // Add to new campaign
      await Campaign.findByIdAndUpdate(
        campaignId,
        { $addToSet: { contactIds: { $each: contactIds } } }
      );

      return NextResponse.json({
        message: `Successfully moved ${result.modifiedCount} contact(s) to new campaign`,
        count: result.modifiedCount
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Bulk operation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
