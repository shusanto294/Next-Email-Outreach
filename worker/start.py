# Main entry point for the cold email platform
# This file now imports functionality from modular components

from database import get_database
from campaign_processor import process_campaigns

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
