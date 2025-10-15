import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import Contact from '@/models/Contact';
import Campaign from '@/models/Campaign';
import connectDB from '@/lib/mongodb';

// GET a specific contact
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const { id } = await params;
    const contact = await Contact.findOne({
      _id: id,
      userId: user._id,
    }).populate('campaignId', 'name');

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Get contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update a specific contact
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contactData = await req.json();
    const { email } = contactData;

    if (email) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
      }
    }

    await connectDB();
    
    const { id } = await params;

    // Check if contact exists and belongs to user
    const existingContact = await Contact.findOne({
      _id: id,
      userId: user._id,
    });

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // If email is being changed, check if new email already exists
    if (email && email.toLowerCase().trim() !== existingContact.email) {
      const duplicateContact = await Contact.findOne({
        userId: user._id,
        email: email.toLowerCase().trim(),
        _id: { $ne: id }
      });

      if (duplicateContact) {
        return NextResponse.json({ error: 'Contact with this email already exists' }, { status: 400 });
      }
    }

    // Update the contact
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (email) updateData.email = email.toLowerCase().trim();
    if (contactData.firstName !== undefined) updateData.firstName = contactData.firstName?.trim();
    if (contactData.lastName !== undefined) updateData.lastName = contactData.lastName?.trim();
    if (contactData.company !== undefined) updateData.company = contactData.company?.trim();
    if (contactData.position !== undefined) updateData.position = contactData.position?.trim();
    if (contactData.phone !== undefined) updateData.phone = contactData.phone?.trim();
    if (contactData.website !== undefined) updateData.website = contactData.website?.trim();
    if (contactData.linkedin !== undefined) updateData.linkedin = contactData.linkedin?.trim();
    if (contactData.companyLinkedin !== undefined) updateData.companyLinkedin = contactData.companyLinkedin?.trim();
    if (contactData.status !== undefined) updateData.status = contactData.status;
    if (contactData.source !== undefined) updateData.source = contactData.source?.trim();
    if (contactData.notes !== undefined) updateData.notes = contactData.notes?.trim();
    if (contactData.personalization !== undefined) updateData.personalization = contactData.personalization?.trim();
    if (contactData.campaignId !== undefined) updateData.campaignId = contactData.campaignId || null;

    // Handle campaign change - update campaign contactIds arrays
    if (contactData.campaignId !== undefined) {
      const oldCampaignId = existingContact.campaignId;
      const newCampaignId = contactData.campaignId;

      // If campaign changed, update both old and new campaign's contactIds
      if (oldCampaignId?.toString() !== newCampaignId) {
        // Remove from old campaign
        if (oldCampaignId) {
          await Campaign.findByIdAndUpdate(
            oldCampaignId,
            { $pull: { contactIds: id } }
          );
        }

        // Add to new campaign
        if (newCampaignId) {
          await Campaign.findByIdAndUpdate(
            newCampaignId,
            { $addToSet: { contactIds: id } }
          );
        }
      }
    }

    const updatedContact = await Contact.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('campaignId', 'name');

    return NextResponse.json({
      message: 'Contact updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE a specific contact
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    const { id } = await params;

    // Check if contact exists and belongs to user
    const existingContact = await Contact.findOne({
      _id: id,
      userId: user._id,
    });

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Delete the contact
    await Contact.findByIdAndDelete(id);

    return NextResponse.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}