import os
import pymongo
import time
import pytz
import uuid
import requests
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from bson import ObjectId
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import re

# Load environment variables from .env.local file
load_dotenv('.env.local')

# Get MongoDB URI from environment variables
MONGODB_URI = os.getenv('MONGODB_URI')

# Check if current time is within allowed schedule
def is_within_schedule(campaign, user_timezone='UTC'):
    """Check if current time is within the campaign's allowed sending schedule"""
    try:
        # Get campaign schedule settings
        schedule = campaign.get('schedule', {})
        sending_hours = schedule.get('sendingHours', {'start': '09:00', 'end': '17:00'})
        sending_days = schedule.get('sendingDays', [1, 2, 3, 4, 5])  # Mon-Fri by default
        
        # Get current time in user's timezone
        user_tz = pytz.timezone(user_timezone)
        current_time = datetime.now(user_tz)
        
        # Check if today is an allowed sending day (0=Sunday, 6=Saturday)
        current_weekday = current_time.weekday()  # Python: 0=Monday, 6=Sunday
        # Convert to JavaScript format (0=Sunday, 6=Saturday)
        js_weekday = (current_weekday + 1) % 7
        
        if js_weekday not in sending_days:
            return False, f"Today ({current_time.strftime('%A')}) is not an allowed sending day (timezone: {user_timezone})"
        
        # Check if current time is within allowed sending hours
        start_hour, start_minute = map(int, sending_hours['start'].split(':'))
        end_hour, end_minute = map(int, sending_hours['end'].split(':'))
        
        current_hour = current_time.hour
        current_minute = current_time.minute
        current_minutes = current_hour * 60 + current_minute
        start_minutes = start_hour * 60 + start_minute
        end_minutes = end_hour * 60 + end_minute
        
        # Handle overnight schedules (e.g., 23:00-11:00)
        if start_minutes <= end_minutes:
            # Normal schedule (e.g., 09:00-17:00)
            within_hours = start_minutes <= current_minutes <= end_minutes
        else:
            # Overnight schedule (e.g., 23:00-11:00)
            within_hours = current_minutes >= start_minutes or current_minutes <= end_minutes
            
        if not within_hours:
            return False, f"Current time ({current_time.strftime('%H:%M')}) is outside allowed hours ({sending_hours['start']}-{sending_hours['end']}) (timezone: {user_timezone})"
        
        return True, "Within allowed schedule"
        
    except Exception as e:
        return False, f"Error checking schedule: {str(e)}"

# Check if email account has reached daily limit
def check_daily_limit(db, email_account_id):
    """Check if email account has reached its daily sending limit"""
    try:
        # Get today's date in UTC
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)
        
        # Count emails sent today from this account
        emails_sent_today = db.emaillogs.count_documents({
            "emailAccountId": email_account_id,
            "sentAt": {"$gte": today, "$lt": tomorrow},
            "status": {"$in": ["sent", "delivered", "opened", "clicked", "replied"]}
        })
        
        # Get account daily limit
        email_account = db.emailaccounts.find_one({"_id": email_account_id})
        if not email_account:
            return False, "Email account not found"
            
        daily_limit = email_account.get('dailyLimit', 50)
        
        if emails_sent_today >= daily_limit:
            return False, f"Daily limit reached ({emails_sent_today}/{daily_limit})"
            
        return True, f"Within daily limit ({emails_sent_today}/{daily_limit})"
        
    except Exception as e:
        return False, f"Error checking daily limit: {str(e)}"

