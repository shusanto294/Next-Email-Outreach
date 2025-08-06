const mongoose = require('mongoose');
const dotenv = require('dotenv');
const axios = require('axios');
const { JSDOM } = require('jsdom');

// Load environment variables from current directory
dotenv.config({ path: '.env.local' });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local file');
  process.exit(1);
}

// User Schema
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'professional', 'enterprise'],
    default: 'free',
  },
  emailsSent: {
    type: Number,
    default: 0,
  },
  emailsLimit: {
    type: Number,
    default: 100,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  timezone: {
    type: String,
    trim: true,
    default: 'UTC',
  },
  aiProvider: {
    type: String,
    enum: ['openai', 'deepseek', null],
    default: null,
  },
  openaiApiKey: {
    type: String,
    trim: true,
  },
  openaiModel: {
    type: String,
    trim: true,
    default: 'gpt-4o-mini',
  },
  deepseekApiKey: {
    type: String,
    trim: true,
  },
  deepseekModel: {
    type: String,
    trim: true,
    default: 'deepseek-chat',
  },
}, {
  timestamps: true,
});

// List Schema
const ListSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  enableAiPersonalization: {
    type: Boolean,
    default: false,
  },
  personalizationPrompt: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  contactCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Contact Schema
const ContactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  listId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  company: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  position: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 20,
  },
  website: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  linkedin: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  companyLinkedin: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  city: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  state: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  country: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  industry: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  revenue: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  employees: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  websiteContent: {
    type: String,
    trim: true,
    maxlength: 10000,
  },
  personalization: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  status: {
    type: String,
    enum: ['active', 'unsubscribed', 'bounced', 'complained', 'do-not-contact'],
    default: 'active',
  },
  lastContacted: {
    type: Date,
  },
  timesContacted: {
    type: Number,
    default: 0,
    min: 0,
  },
  emailStatus: {
    type: String,
    enum: ['never-sent', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'],
    default: 'never-sent',
  },
  source: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
}, {
  timestamps: true,
});

// Models
const User = mongoose.model('User', UserSchema);
const List = mongoose.model('List', ListSchema);
const Contact = mongoose.model('Contact', ContactSchema);

async function connectToDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

