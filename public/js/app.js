// ========================================
// PHILOSOPHIA — Client Application
// ========================================

const state = {
  philosophers: [],
  selected: null,
  conversations: {},
  isStreaming: false,
};

// DOM references
const $ = (sel) => document.querySelector(sel);
const dom = {
  philosopherList: $('#philosopher-list'),
  welcomeScreen: $('#welcome-screen'),
  chatContainer: $('#chat-container'),
  chatAvatar: $('#chat-avatar'),
  chatName: $('#chat-philosopher-name'),
  chatMeta: $('#chat-philosopher-meta'),
  messages: $('#messages'),
  messagesWrapper: $('#messages-wrapper'),
  messageInput: $('#message-input'),
  sendBtn: $('#send-btn'),
  newDialogueBtn: $('#new-dialogue-btn'),
  typingIndicator: $('#typing-indicator'),
  typingAvatar: $('#typing-avatar'),
  typingLabel: $('#typing-label'),
  sidebar: $('#sidebar'),
  sidebarOverlay: $('#sidebar-overlay'),
  menuToggle: $('#menu-toggle'),
  backBtn: $('#back-btn'),
};

// ---- Initialization ----

async function init() {
  try {
    const res = await fetch('/api/philosophers');
    state.philosophers = await res.json();
    renderPhilosopherList();
    setupListeners();
  } catch (err) {
    showError('Failed to load philosophers. Is the server running?');
  }
}

// ---- Render philosopher sidebar ----

function renderPhilosopherList() {
  dom.philosopherList.innerHTML = state.philosophers.map((p) => `
    <button
      class="philosopher-card"
      data-id="${p.id}"
      role="listitem"
      aria-label="${p.name}, ${p.era}"
    >
      <div class="philosopher-card-avatar" style="background:${p.color}">${getInitial(p.name)}</div>
      <div class="philosopher-card-info">
        <div class="philosopher-card-name">${p.name}</div>
        <div class="philosopher-card-meta">${p.era} &middot; ${p.tradition}</div>
      </div>
    </button>
  `).join('');
}

function getInitial(name) {
  // Use first letter, with special cases
  const specials = { 'Simone de Beauvoir': 'SB', 'Marcus Aurelius': 'MA' };
  return specials[name] || name.charAt(0);
}

// ---- Select philosopher ----

function selectPhilosopher(id) {
  state.selected = id;
  const philosopher = state.philosophers.find(p => p.id === id);

  // Initialize conversation with greeting
  if (!state.conversations[id]) {
    state.conversations[id] = [
      { role: 'assistant', content: philosopher.greeting }
    ];
  }

  // Update sidebar selection
  document.querySelectorAll('.philosopher-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === id);
  });

  // Update chat header
  dom.chatAvatar.style.background = philosopher.color;
  dom.chatAvatar.textContent = getInitial(philosopher.name);
  dom.chatName.textContent = philosopher.name;
  dom.chatMeta.textContent = `${philosopher.era} \u00b7 ${philosopher.tradition}`;

  // Update typing indicator avatar
  dom.typingAvatar.style.background = philosopher.color;
  dom.typingAvatar.textContent = getInitial(philosopher.name);
  dom.typingLabel.textContent = `${philosopher.name.split(' ')[0]} is contemplating...`;

  // Show chat, hide welcome
  dom.welcomeScreen.style.display = 'none';
  dom.chatContainer.hidden = false;

  renderMessages();
  closeSidebar();
  dom.messageInput.focus();
}

// ---- Render messages ----

function renderMessages() {
  const conversation = state.conversations[state.selected] || [];
  const philosopher = state.philosophers.find(p => p.id === state.selected);

  dom.messages.innerHTML = conversation.map((msg, i) => {
    const isPhilosopher = msg.role === 'assistant';
    const label = isPhilosopher ? philosopher.name : 'You';
    const cls = isPhilosopher ? 'philosopher' : 'user';

    return `
      <div class="message ${cls}" style="animation-delay: ${Math.min(i * 0.05, 0.3)}s">
        <div class="message-label">${label}</div>
        <div class="message-bubble">${formatContent(msg.content)}</div>
      </div>
    `;
  }).join('');

  scrollToBottom();
}

