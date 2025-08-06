import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import List from '@/models/List';
import Contact from '@/models/Contact';
import connectDB from '@/lib/mongodb';

// GET a specific list
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const list = await List.findOne({
      _id: params.id,
      userId: user._id,
      isActive: true
    });

    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ list });
  } catch (error) {
    console.error('Get list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update a specific list
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, enableAiPersonalization, personalizationPrompt } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    await connectDB();

    // Check if list exists and belongs to user
    const existingList = await List.findOne({
      _id: params.id,
      userId: user._id,
      isActive: true
    });

    if (!existingList) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check if another list with this name already exists (excluding current list)
    const duplicateList = await List.findOne({
      userId: user._id,
      name: name.trim(),
      isActive: true,
      _id: { $ne: params.id }
    });

    if (duplicateList) {
      return NextResponse.json({ error: 'A list with this name already exists' }, { status: 400 });
    }

    // Update the list
    const updatedList = await List.findByIdAndUpdate(
      params.id,
      {
        name: name.trim(),
        enableAiPersonalization: enableAiPersonalization || false,
        personalizationPrompt: personalizationPrompt?.trim(),
      },
      { new: true }
    );

    return NextResponse.json({
      message: 'List updated successfully',
      list: updatedList
    });
  } catch (error) {
    console.error('Update list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE a specific list
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Check if list exists and belongs to user
    const existingList = await List.findOne({
      _id: params.id,
      userId: user._id,
      isActive: true
    });

    if (!existingList) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Get contact count for logging
    const contactCount = await Contact.countDocuments({
      listId: params.id
    });

    // Delete all contacts associated with this list
    if (contactCount > 0) {
      await Contact.deleteMany({
        listId: params.id
      });
    }

    // Soft delete the list
    await List.findByIdAndUpdate(params.id, { isActive: false });

    const message = contactCount > 0 
      ? `List deleted successfully. ${contactCount} associated contacts were also deleted.`
      : 'List deleted successfully';

    return NextResponse.json({ 
      message,
      deletedContacts: contactCount
    });
  } catch (error) {
    console.error('Delete list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}