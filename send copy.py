import os
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
import pytz

wait_time = 0

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

def get_scheduled_contacts():
    """Retrieve contacts scheduled for today or earlier from active campaigns"""
    now = datetime.now()
    
    # Find all active campaigns
    active_campaigns = list(campaigns_collection.find({'isActive': True}))
    
    if not active_campaigns:
        print("No active campaigns found")
        return []
    
    all_scheduled_contacts = []
    
    for campaign in active_campaigns:
        print(f"Processing campaign: {campaign.get('name', 'Unnamed')}")
        
        # Get contactIds from this campaign
        contact_ids = campaign.get('contactIds', [])
        
        if not contact_ids:
            print(f"  No contacts in campaign: {campaign.get('name', 'Unnamed')}")
            continue
        
        # Find scheduled contacts that are in this campaign's contactIds and have upcoming sequences
        query = {
            '_id': {'$in': contact_ids},
            'schedule': {'$lte': now},
            'status': 'active',
            'hasUpcomingSequence': True
        }
        
        campaign_contacts = list(contacts_collection.find(query).limit(1))
        
        if campaign_contacts:
            print(f"  Found {len(campaign_contacts)} scheduled contact(s) in campaign: {campaign.get('name', 'Unnamed')}")
            # Add campaign info to each contact
            for contact in campaign_contacts:
                contact['campaign_name'] = campaign.get('name', 'Unnamed')
                contact['campaign_id'] = campaign.get('_id')
            all_scheduled_contacts.extend(campaign_contacts)
        else:
            print(f"  No scheduled contacts found in campaign: {campaign.get('name', 'Unnamed')}")
    
    return all_scheduled_contacts


def get_next_email_account(campaign):
    """Get the next email account to use for this campaign (simple rotation)"""
    email_account_ids = campaign.get('emailAccountIds', [])
    if not email_account_ids:
        return None, 0
    
    # Simple rotation - use timestamp-based selection for basic rotation
    import random
    selected_index = random.randint(0, len(email_account_ids) - 1)
    selected_email_account_id = email_account_ids[selected_index]
    
    # Get email account details
    email_account = email_accounts_collection.find_one({'_id': selected_email_account_id})
    
    return email_account, selected_index