# Check if enough time has passed since last sequence email
def check_sequence_delay(db, contact_id, campaign_id, sequence_step):
    """Check if enough time has passed since the last sequence email was sent"""
    try:
        if sequence_step == 0:
            return True, "First email in sequence"
            
        # Get the campaign to check sequence delay
        campaign = db.campaigns.find_one({"_id": campaign_id})
        if not campaign:
            return False, "Campaign not found"
            
        sequences = campaign.get('sequences', [])
        if sequence_step >= len(sequences):
            return False, "Invalid sequence step"
            
        # Get delay days for current sequence step
        delay_days = sequences[sequence_step].get('delayDays', 0)
        
        if delay_days == 0:
            return True, "No delay required"
            
        # Find the last email sent to this contact in this campaign
        last_email = db.emaillogs.find_one(
            {
                "contactId": contact_id,
                "campaignId": campaign_id,
                "sequenceStep": sequence_step - 1,
                "status": {"$in": ["sent", "delivered", "opened", "clicked", "replied"]}
            },
            sort=[("sentAt", -1)]
        )
        
        if not last_email or not last_email.get('sentAt'):
            return False, "Previous sequence email not found or not sent"
            
        # Calculate if enough time has passed
        time_since_last = datetime.now(timezone.utc) - last_email['sentAt']
        required_delay = timedelta(days=delay_days)
        
        if time_since_last < required_delay:
            remaining = required_delay - time_since_last
            return False, f"Need to wait {remaining.days} more days ({delay_days} day delay)"
            
        return True, f"Delay satisfied ({time_since_last.days}/{delay_days} days)"
        
    except Exception as e:
        return False, f"Error checking sequence delay: {str(e)}"

# Validate contact status before sending
def validate_contact_status(contact):
    """Validate that contact can receive emails"""
    status = contact.get('status', 'active')
    email_status = contact.get('emailStatus', 'never-sent')
    
    # Check if contact status allows sending
    if status not in ['active']:
        return False, f"Contact status is '{status}' - cannot send emails"
        
    # Check if email status allows sending
    if email_status in ['bounced']:
        return False, f"Email status is '{email_status}' - cannot send emails"
        
    return True, "Contact can receive emails"

