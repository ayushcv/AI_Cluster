const chatContainer = document.getElementById('chatContainer');
const queryInput = document.getElementById('queryInput');
const sendButton = document.getElementById('sendButton');

// Initialize message sounds
let messageSentSound = new Audio('/Users/admin/programming/AI_Cluster/chatUI/assets/message-sent.mp3');
let messageReceivedSound = new Audio('/Users/admin/programming/AI_Cluster/chatUI/assets/message-received.mp3');
let soundEnabled = true;

// Helper function to get a friendly name for each role
function getFriendlyRoleName(role) {
  switch(role.toLowerCase()) {
    case 'agent_math':
      return 'Math Expert';
    case 'agent_coding':
      return 'Coding Expert';
    case 'agent_creative':
      return 'Creative Expert';
    case 'orchestrator':
      return 'Orchestrator';
    case 'assistant':
      return 'Orchestrator';
    case 'user':
      return 'You';
    default:
      return role;
  }
}

// Format timestamp
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Append a message to the chat container.
function appendMessage(role, text) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');
  
  // Create a wrapper for proper positioning
  const messageWrapper = document.createElement('div');
  messageWrapper.classList.add('message-wrapper');
  messageWrapper.style.width = '100%';
  messageWrapper.style.display = 'inline-block';
  messageWrapper.style.clear = 'both';
  
  if (role === 'user') {
    messageDiv.classList.add('user-message');
    if (soundEnabled) messageSentSound.play();
  } else {
    messageDiv.classList.add('ai-message');
    if (soundEnabled) messageReceivedSound.play();
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  
  const roleSpan = document.createElement('strong');
  roleSpan.textContent = getFriendlyRoleName(role);
  roleSpan.classList.add('message-role');
  contentDiv.appendChild(roleSpan);
  
  const textSpan = document.createElement('div');
  textSpan.classList.add('message-text');
  textSpan.innerHTML = formatMessageText(text);
  contentDiv.appendChild(textSpan);
  
  const timestampSpan = document.createElement('span');
  timestampSpan.classList.add('message-timestamp');
  timestampSpan.textContent = formatTimestamp();
  contentDiv.appendChild(timestampSpan);
  
  messageDiv.appendChild(contentDiv);
  messageWrapper.appendChild(messageDiv);
  chatContainer.appendChild(messageWrapper);
  
  // Force layout recalculation
  chatContainer.offsetHeight;
  
  // Ensure the chat container scrolls to the bottom with a more robust approach
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Double-check scroll position after images/content might have loaded
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 500);
  }, 100);
  
  return messageDiv;
}

// Format message text with Markdown-like features
function formatMessageText(text) {
  // Convert code blocks (text between triple backticks)
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Convert inline code (text between single backticks)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert URLs to clickable links
  text = text.replace(
    /(https?:\/\/[^\s]+)/g, 
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  
  // Convert line breaks to <br> tags
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

// Add a system message (like "thinking...")
function appendSystemMessage(text, isDebug = false) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('system-message');
  if (isDebug) messageDiv.classList.add('debug');
  
  if (text === 'Thinking...') {
    // Create typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.classList.add('typing-indicator');
    
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.classList.add('typing-dot');
      typingIndicator.appendChild(dot);
    }
    
    const textSpan = document.createElement('span');
    textSpan.textContent = ' ' + text;
    
    messageDiv.appendChild(typingIndicator);
    messageDiv.appendChild(textSpan);
  } else {
    messageDiv.textContent = text;
  }
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return messageDiv;
}

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDarkMode);
  themeToggleBtn.textContent = isDarkMode ? '☀️' : '🌙';
}

// Toggle sound
function toggleSound() {
  soundEnabled = !soundEnabled;
  soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
}

// Submit the query when the Enter key is pressed.
queryInput.addEventListener('keydown', function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    sendButton.click();
  }
});

