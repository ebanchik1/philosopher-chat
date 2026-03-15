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
  backBtn: $('#back-btn'),
};

// ---- Initialization ----

async function init() {
  try {
    const res = await fetch('/api/philosophers');
    state.philosophers = await res.json();
    renderPhilosopherGrid();
    setupListeners();
  } catch (err) {
    showError('Failed to load philosophers. Is the server running?');
  }
}

// ---- Render welcome page philosopher grid ----

function renderPhilosopherGrid() {
  const grid = document.getElementById('philosopher-grid');
  if (!grid) return;
  grid.innerHTML = state.philosophers.map((p, i) => `
    <button
      class="philosopher-portrait"
      data-id="${p.id}"
      aria-label="${p.name}"
      style="animation-delay: ${i * 0.06}s"
    >
      <div class="philosopher-portrait-circle">
        <img src="${p.image}" alt="${p.name}" loading="lazy">
      </div>
      <span class="philosopher-portrait-name">${p.name}</span>
    </button>
  `).join('');
}

function getInitial(name) {
  const specials = { 'Simone de Beauvoir': 'SB', 'Marcus Aurelius': 'MA' };
  return specials[name] || name.charAt(0);
}

// ---- Navigate back to homepage ----

function goHome() {
  state.selected = null;
  dom.chatContainer.hidden = true;
  dom.welcomeScreen.style.display = 'flex';
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

  // Update chat header
  if (philosopher.image) {
    dom.chatAvatar.style.background = `url(${philosopher.image}) center/cover`;
    dom.chatAvatar.textContent = '';
  } else {
    dom.chatAvatar.style.background = philosopher.color;
    dom.chatAvatar.textContent = getInitial(philosopher.name);
  }
  dom.chatName.textContent = philosopher.name;
  dom.chatMeta.textContent = `${philosopher.era} \u00b7 ${philosopher.tradition}`;

  // Update typing indicator avatar
  if (philosopher.image) {
    dom.typingAvatar.style.background = `url(${philosopher.image}) center/cover`;
    dom.typingAvatar.textContent = '';
  } else {
    dom.typingAvatar.style.background = philosopher.color;
    dom.typingAvatar.textContent = getInitial(philosopher.name);
  }
  dom.typingLabel.textContent = `${philosopher.name.split(' ')[0]} is contemplating...`;

  // Show chat, hide welcome
  dom.welcomeScreen.style.display = 'none';
  dom.chatContainer.hidden = false;

  renderMessages();
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
  const lastMsg = dom.messages.querySelector('.message:last-child .message-bubble');
  if (lastMsg) {
    lastMsg.innerHTML = formatContent(content);
    scrollToBottom();
  }
}

// ---- Basic markdown formatting ----

function formatContent(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  html = html
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p)
    .map(p => `<p>${p}</p>`)
    .join('');

  html = html.replace(/(?<!\>)\n(?!\<)/g, '<br>');

  return html;
}

// ---- Send message ----

async function sendMessage() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isStreaming || !state.selected) return;

  const philosopherId = state.selected;
  const conversation = state.conversations[philosopherId];

  conversation.push({ role: 'user', content: text });
  renderMessages();

  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  dom.sendBtn.disabled = true;

  state.isStreaming = true;
  dom.typingIndicator.hidden = false;
  scrollToBottom();

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

    conversation.push({ role: 'assistant', content: '' });
    renderMessages();
    dom.typingIndicator.hidden = true;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

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

// ---- Auto-resize textarea ----

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

// ---- Event listeners ----

function setupListeners() {
  // Philosopher selection (welcome grid)
  const grid = document.getElementById('philosopher-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const portrait = e.target.closest('.philosopher-portrait');
      if (portrait) selectPhilosopher(portrait.dataset.id);
    });
  }

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

  // Back button — return to homepage
  dom.backBtn.addEventListener('click', goHome);
}

// ---- Start ----
init();
