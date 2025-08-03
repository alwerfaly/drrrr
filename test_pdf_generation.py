#!/usr/bin/env python3

import requests
import json
import time

# Test the PDraft API endpoints
BASE_URL = "http://localhost:5000"

def test_health_check():
    """Test the health check endpoint"""
    print("Testing health check...")
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        if response.status_code == 200:
            print("✅ Health check passed")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_latex_generation():
    """Test LaTeX generation"""
    print("\nTesting LaTeX generation...")
    try:
        prompt = """
        Create a simple research paper about artificial intelligence with the following requirements:
        - Title: "Introduction to Artificial Intelligence"
        - Include an abstract
        - Add 2-3 sections with content
        - Use proper LaTeX formatting
        - Include references
        """
        
        payload = {
            "prompt": prompt,
            "maxTokens": 2000,
            "userId": "test_user"
        }
        
        response = requests.post(f"{BASE_URL}/api/generate-latex", json=payload)
        if response.status_code == 200:
            result = response.json()
            print("✅ LaTeX generation successful")
            latex_code = result.get('latex', '')
            print(f"Generated LaTeX length: {len(latex_code)} characters")
            return latex_code
        else:
            print(f"❌ LaTeX generation failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ LaTeX generation error: {e}")
        return None

def test_pdf_compilation(latex_code):
    """Test PDF compilation"""
    print("\nTesting PDF compilation...")
    try:
        payload = {
            "latex": latex_code,
            "title": "Test Document",
            "userId": "test_user"
        }
        
        response = requests.post(f"{BASE_URL}/api/compile-pdf", json=payload)
        if response.status_code == 200:
            result = response.json()
            print("✅ PDF compilation successful")
            pdf_url = result.get('pdfUrl', '')
            print(f"PDF URL: {pdf_url}")
            return pdf_url
        else:
            print(f"❌ PDF compilation failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ PDF compilation error: {e}")
        return None

def main():
    print("🧪 Testing PDraft API functionality...\n")
    
    # Test health check
    if not test_health_check():
        print("❌ Health check failed, stopping tests")
        return
    
    # Test LaTeX generation
    latex_code = test_latex_generation()
    if not latex_code:
        print("❌ LaTeX generation failed, stopping tests")
        return
    
    # Test PDF compilation
    pdf_url = test_pdf_compilation(latex_code)
    if not pdf_url:
        print("❌ PDF compilation failed")
        return
    
    print("\n🎉 All tests passed! PDraft is working correctly.")
    print(f"You can access the website at: https://5000-bb32627c-8975-414b-9ae4-66e7d9cf0692.proxy.daytona.work")

if __name__ == "__main__":
    main()