# Fetch website content
def fetch_website_content(website_url):
    """Fetch and parse website content for personalization"""
    try:
        if not website_url:
            return None, "No website URL provided"
        
        # Ensure URL has protocol
        if not website_url.startswith(('http://', 'https://')):
            website_url = 'https://' + website_url
        
        # Validate URL format
        parsed = urlparse(website_url)
        if not parsed.netloc:
            return None, "Invalid URL format"
        
        print(f"Fetching website content from: {website_url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(website_url, headers=headers, timeout=10, allow_redirects=True)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script, style, nav, footer, and other non-content elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            element.decompose()
        
        # Extract comprehensive content
        website_data = {
            'url': website_url,
            'title': soup.title.string.strip() if soup.title else '',
            'description': '',
            'main_content': '',
            'headings': [],
            'paragraphs': [],
            'about_section': '',
            'services_section': '',
            'team_section': '',
            'testimonials': '',
            'key_phrases': [],
            'contact_info': '',
            'full_text_summary': ''
        }
        
        # Get meta description and keywords
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            website_data['description'] = meta_desc.get('content', '').strip()
        
        meta_keywords = soup.find('meta', attrs={'name': 'keywords'})
        if meta_keywords:
            keywords = meta_keywords.get('content', '').strip()
            website_data['key_phrases'].extend([kw.strip() for kw in keywords.split(',') if kw.strip()])
        
        # Extract all headings (h1-h6) for structure understanding
        headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        for heading in headings[:15]:  # Limit to first 15 headings
            heading_text = heading.get_text().strip()
            if heading_text and len(heading_text) > 3:
                website_data['headings'].append(heading_text)
        
        # Extract main paragraphs
        paragraphs = soup.find_all('p')
        paragraph_texts = []
        for p in paragraphs[:20]:  # Limit to first 20 paragraphs
            p_text = p.get_text().strip()
            if p_text and len(p_text) > 20:  # Only meaningful paragraphs
                paragraph_texts.append(p_text)
        website_data['paragraphs'] = paragraph_texts
        
        # Extract main content areas
        main_content_selectors = ['main', 'article', '.content', '.main-content', '#content', '#main']
        main_content = ""
        for selector in main_content_selectors:
            content_element = soup.select_one(selector)
            if content_element:
                main_content = content_element.get_text().strip()
                break
        
        if not main_content:
            # Fallback to body content if no main content found
            body = soup.find('body')
            if body:
                main_content = body.get_text().strip()
        
        # Clean up and truncate main content
        main_content = re.sub(r'\s+', ' ', main_content)
        website_data['main_content'] = main_content[:2000] + '...' if len(main_content) > 2000 else main_content
        
        # Look for specific sections with enhanced matching
        section_keywords = {
            'about': ['about us', 'about', 'who we are', 'our story', 'company', 'mission', 'vision'],
            'services': ['services', 'products', 'solutions', 'offerings', 'what we do', 'our services'],
            'team': ['team', 'our team', 'staff', 'people', 'leadership', 'founders'],
            'testimonials': ['testimonials', 'reviews', 'clients say', 'feedback', 'success stories'],
            'contact': ['contact', 'reach us', 'get in touch', 'location', 'address', 'phone', 'email']
        }
        
        for section_name, keywords in section_keywords.items():
            section_content = ""
            for keyword in keywords:
                # Look for headings containing these keywords
                heading_matches = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], 
                                             string=re.compile(keyword, re.IGNORECASE))
                for heading in heading_matches:
                    # Get the next siblings (paragraphs, divs) after the heading
                    content_parts = []
                    for sibling in heading.next_siblings:
                        if hasattr(sibling, 'get_text'):
                            sibling_text = sibling.get_text().strip()
                            if sibling_text and len(sibling_text) > 20:
                                content_parts.append(sibling_text)
                                if len(' '.join(content_parts)) > 500:
                                    break
                    if content_parts:
                        section_content = ' '.join(content_parts)[:800] + '...'
                        break
                
                # Also look for divs/sections with class names containing keywords
                if not section_content:
                    class_matches = soup.find_all(['div', 'section'], 
                                                class_=re.compile(keyword.replace(' ', ''), re.IGNORECASE))
                    for element in class_matches[:2]:
                        element_text = element.get_text().strip()
                        if element_text and len(element_text) > 50:
                            section_content = element_text[:800] + '...' if len(element_text) > 800 else element_text
                            break
                
                if section_content:
                    break
            
            # Store section content
            if section_name == 'about':
                website_data['about_section'] = section_content
            elif section_name == 'services':
                website_data['services_section'] = section_content
            elif section_name == 'team':
                website_data['team_section'] = section_content
            elif section_name == 'testimonials':
                website_data['testimonials'] = section_content
            elif section_name == 'contact':
                website_data['contact_info'] = section_content
        
        # Extract key phrases from important text
        important_text = ' '.join(website_data['headings'] + paragraph_texts[:10])
        # Simple extraction of potential key phrases (2-4 word phrases)
        phrases = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){1,3}\b', important_text)
        website_data['key_phrases'].extend(phrases[:10])  # Add top 10 phrases
        
        # Create comprehensive text summary for AI
        summary_parts = []
        if website_data['title']:
            summary_parts.append(f"Title: {website_data['title']}")
        if website_data['description']:
            summary_parts.append(f"Description: {website_data['description']}")
        if website_data['headings']:
            summary_parts.append(f"Key Sections: {', '.join(website_data['headings'][:10])}")
        if website_data['about_section']:
            summary_parts.append(f"About: {website_data['about_section'][:300]}")
        if website_data['services_section']:
            summary_parts.append(f"Services: {website_data['services_section'][:300]}")
        if website_data['paragraphs']:
            main_paragraphs = ' '.join(website_data['paragraphs'][:5])
            summary_parts.append(f"Main Content: {main_paragraphs[:500]}")
        
        website_data['full_text_summary'] = ' | '.join(summary_parts)
        
        print(f"Website content fetched successfully:")
        print(f"  Title: {website_data['title']}")
        print(f"  Description: {website_data['description'][:100]}{'...' if len(website_data['description']) > 100 else ''}")
        print(f"  Headings Found: {len(website_data['headings'])} ({', '.join(website_data['headings'][:3])}{'...' if len(website_data['headings']) > 3 else ''})")
        print(f"  Paragraphs: {len(website_data['paragraphs'])} paragraphs extracted")
        print(f"  About Section: {'Found' if website_data['about_section'] else 'Not found'}")
        print(f"  Services Section: {'Found' if website_data['services_section'] else 'Not found'}")
        print(f"  Key Phrases: {', '.join(website_data['key_phrases'][:5])}{'...' if len(website_data['key_phrases']) > 5 else ''}")
        print(f"  Main Content Length: {len(website_data['main_content'])} characters")
        print(f"  Full Summary Length: {len(website_data['full_text_summary'])} characters")
        
        return website_data, "Success"
        
    except requests.RequestException as e:
        error_msg = f"Failed to fetch website content: {str(e)}"
        print(error_msg)
        return None, error_msg
    except Exception as e:
        error_msg = f"Error processing website content: {str(e)}"
        print(error_msg)
        return None, error_msg

