import os
import pymongo
import time
from dotenv import load_dotenv

# Load environment variables from .env.local file
load_dotenv('.env.local')

# Get MongoDB URI from environment variables
MONGODB_URI = os.getenv('MONGODB_URI')

# Connect to MongoDB database
def connect_to_mongodb():
    try:
        client = pymongo.MongoClient(MONGODB_URI)
        # Test the connection
        client.admin.command('ping')
        print("Successfully connected to MongoDB!")
        return client
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
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
    # Fetch and display active campaigns
    print("\nFetching 10 latest active campaigns...")
    campaigns = fetch_active_campaigns(db, 10)
    
    if campaigns:
        # print(f"\nFound {len(campaigns)} active campaigns:")
        for i, campaign in enumerate(campaigns, 1):
            name = campaign.get('name', 'Unnamed Campaign')
            userId = campaign.get('userId', 'Unknown User')
            emailAccountIds = campaign.get('emailAccountIds', 'Unknown Email Account')

            print(f"Cmpaign Name: {name}")

            #Get campaign>emailUsedIndex if not exists set it to 0
            emailUsedIndex = campaign.get('emailUsedIndex', 0)
            print('Email used index: ', emailUsedIndex)
            
            #Get campaign>emailAccountIds[emailUsedIndex]
            emailAccountId = emailAccountIds[emailUsedIndex]
            print('Email account ID: ', emailAccountId)

            #Update te emailUsedIndex+1 or set it to 0 if it is greater than the length of emailAccountIds
            emailUsedIndex = (emailUsedIndex + 1) % len(emailAccountIds)
            print('Email used index updated: ', emailUsedIndex)
            
            

            time.sleep(1)
        
        print("Campaign processing cycle completed.")
        return True
    else:
        print("No active campaigns found.")
        return True

# Continuous processing
if __name__ == "__main__":
    print("Starting continuous campaign processing...")
    print("Press Ctrl+C to stop the process")
    
    # Connect to database once at startup
    print("Connecting to database...")
    db = get_database()
    
    if db is None:
        print("Failed to connect to database. Exiting.")
        exit(1)
    
    print(f"Successfully connected to database: {db.name}")
    
    cycle_count = 0
    
    try:
        while True:
            cycle_count += 1
            print(f"\n{'='*50}")
            print(f"Starting processing cycle #{cycle_count}")
            print(f"{'='*50}")
            
            success = process_campaigns(db)
            
            if success:
                print(f"\nCycle #{cycle_count} completed.")
            else:
                print("Error in processing campaigns. Waiting 60 seconds before retry...")
                time.sleep(60)  # Wait longer on failure
                
    except KeyboardInterrupt:
        print(f"\n\nProcess interrupted by user after {cycle_count} cycles.")
        print("Goodbye!")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        print("Process terminated.")
