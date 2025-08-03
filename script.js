// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-SmddcBjJfZBudonYcUmUGVIBY1SeDow",
    authDomain: "pdraft.firebaseapp.com",
    projectId: "pdraft",
    storageBucket: "pdraft.firebasestorage.app",
    messagingSenderId: "399792812397",
    appId: "1:399792812397:web:e3a713c2e476973f48aa64",
    measurementId: "G-F4EW2PEB0N"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let userTokens = 250000;
let chatHistory = [];
let userSettings = {
    fontStyle: 'times',
    fontSize: '12pt',
    language: 'english',
    documentType: 'research-paper',
    maxTokens: 4000
};

// DOM Elements
const authModal = document.getElementById('authModal');
const settingsModal = document.getElementById('settingsModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const app = document.getElementById('app');

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadUserSettings();
    
    // Check authentication state
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            showApp();
            loadUserData();
        } else {
            showAuthModal();
        }
    });
});

// Event Listeners
function initializeEventListeners() {
    // Auth Modal Events
    setupAuthModalEvents();
    
    // Settings Modal Events
    setupSettingsModalEvents();
    
    // Main App Events
    setupMainAppEvents();
    
    // Modal Close Events
    setupModalCloseEvents();
}

function setupAuthModalEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchAuthTab(tabName);
        });
    });

    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Signup form
    document.getElementById('signupForm').addEventListener('submit', handleSignup);

    // Google authentication
    document.getElementById('googleLogin').addEventListener('click', handleGoogleAuth);
    document.getElementById('googleSignup').addEventListener('click', handleGoogleAuth);
    
    // Guest mode
    document.getElementById('continueAsGuest').addEventListener('click', handleGuestMode);
}

function setupSettingsModalEvents() {
    document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('resetSettings').addEventListener('click', resetSettings);
    
    // Max tokens slider
    const maxTokensSlider = document.getElementById('maxTokens');
    const maxTokensValue = document.getElementById('maxTokensValue');
    
    maxTokensSlider.addEventListener('input', (e) => {
        maxTokensValue.textContent = e.target.value;
    });
}

function setupMainAppEvents() {
    document.getElementById('generateBtn').addEventListener('click', generatePDF);
    document.getElementById('clearChatBtn').addEventListener('click', clearChat);
    document.getElementById('newChatBtn').addEventListener('click', clearChat);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Enter key handling for inputs
    document.getElementById('documentTitle').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('documentDescription').focus();
        }
    });
    
    document.getElementById('documentDescription').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            generatePDF();
        }
    });
}

function setupModalCloseEvents() {
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            hideModal(modal);
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModal(e.target);
        }
    });
}

// Authentication Functions
function switchAuthTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        showLoading('Signing in...');
        await auth.signInWithEmailAndPassword(email, password);
        hideLoading();
        hideModal(authModal);
    } catch (error) {
        hideLoading();
        showError('Login failed: ' + error.message);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    try {
        showLoading('Creating account...');
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Initialize user data with free tokens
        await initializeNewUser(userCredential.user);
        
        hideLoading();
        hideModal(authModal);
        showSuccess('Account created successfully! You received 250,000 free tokens.');
    } catch (error) {
        hideLoading();
        showError('Signup failed: ' + error.message);
    }
}

async function handleGoogleAuth() {
    try {
        showLoading('Connecting to Google...');
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        
        // Check if this is a new user
        if (result.additionalUserInfo.isNewUser) {
            await initializeNewUser(result.user);
            showSuccess('Welcome! You received 250,000 free tokens.');
        }
        
        hideLoading();
        hideModal(authModal);
    } catch (error) {
        hideLoading();
        showError('Google authentication failed: ' + error.message);
    }
}

async function handleGuestMode() {
    try {
        showLoading('Setting up guest mode...');
        
        // Create a mock guest user without Firebase authentication
        currentUser = {
            uid: 'guest_' + Date.now(),
            email: 'guest@pdraft.com',
            displayName: 'Guest User',
            isAnonymous: true
        };
        
        // Set guest tokens to 50,000
        userTokens = 50000;
        
        hideLoading();
        hideModal(authModal);
        showApp();
        updateUserDisplay();
        showSuccess('Welcome to guest mode! You have 50,000 free tokens.');
        
    } catch (error) {
        hideLoading();
        showError('Guest mode failed: ' + error.message);
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        currentUser = null;
        chatHistory = [];
        clearChat();
        showAuthModal();
    } catch (error) {
        showError('Logout failed: ' + error.message);
    }
}

// User Data Management
async function initializeNewUser(user) {
    const userData = {
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        tokens: 250000,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        settings: userSettings
    };
    
    await db.collection('users').doc(user.uid).set(userData);
    userTokens = 250000;
}