function updateStreamingMessage(content) {
  const conversation = state.conversations[state.selected];
  const lastMsg = dom.messages.querySelector('.message:last-child .message-bubble');
  if (lastMsg) {
    lastMsg.innerHTML = formatContent(content);
    scrollToBottom();
  }
}

// ---- Basic markdown formatting ----

function formatContent(text) {
  if (!text) return '';

  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* (but not inside bold)
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

  // Blockquotes: > text
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

  // Merge adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Paragraphs: double newlines
  html = html
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p)
    .map(p => `<p>${p}</p>`)
    .join('');

  // Single newlines within paragraphs -> <br>
  html = html.replace(/(?<!\>)\n(?!\<)/g, '<br>');

  return html;
}

// ---- Send message ----

async function sendMessage() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isStreaming || !state.selected) return;

  const philosopherId = state.selected;
  const conversation = state.conversations[philosopherId];

  // Add user message
  conversation.push({ role: 'user', content: text });
  renderMessages();

  // Clear input & reset height
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  dom.sendBtn.disabled = true;

  // Show typing indicator
  state.isStreaming = true;
  dom.typingIndicator.hidden = false;
  scrollToBottom();

  // Build history (exclude greeting and current message)
  const history = conversation.slice(0, -1).map(m => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ philosopherId, message: text, history }),
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    // Add empty assistant message for streaming
    conversation.push({ role: 'assistant', content: '' });
    renderMessages();
    dom.typingIndicator.hidden = true;

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            fullText += parsed.text;
            conversation[conversation.length - 1].content = fullText;
            updateStreamingMessage(fullText);
          }
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) {
            throw e;
          }
        }
      }
    }
  } catch (err) {
    console.error('Chat error:', err);
    // Remove the empty assistant message if streaming failed
    if (conversation[conversation.length - 1]?.content === '') {
      conversation.pop();
    }
    showError(err.message || 'Failed to get response. Please try again.');
    renderMessages();
  } finally {
    state.isStreaming = false;
    dom.typingIndicator.hidden = true;
  }
}

// ---- New dialogue ----

function newDialogue() {
  if (!state.selected) return;
  const philosopher = state.philosophers.find(p => p.id === state.selected);
  state.conversations[state.selected] = [
    { role: 'assistant', content: philosopher.greeting }
  ];
  renderMessages();
  dom.messageInput.focus();
}

// ---- UI helpers ----

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messagesWrapper.scrollTop = dom.messagesWrapper.scrollHeight;
  });
}

function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  dom.sidebarOverlay.classList.remove('visible');
  dom.menuToggle.classList.remove('active');
}

function toggleSidebar() {
  const isOpen = dom.sidebar.classList.toggle('open');
  dom.sidebarOverlay.classList.toggle('visible', isOpen);
  dom.menuToggle.classList.toggle('active', isOpen);
}

// ---- Auto-resize textarea ----

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

// ---- Event listeners ----

function setupListeners() {
  // Philosopher selection
  dom.philosopherList.addEventListener('click', (e) => {
    const card = e.target.closest('.philosopher-card');
    if (card) selectPhilosopher(card.dataset.id);
  });

  // Send message
  dom.sendBtn.addEventListener('click', sendMessage);

  // Textarea: enter to send, shift+enter for newline
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea & enable/disable send
  dom.messageInput.addEventListener('input', () => {
    autoResize(dom.messageInput);
    dom.sendBtn.disabled = !dom.messageInput.value.trim() || state.isStreaming;
  });

  // New dialogue
  dom.newDialogueBtn.addEventListener('click', newDialogue);

  // Mobile sidebar
  dom.menuToggle.addEventListener('click', toggleSidebar);
  dom.sidebarOverlay.addEventListener('click', closeSidebar);

  // Mobile back button
  dom.backBtn.addEventListener('click', () => {
    dom.chatContainer.hidden = true;
    dom.welcomeScreen.style.display = 'flex';
    state.selected = null;
    document.querySelectorAll('.philosopher-card').forEach(c => c.classList.remove('selected'));
    toggleSidebar();
  });
}

// ---- Start ----
init();