// Send query to the server
sendButton.addEventListener('click', function() {
  const query = queryInput.value.trim();
  
  if (query === '') {
    return;
  }
  
  // Display user's message
  appendMessage('user', query);
  
  // Clear input field
  queryInput.value = '';
  
  // Show thinking indicator
  const thinkingMsg = appendSystemMessage('Thinking...');
  thinkingMsg.classList.add('system-message-thinking');
  
  // Make API call using GET with query parameters instead of POST
  const encodedQuery = encodeURIComponent(query);
  const eventSource = new EventSource(`http://localhost:8000/query?user_input=${encodedQuery}`);
  
  eventSource.onmessage = function(event) {
    // Remove thinking message when we get the first response
    document.querySelectorAll('.system-message-thinking').forEach(el => el.remove());
    
    let data = event.data;
    
    // Clean the data by removing any "data:" prefixes
    if (data.startsWith('data:')) {
      data = data.substring(5).trim();
    }
    
    try {
      // Check if the data is valid JSON
      const jsonData = JSON.parse(data);
      
      // Handle structured JSON messages
      if (jsonData.message_type === "content" && jsonData.content) {
        // Clean content of any "data:" prefixes
        let cleanContent = jsonData.content;
        if (cleanContent.startsWith('data:')) {
          cleanContent = cleanContent.substring(5).trim();
        }
        appendMessage('assistant', cleanContent);
      } 
      else if (jsonData.role && jsonData.content) {
        // Handle messages with role and content structure
        appendMessage(jsonData.role, jsonData.content);
      }
      else {
        // Default fallback for other JSON structures
        console.log("Received unexpected JSON structure:", jsonData);
        if (typeof jsonData === 'string') {
          appendMessage('assistant', jsonData);
        } else {
          // Don't show raw JSON to users
          appendMessage('assistant', "I received a response I don't understand. Please try again.");
        }
      }
    } catch (e) {
      // Handle plain text messages with agent identifiers
      const agentPrefixes = [
        "agent_math:", "agent_coding:", "agent_creative:", 
        "orchestrator:", "data:"
      ];
      
      // Find if any known prefix is in the message
      let foundPrefix = false;
      for (const prefix of agentPrefixes) {
        if (data.includes(prefix)) {
          foundPrefix = true;
          const parts = data.split(prefix);
          // Get content after the first occurrence of the prefix
          if (parts.length > 1) {
            const content = parts.slice(1).join(prefix).trim();
            const role = prefix.replace(':', '');
            appendMessage(role, content);
            break;
          }
        }
      }
      
      // If no known prefix, display as assistant message
      if (!foundPrefix) {
        appendMessage('assistant', data);
      }
    }
  };
  
  eventSource.onerror = function(error) {
    console.error('EventSource error:', error);
    document.querySelectorAll('.system-message-thinking').forEach(el => el.remove());
    
    // Only show an error message for real errors, not normal connection closures
    // When a connection completes normally, it will still trigger onerror
    // Normal completion: readyState is CLOSED (2) with no actual error details
    if (error && error.eventPhase !== EventSource.CLOSED) {
      appendSystemMessage('Error communicating with server', false);
    }
    
    // Always close the connection when we get an error event
    eventSource.close();
  };
});

// Initialize UI elements
function initializeUI() {
  // Create chat header
  const chatHeader = document.createElement('div');
  chatHeader.classList.add('chat-header');
  
  const chatTitle = document.createElement('div');
  chatTitle.classList.add('chat-title');
  chatTitle.textContent = 'AI Cluster Chat';
  chatHeader.appendChild(chatTitle);
  
  const chatControls = document.createElement('div');
  chatControls.classList.add('chat-controls');
  
  // Theme toggle button
  const themeToggleBtn = document.createElement('button');
  themeToggleBtn.classList.add('theme-toggle');
  themeToggleBtn.textContent = '🌙';
  themeToggleBtn.setAttribute('title', 'Toggle dark mode');
  themeToggleBtn.addEventListener('click', toggleDarkMode);
  chatControls.appendChild(themeToggleBtn);
  window.themeToggleBtn = themeToggleBtn;
  
  // Sound toggle button
  const soundToggleBtn = document.createElement('button');
  soundToggleBtn.classList.add('theme-toggle');
  soundToggleBtn.textContent = '🔊';
  soundToggleBtn.setAttribute('title', 'Toggle sound');
  soundToggleBtn.addEventListener('click', toggleSound);
  chatControls.appendChild(soundToggleBtn);
  window.soundToggleBtn = soundToggleBtn;
  
  chatHeader.appendChild(chatControls);
  
  // Insert header before chat container
  document.querySelector('.chat-wrapper').insertBefore(chatHeader, chatContainer);
  
  // Check for saved theme preference
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.textContent = '☀️';
  }
  
  // Update send button
  sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
}

// Additional function to periodically check and fix message display issues
function monitorChatDisplay() {
  // Check every 2 seconds if messages are displaying correctly
  setInterval(() => {
    const messages = chatContainer.querySelectorAll('.message');
    
    // If we have messages but they're not visible properly
    if (messages.length > 0) {
      // Force container update
      chatContainer.style.display = 'flex';
      
      // Make sure we're scrolled to the bottom
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, 2000);
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  monitorChatDisplay();
});

// Add welcome message after a slight delay
setTimeout(() => {
  appendMessage('assistant', '# Welcome to the AI Cluster Chat! 👋\n\nI\'m here to help you with your questions. Here are some things I can do:\n\n- Answer questions\n- Generate code\n- Solve problems\n- Have engaging conversations\n\nWhat would you like to talk about today?');
}, 500);
