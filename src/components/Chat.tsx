import { useState, useRef, useEffect, useCallback } from "react";

interface Philosopher {
  id: string;
  name: string;
  era: string;
  tradition: string;
  shortDesc: string;
  color: string;
  image: string;
  greeting: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  philosopher: Philosopher;
  onBack: () => void;
}

function formatContent(text: string): string {
  if (!text) return "";

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
  html = html.replace(/^&gt;\s?(.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  html = html
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p)
    .map((p) => `<p>${p}</p>`)
    .join("");

  html = html.replace(/(?<!>)\n(?!<)/g, "<br>");

  return html;
}

export default function Chat({ philosopher, onBack }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: philosopher.greeting },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Reset messages when philosopher changes
  useEffect(() => {
    setMessages([{ role: "assistant", content: philosopher.greeting }]);
    setInput("");
    setIsStreaming(false);
  }, [philosopher.id, philosopher.greeting]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);

    const history = newMessages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          philosopherId: philosopher.id,
          message: text,
          history,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const assistantMessage: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMessage]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: fullText,
                };
                return updated;
              });
            }
          } catch (e: unknown) {
            if (e instanceof Error && !e.message.includes("JSON")) throw e;
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get response";
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.content === "") {
          updated.pop();
        }
        return updated;
      });
      alert(errorMessage);
    } finally {
      setIsStreaming(false);
    }
  };

  const newDialogue = () => {
    setMessages([{ role: "assistant", content: philosopher.greeting }]);
    setInput("");
    textareaRef.current?.focus();
  };

  return (
    <div className="chat-container" style={{ display: "flex" }}>
      <div className="chat-header" id="chat-header">
        <div className="chat-header-left">
          <button
            className="back-btn"
            onClick={onBack}
            aria-label="Back to philosophers"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div
            className="chat-header-avatar"
            style={{
              background: philosopher.image
                ? `url(${philosopher.image}) center/cover`
                : philosopher.color,
            }}
          >
            {!philosopher.image && philosopher.name.charAt(0)}
          </div>
          <div className="chat-header-info">
            <h2>{philosopher.name}</h2>
            <p>
              {philosopher.era} &middot; {philosopher.tradition}
            </p>
          </div>
        </div>
        <button
          className="new-dialogue-btn"
          onClick={newDialogue}
          title="Start a new dialogue"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>New Dialogue</span>
        </button>
      </div>

      <div className="chat-header-divider">
        <span></span>
      </div>

      <div className="messages-wrapper" id="messages-wrapper">
        <div className="messages" id="messages">
          {messages.map((msg, i) => {
            const isPhilosopher = msg.role === "assistant";
            return (
              <div
                key={i}
                className={`message ${isPhilosopher ? "philosopher" : "user"}`}
                style={{
                  animationDelay: `${Math.min(i * 0.05, 0.3)}s`,
                }}
              >
                <div className="message-label">
                  {isPhilosopher ? philosopher.name : "You"}
                </div>
                <div
                  className="message-bubble"
                  dangerouslySetInnerHTML={{
                    __html: formatContent(msg.content),
                  }}
                />
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {isStreaming && (
        <div className="typing-indicator">
          <div
            className="typing-avatar"
            style={{
              background: philosopher.image
                ? `url(${philosopher.image}) center/cover`
                : philosopher.color,
            }}
          >
            {!philosopher.image && philosopher.name.charAt(0)}
          </div>
          <div className="typing-body">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="typing-label">
              {philosopher.name.split(" ")[0]} is contemplating...
            </span>
          </div>
        </div>
      )}

      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            placeholder="Pose your question..."
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            aria-label="Your message"
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
        <p className="input-hint">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
