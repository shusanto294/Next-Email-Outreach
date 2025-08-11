"""Email simulation module for testing email campaigns without actually sending emails"""

def simulate_send_email(from_email, to_email, subject, body):
    """Simulate sending an email without actually sending it"""
    print(f"SENDING EMAIL:")
    print(f"   From: {from_email}")
    print(f"   To: {to_email}")
    print(f"   Subject: {subject}")
    print(f"   Full Body: {body}")
    print("*************************************************")
    return True


def simulate_batch_send_emails(email_list):
    """Simulate sending multiple emails in batch"""
    success_count = 0
    failed_count = 0
    
    for email_data in email_list:
        try:
            result = simulate_send_email(
                email_data.get('from_email'),
                email_data.get('to_email'),
                email_data.get('subject'),
                email_data.get('body')
            )
            if result:
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"Error simulating email send: {e}")
            failed_count += 1
    
    print(f"BATCH SIMULATION COMPLETE:")
    print(f"   Success: {success_count}")
    print(f"   Failed: {failed_count}")
    print(f"   Total: {len(email_list)}")
    
    return success_count, failed_count


def get_simulation_stats():
    """Return simulation statistics - placeholder for future implementation"""
    return {
        'simulation_mode': True,
        'real_sending': False,
        'total_simulated': 0  # Could be tracked in future versions
    }