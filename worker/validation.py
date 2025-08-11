import pytz
from datetime import datetime, timedelta, timezone


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