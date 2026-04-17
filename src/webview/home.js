(function () {
  const vscode = acquireVsCodeApi();

  // Persist first-run state across reloads
  const state = vscode.getState() || {};

  // XSS SAFETY: Use this for ALL dynamic content displayed in the chat
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convert escaped markdown to formatted HTML (must call escapeHtml FIRST)
  function formatMarkdown(raw) {
    const escaped = escapeHtml(raw);
    return escaped
      // Headers: ### text -> <h3>
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{1}\s+(.+)$/gm, '<h2>$1</h2>')
      // Bold: **text** -> <strong>
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Inline code: `text` -> <code>
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bullet lists: - item or * item -> <li>
      .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
      // Numbered lists: 1. item -> <li>
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Wrap consecutive <li> in <ul>
      .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
      // Emoji warning lines: warning text -> highlighted
      .replace(/^(\u26a0\ufe0f.+)$/gm, '<div class="warning">$1</div>')
      // Double newlines -> paragraph breaks
      .replace(/\n\n/g, '</p><p>')
      // Single newlines -> line breaks
      .replace(/\n/g, '<br>')
      // Wrap in paragraph
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // DOM references
  const homeScreen = document.getElementById('home-screen');
  const chatScreen = document.getElementById('chat-screen');
  const chatMessages = document.getElementById('chat-messages');
  const chatTitle = document.getElementById('chat-title');
  const thinkingIndicator = document.getElementById('thinking-indicator');
  const welcomeOverlay = document.getElementById('welcome-overlay');

  // ========== WELCOME (first run only) ==========
  if (!state.welcomed) {
    welcomeOverlay.style.display = 'flex';
  }

  document.getElementById('welcome-dismiss').addEventListener('click', function () {
    welcomeOverlay.style.display = 'none';
    state.welcomed = true;
    vscode.setState(state);
  });

  // ========== CARD CLICK ==========
  document.querySelectorAll('.card').forEach(function (card) {
    card.addEventListener('click', function () {
      vscode.postMessage({ type: 'startDiagnosis', card: card.dataset.card });
    });
  });

  // Custom question submit
  document.getElementById('custom-submit').addEventListener('click', function () {
    var input = document.getElementById('custom-question');
    var text = input.value.trim();
    if (text) {
      vscode.postMessage({ type: 'startDiagnosis', card: text });
      input.value = '';
    }
  });

  // Enter key on custom question
  document.getElementById('custom-question').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('custom-submit').click();
  });

  // Chat submit
  document.getElementById('chat-submit').addEventListener('click', function () {
    var input = document.getElementById('chat-question');
    var text = input.value.trim();
    if (text) {
      addMessage('user', text);
      vscode.postMessage({ type: 'chatMessage', text: text });
      input.value = '';
    }
  });

  // Enter key on chat question
  document.getElementById('chat-question').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('chat-submit').click();
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', function () {
    homeScreen.style.display = '';
    chatScreen.style.display = 'none';
  });

  // ========== INBOUND MESSAGES (extension -> webview) ==========
  window.addEventListener('message', function (event) {
    var msg = event.data;
    switch (msg.type) {
      case 'showChat':
        homeScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        chatTitle.textContent = msg.card;
        chatMessages.innerHTML = '';
        break;
      case 'thinking':
        thinkingIndicator.style.display = msg.active ? 'flex' : 'none';
        if (msg.active) {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        break;
      case 'assistantMessage':
        addMessage('assistant', msg.text);
        break;
      case 'toolRunning':
        addMessage('tool', '\ud83d\udcca Running: ' + escapeHtml(msg.tool) + '...');
        break;
      case 'toolResult':
        addMessage('tool', escapeHtml(msg.output));
        break;
      case 'diagnosisComplete':
        break;
    }
  });

  function addMessage(role, content) {
    var div = document.createElement('div');
    div.className = 'message ' + role;
    if (role === 'tool') {
      div.innerHTML = '<pre>' + content + '</pre>';
    } else if (role === 'assistant') {
      div.innerHTML = formatMarkdown(content);
    } else {
      div.innerHTML = escapeHtml(content);
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Send ready message
  vscode.postMessage({ type: 'ready' });
})();
(function () {
  const vscode = acquireVsCodeApi();

  // XSS SAFETY: Use this for ALL dynamic content displayed in the chat
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convert escaped markdown to formatted HTML (must call escapeHtml FIRST)
  function formatMarkdown(raw) {
    const escaped = escapeHtml(raw);
    return escaped
      // Headers: ### text → <h3>
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{1}\s+(.+)$/gm, '<h2>$1</h2>')
      // Bold: **text** → <strong>
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Inline code: `text` → <code>
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bullet lists: - item or * item → <li>
      .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
      // Numbered lists: 1. item → <li>
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Wrap consecutive <li> in <ul>
      .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
      // Emoji warning lines: ⚠️ text → highlighted
      .replace(/^(⚠️.+)$/gm, '<div class="warning">$1</div>')
      // Double newlines → paragraph breaks
      .replace(/\n\n/g, '</p><p>')
      // Single newlines → line breaks
      .replace(/\n/g, '<br>')
      // Wrap in paragraph
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // DOM references
  const homeScreen = document.getElementById('home-screen');
  const chatScreen = document.getElementById('chat-screen');
  const chatMessages = document.getElementById('chat-messages');
  const chatTitle = document.getElementById('chat-title');

  // OUTBOUND MESSAGES (webview → extension):
  // 1. 'ready' — sent on load
  // 2. 'startDiagnosis' — { card: string } — when user clicks a card or submits custom question
  // 3. 'chatMessage' — { text: string } — when user sends a follow-up in chat

  // Card click handlers
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      vscode.postMessage({ type: 'startDiagnosis', card: card.dataset.card });
    });
  });

  // Custom question submit
  document.getElementById('custom-submit').addEventListener('click', () => {
    const input = document.getElementById('custom-question');
    const text = input.value.trim();
    if (text) {
      vscode.postMessage({ type: 'startDiagnosis', card: text });
      input.value = '';
    }
  });

  // Enter key on custom question
  document.getElementById('custom-question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('custom-submit').click();
  });

  // Chat submit
  document.getElementById('chat-submit').addEventListener('click', () => {
    const input = document.getElementById('chat-question');
    const text = input.value.trim();
    if (text) {
      addMessage('user', text);
      vscode.postMessage({ type: 'chatMessage', text });
      input.value = '';
    }
  });

  // Enter key on chat question
  document.getElementById('chat-question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('chat-submit').click();
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    homeScreen.style.display = '';
    chatScreen.style.display = 'none';
  });

  // INBOUND MESSAGES (extension → webview):
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'showChat':
        homeScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        chatTitle.textContent = msg.card; // textContent, not innerHTML
        chatMessages.innerHTML = ''; // Clear previous chat (safe — no user data)
        break;
      case 'assistantMessage':
        addMessage('assistant', msg.text);
        break;
      case 'toolRunning':
        addMessage('tool', '📊 Running: ' + escapeHtml(msg.tool) + '...');
        break;
      case 'toolResult':
        addMessage('tool', escapeHtml(msg.output));
        break;
      case 'diagnosisComplete':
        // Optional: could show a "diagnosis complete" indicator
        break;
    }
  });

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    if (role === 'tool') {
      // Tool output is preformatted, already escaped above
      div.innerHTML = '<pre>' + content + '</pre>';
    } else if (role === 'assistant') {
      // Format markdown for AI responses
      div.innerHTML = formatMarkdown(content);
    } else {
      // User messages — plain escaped text
      div.innerHTML = escapeHtml(content);
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Send ready message
  vscode.postMessage({ type: 'ready' });
})();
