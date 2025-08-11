import os
import pymongo
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from dotenv import load_dotenv

# Load environment variables from .env.local file
load_dotenv('../.env.local')

# Get MongoDB URI from environment variables
MONGODB_URI = os.getenv('MONGODB_URI')


def connect_to_mongodb():
    """Connect to MongoDB database"""
    try:
        if not MONGODB_URI:
            return None
        client = pymongo.MongoClient(MONGODB_URI)
        # Test the connection
        client.admin.command('ping')
        return client
    except Exception as e:
        return None


def get_database():
    """Get database instance"""
    client = connect_to_mongodb()
    if client:
        db_name = MONGODB_URI.split('/')[-1]  # Extract database name from URI
        return client[db_name]
    return None


def fetch_active_campaigns(db, limit=10):
    """Fetch active campaigns from database"""
    campaigns_collection = db['campaigns']
    
    # Query for campaigns with isActive=true, sort by latest (assuming _id or createdAt)
    # Using _id for sorting (latest first) as it contains timestamp
    active_campaigns = campaigns_collection.find(
        {"isActive": True}
    ).sort("_id", -1).limit(limit)
    
    return list(active_campaigns)


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