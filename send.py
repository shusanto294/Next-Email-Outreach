import os
import sys
import time
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
import pytz
from openai import OpenAI

# Force unbuffered output
sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

wait_time = 1  # Wait 60 seconds between cycles

load_dotenv('.env.local')

MONGODB_URI = os.getenv('MONGODB_URI')
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set")

client = MongoClient(MONGODB_URI)
db = client.get_default_database()
contacts_collection = db['contacts']
campaigns_collection = db['campaigns']
email_accounts_collection = db['emailaccounts']
users_collection = db['users']
sent_emails_collection = db['sentemails']


def replace_variables(text, contact, email_account):
    """Replace variables in text with contact information"""
    if not text:
        return text

    replacements = {
        '{{firstName}}': contact.get('firstName', ''),
        '{{lastName}}': contact.get('lastName', ''),
        '{{company}}': contact.get('company', ''),
        '{{position}}': contact.get('position', ''),
        '{{phone}}': contact.get('phone', ''),
        '{{website}}': contact.get('website', ''),
        '{{linkedin}}': contact.get('linkedin', ''),
        '{{email}}': contact.get('email', ''),
        '{{fromName}}': email_account.get('fromName', email_account.get('email', '')),
    }

    result = text
    for variable, value in replacements.items():
        result = result.replace(variable, str(value) if value else '')

    return result


def generate_with_ai(openai_api_key, prompt, contact, email_account, is_subject=False):
    """Generate personalized email content using OpenAI"""
    try:
        client = OpenAI(api_key=openai_api_key)

        # Build contact information context
        contact_info = []
        if contact.get('firstName'):
            contact_info.append(f"First Name: {contact['firstName']}")
        if contact.get('lastName'):
            contact_info.append(f"Last Name: {contact['lastName']}")
        if contact.get('company'):
            contact_info.append(f"Company: {contact['company']}")
        if contact.get('position'):
            contact_info.append(f"Position: {contact['position']}")
        if contact.get('phone'):
            contact_info.append(f"Phone: {contact['phone']}")
        if contact.get('website'):
            contact_info.append(f"Website: {contact['website']}")
        if contact.get('linkedin'):
            contact_info.append(f"LinkedIn: {contact['linkedin']}")
        if contact.get('email'):
            contact_info.append(f"Email: {contact['email']}")

        # Add custom fields if available
        if contact.get('city'):
            contact_info.append(f"City: {contact['city']}")
        if contact.get('state'):
            contact_info.append(f"State: {contact['state']}")
        if contact.get('country'):
            contact_info.append(f"Country: {contact['country']}")
        if contact.get('industry'):
            contact_info.append(f"Industry: {contact['industry']}")

        contact_context = "\n".join(contact_info)

        # Get sender name
        from_name = email_account.get('fromName', email_account.get('email', 'Sales Team'))

        if is_subject:
            system_message = f"""You are an expert email marketer writing subject lines for cold emails.
Generate a compelling, personalized subject line based on the prompt and contact information.

IMPORTANT RULES:
- Keep it under 60 characters
- Make it personal and relevant to the contact
- Do NOT use brackets or special formatting
- Do NOT include "Subject:" prefix
- Return ONLY the subject line, nothing else"""

            user_message = f"""Contact Information:
{contact_context}

Prompt: {prompt}

Generate a personalized subject line for this contact:"""
        else:
            system_message = f"""You are an expert email marketer writing personalized cold emails.
Generate a professional, personalized email body based on the prompt and contact information.

IMPORTANT RULES:
- Use the contact's first name if available
- Reference their company, position, or other relevant details
- Keep it concise and professional
- Sign off with the sender's name: {from_name}
- Do NOT include subject line
- Return ONLY the email body"""

            user_message = f"""Contact Information:
{contact_context}

Sender Name: {from_name}

Prompt: {prompt}

Generate a personalized email body for this contact:"""

        print(f"\n🤖 Generating with AI...")
        print(f"   Contact: {contact.get('firstName', '')} {contact.get('lastName', '')} from {contact.get('company', 'Unknown')}")

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7,
            max_tokens=500 if is_subject else 1000,
        )

        generated_text = response.choices[0].message.content.strip()

        # Clean up the generated text
        if is_subject:
            # Remove any "Subject:" prefix if present
            generated_text = re.sub(r'^subject:\s*', '', generated_text, flags=re.IGNORECASE)
            # Remove quotes if present
            generated_text = generated_text.strip('"\'')

        print(f"   ✅ Generated {'subject' if is_subject else 'content'}: {generated_text[:50]}...")

        return generated_text

    except Exception as e:
        print(f"   ❌ AI generation failed: {e}")
        return None