# Create personalization log entry
def create_personalization_log(db, user_id, campaign_id, contact_id, sequence_step, personalization_type, 
                              ai_provider, original_prompt, personalized_result, website_data=None, 
                              ai_model=None, processing_time=None):
    """Create a personalization log entry for tracking AI usage"""
    try:
        current_time = datetime.now(timezone.utc)
        
        personalization_log = {
            "_id": ObjectId(),
            "userId": user_id,
            "campaignId": campaign_id,
            "contactId": contact_id,
            "sequenceStep": sequence_step,
            "personalizationType": personalization_type,  # 'subject' or 'content'
            "aiProvider": ai_provider,  # 'openai', 'deepseek', or 'manual'
            "aiModel": ai_model,
            "originalPrompt": original_prompt,
            "personalizedResult": personalized_result,
            "websiteData": website_data,
            "processingTime": processing_time,
            "createdAt": current_time
        }
        
        result = db.personalizationlogs.insert_one(personalization_log)
        return True, str(result.inserted_id)
        
    except Exception as e:
        return False, f"Error creating personalization log: {str(e)}"

# Create email log entry
def create_email_log(db, user_id, campaign_id, contact_id, email_account_id, sequence_step, subject, content):
    """Create an email log entry for tracking"""
    try:
        message_id = str(uuid.uuid4())
        current_time = datetime.now(timezone.utc)
        
        email_log = {
            "_id": ObjectId(),
            "userId": user_id,
            "campaignId": campaign_id,
            "contactId": contact_id,
            "emailAccountId": email_account_id,
            "sequenceStep": sequence_step,
            "messageId": message_id,
            "subject": subject,
            "content": content,
            "status": "sent",
            "scheduledAt": current_time,
            "sentAt": current_time,
            "openCount": 0,
            "clickCount": 0,
            "createdAt": current_time,
            "updatedAt": current_time
        }
        
        result = db.emaillogs.insert_one(email_log)
        return True, str(result.inserted_id)
        
    except Exception as e:
        return False, f"Error creating email log: {str(e)}"

# AI personalization with OpenAI
def personalize_with_openai(prompt, contact, api_key, model="gpt-4o-mini", website_data=None):
    """Use OpenAI API to personalize content based on contact data and prompt"""
    try:
        start_time = time.time()
        
        # Build context from contact data
        contact_context = f"""
Contact Information:
- Name: {contact.get('firstName', '')} {contact.get('lastName', '')}
- Company: {contact.get('company', '')}
- Position: {contact.get('position', '')}
- Email: {contact.get('email', '')}
- Phone: {contact.get('phone', '')}
- Website: {contact.get('website', '')}
- Location: {contact.get('city', '')}, {contact.get('state', '')}, {contact.get('country', '')}
- Industry: {contact.get('industry', '')}
- Personalization Notes: {contact.get('personalization', '')}
"""
        
        # Add comprehensive website content if available
        if website_data:
            website_context = f"""
Website Information:
- Website Title: {website_data.get('title', '')}
- Meta Description: {website_data.get('description', '')}
- Key Section Headings: {', '.join(website_data.get('headings', [])[:8])}
- About Section: {website_data.get('about_section', '')}
- Services/Products: {website_data.get('services_section', '')}
- Team Information: {website_data.get('team_section', '')}
- Client Testimonials: {website_data.get('testimonials', '')}
- Key Phrases: {', '.join(website_data.get('key_phrases', [])[:8])}
- Main Website Content: {website_data.get('main_content', '')[:1000]}{'...' if len(website_data.get('main_content', '')) > 1000 else ''}
- Website Summary: {website_data.get('full_text_summary', '')}
"""
            contact_context += website_context
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are an expert at writing personalized cold emails. Generate content based on the contact information and website data provided. Use the website information to make the content more relevant and specific to their business. Keep it professional, concise, and engaging. Only return the requested content without any additional formatting or explanation.'
                },
                {
                    'role': 'user',
                    'content': f"{contact_context}\n\nPrompt: {prompt}\n\nGenerate the personalized content based on the contact and website information above:"
                }
            ],
            'max_tokens': 500,
            'temperature': 0.7
        }
        
        response = requests.post('https://api.openai.com/v1/chat/completions', 
                               headers=headers, json=data, timeout=30)
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            personalized_content = result['choices'][0]['message']['content'].strip()
            return personalized_content, processing_time
        else:
            print(f"OpenAI API error {response.status_code}: {response.text}")
            fallback_result = personalize_content(prompt, contact)
            return fallback_result, processing_time
            
    except Exception as e:
        processing_time = time.time() - start_time if 'start_time' in locals() else 0
        print(f"Error with OpenAI personalization: {e}")
        fallback_result = personalize_content(prompt, contact)
        return fallback_result, processing_time

