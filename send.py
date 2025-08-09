import os
import pymongo
import time
import pytz
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv
from bson import ObjectId

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
        
        if not (start_minutes <= current_minutes <= end_minutes):
            return False, f"Current time ({current_time.strftime('%H:%M')}) is outside allowed hours ({sending_hours['start']}-{sending_hours['end']}) (timezone: {user_timezone})"
        
        return True, "Within allowed schedule"
        
    except Exception as e:
        return False, f"Error checking schedule: {str(e)}"

# Check if email account has reached daily limit
def check_daily_limit(db, email_account_id):
    """Check if email account has reached its daily sending limit"""
    try:
        # Get today's date in UTC
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
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
        time_since_last = datetime.utcnow() - last_email['sentAt']
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

# Create email log entry
def create_email_log(db, user_id, campaign_id, contact_id, email_account_id, sequence_step, subject, content):
    """Create an email log entry for tracking"""
    try:
        message_id = str(uuid.uuid4())
        current_time = datetime.utcnow()
        
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
                
                # Get subject and content, then personalize them
                subject = sequenceToUse.get('subject', 'No Subject')
                content = sequenceToUse.get('content', 'No Content')
                
                # Personalize content with contact data
                personalized_subject = personalize_content(subject, contact)
                personalized_content = personalize_content(content, contact)
                
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
                    current_time = datetime.utcnow()
                    
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
                            "failedAt": datetime.utcnow(),
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
