import time
import requests


def personalize_with_openai(prompt, contact, api_key, model="gpt-4o-mini", website_data=None):
    """Use OpenAI API to personalize content based on contact data and prompt"""
    try:
        start_time = time.time()
        
        # Build context from contact data
        contact_context = f"""
Contact Information:
- Name: {contact.get('firstName', '')} {contact.get('lastName', '')}
- Company: {contact.get('company', '')}
- Position: {contact.get('position', '')}
- Email: {contact.get('email', '')}
- Phone: {contact.get('phone', '')}
- Website: {contact.get('website', '')}
- Location: {contact.get('city', '')}, {contact.get('state', '')}, {contact.get('country', '')}
- Industry: {contact.get('industry', '')}
- Personalization Notes: {contact.get('personalization', '')}
"""
        
        # Add comprehensive website content if available
        if website_data:
            website_context = f"""
Website Information:
- Website URL: {website_data.get('url', '')}
- Website Content: {website_data.get('websiteContent', '')}
"""
            contact_context += website_context
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are an expert at writing personalized cold emails. Generate content based on the contact information and website data provided. Use the website information to make the content more relevant and specific to their business. Keep it professional, concise, and engaging. Only return the requested content without any additional formatting or explanation.'
                },
                {
                    'role': 'user',
                    'content': f"{contact_context}\n\nPrompt: {prompt}\n\nGenerate the personalized content based on the contact and website information above:"
                }
            ],
            'max_tokens': 500,
            'temperature': 0.7
        }
        
        response = requests.post('https://api.openai.com/v1/chat/completions', 
                               headers=headers, json=data, timeout=30)
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            personalized_content = result['choices'][0]['message']['content'].strip()
            return personalized_content, processing_time
        else:
            print(f"OpenAI API error {response.status_code}: {response.text}")
            from content_processing import personalize_content
            fallback_result = personalize_content(prompt, contact)
            return fallback_result, processing_time
            
    except Exception as e:
        processing_time = time.time() - start_time if 'start_time' in locals() else 0
        print(f"Error with OpenAI personalization: {e}")
        from content_processing import personalize_content
        fallback_result = personalize_content(prompt, contact)
        return fallback_result, processing_time


def personalize_with_deepseek(prompt, contact, api_key, model="deepseek-chat", website_data=None):
    """Use DeepSeek API to personalize content based on contact data and prompt"""
    try:
        start_time = time.time()
        
        # Build context from contact data
        contact_context = f"""
Contact Information:
- Name: {contact.get('firstName', '')} {contact.get('lastName', '')}
- Company: {contact.get('company', '')}
- Position: {contact.get('position', '')}
- Email: {contact.get('email', '')}
- Phone: {contact.get('phone', '')}
- Website: {contact.get('website', '')}
- Location: {contact.get('city', '')}, {contact.get('state', '')}, {contact.get('country', '')}
- Industry: {contact.get('industry', '')}
- Personalization Notes: {contact.get('personalization', '')}
"""
        
        # Add comprehensive website content if available
        if website_data:
            website_context = f"""
Website Information:
- Website URL: {website_data.get('url', '')}
- Website Content: {website_data.get('websiteContent', '')}
"""
            contact_context += website_context
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': model,
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are an expert at writing personalized cold emails. Generate content based on the contact information and website data provided. Use the website information to make the content more relevant and specific to their business. Keep it professional, concise, and engaging. Only return the requested content without any additional formatting or explanation.'
                },
                {
                    'role': 'user',
                    'content': f"{contact_context}\n\nPrompt: {prompt}\n\nGenerate the personalized content based on the contact and website information above:"
                }
            ],
            'max_tokens': 500,
            'temperature': 0.7
        }
        
        response = requests.post('https://api.deepseek.com/chat/completions', 
                               headers=headers, json=data, timeout=30)
        
        processing_time = time.time() - start_time
        
        if response.status_code == 200:
            result = response.json()
            personalized_content = result['choices'][0]['message']['content'].strip()
            return personalized_content, processing_time
        else:
            print(f"DeepSeek API error {response.status_code}: {response.text}")
            from content_processing import personalize_content
            fallback_result = personalize_content(prompt, contact)
            return fallback_result, processing_time
            
    except Exception as e:
        processing_time = time.time() - start_time if 'start_time' in locals() else 0
        print(f"Error with DeepSeek personalization: {e}")
        from content_processing import personalize_content
        fallback_result = personalize_content(prompt, contact)
        return fallback_result, processing_time


def personalize_with_ai(prompt, contact, user, website_data=None):
    """Personalize content using AI based on user's configuration"""
    try:
        ai_provider = user.get('aiProvider')
        
        if ai_provider == 'openai':
            api_key = user.get('openaiApiKey')
            model = user.get('openaiModel', 'gpt-4o-mini')
            if not api_key:
                print("OpenAI API key not configured, falling back to basic personalization")
                from content_processing import personalize_content
                return personalize_content(prompt, contact), 0
            return personalize_with_openai(prompt, contact, api_key, model, website_data)
            
        elif ai_provider == 'deepseek':
            api_key = user.get('deepseekApiKey')
            model = user.get('deepseekModel', 'deepseek-chat')
            if not api_key:
                print("DeepSeek API key not configured, falling back to basic personalization")
                from content_processing import personalize_content
                return personalize_content(prompt, contact), 0
            return personalize_with_deepseek(prompt, contact, api_key, model, website_data)
            
        else:
            print(f"No AI provider configured, falling back to basic personalization")
            from content_processing import personalize_content
            return personalize_content(prompt, contact), 0
            
    except Exception as e:
        print(f"Error in AI personalization dispatcher: {e}")
        from content_processing import personalize_content
        return personalize_content(prompt, contact), 0