# ============================================================================
# SCHEDULE VALIDATION FUNCTION
# ============================================================================
def can_send_email_now(campaign):
    """
    Check if emails can be sent now based on campaign schedule and user timezone
    
    Args:
        campaign (dict): Campaign document with schedule settings and userId
        
    Returns:
        tuple: (can_send: bool, reason: str)
    """
    try:
        # Get user information for timezone
        user = users_collection.find_one({'_id': campaign.get('userId')})
        if not user:
            return False, "User not found"
        
        # Get user timezone (default to UTC if not set)
        user_timezone = user.get('timezone', 'UTC')
        try:
            tz = pytz.timezone(user_timezone)
        except pytz.exceptions.UnknownTimeZoneError:
            print(f"⚠️  Unknown timezone '{user_timezone}', using UTC")
            tz = pytz.UTC
        
        # Get current time in user's timezone
        current_time_utc = datetime.now(pytz.UTC)
        current_time_user = current_time_utc.astimezone(tz)
        
        print(f"🌍 User timezone: {user_timezone}")
        print(f"🕐 Current time (user timezone): {current_time_user.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        
        # Get schedule settings from campaign
        schedule = campaign.get('schedule', {})
        sending_hours = schedule.get('sendingHours', {})
        sending_days = schedule.get('sendingDays', [0, 1, 2, 3, 4, 5, 6])  # Default: all days
        
        # Parse sending hours
        start_hour_str = sending_hours.get('start', '09:00')
        end_hour_str = sending_hours.get('end', '17:00')
        
        start_hour = datetime.strptime(start_hour_str, '%H:%M').time()
        end_hour = datetime.strptime(end_hour_str, '%H:%M').time()
        
        print(f"📅 Allowed sending hours: {start_hour_str} - {end_hour_str}")
        print(f"📅 Allowed sending days: {sending_days}")
        
        # Check if current day is allowed (0=Monday, 6=Sunday)
        current_weekday = current_time_user.weekday()
        if current_weekday not in sending_days:
            return False, f"Today is not a sending day. Current: {current_weekday}, Allowed: {sending_days}"
        
        # Check if current time is within sending hours
        current_time_only = current_time_user.time()
        if not (start_hour <= current_time_only <= end_hour):
            return False, f"Current time {current_time_only.strftime('%H:%M')} is outside sending hours {start_hour_str}-{end_hour_str}"
        
        return True, "Schedule check passed"
        
    except Exception as e:
        print(f"❌ Error checking schedule: {e}")
        return False, f"Schedule check error: {e}"


# ============================================================================
# EMAIL SENDING FUNCTION
# ============================================================================
def send_email(sender_email, receiver_email, subject, body):
    """
    Send email function - currently just prints email details for testing
    
    Args:
        sender_email (str): Email address of the sender
        receiver_email (str): Email address of the receiver
        subject (str): Email subject line
        body (str): Email body content
    
    Returns:
        bool: True if email was "sent" successfully
    """
    print(f"\n" + "="*60)
    print(f"📧 SENDING EMAIL")
    print(f"="*60)
    print(f"From: {sender_email}")
    print(f"To: {receiver_email}")
    print(f"Subject: {subject}")
    print(f"\nBody:")
    print(f"-"*40)
    print(f"{body}")
    print(f"-"*40)
    print(f"✅ Email sent successfully!")
    print(f"="*60)
    
    # Here you can add actual email sending logic later
    # For example: SMTP, SendGrid, Amazon SES, etc.
    
    return True


# ============================================================================
# UPDATE SENT COUNTS FUNCTION
# ============================================================================
def update_sent_counts(contact_id, campaign_id):
    """
    Update sent email counts for both contact and campaign after sending email
    
    Args:
        contact_id (ObjectId): Contact ID to update
        campaign_id (ObjectId): Campaign ID to update
    
    Returns:
        bool: True if updates were successful
    """
    try:
        # Update contact timesContacted count
        contact_result = contacts_collection.update_one(
            {'_id': contact_id},
            {
                '$inc': {'timesContacted': 1},
                '$set': {'lastContacted': datetime.now()}
            }
        )
        
        # Update campaign stats.sent count
        campaign_result = campaigns_collection.update_one(
            {'_id': campaign_id},
            {'$inc': {'stats.sent': 1}}
        )
        
        print(f"📊 Updated sent counts:")
        print(f"   Contact times contacted: +1")
        print(f"   Campaign sent count: +1")
        
        return contact_result.modified_count > 0 and campaign_result.modified_count > 0
        
    except Exception as e:
        print(f"❌ Error updating sent counts: {e}")
        return False


# ============================================================================
# CONTACT SCHEDULE UPDATE FUNCTION
# ============================================================================
def update_contact_schedule(contact_id, sequence, contact_sent_count, total_sequences):
    """
    Update contact's schedule based on the sequence's nextEmailAfter setting
    and set hasUpcomingSequence based on remaining sequences
    
    Args:
        contact_id (ObjectId): Contact ID to update
        sequence (dict): Email sequence containing nextEmailAfter value
        contact_sent_count (int): Current number of emails sent to contact
        total_sequences (int): Total number of active sequences in campaign
    
    Returns:
        bool: True if update was successful
    """
    try:
        next_email_after_days = sequence.get('nextEmailAfter', 1)  # Default to 1 day
        
        # Calculate new schedule date
        current_time = datetime.now()
        new_schedule = current_time + timedelta(days=next_email_after_days)
        
        # Check if there are more sequences after this one
        # contact_sent_count will be incremented after this, so check if there are sequences beyond that
        has_upcoming_sequence = (contact_sent_count + 1) < total_sequences
        
        # Update the contact's schedule and hasUpcomingSequence in database
        update_data = {'$set': {'schedule': new_schedule, 'hasUpcomingSequence': has_upcoming_sequence}}
        
        result = contacts_collection.update_one(
            {'_id': contact_id},
            update_data
        )
        
        print(f"📅 Updated contact schedule:")
        print(f"   Contact ID: {contact_id}")
        print(f"   Next email after: {next_email_after_days} days")
        print(f"   New schedule: {new_schedule.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   Has upcoming sequence: {has_upcoming_sequence}")
        print(f"   Contact sent count (after this): {contact_sent_count + 1}")
        print(f"   Total sequences: {total_sequences}")
        
        return result.modified_count > 0
        
    except Exception as e:
        print(f"❌ Error updating contact schedule: {e}")
        return False


# ============================================================================
# UPDATE ALL CONTACTS UPCOMING SEQUENCE STATUS
# ============================================================================
def update_all_contacts_upcoming_sequence_status(campaign_id):
    """
    Update hasUpcomingSequence for all contacts in a campaign based on available sequences
    
    Args:
        campaign_id (ObjectId): Campaign ID to update contacts for
    
    Returns:
        int: Number of contacts updated
    """
    try:
        # Get campaign with sequences
        campaign = campaigns_collection.find_one({'_id': campaign_id})
        if not campaign:
            print(f"❌ Campaign not found: {campaign_id}")
            return 0
        
        # Get active sequences count
        active_sequences = [seq for seq in campaign.get('sequences', []) if seq.get('isActive', True)]
        total_sequences = len(active_sequences)
        
        print(f"🔄 Updating hasUpcomingSequence for all contacts in campaign")
        print(f"   Campaign has {total_sequences} active sequences")
        
        # Get all contacts for this campaign
        contacts = list(contacts_collection.find({'campaignId': campaign_id}))
        
        updated_count = 0
        for contact in contacts:
            contact_sent_count = contact.get('timesContacted', 0)
            has_upcoming_sequence = contact_sent_count < total_sequences
            
            # Update contact's hasUpcomingSequence status
            result = contacts_collection.update_one(
                {'_id': contact['_id']},
                {'$set': {'hasUpcomingSequence': has_upcoming_sequence}}
            )
            
            if result.modified_count > 0:
                updated_count += 1
        
        print(f"✅ Updated {updated_count} contacts with upcoming sequence status")
        return updated_count
        
    except Exception as e:
        print(f"❌ Error updating contacts upcoming sequence status: {e}")
        return 0


# ============================================================================
# SET ALL CONTACTS UPCOMING SEQUENCE TO TRUE
# ============================================================================
def set_all_contacts_upcoming_sequence_true(campaign_id):
    """
    Set hasUpcomingSequence to true for all contacts in a campaign
    (called when sequences are added/updated)
    
    Args:
        campaign_id (ObjectId): Campaign ID to update contacts for
    
    Returns:
        int: Number of contacts updated
    """
    try:
        print(f"🔄 Setting hasUpcomingSequence=true for all contacts in campaign")
        
        # Update all contacts in this campaign to have upcoming sequences
        result = contacts_collection.update_many(
            {'campaignId': campaign_id},
            {'$set': {'hasUpcomingSequence': True}}
        )
        
        print(f"✅ Updated {result.modified_count} contacts to hasUpcomingSequence=true")
        return result.modified_count
        
    except Exception as e:
        print(f"❌ Error setting contacts upcoming sequence to true: {e}")
        return 0


# ============================================================================
# UPDATE CONTACT SCHEDULES BASED ON SEQUENCE CHANGES
# ============================================================================
def update_contact_schedules_for_sequence_changes(campaign_id):
    """
    Recalculate and update contact schedules when sequence nextEmailAfter values change
    
    Args:
        campaign_id (ObjectId): Campaign ID to update contacts for
    
    Returns:
        int: Number of contacts updated
    """
    try:
        print(f"🔄 Recalculating contact schedules based on sequence changes")
        
        # Get campaign with sequences
        campaign = campaigns_collection.find_one({'_id': campaign_id})
        if not campaign:
            print(f"❌ Campaign not found: {campaign_id}")
            return 0
        
        # Get active sequences
        active_sequences = [seq for seq in campaign.get('sequences', []) if seq.get('isActive', True)]
        total_sequences = len(active_sequences)
        
        if total_sequences == 0:
            print(f"❌ No active sequences found in campaign")
            return 0
        
        print(f"   Campaign has {total_sequences} active sequences")
        
        # Get all contacts for this campaign
        contacts = list(contacts_collection.find({'campaignId': campaign_id}))
        
        updated_count = 0
        current_time = datetime.now()
        
        for contact in contacts:
            contact_sent_count = contact.get('timesContacted', 0)
            
            # Skip contacts who haven't been contacted yet (they'll start immediately)
            if contact_sent_count == 0:
                continue
            
            # Skip contacts who have completed all sequences
            if contact_sent_count >= total_sequences:
                continue
            
            # Determine which sequence this contact is waiting for next
            next_sequence_index = contact_sent_count  # 0-based index of next sequence
            
            if next_sequence_index < len(active_sequences):
                next_sequence = active_sequences[next_sequence_index]
                
                # Get the nextEmailAfter from the sequence they're waiting for
                next_email_after_days = next_sequence.get('nextEmailAfter', 7)
                
                # Calculate new schedule based on their last contacted date
                last_contacted = contact.get('lastContacted')
                if last_contacted:
                    # Calculate new schedule from their last contacted date
                    new_schedule = last_contacted + timedelta(days=next_email_after_days)
                else:
                    # If no lastContacted, use current time (shouldn't happen but safety check)
                    new_schedule = current_time + timedelta(days=next_email_after_days)
                
                # Update the contact's schedule
                result = contacts_collection.update_one(
                    {'_id': contact['_id']},
                    {'$set': {'schedule': new_schedule}}
                )
                
                if result.modified_count > 0:
                    updated_count += 1
                    print(f"   Updated contact {contact.get('email', 'Unknown')}")
                    print(f"     Times contacted: {contact_sent_count}")
                    print(f"     Waiting for sequence: {next_sequence_index + 1}")
                    print(f"     Next email after: {next_email_after_days} days")
                    print(f"     New schedule: {new_schedule.strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"✅ Updated schedules for {updated_count} contacts")
        return updated_count
        
    except Exception as e:
        print(f"❌ Error updating contact schedules for sequence changes: {e}")
        return 0


# ============================================================================
# MAIN PROGRAM
# ============================================================================
def main():
    """Main loop to continuously retrieve and process scheduled contacts"""
    print("Starting contact retrieval system...")
    
    while True:
        try:
            contacts = get_scheduled_contacts()
            
            if contacts:
                print(f"\nFound {len(contacts)} total scheduled contact(s):")
                for contact in contacts:
                    print(f"\nContact: {contact.get('email', 'No email')}")
                    print(f"Campaign: {contact.get('campaign_name', 'Unknown')}")
                    
                    # Get full campaign details to access sequences
                    campaign_id = contact.get('campaign_id')
                    if campaign_id:
                        campaign = campaigns_collection.find_one({'_id': campaign_id})
                        if campaign:
                            # Check if we can send emails now based on schedule and timezone
                            can_send, reason = can_send_email_now(campaign)
                            print(f"🔍 Schedule check: {reason}")
                            
                            if not can_send:
                                print(f"⏸️  Skipping email sending: {reason}")
                                continue
                            
                            print("✅ Schedule check passed - proceeding with email sending")
                            
                            # Get email account for sending
                            email_account, selected_index = get_next_email_account(campaign)
                            if email_account:
                                print(f"Selected Email Account: {email_account.get('email', 'Unknown email')}")
                                print(f"Email Account Name: {email_account.get('name', 'No name')}")
                                print(f"Selected account index: {selected_index}")
                            else:
                                print("No email accounts found for this campaign")
                                continue
                            
                            # Show sequences and send emails
                            if 'sequences' in campaign:
                                print(f"Sequences in campaign:")
                                for i, sequence in enumerate(campaign['sequences'], 1):
                                    print(f"  Sequence {i}:")
                                    print(f"    Subject: {sequence.get('subject', 'No subject')}")
                                    print(f"    Content: {sequence.get('content', 'No content')[:100]}{'...' if len(sequence.get('content', '')) > 100 else ''}")
                                    
                                    # Print AI prompts if they exist
                                    if sequence.get('useAiForSubject') and sequence.get('aiSubjectPrompt'):
                                        print(f"    AI Subject Prompt: {sequence.get('aiSubjectPrompt')}")
                                    
                                    if sequence.get('useAiForContent') and sequence.get('aiContentPrompt'):
                                        print(f"    AI Content Prompt: {sequence.get('aiContentPrompt')}")
                                    
                                    print()  # Empty line for better readability
                                
                                # Determine which sequence to send based on contact's sent count
                                contact_sent_count = contact.get('timesContacted', 0)
                                
                                # Find the appropriate sequence based on sent count (0-indexed)
                                # First email = sequence 0, second email = sequence 1, etc.
                                target_sequence_index = contact_sent_count
                                
                                # Get active sequences only
                                active_sequences = [seq for seq in campaign['sequences'] if seq.get('isActive', True)]
                                total_sequences = len(active_sequences)
                                
                                if target_sequence_index < len(active_sequences) and email_account:
                                    target_sequence = active_sequences[target_sequence_index]
                                    
                                    print(f"📧 Sending sequence #{target_sequence_index + 1} (step {target_sequence.get('stepNumber', 'Unknown')})")
                                    print(f"   Contact has been contacted {contact_sent_count} times before")
                                    
                                    sender_email = email_account.get('email', 'unknown@sender.com')
                                    receiver_email = contact.get('email', 'unknown@receiver.com')
                                    subject = target_sequence.get('subject', 'No Subject')
                                    body = target_sequence.get('content', 'No Content')
                                    
                                    # Call send_email function
                                    email_sent = send_email(sender_email, receiver_email, subject, body)
                                    
                                    # Use the target sequence for scheduling (instead of active_sequence)
                                    active_sequence = target_sequence
                                elif target_sequence_index >= len(active_sequences):
                                    print(f"📭 No more sequences to send for this contact")
                                    print(f"   Contact has been contacted {contact_sent_count} times")
                                    print(f"   Campaign has {len(active_sequences)} active sequences")
                                    email_sent = False
                                    active_sequence = None
                                else:
                                    print("❌ No email account available or no sequences found")
                                    email_sent = False
                                    active_sequence = None
                                
                                # Update sent counts and contact schedule after successful email sending
                                if email_sent and active_sequence:
                                    contact_id = contact.get('_id')
                                    campaign_id = contact.get('campaign_id')
                                    
                                    if contact_id and campaign_id:
                                        # Update sent counts for both contact and campaign
                                        update_sent_counts(contact_id, campaign_id)
                                        
                                        # Update contact schedule based on sequence nextEmailAfter setting
                                        update_contact_schedule(contact_id, active_sequence, contact_sent_count, total_sequences)
                                    else:
                                        print("⚠️  Warning: Contact ID or Campaign ID not found, cannot update counts/schedule")
                                    
                                    # Apply delay between emails based on campaign settings
                                    email_delay_seconds = campaign.get('schedule', {}).get('emailDelaySeconds', 60)
                                    print(f"⏱️  Waiting {email_delay_seconds} seconds before next email (campaign delay setting)...")
                                    # time.sleep(email_delay_seconds)
                    
                    print("-" * 50)  # Separator between contacts
            else:
                print("No scheduled contacts found in any active campaign")
            
            # print(f"Waiting {wait_time} seconds before next check")
            time.sleep(wait_time)
            
        except KeyboardInterrupt:
            print("\n\n🛑 Script interrupted by user (Ctrl+C)")
            print("👋 Exiting gracefully...")
            break
            
        except Exception as e:
            print(f"❌ Error retrieving contacts: {e}")
            print("🔄 Retrying in 30 seconds...")
            time.sleep(30)
    
    print("✅ Script terminated successfully!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Script interrupted by user (Ctrl+C)")
        print("👋 Goodbye!")
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        print("❌ Script terminated with error!")

