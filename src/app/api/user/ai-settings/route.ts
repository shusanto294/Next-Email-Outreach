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

    const { 
      aiProvider, 
      openaiApiKey, 
      openaiModel, 
      deepseekApiKey, 
      deepseekModel 
    } = await req.json();

    console.log('🔄 AI Settings Update Request:');
    console.log('- User ID:', user._id);
    console.log('- AI Provider:', aiProvider);
    console.log('- OpenAI API Key provided:', openaiApiKey ? 'Yes' : 'No');
    console.log('- OpenAI Model:', openaiModel);
    console.log('- DeepSeek API Key provided:', deepseekApiKey ? 'Yes' : 'No');
    console.log('- DeepSeek Model:', deepseekModel);

    // Validate aiProvider if provided
    if (aiProvider && !['openai', 'deepseek'].includes(aiProvider)) {
      return NextResponse.json({ error: 'Invalid AI provider' }, { status: 400 });
    }

    // Get current user data to check existing keys
    await connectDB();
    const existingUser = await User.findById(user._id);
    
    console.log('📊 Current user data in DB:');
    console.log('- AI Provider:', existingUser?.aiProvider);
    console.log('- OpenAI API Key exists:', existingUser?.openaiApiKey ? 'Yes' : 'No');
    console.log('- OpenAI Model:', existingUser?.openaiModel);
    console.log('- DeepSeek API Key exists:', existingUser?.deepseekApiKey ? 'Yes' : 'No');
    console.log('- DeepSeek Model:', existingUser?.deepseekModel);
    
    // Check if we have existing keys or new keys being provided
    const hasOpenaiKey = (openaiApiKey && openaiApiKey.trim().length > 0) || existingUser?.openaiApiKey;
    const hasDeepseekKey = (deepseekApiKey && deepseekApiKey.trim().length > 0) || existingUser?.deepseekApiKey;

    // If a provider is selected, ensure its API key exists (either provided now or already saved)
    if (aiProvider === 'openai' && !hasOpenaiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required for selected provider' }, { status: 400 });
    }

    if (aiProvider === 'deepseek' && !hasDeepseekKey) {
      return NextResponse.json({ error: 'DeepSeek API key is required for selected provider' }, { status: 400 });
    }

    // Prepare update object - only include fields that are provided and non-empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    
    if (aiProvider !== undefined) {
      updateData.aiProvider = aiProvider;
    }
    
    if (openaiApiKey !== undefined && openaiApiKey.trim() !== '') {
      updateData.openaiApiKey = openaiApiKey.trim();
    }
    
    if (openaiModel !== undefined) {
      updateData.openaiModel = openaiModel.trim();
    }
    
    if (deepseekApiKey !== undefined && deepseekApiKey.trim() !== '') {
      updateData.deepseekApiKey = deepseekApiKey.trim();
    }
    
    if (deepseekModel !== undefined) {
      updateData.deepseekModel = deepseekModel.trim();
    }

    console.log('💾 Update data to be saved:');
    console.log(JSON.stringify(updateData, null, 2));

    // Update user with AI settings
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true }
    ).select('-password'); // Exclude password from response

    if (!updatedUser) {
      console.error('❌ User not found after update');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User updated successfully:');
    console.log('- AI Provider:', updatedUser.aiProvider);
    console.log('- OpenAI API Key exists:', updatedUser.openaiApiKey ? 'Yes' : 'No');
    console.log('- OpenAI Model:', updatedUser.openaiModel);
    console.log('- DeepSeek API Key exists:', updatedUser.deepseekApiKey ? 'Yes' : 'No');
    console.log('- DeepSeek Model:', updatedUser.deepseekModel);

    return NextResponse.json({
      message: 'AI settings updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update AI settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const userData = await User.findById(user._id).select('-password');
    
    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: userData,
    });
  } catch (error) {
    console.error('Get AI settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}