# Continuous loop to process campaigns
print("🚀 Starting continuous email campaign processor...")
print(f"⏱️  Checking for active campaigns every {wait_time} seconds")
print("Press Ctrl+C to stop\n")

cycle_count = 0

while True:
    try:
        cycle_count += 1
        print(f"\n{'='*60}")
        print(f"🔄 CYCLE #{cycle_count} - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")

        # Loop through all active campaigns
        active_campaigns = campaigns_collection.find({"isActive": True})
        campaign_count = 0

        for campaign in active_campaigns:
            campaign_count += 1
            print(f"\n📋 Processing Campaign #{campaign_count}: {campaign.get('name', 'Unnamed')}")
            # Get the user id
            user_id = campaign.get('userId')

            # Query the user from the users table
            user = users_collection.find_one({"_id": ObjectId(user_id)})

            # Get timezone for schedule check
            if user:
                timezone = user.get('timezone', 'UTC')
            else:
                timezone = 'UTC'

            # Get schedule settings from campaign
            schedule = campaign.get('schedule', {})
            sending_hours = schedule.get('sendingHours', {})
            start_time = sending_hours.get('start', '09:00')  # Default 09:00
            end_time = sending_hours.get('end', '17:00')  # Default 17:00
            sending_days = schedule.get('sendingDays', [0, 1, 2, 3, 4])  # Default Mon-Fri (0=Sunday, 6=Saturday)


            # Get current time in user's timezone and check schedule FIRST
            can_send = False
            try:
                user_tz = pytz.timezone(timezone)
                current_time_utc = datetime.now(pytz.UTC)
                current_time_user = current_time_utc.astimezone(user_tz)

                # Check if current day is in sending days
                current_day = current_time_user.weekday()
                # Convert Python weekday (0=Monday) to campaign weekday (0=Sunday)
                # Python: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
                # Campaign: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
                campaign_weekday = (current_day + 1) % 7

                is_valid_day = campaign_weekday in sending_days


                # Check if current time is within sending hours
                current_time_str = current_time_user.strftime('%H:%M')

                # Handle overnight time ranges (e.g., 17:00 to 09:00)
                if end_time < start_time:
                    # Range crosses midnight
                    is_within_hours = current_time_str >= start_time or current_time_str <= end_time
                else:
                    # Normal range (e.g., 09:00 to 17:00)
                    is_within_hours = start_time <= current_time_str <= end_time


                # Final decision
                can_send = is_valid_day and is_within_hours

                print(f"\n{'✓' if can_send else '✗'} CAN SEND EMAIL: {can_send}")
                if not can_send:
                    if not is_valid_day:
                        print(f"  Reason: Today ({campaign_weekday}) is not in the sending days list")
                    if not is_within_hours:
                        print(f"  Reason: Current time ({current_time_str}) is outside sending hours ({start_time}-{end_time})")
            except Exception as e:
                print(f"Error checking schedule: {e}")
                print(f"✗ CAN SEND EMAIL: False (Error occurred)")
                can_send = False

            # Only proceed if we can send emails
            if not can_send:
                print("Skipping campaign - outside sending schedule")
                continue

            # Print user details only if we can send
            print(f"\nUser ID: {user_id}")

            openai_api_key = user.get('openaiApiKey') if user else None
            print(f"OpenAI API Key: {openai_api_key[:10]}..." if openai_api_key else "OpenAI API Key: Not set")

            # Get send count
            stats = campaign.get('stats', {})
            sent = stats.get('sent')

            # Get count of emailAccountIds
            email_account_ids = campaign.get('emailAccountIds', [])
            email_account_count = len(email_account_ids)

            # Get the count of contactIds
            contact_ids = campaign.get('contactIds', [])
            contact_count = len(contact_ids)

            # Get or initialize the current email account index from campaign
            current_email_account_index = campaign.get('currentEmailAccountIndex', 0)

            # Ensure index is valid (in case email accounts were removed)
            if email_account_count > 0:
                if current_email_account_index >= email_account_count:
                    current_email_account_index = 0
                    # Update the campaign with corrected index
                    campaigns_collection.update_one(
                        {"_id": campaign["_id"]},
                        {"$set": {"currentEmailAccountIndex": 0}}
                    )

                print(f"\n🔄 Email Account Rotation: Using account #{current_email_account_index + 1} of {email_account_count}")

                # Try to find an available email account (one that hasn't hit daily limit)
                email_account = None
                current_email_account_id = None
                attempts = 0
                max_attempts = email_account_count  # Try all accounts once

                while attempts < max_attempts:
                    current_email_account_id = email_account_ids[current_email_account_index]

                    # Query email account details
                    temp_email_account = email_accounts_collection.find_one({"_id": ObjectId(current_email_account_id)})

                    if temp_email_account:
                        # Calculate sent count for today from database
                        today_start = datetime.now(pytz.UTC).replace(hour=0, minute=0, second=0, microsecond=0)
                        sent_today_count = sent_emails_collection.count_documents({
                            "emailAccountId": ObjectId(current_email_account_id),
                            "sentAt": {"$gte": today_start},
                            "status": {"$in": ["sent", "delivered"]}
                        })

                        daily_limit = temp_email_account.get('dailyLimit', 50)
                        print(f"📊 Checking {temp_email_account.get('email', 'N/A')}: {sent_today_count}/{daily_limit} emails sent today")

                        # Check if this account can send more emails
                        if sent_today_count < daily_limit:
                            email_account = temp_email_account
                            print(f"✅ Using email account: {email_account.get('email', 'N/A')}")
                            break
                        else:
                            print(f"⚠️  Daily limit reached for {temp_email_account.get('email')}. Trying next account...")

                    # Move to next account and try again
                    current_email_account_index = (current_email_account_index + 1) % email_account_count
                    attempts += 1

                # If no available account was found after checking all
                if email_account is None:
                    print(f"❌ All email accounts have reached their daily limits. Skipping campaign.")
                    # Update the index anyway for next cycle
                    next_index = (campaign.get('currentEmailAccountIndex', 0) + 1) % email_account_count
                    campaigns_collection.update_one(
                        {"_id": campaign["_id"]},
                        {"$set": {"currentEmailAccountIndex": next_index}}
                    )
                    continue

            else:
                print("No email accounts available for this campaign")
                current_email_account_index = None
                current_email_account_id = None
                email_account = None

            # Check if we have a valid email account before proceeding
            if email_account is None:
                print("⚠️  No available email account. Skipping to next campaign.")
                continue

            # Determine current contact index based on sent count
            if contact_count > 0:
                current_contact_index = sent % contact_count
                current_contact_id = contact_ids[current_contact_index]

                # Query contact details
                contact = contacts_collection.find_one({"_id": ObjectId(current_contact_id)})
                if contact:
                    print(f"Contact Email: {contact.get('email', 'N/A')}")
                else:
                    print("Contact not found in database")
            else:
                print("No contacts available for this campaign")
                current_contact_index = None
                current_contact_id = None

            # Prepare personalized email
            print("\n📧 EMAIL PERSONALIZATION:")
            print("=" * 50)

            # Get email fields directly from campaign
            useAiForSubject = campaign.get('useAiForSubject', False)
            useAiForContent = campaign.get('useAiForContent', False)

            # Initialize final subject and content
            final_subject = None
            final_content = None

            # Process Subject
            if useAiForSubject:
                ai_subject_prompt = campaign.get('aiSubjectPrompt', '')
                print("📝 SUBJECT MODE: AI-Generated")
                print(f"   Prompt: {ai_subject_prompt[:50]}..." if len(ai_subject_prompt) > 50 else f"   Prompt: {ai_subject_prompt}")

                if openai_api_key and ai_subject_prompt and contact and email_account:
                    final_subject = generate_with_ai(openai_api_key, ai_subject_prompt, contact, email_account, is_subject=True)
                    if final_subject:
                        print(f"   ✅ Generated: {final_subject}")
                    else:
                        print(f"   ⚠️ AI generation failed, using prompt as fallback")
                        final_subject = ai_subject_prompt[:60]  # Fallback to prompt
                else:
                    print(f"   ⚠️ Missing API key or data, using prompt as subject")
                    final_subject = ai_subject_prompt[:60] if ai_subject_prompt else "No Subject"
            else:
                subject_template = campaign.get('subject', '')
                print("📝 SUBJECT MODE: Manual with Variables")
                print(f"   Template: {subject_template[:50]}..." if len(subject_template) > 50 else f"   Template: {subject_template}")

                if contact and email_account:
                    final_subject = replace_variables(subject_template, contact, email_account)
                    print(f"   ✅ Personalized: {final_subject}")
                else:
                    final_subject = subject_template if subject_template else "No Subject"

            # Process Content/Body
            if useAiForContent:
                ai_content_prompt = campaign.get('aiContentPrompt', '')
                print("\n📄 CONTENT MODE: AI-Generated")
                print(f"   Prompt: {ai_content_prompt[:50]}..." if len(ai_content_prompt) > 50 else f"   Prompt: {ai_content_prompt}")

                if openai_api_key and ai_content_prompt and contact and email_account:
                    final_content = generate_with_ai(openai_api_key, ai_content_prompt, contact, email_account, is_subject=False)
                    if final_content:
                        print(f"   ✅ Generated: {final_content[:100]}...")
                    else:
                        print(f"   ⚠️ AI generation failed, using prompt as fallback")
                        final_content = ai_content_prompt
                else:
                    print(f"   ⚠️ Missing API key or data, using prompt as content")
                    final_content = ai_content_prompt if ai_content_prompt else "No content"
            else:
                content_template = campaign.get('content', '')
                print("\n📄 CONTENT MODE: Manual with Variables")
                print(f"   Template: {content_template[:50]}..." if len(content_template) > 50 else f"   Template: {content_template}")

                if contact and email_account:
                    final_content = replace_variables(content_template, contact, email_account)
                    print(f"   ✅ Personalized: {final_content[:100]}...")
                else:
                    final_content = content_template if content_template else "No content"

            print("=" * 50)


            # Send the actual email (placeholder - implement actual sending logic here)
            print("\n🚀 SENDING EMAIL...")

            # Store the sent email in the database BEFORE incrementing count
            try:
                # Get email account details for 'from' field
                from_email = email_account.get('email', 'N/A') if email_account else 'N/A'
                to_email = contact.get('email', 'N/A') if contact else 'N/A'

                # Get current time in UTC (timezone-aware)
                current_utc_time = datetime.now(pytz.UTC)

                # Prepare email document with PERSONALIZED content
                sent_email_doc = {
                    "userId": user_id,
                    "campaignId": campaign["_id"],
                    "emailAccountId": current_email_account_id if current_email_account_id else None,
                    "contactId": current_contact_id if current_contact_id else None,
                    "from": from_email,
                    "to": to_email,
                    "subject": final_subject,  # Use personalized subject
                    "content": final_content,  # Use personalized content
                    "status": "sent",  # Will be updated to 'delivered' by email provider callback
                    "sentAt": current_utc_time,
                    "wasAiGenerated": useAiForSubject or useAiForContent,
                    "aiGeneratedSubject": useAiForSubject,
                    "aiGeneratedContent": useAiForContent,
                    "opened": False,
                    "clicked": False,
                    "createdAt": current_utc_time,
                    "updatedAt": current_utc_time,
                }

                # Insert the sent email document
                result = sent_emails_collection.insert_one(sent_email_doc)
                sent_email_id = result.inserted_id

                print(f"\n✅ Email stored in database with ID: {sent_email_id}")
                print(f"   From: {from_email}")
                print(f"   To: {to_email}")
                print(f"   Subject: {final_subject[:80]}..." if len(final_subject) > 80 else f"   Subject: {final_subject}")
                print(f"   Content Preview: {final_content[:100]}..." if len(final_content) > 100 else f"   Content: {final_content}")

            except Exception as e:
                print(f"❌ Error storing sent email in database: {e}")
                # Continue even if database storage fails

            # Increment the sent count and rotate email account index
            new_sent_count = sent + 1
            next_email_account_index = (current_email_account_index + 1) % email_account_count if email_account_count > 0 else 0

            campaigns_collection.update_one(
                {"_id": campaign["_id"]},
                {"$set": {
                    "stats.sent": new_sent_count,
                    "currentEmailAccountIndex": next_email_account_index
                }}
            )
            print(f"\n📊 Sent count updated: {sent} -> {new_sent_count}")
            print(f"🔄 Email account index rotated: {current_email_account_index} -> {next_email_account_index}")


        # End of campaign loop
        if campaign_count == 0:
            print("\n⚠️  No active campaigns found")

        print(f"\n✅ Cycle #{cycle_count} completed - Processed {campaign_count} campaigns")
        print(f"⏱️  Waiting {wait_time} seconds before next cycle...")
        time.sleep(wait_time)

    except KeyboardInterrupt:
        print("\n\n⛔ Stopped by user (Ctrl+C)")
        print("👋 Shutting down email campaign processor...")
        break
    except Exception as e:
        print(f"\n❌ Error in cycle #{cycle_count}: {e}")
        print(f"⏱️  Waiting {wait_time} seconds before retrying...")
        time.sleep(wait_time)


