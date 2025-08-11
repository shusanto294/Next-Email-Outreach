import time
from datetime import datetime, timezone
from bson import ObjectId

from validation import is_within_schedule, check_daily_limit, check_sequence_delay, validate_contact_status
from content_processing import fetch_website_content, personalize_content
from email_simulator import simulate_send_email
from ai_personalization import personalize_with_ai
from database import fetch_active_campaigns, create_personalization_log, create_email_log


def process_campaigns(db):
    """Main function to process all active campaigns"""
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
                
                # Process single campaign
                process_single_campaign(db, campaign, user)
                
            except Exception as e:
                continue
        
        return True
        
    except Exception as e:
        return False


def process_single_campaign(db, campaign, user):
    """Process a single campaign"""
    try:
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
            return
        
        # Inbox and contact rotation with bounds checking
        if len(emailAccountIds) > 0:
            nextEmailAccountToUse = (nextEmailAccountToUse + 1) % len(emailAccountIds)
        else:
            print(f"Campaign {campaign.get('_id')} has no email accounts")
            time.sleep(1)
            return
            
        if len(contactIds) > 0:
            nextContactToUse = (nextContactToUse + 1) % len(contactIds)
        else:
            print(f"Campaign {campaign.get('_id')} has no contacts")
            time.sleep(1)
            return

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
            return
        
        from_email = sendingEmailAccount.get('email', 'Unknown')

        # Check if email account has reached daily limit
        within_limit, limit_message = check_daily_limit(db, sendingEmailAccountID)
        if not within_limit:
            print(f"Email account {from_email}: {limit_message}")
            time.sleep(1)
            return

        # Get the contact
        contactID = contactIds[nextContactToUse]
        contact = db.contacts.find_one({"_id": contactID})
        
        if not contact:
            print(f"Contact {contactID} not found in database")
            time.sleep(1)
            return
        
        # Validate contact status
        can_send, status_message = validate_contact_status(contact)
        if not can_send:
            print(f"Contact {contact.get('email', 'Unknown')}: {status_message}")
            time.sleep(1)
            return
            
        timesContacted = contact.get('timesContacted', 0)
        to_email = contact.get('email', 'Unknown')
        
        # Check if we have reached the end of sequences for this contact
        if timesContacted >= len(sequences):
            print(f"Contact {to_email} has been contacted {timesContacted} times, exceeding available sequences ({len(sequences)})")
            time.sleep(1)
            return

        # Check if enough time has passed since last sequence email
        delay_ok, delay_message = check_sequence_delay(db, contactID, campaign["_id"], timesContacted)
        if not delay_ok:
            print(f"Contact {to_email}: {delay_message}")
            time.sleep(1)
            return

        # Get the sequence to use
        sequenceToUse = sequences[timesContacted]
        
        if not sequenceToUse or not sequenceToUse.get('isActive', True):
            print(f"Sequence {timesContacted} is empty or inactive for campaign {campaign.get('_id')}")
            time.sleep(1)
            return
        
        # Process email content and send
        process_email_content(db, campaign, user, contact, sequenceToUse, sendingEmailAccountID, 
                            from_email, to_email, contactID, timesContacted, sequences)
        
    except Exception as e:
        print(f"Error processing campaign: {e}")


def process_email_content(db, campaign, user, contact, sequenceToUse, sendingEmailAccountID, 
                         from_email, to_email, contactID, timesContacted, sequences):
    """Process and send email content for a contact"""
    try:
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
        personalized_subject = get_personalized_subject(
            db, campaign, user, contact, sequenceToUse, website_data, contactID, timesContacted
        )
        
        personalized_content = get_personalized_content(
            db, campaign, user, contact, sequenceToUse, website_data, contactID, timesContacted
        )
        
        print(f"Processing: {to_email} (sequence {timesContacted + 1}/{len(sequences)})")
        
        # Create email log entry before sending
        log_created, log_id = create_email_log(
            db, user.get('_id'), campaign["_id"], contactID, 
            sendingEmailAccountID, timesContacted, 
            personalized_subject, personalized_content
        )
        
        if not log_created:
            print(f"Failed to create email log: {log_id}")
            time.sleep(1)
            return
        
        # Simulate sending the email
        email_sent_successfully = simulate_send_email(from_email, to_email, personalized_subject, personalized_content)
        
        if email_sent_successfully:
            update_after_successful_send(db, campaign, contact, contactID, sendingEmailAccountID, timesContacted)
        else:
            mark_email_as_failed(db, log_id)
            
        # Use campaign's email delay setting
        schedule = campaign.get('schedule', {})
        email_delay = schedule.get('emailDelaySeconds', 60)  # Default 60 seconds
        time.sleep(email_delay)
        
    except Exception as e:
        print(f"Error processing email content: {e}")


def get_personalized_subject(db, campaign, user, contact, sequenceToUse, website_data, contactID, timesContacted):
    """Get personalized subject line"""
    if sequenceToUse.get('useAiForSubject', False):
        # Use AI prompt for subject
        ai_subject_prompt = sequenceToUse.get('aiSubjectPrompt', 'No AI Subject Prompt')
        personalized_subject, subject_processing_time = personalize_with_ai(ai_subject_prompt, contact, user, website_data)
        print(f"Using AI Subject: {personalized_subject}")
        
        # Store personalization log for subject
        create_personalization_log(
            db, user.get('_id'), campaign["_id"], contactID, timesContacted,
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
            db, user.get('_id'), campaign["_id"], contactID, timesContacted,
            'subject', 'manual', subject, personalized_subject,
            website_data, None, None
        )
    
    return personalized_subject


def get_personalized_content(db, campaign, user, contact, sequenceToUse, website_data, contactID, timesContacted):
    """Get personalized email content"""
    if sequenceToUse.get('useAiForContent', False):
        # Use AI prompt for content
        ai_content_prompt = sequenceToUse.get('aiContentPrompt', 'No AI Content Prompt')
        personalized_content, content_processing_time = personalize_with_ai(ai_content_prompt, contact, user, website_data)
        print(f"Using AI Content: {personalized_content}")
        
        # Store personalization log for content
        create_personalization_log(
            db, user.get('_id'), campaign["_id"], contactID, timesContacted,
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
            db, user.get('_id'), campaign["_id"], contactID, timesContacted,
            'content', 'manual', content, personalized_content,
            website_data, None, None
        )
    
    return personalized_content


def update_after_successful_send(db, campaign, contact, contactID, sendingEmailAccountID, timesContacted):
    """Update database records after successful email send"""
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
    
    # print(f"Email sent successfully to {contact.get('email', 'Unknown')}")


def mark_email_as_failed(db, log_id):
    """Mark email log as failed"""
    db.emaillogs.update_one(
        {"_id": ObjectId(log_id)},
        {"$set": {
            "status": "failed",
            "failedAt": datetime.now(timezone.utc),
            "errorMessage": "Simulation failed"
        }}
    )
    print(f"Failed to send email")