async function fetchWebsiteContent(url) {
  try {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    console.log(`   🌐 Fetching content from: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Extract text content from key elements
    const title = document.querySelector('title')?.textContent || '';
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    
    // Get main content (try multiple selectors)
    const contentSelectors = [
      'main',
      '.content',
      '#content',
      '.main-content',
      'article',
      '.about',
      '.hero',
      '.intro'
    ];
    
    let mainContent = '';
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainContent = element.textContent || '';
        break;
      }
    }

    // If no specific content found, get body text (limit to first 2000 chars)
    if (!mainContent) {
      const bodyText = document.body?.textContent || '';
      mainContent = bodyText.substring(0, 2000);
    }

    // Clean up the content
    const content = `Title: ${title}\n\nDescription: ${metaDescription}\n\nContent: ${mainContent}`
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .substring(0, 8000); // Limit to 8000 chars to stay within DB limit

    console.log(`   ✅ Extracted ${content.length} characters of content`);
    return content;

  } catch (error) {
    console.log(`   ❌ Failed to fetch website content: ${error.message}`);
    return null;
  }
}

async function callOpenAI(apiKey, model, prompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional email personalization assistant. Create personalized, professional, and engaging email content based on the provided information.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.log(`   ❌ OpenAI API error: ${error.message}`);
    return null;
  }
}

async function callDeepSeek(apiKey, model, prompt) {
  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional email personalization assistant. Create personalized, professional, and engaging email content based on the provided information.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.log(`   ❌ DeepSeek API error: ${error.message}`);
    return null;
  }
}

async function generateAIPersonalization(user, listPrompt, contact, websiteContent) {
  const firstName = contact.firstName || 'there';
  const company = contact.company || 'your company';
  const position = contact.position || '';
  
  let prompt = `Create a personalized email opening for ${firstName}`;
  
  if (company) prompt += ` from ${company}`;
  if (position) prompt += ` (${position})`;
  
  prompt += `.\n\nPersonalization instructions: ${listPrompt}\n\n`;
  
  if (websiteContent) {
    prompt += `Website content about their company:\n${websiteContent}\n\n`;
  }
  
  prompt += `Contact details:\n`;
  prompt += `- Name: ${firstName} ${contact.lastName || ''}\n`;
  prompt += `- Company: ${company}\n`;
  if (position) prompt += `- Position: ${position}\n`;
  if (contact.industry) prompt += `- Industry: ${contact.industry}\n`;
  
  prompt += `\nPlease create a short, personalized opening paragraph (2-3 sentences) that would work well in a cold email. Be specific and reference something meaningful about their business or role.`;

  // Call appropriate AI service
  if (user.aiProvider === 'openai' && user.openaiApiKey) {
    return await callOpenAI(user.openaiApiKey, user.openaiModel || 'gpt-4o-mini', prompt);
  } else if (user.aiProvider === 'deepseek' && user.deepseekApiKey) {
    return await callDeepSeek(user.deepseekApiKey, user.deepseekModel || 'deepseek-chat', prompt);
  }
  
  return null;
}

async function personalizeContacts() {
  try {
    console.log('\n🔍 Looking for lists with AI personalization enabled...');
    
    // Find all lists with AI personalization enabled and populate user data
    const aiEnabledLists = await List.find({
      enableAiPersonalization: true,
      isActive: true
    }).populate('userId').select('_id name personalizationPrompt userId');
    
    console.log(`📋 Found ${aiEnabledLists.length} lists with AI personalization enabled`);
    
    if (aiEnabledLists.length === 0) {
      console.log('ℹ️  No lists found with AI personalization enabled');
      return;
    }
    
    let totalProcessed = 0;
    let totalWithWebsiteContent = 0;
    let totalPersonalized = 0;
    
    // Process each AI-enabled list
    for (const list of aiEnabledLists) {
      console.log(`\n📝 Processing list: "${list.name}" (ID: ${list._id})`);
      
      const user = list.userId;
      if (!user) {
        console.log('   ❌ User not found for this list');
        continue;
      }
      
      // Check if user has AI provider configured
      if (!user.aiProvider || (!user.openaiApiKey && !user.deepseekApiKey)) {
        console.log(`   ⚠️  User ${user.email} doesn't have AI provider configured`);
        continue;
      }
      
      console.log(`   🤖 Using ${user.aiProvider.toUpperCase()} for personalization`);
      
      // Find contacts in this list that don't have personalization set
      const contactsToProcess = await Contact.find({
        listId: list._id,
        $or: [
          { personalization: { $exists: false } },
          { personalization: null },
          { personalization: '' }
        ]
      }).select('_id email firstName lastName company position website websiteContent industry');
      
      console.log(`   👥 Found ${contactsToProcess.length} contacts without personalization`);
      
      if (contactsToProcess.length === 0) {
        console.log('   ✅ All contacts in this list already have personalization');
        continue;
      }
      
      // Process each contact
      for (let i = 0; i < contactsToProcess.length; i++) {
        const contact = contactsToProcess[i];
        console.log(`   👤 Processing contact ${i + 1}/${contactsToProcess.length}: ${contact.email}`);
        
        let websiteContent = contact.websiteContent;
        
        // Extract website content if not already done
        if (contact.website && !websiteContent) {
          websiteContent = await fetchWebsiteContent(contact.website);
          if (websiteContent) {
            // Save website content to database
            await Contact.updateOne(
              { _id: contact._id },
              { $set: { websiteContent: websiteContent } }
            );
            console.log(`   💾 Saved website content for ${contact.email}`);
            totalWithWebsiteContent++;
          }
        }
        
        // Generate AI personalization
        if (list.personalizationPrompt) {
          const aiPersonalization = await generateAIPersonalization(
            user, 
            list.personalizationPrompt, 
            contact, 
            websiteContent
          );
          
          if (aiPersonalization) {
            // Save AI personalization to database
            await Contact.updateOne(
              { _id: contact._id },
              { $set: { personalization: aiPersonalization } }
            );
            console.log(`   ✨ Generated AI personalization for ${contact.email}`);
            console.log(`   📝 Preview: "${aiPersonalization.substring(0, 100)}..."`);
            totalPersonalized++;
          } else {
            console.log(`   ❌ Failed to generate AI personalization for ${contact.email}`);
          }
        } else {
          console.log(`   ⚠️  No personalization prompt set for list: ${list.name}`);
        }
        
        totalProcessed++;
        
        // Add small delay to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n🎉 Personalization complete!`);
    console.log(`📊 Summary:`);
    console.log(`   - Total contacts processed: ${totalProcessed}`);
    console.log(`   - Website content extracted: ${totalWithWebsiteContent}`);
    console.log(`   - AI personalizations generated: ${totalPersonalized}`);
    
  } catch (error) {
    console.error('❌ Error during personalization process:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting AI Contact Personalization Process');
    console.log('=============================================');
    
    await connectToDatabase();
    await personalizeContacts();
    
    console.log('\n✅ Process completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Process failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
main();