import os
import time
import imaplib
import email
from email.header import decode_header
from datetime import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
import re
import pytz

# Load environment variables
load_dotenv('.env.local')

MONGODB_URI = os.getenv('MONGODB_URI')
if not MONGODB_URI:
    raise ValueError("MONGODB_URI environment variable is not set")

# MongoDB connection
client = MongoClient(MONGODB_URI)
db = client.get_default_database()
email_accounts_collection = db['emailaccounts']
received_emails_collection = db['receivedemails']
sent_emails_collection = db['sentemails']
contacts_collection = db['contacts']
campaigns_collection = db['campaigns']
users_collection = db['users']
logs_collection = db['logs']


def log_message(user_id, message, level='info', metadata=None):
    """
    Log a message to the database

    Args:
        user_id: User ID (ObjectId or string)
        message: Log message
        level: Log level ('info', 'success', 'warning', 'error')
        metadata: Optional dictionary with additional data
    """
    try:
        # Convert user_id to ObjectId if it's a string
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        current_utc_time = datetime.now(pytz.UTC)

        log_doc = {
            'userId': user_id,
            'source': 'receive',
            'level': level,
            'message': message,
            'metadata': metadata or {},
            'createdAt': current_utc_time,
            'updatedAt': current_utc_time,
        }

        logs_collection.insert_one(log_doc)
        # Also print to console for debugging
        print(message)
    except Exception as e:
        # Fallback to print if logging fails
        print(f"[LOG ERROR] {message}")
        print(f"[LOG ERROR] Failed to write to database: {e}")

# Configuration
EMAILS_TO_FETCH = 50  # Number of emails to fetch per account per check
DEFAULT_CHECK_INTERVAL = 30  # Default check interval if user setting is not available (in seconds)


def should_ignore_email(subject, body, user_id):
    """Check if email should be ignored based on user's ignore keywords"""
    try:
        # Fetch user's ignore keywords
        user = users_collection.find_one({'_id': ObjectId(user_id)})

        if not user or not user.get('ignoreKeywords'):
            return False  # No keywords to ignore

        # Get keywords and split by comma
        ignore_keywords_str = user.get('ignoreKeywords', '').strip()
        if not ignore_keywords_str:
            return False

        # Split by comma and clean each keyword
        keywords = [kw.strip().lower() for kw in ignore_keywords_str.split(',') if kw.strip()]

        if not keywords:
            return False

        # Combine subject and body for checking
        subject_lower = (subject or '').lower()
        body_lower = (body or '').lower()
        combined_text = subject_lower + ' ' + body_lower

        # Check if any keyword is present
        for keyword in keywords:
            if keyword in combined_text:
                print(f"      🚫 Ignoring email - contains keyword: '{keyword}'")
                return True

        return False

    except Exception as e:
        print(f"      ⚠️ Error checking ignore keywords: {e}")
        return False  # Don't ignore if there's an error


def clean_email_address(email_str):
    """Extract clean email address from string like 'Name <email@domain.com>'"""
    if not email_str:
        return None

    # Try to extract email from angle brackets
    match = re.search(r'<(.+?)>', email_str)
    if match:
        return match.group(1).lower().strip()

    # If no angle brackets, just clean and return
    return email_str.lower().strip()


def decode_mime_words(s):
    """Decode MIME encoded words in headers"""
    if not s:
        return ""

    decoded_fragments = decode_header(s)
    result = []

    for fragment, encoding in decoded_fragments:
        if isinstance(fragment, bytes):
            if encoding:
                try:
                    result.append(fragment.decode(encoding))
                except:
                    result.append(fragment.decode('utf-8', errors='ignore'))
            else:
                result.append(fragment.decode('utf-8', errors='ignore'))
        else:
            result.append(str(fragment))

    return ''.join(result)


def extract_text_from_email(msg):
    """Extract plain text and HTML content from email message"""
    text_content = ""
    html_content = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))

            # Skip attachments
            if "attachment" in content_disposition:
                continue

            try:
                body = part.get_payload(decode=True)
                if body:
                    charset = part.get_content_charset() or 'utf-8'
                    body = body.decode(charset, errors='ignore')

                    if content_type == "text/plain":
                        text_content += body
                    elif content_type == "text/html":
                        html_content += body
            except:
                continue
    else:
        # Not multipart
        try:
            body = msg.get_payload(decode=True)
            if body:
                charset = msg.get_content_charset() or 'utf-8'
                body = body.decode(charset, errors='ignore')

                content_type = msg.get_content_type()
                if content_type == "text/plain":
                    text_content = body
                elif content_type == "text/html":
                    html_content = body
        except:
            pass

    return text_content, html_content


