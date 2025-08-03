from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import requests
import os
import tempfile
import subprocess
import uuid
import json
from datetime import datetime
import logging
import time
import shutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
DEEPSEEK_API_KEY = "sk-64ddb82e1d034a87acb26ce2a0d629ff"
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

# Create directories for PDFs (temp files are handled by tempfile.mkdtemp)
PDF_DIR = os.path.join(os.getcwd(), 'pdfs')
os.makedirs(PDF_DIR, exist_ok=True)

class SunoLatexCompiler:
    def __init__(self):
        self.pdf_dir = PDF_DIR
        # Create output directory for compiled PDFs
        os.makedirs(self.pdf_dir, exist_ok=True)
    
    def compile_latex(self, latex_code, title, user_id):
        """Compile LaTeX code to PDF using the Suno compiler approach"""
        try:
            if not latex_code.strip():
                raise Exception('No LaTeX code provided')
            
            # Generate unique job ID
            job_id = str(uuid.uuid4())
            
            # Create temporary directory for compilation
            temp_dir = tempfile.mkdtemp(prefix=f'latex_{job_id}_')
            
            try:
                # Write LaTeX code to file
                tex_file = os.path.join(temp_dir, 'document.tex')
                with open(tex_file, 'w', encoding='utf-8') as f:
                    f.write(latex_code)
                
                # Compile LaTeX to PDF using pdflatex
                # Run multiple times to resolve references
                pdf_created = False
                for i in range(3):  # Run up to 3 times for cross-references
                    result = subprocess.run([
                        'pdflatex', 
                        '-interaction=nonstopmode',
                        '-output-directory', temp_dir,
                        tex_file
                    ], capture_output=True, text=True, cwd=temp_dir, timeout=120)
                    
                    # Check if PDF was created successfully
                    pdf_file = os.path.join(temp_dir, 'document.pdf')
                    if os.path.exists(pdf_file):
                        pdf_created = True
                        break
                
                if not pdf_created:
                    # Compilation failed, return error
                    error_msg = result.stderr if result.stderr else result.stdout
                    raise Exception(f'LaTeX compilation failed:\n{error_msg}')
                
                # Move PDF to permanent location with unique filename
                pdf_filename = f'{job_id}.pdf'
                final_pdf = os.path.join(self.pdf_dir, pdf_filename)
                shutil.move(pdf_file, final_pdf)
                
                logger.info(f"PDF compiled successfully: {pdf_filename}")
                
                # Return URL for PDF download
                return f"/api/download-pdf/{pdf_filename}"
                
            finally:
                # Clean up temporary directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except subprocess.TimeoutExpired:
            raise Exception("LaTeX compilation timed out after 120 seconds")
        except Exception as e:
            logger.error(f"Error compiling LaTeX: {str(e)}")
            raise e

class DeepSeekAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.api_url = DEEPSEEK_API_URL
    
    def generate_latex(self, prompt, max_tokens=4000):
        """Generate LaTeX code using DeepSeek API"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': 'deepseek-chat',
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are an expert LaTeX document generator. Generate complete, compilable LaTeX documents based on user requirements. Always include necessary packages and proper document structure. Return only the LaTeX code without any explanations or markdown formatting.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'max_tokens': max_tokens,
            'temperature': 0.7,
            'stream': False
        }
        
        # Retry logic with exponential backoff
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Increased timeout to 90 seconds
                response = requests.post(self.api_url, headers=headers, json=data, timeout=90)
                response.raise_for_status()
                
                result = response.json()
                latex_code = result['choices'][0]['message']['content'].strip()
                
                # Clean up the response to ensure it's pure LaTeX
                latex_code = self.clean_latex_response(latex_code)
                
                return latex_code
                
            except requests.exceptions.Timeout as e:
                logger.warning(f"DeepSeek API timeout on attempt {attempt + 1}/{max_retries}: {str(e)}")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 5  # Exponential backoff: 5s, 10s, 20s
                    logger.info(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"DeepSeek API timed out after {max_retries} attempts")
            except requests.exceptions.RequestException as e:
                logger.error(f"DeepSeek API error: {str(e)}")
                raise Exception(f"Failed to generate LaTeX: {str(e)}")
    
    def clean_latex_response(self, latex_code):
        """Clean up LaTeX response to remove any non-LaTeX content"""
        # Remove markdown code blocks if present
        if '```latex' in latex_code:
            latex_code = latex_code.split('```latex')[1].split('```')[0]
        elif '```' in latex_code:
            latex_code = latex_code.split('```')[1].split('```')[0]
        
        # Ensure document starts with \documentclass
        lines = latex_code.strip().split('\n')
        start_idx = 0
        for i, line in enumerate(lines):
            if line.strip().startswith('\\documentclass'):
                start_idx = i
                break
        
        return '\n'.join(lines[start_idx:]).strip()

# Initialize services
latex_compiler = SunoLatexCompiler()
deepseek_api = DeepSeekAPI(DEEPSEEK_API_KEY)

@app.route('/')
def index():
    """Serve the main application"""
    return send_file('index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    try:
        return send_file(filename)
    except FileNotFoundError:
        # Handle missing files gracefully (like favicon.ico)
        return '', 404

@app.route('/api/generate-latex', methods=['POST'])
def generate_latex():
    """Generate LaTeX code using DeepSeek API"""
    try:
        data = request.get_json()
        prompt = data.get('prompt')
        max_tokens = data.get('maxTokens', 4000)
        user_id = data.get('userId')
        
        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400
        
        logger.info(f"Generating LaTeX for user {user_id}")
        
        # Generate LaTeX code
        latex_code = deepseek_api.generate_latex(prompt, max_tokens)
        
        return jsonify({
            'latex': latex_code,
            'success': True
        })
        
    except Exception as e:
        logger.error(f"Error generating LaTeX: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/compile-pdf', methods=['POST'])
def compile_pdf():
    """Compile LaTeX code to PDF"""
    try:
        data = request.get_json()
        latex_code = data.get('latex')
        title = data.get('title', 'Document')
        user_id = data.get('userId')
        
        if not latex_code:
            return jsonify({'error': 'LaTeX code is required'}), 400
        
        logger.info(f"Compiling PDF for user {user_id}")
        
        # Compile LaTeX to PDF
        pdf_url = latex_compiler.compile_latex(latex_code, title, user_id)
        
        return jsonify({
            'pdfUrl': pdf_url,
            'success': True
        })
        
    except Exception as e:
        logger.error(f"Error compiling PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download-pdf/<filename>')
def download_pdf(filename):
    """Download generated PDF"""
    try:
        pdf_path = os.path.join(PDF_DIR, filename)
        if not os.path.exists(pdf_path):
            return jsonify({'error': 'PDF not found'}), 404
        
        return send_file(
            pdf_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )
        
    except Exception as e:
        logger.error(f"Error downloading PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'services': {
            'deepseek_api': 'available',
            'latex_compiler': 'available'
        }
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Check if LaTeX is installed
    try:
        result = subprocess.run(['pdflatex', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info("LaTeX installation found")
        else:
            logger.warning("LaTeX not found - PDF compilation will fail")
    except FileNotFoundError:
        logger.warning("LaTeX not found - installing...")
        # Note: In production, LaTeX should be pre-installed
    
    logger.info("Starting PDraft Flask server...")
    app.run(host='0.0.0.0', port=5000, debug=True)