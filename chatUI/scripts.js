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
  // Remove any typing bubbles when showing a system message
  removeTypingBubbles();
  
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('system-message');
  if (isDebug) messageDiv.classList.add('debug');
  
  if (text === 'Thinking...') {
    // Create the new typing bubble instead
    return showTypingBubble('assistant');
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
  
  // Show orchestrator thinking first
  const thinkingIndicator = showTypingBubble('orchestrator');
  
  // Make API call using GET with query parameters instead of POST
  const encodedQuery = encodeURIComponent(query);
  const eventSource = new EventSource(`http://localhost:8000/query?user_input=${encodedQuery}`);
  
  // Keep track of active agents/experts
  const activeAgents = new Set(['orchestrator']);
  let currentThinkingAgent = 'orchestrator';
  
  eventSource.onmessage = function(event) {
    let data = event.data;
    
    // Clean the data by removing any "data:" prefixes
    if (data.startsWith('data:')) {
      data = data.substring(5).trim();
    }
    
    try {
      // Check if the data is valid JSON
      const jsonData = JSON.parse(data);
      
      // Check for routing/thinking information
      if (jsonData.status) {
        if (jsonData.status === 'routing' && jsonData.target) {
          // Orchestrator is routing to a specific expert
          currentThinkingAgent = jsonData.target;
          activeAgents.add(currentThinkingAgent);
          removeTypingBubbles();
          showTypingBubble(currentThinkingAgent);
          return; // Don't remove the thinking bubble yet
        }
        else if (jsonData.status === 'thinking' && jsonData.agent) {
          currentThinkingAgent = jsonData.agent;
          activeAgents.add(currentThinkingAgent);
          removeTypingBubbles();
          showTypingBubble(currentThinkingAgent);
          return; // Keep the thinking bubble
        }
        else if (jsonData.status === 'done' && jsonData.agent) {
          activeAgents.delete(jsonData.agent);
          if (activeAgents.size > 0) {
            currentThinkingAgent = [...activeAgents][0];
            removeTypingBubbles();
            showTypingBubble(currentThinkingAgent);
            return;
          }
        }
      }
      
      // Handle regular messages - remove thinking bubbles
      removeTypingBubbles();
      
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
        } else if (!jsonData.status) { // Don't show status updates as messages
          appendMessage('assistant', "I received a response I don't understand. Please try again.");
        }
      }
    } catch (e) {
      // For non-JSON data, check for specific text patterns that indicate agent switching
      if (typeof data === 'string') {
        // Check for phrases that indicate orchestrator is forwarding to experts
        const forwardingPatterns = {
          'agent_math': [
            "forward it over to our in-house math specialist",
            "I'm going to forward this to our math expert",
            "I'll ask our math specialist",
            "let me connect you with our math specialist",
            "our math expert can help with this",
            "I'll consult the math expert",
            "Let me ask our math expert"
          ],
          'agent_coding': [
            "I'll forward this to our coding expert",
            "let me connect you with our coding specialist",
            "our coding expert can help with this",
            "I'll consult the coding expert",
            "Let me ask our coding expert"
          ],
          'agent_creative': [
            "I'll forward this to our creative expert",
            "let me connect you with our creative specialist",
            "our creative expert can help with this",
            "I'll consult the creative expert",
            "Let me ask our creative expert"
          ]
        };
        
        // Check each agent's forwarding patterns
        let foundForwarding = false;
        for (const [agent, patterns] of Object.entries(forwardingPatterns)) {
          for (const pattern of patterns) {
            if (data.toLowerCase().includes(pattern.toLowerCase())) {
              removeTypingBubbles();
              showTypingBubble(agent);
              foundForwarding = true;
              
              // Display the orchestrator's forwarding message
              appendMessage('orchestrator', data);
              return;
            }
          }
        }
        
        if (foundForwarding) return;
        
        // Original pattern checking for simpler phrases
        if (data.includes("I'll consult the math expert") || 
            data.includes("Let me ask our math expert")) {
          removeTypingBubbles();
          showTypingBubble('agent_math');
          return;
        } 
        else if (data.includes("I'll consult the coding expert") || 
                 data.includes("Let me ask our coding expert")) {
          removeTypingBubbles();
          showTypingBubble('agent_coding');
          return;
        }
        else if (data.includes("I'll consult the creative expert") || 
                 data.includes("Let me ask our creative expert")) {
          removeTypingBubbles();
          showTypingBubble('agent_creative');
          return;
        }
      }
      
      // Handle plain text messages with agent identifiers
      const agentPrefixes = [
        "agent_math:", "agent_coding:", "agent_creative:", 
        "orchestrator:", "data:"
      ];
      
      // Remove thinking bubbles for regular messages
      removeTypingBubbles();
      
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

// Function to create a typing bubble for agents/experts
function showTypingBubble(role) {
  // Remove any existing typing bubbles
  removeTypingBubbles();
  
  const sanitizedRole = role ? role.toLowerCase().replace(':', '') : 'assistant';
  
  // Create wrapper for the typing bubble
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.classList.add('message-wrapper', 'typing-bubble-wrapper');
  bubbleWrapper.style.width = '100%';
  bubbleWrapper.style.display = 'inline-block';
  bubbleWrapper.style.clear = 'both';
  
  // Create the typing bubble element
  const typingBubble = document.createElement('div');
  typingBubble.classList.add('typing-bubble');
  
  // Add role-specific class for styling
  if (sanitizedRole !== 'assistant' && sanitizedRole !== 'orchestrator') {
    typingBubble.classList.add(sanitizedRole);
  }
  
  // Add agent icon
  const bubbleIcon = document.createElement('div');
  bubbleIcon.classList.add('typing-bubble-icon');
  
  // Set icon based on agent type
  switch (sanitizedRole) {
    case 'agent_math':
      bubbleIcon.innerHTML = '∑';
      break;
    case 'agent_coding':
      bubbleIcon.innerHTML = '&lt;/&gt;';
      break;
    case 'agent_creative':
      bubbleIcon.innerHTML = '✨';
      break;
    default:
      bubbleIcon.innerHTML = '🤔';
      break;
  }
  
  typingBubble.appendChild(bubbleIcon);
  
  // Add specialized animations based on agent type
  if (sanitizedRole === 'agent_math') {
    // Math symbols animation with improved visuals
    const mathAnimation = document.createElement('div');
    mathAnimation.classList.add('typing-bubble-math-animation');
    
    const mathSymbols = ['∫', 'π', '∑', '√', 'x²'];
    mathSymbols.forEach((symbol, index) => {
      const symbolSpan = document.createElement('span');
      symbolSpan.textContent = symbol;
      symbolSpan.style.animationDelay = `${index * 0.2}s`;
      mathAnimation.appendChild(symbolSpan);
    });
    
    // Add "Working on problem..." text
    const workingText = document.createElement('div');
    workingText.textContent = "Working on your math problem...";
    workingText.style.marginTop = '8px';
    workingText.style.fontSize = '0.8rem';
    
    typingBubble.appendChild(mathAnimation);
    typingBubble.appendChild(workingText);
  }
  else if (sanitizedRole === 'agent_coding') {
    // Code-like typing animation
    const codeAnimation = document.createElement('div');
    codeAnimation.classList.add('typing-bubble-dots');
    
    // Coding animation with typing effect
    const codingText = document.createElement('span');
    codingText.classList.add('typing-bubble-code-animation');
    codingText.textContent = 'function calculate() { ... }';
    
    codeAnimation.appendChild(codingText);
    typingBubble.appendChild(codeAnimation);
  }
  else if (sanitizedRole === 'agent_creative') {
    // Creative spinning icons animation
    const creativeAnimation = document.createElement('div');
    creativeAnimation.classList.add('typing-bubble-creative-animation');
    
    const creativeIcons = ['✨', '💡', '🎨'];
    creativeIcons.forEach(icon => {
      const iconSpan = document.createElement('span');
      iconSpan.classList.add('creative-icon');
      iconSpan.textContent = icon;
      creativeAnimation.appendChild(iconSpan);
    });
    
    typingBubble.appendChild(creativeAnimation);
  }
  else {
    // Default dots animation for orchestrator and others
    const dotsContainer = document.createElement('div');
    dotsContainer.classList.add('typing-bubble-dots');
    
    // Add three animated dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.classList.add('typing-bubble-dot');
      dotsContainer.appendChild(dot);
    }
    
    typingBubble.appendChild(dotsContainer);
  }
  
  // Add agent label with more descriptive text
  const agentLabel = document.createElement('div');
  let labelText = getFriendlyRoleName(sanitizedRole);
  
  // Add more descriptive text based on agent type
  switch(sanitizedRole) {
    case 'agent_math':
      labelText += ' is solving your problem';
      break;
    case 'agent_coding':
      labelText += ' is working on your code';
      break;
    case 'agent_creative':
      labelText += ' is crafting a response';
      break;
    default:
      labelText += ' is thinking';
  }
  
  agentLabel.textContent = labelText;
  agentLabel.style.marginTop = '8px';
  agentLabel.style.fontSize = '0.75rem';
  agentLabel.style.opacity = '0.8';
  typingBubble.appendChild(agentLabel);
  
  bubbleWrapper.appendChild(typingBubble);
  chatContainer.appendChild(bubbleWrapper);
  
  // Scroll to the bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  return bubbleWrapper;
}

// Function to remove all typing bubbles
function removeTypingBubbles() {
  document.querySelectorAll('.typing-bubble-wrapper').forEach(bubble => {
    bubble.remove();
  });
}
