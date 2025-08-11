import requests
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup


def fetch_website_content(website_url):
    """Fetch and parse website content for personalization"""
    try:
        if not website_url:
            return None, "No website URL provided"
        
        # Ensure URL has protocol
        if not website_url.startswith(('http://', 'https://')):
            website_url = 'https://' + website_url
        
        # Validate URL format
        parsed = urlparse(website_url)
        if not parsed.netloc:
            return None, "Invalid URL format"
        
        print(f"Fetching website content from: {website_url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(website_url, headers=headers, timeout=10, allow_redirects=True)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script, style, nav, footer, and other non-content elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            element.decompose()
        
        # Extract comprehensive content - single websiteContent property
        website_data = {
            'url': website_url,
            'websiteContent': ''  # Single field for all content
        }
        
        # Get title
        title = soup.title.string.strip() if soup.title else ''
        
        # Get meta description
        description = ''
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            description = meta_desc.get('content', '').strip()
        
        # Extract all text content from body
        body = soup.find('body')
        if body:
            # Get all text content from the body
            all_text = body.get_text()
            # Clean up whitespace and normalize
            cleaned_text = re.sub(r'\s+', ' ', all_text).strip()
            
            # Concatenate title, meta description, and all body text
            content_parts = []
            
            if title:
                content_parts.append(title)
            
            if description:
                content_parts.append(description)
            
            if cleaned_text:
                content_parts.append(cleaned_text)
            
            # Join all parts with space separator
            website_data['websiteContent'] = ' '.join(content_parts)
        
        print(f"Website content fetched successfully:")
        print(f"  URL: {website_data['url']}")
        print(f"  Website Content Length: {len(website_data['websiteContent'])} characters")
        print(f"  Website Content Preview: {website_data['websiteContent'][:200]}...")
        
        return website_data, "Success"
        
    except requests.RequestException as e:
        error_msg = f"Failed to fetch website content: {str(e)}"
        print(error_msg)
        return None, error_msg
    except Exception as e:
        error_msg = f"Error processing website content: {str(e)}"
        print(error_msg)
        return None, error_msg


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