# AI personalization with DeepSeek
def personalize_with_deepseek(prompt, contact, api_key, model="deepseek-chat", website_data=None):
    """Use DeepSeek API to personalize content based on contact data and prompt"""
    try:
        start_time = time.time()
        
        # Build context from contact data
        contact_context = f"""
Contact Information:
- Name: {contact.get('firstName', '')} {contact.get('lastName', '')}
- Company: {contact.get('company', '')}
- Position: {contact.get('position', '')}
- Email: {contact.get('email', '')}
- Phone: {contact.get('phone', '')}
- Website: {contact.get('website', '')}
- Location: {contact.get('city', '')}, {contact.get('state', '')}, {contact.get('country', '')}
- Industry: {contact.get('industry', '')}
- Personalization Notes: {contact.get('personalization', '')}
"""
        
        # Add comprehensive website content if available
        if website_data:
            website_context = f"""
Website Information:
- Website Title: {website_data.get('title', '')}
- Meta Description: {website_data.get('description', '')}
- Key Section Headings: {', '.join(website_data.get('headings', [])[:8])}
- About Section: {website_data.get('about_section', '')}
- Services/Products: {website_data.get('services_section', '')}
- Team Information: {website_data.get('team_section', '')}
- Client Testimonials: {website_data.get('testimonials', '')}
- Key Phrases: {', '.join(website_data.get('key_phrases', [])[:8])}
- Main Website Content: {website_data.get('main_content', '')[:1000]}{'...' if len(website_data.get('main_content', '')) > 1000 else ''}
- Website Summary: {website_data.get('full_text_summary', '')}
"""
            contact_context += website_context
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are an expert at writing personalized cold emails. Generate content based on the contact information and website data provided. Use the website information to make the content more relevant and specific to their business. Keep it professional, concise, and engaging. Only return the requested content without any additional formatting or explanation.'
                },
                {
                    'role': 'user',
                    'content': f"{contact_context}\n\nPrompt: {prompt}\n\nGenerate the personalized content based on the contact and website information above:"
                }
            ],
            'max_tokens': 500,
            'temperature': 0.7
        }
        
        response = requests.post('https://api.deepseek.com/chat/completions', 
                               headers=headers, json=data, timeout=30)
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            personalized_content = result['choices'][0]['message']['content'].strip()
            return personalized_content, processing_time
        else:
            print(f"DeepSeek API error {response.status_code}: {response.text}")
            fallback_result = personalize_content(prompt, contact)
            return fallback_result, processing_time
            
    except Exception as e:
        processing_time = time.time() - start_time if 'start_time' in locals() else 0
        print(f"Error with DeepSeek personalization: {e}")
        fallback_result = personalize_content(prompt, contact)
        return fallback_result, processing_time

# AI personalization dispatcher
def personalize_with_ai(prompt, contact, user, website_data=None):
    """Personalize content using AI based on user's configuration"""
    try:
        ai_provider = user.get('aiProvider')
        
        if ai_provider == 'openai':
            api_key = user.get('openaiApiKey')
            model = user.get('openaiModel', 'gpt-4o-mini')
            if not api_key:
                print("OpenAI API key not configured, falling back to basic personalization")
                return personalize_content(prompt, contact), 0
            return personalize_with_openai(prompt, contact, api_key, model, website_data)
            
        elif ai_provider == 'deepseek':
            api_key = user.get('deepseekApiKey')
            model = user.get('deepseekModel', 'deepseek-chat')
            if not api_key:
                print("DeepSeek API key not configured, falling back to basic personalization")
                return personalize_content(prompt, contact), 0
            return personalize_with_deepseek(prompt, contact, api_key, model, website_data)
            
        else:
            print(f"No AI provider configured, falling back to basic personalization")
            return personalize_content(prompt, contact), 0
            
    except Exception as e:
        print(f"Error in AI personalization dispatcher: {e}")
        return personalize_content(prompt, contact), 0