def extract_attachments_info(msg):
    """Extract attachment information from email"""
    attachments = []

    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition"))

            if "attachment" in content_disposition:
                filename = part.get_filename()
                if filename:
                    filename = decode_mime_words(filename)
                    attachments.append({
                        "filename": filename,
                        "contentType": part.get_content_type(),
                        "size": len(part.get_payload(decode=True) or b'')
                    })

    return attachments


def find_related_sent_email(from_email, subject, in_reply_to, references, user_id, email_account_id):
    """Try to find the sent email that this is a reply to"""
    # Clean the subject (remove Re:, Fwd:, etc.)
    clean_subject = re.sub(r'^(Re:|RE:|Fwd:|FWD:)\s*', '', subject or '', flags=re.IGNORECASE).strip()

    # First try to match by message ID
    if in_reply_to:
        sent_email = sent_emails_collection.find_one({
            'messageId': in_reply_to,
            'userId': user_id
        })
        if sent_email:
            return sent_email

    # Try to match by references
    if references:
        for ref in references:
            sent_email = sent_emails_collection.find_one({
                'messageId': ref,
                'userId': user_id
            })
            if sent_email:
                return sent_email

    # Try to match by recipient and subject
    sent_email = sent_emails_collection.find_one({
        'to': from_email,
        'userId': user_id,
        'emailAccountId': email_account_id,
        '$or': [
            {'subject': {'$regex': re.escape(clean_subject), '$options': 'i'}},
            {'subject': subject}
        ]
    }, sort=[('sentAt', -1)])

    return sent_email


def find_or_create_contact(email_address, user_id):
    """Find existing contact or create new one"""
    # Try to find existing contact
    contact = contacts_collection.find_one({
        'email': email_address,
        'userId': user_id
    })

    if contact:
        return contact

    # Extract name from email if possible
    name_part = email_address.split('@')[0]
    first_name = name_part.replace('.', ' ').replace('_', ' ').title()

    # Get current time in UTC (timezone-aware)
    current_utc_time = datetime.now(pytz.UTC)

    # Create new contact
    new_contact = {
        'userId': user_id,
        'email': email_address,
        'firstName': first_name,
        'lastName': '',
        'company': '',
        'position': '',
        'phone': '',
        'website': '',
        'linkedin': '',
        'status': 'active',
        'source': 'email_reply',
        'createdAt': current_utc_time,
        'updatedAt': current_utc_time,
    }

    result = contacts_collection.insert_one(new_contact)
    new_contact['_id'] = result.inserted_id

    print(f"   📝 Created new contact: {email_address}")

    return new_contact


def connect_to_imap(email_account):
    """Connect to IMAP server for an email account"""
    provider = email_account.get('provider', 'gmail')
    email_address = email_account.get('email')

    # Get password from smtpPassword field (used for both SMTP and IMAP)
    password = email_account.get('smtpPassword')

    if not password:
        print(f"   ⚠️  No password found for {email_address}")
        print(f"      Please ensure 'smtpPassword' field is set in the database")
        return None

    # Get IMAP settings from database
    imap_host = email_account.get('imapHost')
    imap_port = email_account.get('imapPort', 993)

    if not imap_host:
        print(f"   ⚠️  No IMAP host found for {email_address}")
        print(f"      Please ensure 'imapHost' field is set in the database")
        return None

    # Use database settings
    host = imap_host
    port = imap_port

    try:
        # Connect to IMAP server
        print(f"   🔌 Connecting to IMAP...")
        print(f"      Host: {host}")
        print(f"      Port: {port}")
        print(f"      Username: {email_address}")

        imap = imaplib.IMAP4_SSL(host, port)
        imap.login(email_address, password)
        print(f"   ✅ Connected to IMAP successfully!")
        return imap
    except Exception as e:
        print(f"   ❌ IMAP connection failed: {e}")
        print(f"      Check:")
        print(f"      - IMAP host is correct: {host}")
        print(f"      - IMAP port is correct: {port}")
        print(f"      - Password is correct")
        print(f"      - IMAP is enabled for this email account")
        return None


