import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import List from '@/models/List';
import Contact from '@/models/Contact';
import connectDB from '@/lib/mongodb';

// GET all lists for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const lists = await List.find({ 
      userId: user._id,
      isActive: true 
    }).sort({ createdAt: -1 });

    return NextResponse.json({ lists });
  } catch (error) {
    console.error('Get lists error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create a new list
export async function POST(req: NextRequest) {
  try {
    console.log('📝 Starting list creation...');
    
    const user = await authenticateUser(req);
    if (!user) {
      console.log('❌ Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('✅ User authenticated:', user.email);

    const body = await req.json();
    console.log('📋 Request body:', body);
    
    const { name, enableAiPersonalization, personalizationPrompt } = body;

    if (!name || !name.trim()) {
      console.log('❌ List name validation failed');
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    await connectDB();
    console.log('✅ Database connected');

    // Check if list with this name already exists for this user
    const existingList = await List.findOne({
      userId: user._id,
      name: name.trim(),
      isActive: true
    });

    if (existingList) {
      console.log('❌ List name already exists');
      return NextResponse.json({ error: 'A list with this name already exists' }, { status: 400 });
    }

    const listData = {
      userId: user._id,
      name: name.trim(),
      enableAiPersonalization: enableAiPersonalization || false,
      personalizationPrompt: personalizationPrompt?.trim(),
      contactCount: 0,
      isActive: true,
    };
    console.log('📋 Creating list with data:', listData);

    const newList = new List(listData);
    await newList.save();
    console.log('✅ List created successfully:', newList._id);

    return NextResponse.json({ 
      message: 'List created successfully',
      list: newList 
    }, { status: 201 });
  } catch (error: any) {
    console.error('❌ Create list error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}