# Personalize email content with contact data
def personalize_content(content, contact):
    """Replace placeholders in email content with contact data"""
    try:
        # Common personalizations
        personalizations = {
            '{{firstName}}': contact.get('firstName', ''),
            '{{lastName}}': contact.get('lastName', ''),
            '{{fullName}}': f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip(),
            '{{company}}': contact.get('company', ''),
            '{{position}}': contact.get('position', ''),
            '{{email}}': contact.get('email', ''),
            '{{phone}}': contact.get('phone', ''),
            '{{website}}': contact.get('website', ''),
            '{{city}}': contact.get('city', ''),
            '{{state}}': contact.get('state', ''),
            '{{country}}': contact.get('country', ''),
            '{{industry}}': contact.get('industry', ''),
            '{{personalization}}': contact.get('personalization', '')
        }
        
        personalized_content = content
        for placeholder, value in personalizations.items():
            if value:  # Only replace if value is not empty
                personalized_content = personalized_content.replace(placeholder, value)
            else:
                # Remove empty placeholders
                personalized_content = personalized_content.replace(placeholder, '')

                
        return personalized_content.strip()
        
    except Exception as e:
        print(f"Error personalizing content: {e}")
        return content

# Simulate sending email (instead of actually sending)
def simulate_send_email(from_email, to_email, subject, body):
    """Simulate sending an email without actually sending it"""
    print(f"SENDING EMAIL:")
    print(f"   From: {from_email}")
    print(f"   To: {to_email}")
    print(f"   Subject: {subject}")
    print(f"   Body Preview: {body[:100]}{'...' if len(body) > 100 else ''}")
    print(f"   Status: SIMULATED SUCCESS")
    return True

# Connect to MongoDB database
def connect_to_mongodb():
    try:
        if not MONGODB_URI:
            return None
        client = pymongo.MongoClient(MONGODB_URI)
        # Test the connection
        client.admin.command('ping')
        return client
    except Exception as e:
        return None

# Get database instance
def get_database():
    client = connect_to_mongodb()
    if client:
        db_name = MONGODB_URI.split('/')[-1]  # Extract database name from URI
        return client[db_name]
    return None

# Fetch active campaigns
def fetch_active_campaigns(db, limit=10):
    campaigns_collection = db['campaigns']
    
    # Query for campaigns with isActive=true, sort by latest (assuming _id or createdAt)
    # Using _id for sorting (latest first) as it contains timestamp
    active_campaigns = campaigns_collection.find(
        {"isActive": True}
    ).sort("_id", -1).limit(limit)
    
    return list(active_campaigns)