def fetch_emails_from_account(email_account):
    """Fetch new emails from a single email account"""
    email_address = email_account.get('email')
    user_id = email_account.get('userId')
    account_id = email_account.get('_id')

    log_message(user_id, f"📬 Fetching emails for: {email_address}", level='info')

    # Connect to IMAP
    imap = connect_to_imap(email_account)
    if not imap:
        return 0

    emails_fetched = 0

    try:
        # Select inbox
        imap.select('INBOX')

        # Search for unseen emails
        status, messages = imap.search(None, 'UNSEEN')

        if status != 'OK':
            print(f"   ⚠️  Failed to search inbox")
            return 0

        message_ids = messages[0].split()

        if not message_ids:
            log_message(user_id, f"📭 No new emails for {email_address}", level='info')
            return 0

        log_message(user_id, f"📨 Found {len(message_ids)} new email(s) for {email_address}", level='info')

        # Limit to EMAILS_TO_FETCH
        message_ids = message_ids[-EMAILS_TO_FETCH:]

        for msg_id in message_ids:
            try:
                # Fetch email
                status, msg_data = imap.fetch(msg_id, '(RFC822)')

                if status != 'OK':
                    continue

                # Parse email
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                # Extract headers
                subject = decode_mime_words(msg.get('Subject', ''))
                from_header = msg.get('From', '')
                to_header = msg.get('To', '')
                date_header = msg.get('Date', '')
                message_id = msg.get('Message-ID', '').strip('<>')
                in_reply_to = msg.get('In-Reply-To', '').strip('<>')
                references_header = msg.get('References', '')

                # Parse references
                references = []
                if references_header:
                    references = [ref.strip('<>') for ref in references_header.split()]

                # Extract email addresses
                from_email = clean_email_address(from_header)
                to_email = clean_email_address(to_header) or email_address

                # Parse date first (needed for duplicate check)
                try:
                    received_date = email.utils.parsedate_to_datetime(date_header)
                    # Ensure it's timezone-aware (convert to UTC if naive)
                    if received_date.tzinfo is None:
                        received_date = pytz.UTC.localize(received_date)
                except:
                    # Fallback to current UTC time if parsing fails
                    received_date = datetime.now(pytz.UTC)

                # Check if already exists (multiple conditions to prevent duplicates)
                existing = None

                # First check by Message-ID (most reliable)
                if message_id:
                    existing = received_emails_collection.find_one({
                        'messageId': message_id,
                        'emailAccountId': account_id
                    })

                # Fallback: check by from, subject, and date if no Message-ID
                if not existing and from_email and subject:
                    existing = received_emails_collection.find_one({
                        'from': from_email,
                        'subject': subject,
                        'emailAccountId': account_id,
                        'receivedAt': received_date
                    })

                if existing:
                    print(f"   ⏭️  Skipping duplicate email")
                    print(f"      Subject: {subject[:50]}...")
                    print(f"      Already in DB with ID: {existing['_id']}")
                    continue

                # Extract content
                text_content, html_content = extract_text_from_email(msg)

                # Check if email should be ignored based on user's ignore keywords
                if should_ignore_email(subject, text_content, user_id):
                    print(f"   ⏭️  Skipping email - matches ignore keywords")
                    print(f"      Subject: {subject[:50]}...")
                    continue

                # Extract attachments
                attachments = extract_attachments_info(msg)

                # Find related sent email (to detect replies)
                sent_email = find_related_sent_email(
                    from_email, subject, in_reply_to, references, user_id, account_id
                )

                is_reply = sent_email is not None
                campaign_id = sent_email.get('campaignId') if sent_email else None
                sent_email_id = sent_email.get('_id') if sent_email else None

                # Find or create contact
                contact = find_or_create_contact(from_email, user_id)
                contact_id = contact.get('_id')

                # Determine if it's a reply to check for subject indicators
                subject_lower = (subject or '').lower()
                is_likely_reply = any(indicator in subject_lower for indicator in ['re:', 'reply', 'response'])

                # Get current time in UTC (timezone-aware)
                current_utc_time = datetime.now(pytz.UTC)

                # Create received email document
                received_email_doc = {
                    'userId': user_id,
                    'emailAccountId': account_id,
                    'contactId': contact_id,
                    'campaignId': campaign_id,
                    'from': from_email,
                    'to': to_email,
                    'subject': subject,
                    'content': text_content,
                    'htmlContent': html_content if html_content else None,
                    'messageId': message_id,
                    'threadId': in_reply_to or message_id,  # Use in_reply_to as threadId if available
                    'inReplyTo': in_reply_to if in_reply_to else None,
                    'references': references if references else [],
                    'attachments': attachments if attachments else [],
                    'isRead': False,
                    'isSeen': False,  # New field to track if user has viewed the email
                    'isStarred': False,
                    'isRepliedTo': False,
                    'isForwarded': False,
                    'category': 'inbox',
                    'isReply': is_reply or is_likely_reply,
                    'sentEmailId': sent_email_id,
                    'receivedAt': received_date,
                    'createdAt': current_utc_time,
                    'updatedAt': current_utc_time,
                }

                # Insert into database
                insert_result = received_emails_collection.insert_one(received_email_doc)
                inserted_id = insert_result.inserted_id

                # Log successful email save
                email_log_msg = f"✅ Received email from {from_email} - Subject: {subject[:50]}..."
                if is_reply:
                    email_log_msg += " (Reply detected)"

                log_message(
                    user_id,
                    email_log_msg,
                    level='success',
                    metadata={
                        'emailAccount': email_address,
                        'from': from_email,
                        'isReply': is_reply,
                    }
                )

                print(f"      ID: {inserted_id}")

                # Update campaign stats if this is a reply
                if campaign_id and is_reply:
                    try:
                        campaigns_collection.update_one(
                            {'_id': campaign_id},
                            {'$inc': {'stats.replied': 1}}
                        )
                        print(f"      📊 Campaign stats updated (replied +1)")
                    except Exception as e:
                        print(f"      ⚠️ Could not update campaign stats: {e}")

                emails_fetched += 1

            except Exception as e:
                print(f"   ❌ Error processing email: {e}")
                continue

        print(f"   📊 Total fetched: {emails_fetched}")

    except Exception as e:
        print(f"   ❌ Error fetching emails: {e}")

    finally:
        try:
            imap.close()
            imap.logout()
        except:
            pass

    return emails_fetched