async function loadUserData() {
    try {
        // Skip Firebase operations for guest users
        if (currentUser.isAnonymous) {
            updateUserDisplay();
            loadGuestHistory();
            applySettings();
            return;
        }
        
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            userTokens = userData.tokens || 250000;
            userSettings = { ...userSettings, ...userData.settings };
            
            updateUserDisplay();
            loadChatHistory();
            applySettings();
        } else {
            // Initialize new user data
            await initializeNewUser(currentUser);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showError('Failed to load user data');
    }
}

function updateUserDisplay() {
    document.getElementById('userName').textContent = 
        currentUser.displayName || currentUser.email.split('@')[0];
    document.getElementById('tokenCount').textContent = userTokens.toLocaleString();
}

async function updateUserTokens(tokensUsed) {
    userTokens = Math.max(0, userTokens - tokensUsed);
    
    // Skip Firebase operations for guest users
    if (currentUser.isAnonymous) {
        updateUserDisplay();
        return;
    }
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            tokens: userTokens
        });
        updateUserDisplay();
    } catch (error) {
        console.error('Error updating tokens:', error);
    }
}

// Chat History Management
async function loadChatHistory() {
    try {
        const historyQuery = await db.collection('users')
            .doc(currentUser.uid)
            .collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        chatHistory = [];
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        historyQuery.forEach(doc => {
            const data = doc.data();
            chatHistory.push({ id: doc.id, ...data });
            
            const historyItem = createHistoryItem(doc.id, data);
            historyList.appendChild(historyItem);
        });
        
        if (chatHistory.length === 0) {
            historyList.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No documents yet</p>';
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

function createHistoryItem(id, data) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <div class="history-item-content">
            <div class="history-item-title">${data.title || 'Untitled Document'}</div>
            <div class="history-item-date">${formatDate(data.createdAt)}</div>
        </div>
        <button class="history-item-delete" onclick="deleteHistoryItem('${id}')">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    item.addEventListener('click', (e) => {
        if (!e.target.closest('.history-item-delete')) {
            loadHistoryItem(data);
        }
    });
    
    return item;
}

async function deleteHistoryItem(id) {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('documents')
            .doc(id)
            .delete();
        
        loadChatHistory();
        showSuccess('Document deleted successfully');
    } catch (error) {
        console.error('Error deleting document:', error);
        showError('Failed to delete document');
    }
}

function loadHistoryItem(data) {
    document.getElementById('documentTitle').value = data.title || '';
    document.getElementById('documentDescription').value = data.description || '';
    
    // Clear and reload chat messages
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    if (data.messages) {
        data.messages.forEach(message => {
            addMessageToChat(message.type, message.content, message.pdfUrl);
        });
    }
}

function loadGuestHistory() {
    // For guest users, show empty history
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">History not available in guest mode</p>';
}

// PDF Generation
async function generatePDF() {
    const title = document.getElementById('documentTitle').value.trim();
    const description = document.getElementById('documentDescription').value.trim();
    
    if (!title || !description) {
        showError('Please enter both title and description');
        return;
    }
    
    if (userTokens < 100) {
        showError('Insufficient tokens. Please contact support to purchase more tokens.');
        return;
    }
    
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    showLoading('Generating LaTeX code...');
    
    try {
        // Add user message to chat
        addMessageToChat('user', `**Title:** ${title}\n\n**Description:** ${description}`);
        
        // Generate LaTeX using DeepSeek API
        const latexCode = await generateLatexCode(title, description);
        
        showLoading('Compiling PDF...');
        
        // Compile PDF using Flask backend
        const pdfUrl = await compilePDF(latexCode, title);
        
        // Add assistant response to chat
        addMessageToChat('assistant', 'PDF generated successfully!', pdfUrl);
        
        // Save to history
        await saveToHistory(title, description, latexCode, pdfUrl);
        
        // Update tokens (estimate based on content length)
        const tokensUsed = Math.min(userSettings.maxTokens, Math.ceil((title.length + description.length) / 4));
        await updateUserTokens(tokensUsed);
        
        // Clear inputs
        document.getElementById('documentTitle').value = '';
        document.getElementById('documentDescription').value = '';
        
        hideLoading();
        showSuccess('PDF generated successfully!');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        hideLoading();
        showError('Failed to generate PDF: ' + error.message);
        addMessageToChat('assistant', 'Sorry, there was an error generating your PDF. Please try again.');
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate PDF';
    }
}

async function generateLatexCode(title, description) {
    const prompt = createLatexPrompt(title, description);
    
    const response = await fetch('http://localhost:5000/api/generate-latex', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: prompt,
            maxTokens: userSettings.maxTokens,
            userId: currentUser.uid
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to generate LaTeX code');
    }
    
    const data = await response.json();
    return data.latex;
}

async function compilePDF(latexCode, title) {
    const response = await fetch('http://localhost:5000/api/compile-pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            latex: latexCode,
            title: title,
            userId: currentUser.uid
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to compile PDF');
    }
    
    const data = await response.json();
    return data.pdfUrl;
}

function createLatexPrompt(title, description) {
    const { fontStyle, fontSize, language, documentType } = userSettings;
    
    return `Generate a professional LaTeX document with the following specifications:

Title: ${title}
Description: ${description}

Document Settings:
- Font: ${fontStyle}
- Font Size: ${fontSize}
- Language: ${language}
- Document Type: ${documentType}

Requirements:
1. Create a complete, compilable LaTeX document
2. Include proper document structure with sections and subsections
3. Use professional formatting appropriate for ${documentType}
4. Include mathematical equations, tables, and figures where relevant
5. Ensure proper bibliography and citations if needed
6. Make the document comprehensive and well-structured
7. Use appropriate packages for the document type
8. Include proper headers, footers, and page numbering

Please generate only the LaTeX code without any explanations or markdown formatting.`;
}

// Chat Management
function addMessageToChat(type, content, pdfUrl = null) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatar = type === 'user' ? 'U' : 'AI';
    const avatarClass = type === 'user' ? 'user' : 'assistant';
    
    let pdfSection = '';
    if (pdfUrl) {
        // Ensure the PDF URL is absolute
        const fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `http://localhost:5000${pdfUrl}`;
        pdfSection = `
            <div class="pdf-result">
                <p><strong>Your PDF is ready!</strong></p>
                <a href="${fullPdfUrl}" class="pdf-download" download>
                    <i class="fas fa-download"></i> Download PDF
                </a>
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-text">${formatMessageContent(content)}</div>
            ${pdfSection}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMessageContent(content) {
    // Simple markdown-like formatting
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function clearChat() {
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('documentTitle').value = '';
    document.getElementById('documentDescription').value = '';
}

// History Management
async function saveToHistory(title, description, latexCode, pdfUrl) {
    // Skip Firebase operations for guest users
    if (currentUser.isAnonymous) {
        console.log('History not saved in guest mode');
        return;
    }
    
    try {
        const docData = {
            title: title,
            description: description,
            latex: latexCode,
            pdfUrl: pdfUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            messages: [
                {
                    type: 'user',
                    content: `**Title:** ${title}\n\n**Description:** ${description}`
                },
                {
                    type: 'assistant',
                    content: 'PDF generated successfully!',
                    pdfUrl: pdfUrl
                }
            ]
        };
        
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('documents')
            .add(docData);
        
        loadChatHistory();
    } catch (error) {
        console.error('Error saving to history:', error);
    }
}

// Settings Management
function showSettingsModal() {
    applySettingsToModal();
    showModal(settingsModal);
}

function applySettingsToModal() {
    document.getElementById('fontStyle').value = userSettings.fontStyle;
    document.getElementById('fontSize').value = userSettings.fontSize;
    document.getElementById('language').value = userSettings.language;
    document.getElementById('documentType').value = userSettings.documentType;
    document.getElementById('maxTokens').value = userSettings.maxTokens;
    document.getElementById('maxTokensValue').textContent = userSettings.maxTokens;
}

async function saveSettings() {
    userSettings = {
        fontStyle: document.getElementById('fontStyle').value,
        fontSize: document.getElementById('fontSize').value,
        language: document.getElementById('language').value,
        documentType: document.getElementById('documentType').value,
        maxTokens: parseInt(document.getElementById('maxTokens').value)
    };
    
    // Skip Firebase operations for guest users
    if (currentUser.isAnonymous) {
        localStorage.setItem('pdraft_settings', JSON.stringify(userSettings));
        hideModal(settingsModal);
        showSuccess('Settings saved locally!');
        return;
    }
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            settings: userSettings
        });
        
        localStorage.setItem('pdraft_settings', JSON.stringify(userSettings));
        hideModal(settingsModal);
        showSuccess('Settings saved successfully!');
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Failed to save settings');
    }
}

function resetSettings() {
    userSettings = {
        fontStyle: 'times',
        fontSize: '12pt',
        language: 'english',
        documentType: 'research-paper',
        maxTokens: 4000
    };
    
    applySettingsToModal();
    showSuccess('Settings reset to default');
}

function loadUserSettings() {
    const savedSettings = localStorage.getItem('pdraft_settings');
    if (savedSettings) {
        userSettings = { ...userSettings, ...JSON.parse(savedSettings) };
    }
}

function applySettings() {
    // Apply any UI changes based on settings
    // This could include theme changes, language updates, etc.
}

// UI Helper Functions
function showModal(modal) {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function hideModal(modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function showAuthModal() {
    app.style.display = 'none';
    showModal(authModal);
}

function showApp() {
    app.style.display = 'flex';
    hideModal(authModal);
}

function showLoading(text = 'Loading...') {
    document.getElementById('loadingText').textContent = text;
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showError(message) {
    // Simple error notification - could be enhanced with a proper notification system
    alert('Error: ' + message);
}

function showSuccess(message) {
    // Simple success notification - could be enhanced with a proper notification system
    alert('Success: ' + message);
}

// Utility Functions
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
}

// Error Handling
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// Export functions for global access
window.deleteHistoryItem = deleteHistoryItem;