# Main processing function
def process_campaigns(db):
    try:
        campaigns = fetch_active_campaigns(db, 10)
        
        if not campaigns:
            print("No active campaigns found")
            time.sleep(1)
            return True
        
        for i, campaign in enumerate(campaigns, 1):
            try:
                # Get user information to check timezone
                user_id = campaign.get('userId')
                if not user_id:
                    print(f"Campaign {campaign.get('_id')} has no userId")
                    time.sleep(1)
                    continue
                
                user = db.users.find_one({"_id": user_id})
                if not user:
                    print(f"User {user_id} not found for campaign {campaign.get('_id')}")
                    time.sleep(1)
                    continue
                
                user_timezone = user.get('timezone', 'UTC')
                print(f"Using timezone: {user_timezone} for campaign {campaign.get('_id')}")
                
                # Check if current time is within allowed schedule
                within_schedule, schedule_message = is_within_schedule(campaign, user_timezone)
                if not within_schedule:
                    print(f"Campaign {campaign.get('_id')}: {schedule_message}")
                    time.sleep(1)
                    continue
                
                # Get campaign data with defaults
                nextEmailAccountToUse = campaign.get('nextEmailAccountToUse', 0)
                nextContactToUse = campaign.get('nextContactToUse', 0)
                emailAccountIds = campaign.get('emailAccountIds', [])
                contactIds = campaign.get('contactIds', [])
                sequences = campaign.get('sequences', [])
                emailSent = campaign.get('emailSent', 0)
                
                # Validate campaign has required data
                if not emailAccountIds or not contactIds or not sequences:
                    print(f"Campaign {campaign.get('_id')} missing required data (email accounts, contacts, or sequences)")
                    time.sleep(1)
                    continue
                
                # Inbox and contact rotation with bounds checking
                if len(emailAccountIds) > 0:
                    nextEmailAccountToUse = (nextEmailAccountToUse + 1) % len(emailAccountIds)
                else:
                    print(f"Campaign {campaign.get('_id')} has no email accounts")
                    time.sleep(1)
                    continue
                    
                if len(contactIds) > 0:
                    nextContactToUse = (nextContactToUse + 1) % len(contactIds)
                else:
                    print(f"Campaign {campaign.get('_id')} has no contacts")
                    time.sleep(1)
                    continue

                # Update campaign with new rotation values
                db.campaigns.update_one(
                    {"_id": campaign["_id"]},
                    {"$set": {
                        "nextEmailAccountToUse": nextEmailAccountToUse, 
                        "nextContactToUse": nextContactToUse
                    }}
                )

                # Get the sending email account
                sendingEmailAccountID = emailAccountIds[nextEmailAccountToUse]
                sendingEmailAccount = db.emailaccounts.find_one({"_id": sendingEmailAccountID})
                
                if not sendingEmailAccount:
                    print(f"Email account {sendingEmailAccountID} not found in database")
                    time.sleep(1)
                    continue
                
                from_email = sendingEmailAccount.get('email', 'Unknown')

                # Check if email account has reached daily limit
                within_limit, limit_message = check_daily_limit(db, sendingEmailAccountID)
                if not within_limit:
                    print(f"Email account {from_email}: {limit_message}")
                    time.sleep(1)
                    continue

                # Get the contact
                contactID = contactIds[nextContactToUse]
                contact = db.contacts.find_one({"_id": contactID})
                
                if not contact:
                    print(f"Contact {contactID} not found in database")
                    time.sleep(1)
                    continue
                
                # Validate contact status
                can_send, status_message = validate_contact_status(contact)
                if not can_send:
                    print(f"Contact {contact.get('email', 'Unknown')}: {status_message}")
                    time.sleep(1)
                    continue
                    
                timesContacted = contact.get('timesContacted', 0)
                to_email = contact.get('email', 'Unknown')
                
                # Check if we have reached the end of sequences for this contact
                if timesContacted >= len(sequences):
                    print(f"Contact {to_email} has been contacted {timesContacted} times, exceeding available sequences ({len(sequences)})")
                    time.sleep(1)
                    continue

                # Check if enough time has passed since last sequence email
                delay_ok, delay_message = check_sequence_delay(db, contactID, campaign["_id"], timesContacted)
                if not delay_ok:
                    print(f"Contact {to_email}: {delay_message}")
                    time.sleep(1)
                    continue

                # Get the sequence to use
                sequenceToUse = sequences[timesContacted]
                
                if not sequenceToUse or not sequenceToUse.get('isActive', True):
                    print(f"Sequence {timesContacted} is empty or inactive for campaign {campaign.get('_id')}")
                    time.sleep(1)
                    continue
                
                # Fetch website content if available
                website_data = None
                website_url = contact.get('website', '')
                if website_url and website_url.strip():
                    website_data, website_fetch_result = fetch_website_content(website_url.strip())
                    if website_data:
                        print(f"Website data fetched for {contact.get('email', 'Unknown')}")
                    else:
                        print(f"Failed to fetch website data: {website_fetch_result}")

                # Get subject and content based on AI mode or manual mode
                if sequenceToUse.get('useAiForSubject', False):
                    # Use AI prompt for subject
                    ai_subject_prompt = sequenceToUse.get('aiSubjectPrompt', 'No AI Subject Prompt')
                    personalized_subject, subject_processing_time = personalize_with_ai(ai_subject_prompt, contact, user, website_data)
                    print(f"Using AI Subject: {personalized_subject}")
                    
                    # Store personalization log for subject
                    create_personalization_log(
                        db, user_id, campaign["_id"], contactID, timesContacted,
                        'subject', user.get('aiProvider', 'manual'), ai_subject_prompt,
                        personalized_subject, website_data, user.get('openaiModel') or user.get('deepseekModel'),
                        subject_processing_time
                    )
                else:
                    # Use manual subject
                    subject = sequenceToUse.get('subject', 'No Subject')
                    personalized_subject = personalize_content(subject, contact)
                    
                    # Store personalization log for manual subject
                    create_personalization_log(
                        db, user_id, campaign["_id"], contactID, timesContacted,
                        'subject', 'manual', subject, personalized_subject,
                        website_data, None, None
                    )
                
                if sequenceToUse.get('useAiForContent', False):
                    # Use AI prompt for content
                    ai_content_prompt = sequenceToUse.get('aiContentPrompt', 'No AI Content Prompt')
                    personalized_content, content_processing_time = personalize_with_ai(ai_content_prompt, contact, user, website_data)
                    print(f"Using AI Content: {personalized_content[:100]}{'...' if len(personalized_content) > 100 else ''}")
                    
                    # Store personalization log for content
                    create_personalization_log(
                        db, user_id, campaign["_id"], contactID, timesContacted,
                        'content', user.get('aiProvider', 'manual'), ai_content_prompt,
                        personalized_content, website_data, user.get('openaiModel') or user.get('deepseekModel'),
                        content_processing_time
                    )
                else:
                    # Use manual content
                    content = sequenceToUse.get('content', 'No Content')
                    personalized_content = personalize_content(content, contact)
                    
                    # Store personalization log for manual content
                    create_personalization_log(
                        db, user_id, campaign["_id"], contactID, timesContacted,
                        'content', 'manual', content, personalized_content,
                        website_data, None, None
                    )
                
                print(f"Processing: {to_email} (sequence {timesContacted + 1}/{len(sequences)})")
                
                # Create email log entry before sending
                log_created, log_id = create_email_log(
                    db, user_id, campaign["_id"], contactID, 
                    sendingEmailAccountID, timesContacted, 
                    personalized_subject, personalized_content
                )
                
                if not log_created:
                    print(f"Failed to create email log: {log_id}")
                    time.sleep(1)
                    continue
                
                # Simulate sending the email
                email_sent_successfully = simulate_send_email(from_email, to_email, personalized_subject, personalized_content)
                
                if email_sent_successfully:
                    current_time = datetime.now(timezone.utc)
                    
                    # Update the contact's data
                    db.contacts.update_one(
                        {"_id": contactID},
                        {"$set": {
                            "timesContacted": timesContacted + 1,
                            "lastContacted": current_time,
                            "lastSent": current_time,
                            "emailStatus": "sent",
                            "updatedAt": current_time
                        }}
                    )
                    
                    # Update the campaign's stats
                    db.campaigns.update_one(
                        {"_id": campaign["_id"]},
                        {"$inc": {
                            "emailSent": 1,
                            "stats.sent": 1
                        },
                        "$set": {"updatedAt": current_time}}
                    )
                    
                    # Update email account's last used time
                    db.emailaccounts.update_one(
                        {"_id": sendingEmailAccountID},
                        {"$set": {
                            "lastUsed": current_time,
                            "updatedAt": current_time
                        }}
                    )
                    
                    print(f"Email sent successfully to {to_email}")
                else:
                    # Mark email log as failed
                    db.emaillogs.update_one(
                        {"_id": ObjectId(log_id)},
                        {"$set": {
                            "status": "failed",
                            "failedAt": datetime.now(timezone.utc),
                            "errorMessage": "Simulation failed"
                        }}
                    )
                    print(f"Failed to send email to {to_email}")

                # Use campaign's email delay setting
                schedule = campaign.get('schedule', {})
                email_delay = schedule.get('emailDelaySeconds', 60)  # Default 60 seconds
                time.sleep(email_delay)
                
            except Exception as e:
                continue
        
        return True
        
    except Exception as e:
        return False

# Continuous processing
if __name__ == "__main__":
    # Connect to database once at startup
    db = get_database()
    
    if db is None:
        print("Failed to connect to database")
        exit(1)
    
    try:
        while True:
            process_campaigns(db)
                
    except KeyboardInterrupt:
        pass
    except Exception as e:
        pass