def main():
    """Main loop to continuously fetch emails"""
    print("=" * 60)
    print("📧 EMAIL RECEIVER - STARTING")
    print("=" * 60)
    print(f"Default check interval: {DEFAULT_CHECK_INTERVAL} seconds")
    print(f"Emails per check: {EMAILS_TO_FETCH}")
    print("=" * 60)

    iteration = 0

    while True:
        print("=" * 60)

        try:
            # Fetch all active email accounts
            email_accounts = list(email_accounts_collection.find({'isActive': True}))

            if not email_accounts:
                print("⚠️  No active email accounts found")
            else:
                print(f"📋 Found {len(email_accounts)} active email account(s)")

                total_emails = 0

                for email_account in email_accounts:
                    fetched = fetch_emails_from_account(email_account)
                    total_emails += fetched

                print(f"\n✅ ITERATION COMPLETE - Total emails fetched: {total_emails}")

        except Exception as e:
            print(f"❌ Error in main loop: {e}")

        # Get check interval from user settings
        check_interval = DEFAULT_CHECK_INTERVAL
        try:
            # Get the first active email account to find user
            if email_accounts and len(email_accounts) > 0:
                user_id = email_accounts[0].get('userId')
                if user_id:
                    user = users_collection.find_one({'_id': ObjectId(user_id)})
                    if user and user.get('emailCheckDelay'):
                        check_interval = user.get('emailCheckDelay')
                        print(f"📊 Using user's email check delay: {check_interval} seconds")
        except Exception as e:
            print(f"⚠️  Could not fetch user check interval, using default: {e}")

        # Wait before next check
        print(f"\n⏳ Waiting {check_interval} seconds until next check...")
        print("-" * 60)
        time.sleep(check_interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Email receiver stopped by user")
        print("=" * 60)
