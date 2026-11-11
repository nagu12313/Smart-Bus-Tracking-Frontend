import React, { useState, useEffect, useRef, useMemo } from "react";
import transportChatService from "../services/transportChatService";

function parseBold(text) {
  if (!text) return text;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderFormattedMessage(rawText, isUser) {
  if (!rawText) return null;

  const lines = rawText.split("\n");

  return lines.map((line, lineIdx) => {
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const segments = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        segments.push(parseBold(line.substring(lastIndex, match.index)));
      }
      const label = match[1];
      const url = match[2];
      segments.push(
        <a
          key={`link-${lineIdx}-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isUser ? "#ffffff" : "#216ee5",
            textDecoration: "underline",
            fontWeight: 600,
            wordBreak: "break-all",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      segments.push(parseBold(line.substring(lastIndex)));
    }

    return (
      <div key={lineIdx} style={{ minHeight: line.trim() ? "auto" : "8px" }}>
        {segments.length > 0 ? segments : <span>&nbsp;</span>}
      </div>
    );
  });
}

/**
 * Smart Transport Assistant — Minimalist AI Chatbot Modal
 * Project Blue theme (#216ee5), strictly border-radius: 0px.
 */
export default function SmartTransportAssistantModal({
  isOpen,
  onClose,
  currentUser,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [initData, setInitData] = useState(null);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  // Load dynamic runtime role context & chat history on modal open
  useEffect(() => {
    if (!isOpen) return;
    loadInitAndHistory();
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadInitAndHistory() {
    setLoadingHistory(true);
    setError("");
    try {
      // 1. Fetch dynamic role-specific runtime context & suggestions
      let init = null;
      try {
        init = await transportChatService.getInitContext();
        setInitData(init);
      } catch (e) {
        console.warn("Failed to load transport chat init context:", e);
      }

      // 2. Fetch stored chat history
      const history = await transportChatService.getHistory();
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history);
      } else if (init && init.welcomeMessage) {
        setMessages([
          {
            id: "welcome-system",
            sender: "assistant",
            message: init.welcomeMessage,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages([
          {
            id: "welcome-fallback",
            sender: "assistant",
            message: `Hello ${currentUser?.name || "there"}! I am your Smart Transport AI Assistant. How can I assist you with bus tracking, routes, or timings today?`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.warn("Error loading chat history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleClearHistory() {
    try {
      await transportChatService.clearHistory();
      if (initData?.welcomeMessage) {
        setMessages([
          {
            id: "welcome-cleared",
            sender: "assistant",
            message: initData.welcomeMessage,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.warn("Failed to clear chat history:", err);
    }
  }

  async function handleSend(textToSend) {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setError("");
    const userMsg = {
      id: `local-${Date.now()}`,
      sender: "user",
      message: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const botResponse = await transportChatService.sendMessage(query);
      if (botResponse && botResponse.message) {
        setMessages((prev) => [...prev, botResponse]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: "assistant",
            message: "Please contact your transport administrator for further assistance.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.warn("Transport chat error:", err);
      const errMsg = err.response?.data?.message || "Please contact your transport administrator for further assistance.";
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: "assistant",
          message: errMsg,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop-custom"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="chat-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "640px",
          height: "82vh",
          maxHeight: "720px",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          borderRadius: "0px",
          border: "1px solid #216ee5",
          boxShadow: "0 20px 40px rgba(33,110,229,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Project Blue Header (border-radius: 0px, No Clear button) */}
        <div
          style={{
            background: "#216ee5",
            color: "#ffffff",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: "0px",
            borderBottom: "1px solid #1d6de5",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>🚌</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "0.2px" }}>
                Smart Transport Assistant
              </div>
              <div style={{ fontSize: "11px", color: "#e0edff" }}>
                {initData?.contextSummary || (currentUser?.name ? `${currentUser.name} (${currentUser.role || "User"})` : "Campus Transit AI")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handleClearHistory}
              title="Clear chat history"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "#ffffff",
                fontSize: "11px",
                padding: "2px 8px",
                cursor: "pointer",
                borderRadius: "0px",
                lineHeight: "1.4",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                fontSize: "18px",
                cursor: "pointer",
                padding: "0 4px",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {loadingHistory ? (
            <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", marginTop: "20px" }}>
              Loading...
            </div>
          ) : (
            messages.map((m, idx) => {
              const isUser = m.sender === "user";
              return (
                <div
                  key={m.id || idx}
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      background: isUser ? "#216ee5" : "#ffffff",
                      color: isUser ? "#ffffff" : "#172b43",
                      border: isUser ? "1px solid #216ee5" : "1px solid #e2e8f0",
                      borderRadius: "0px",
                      fontSize: "13px",
                      lineHeight: "1.55",
                      wordBreak: "break-word",
                    }}
                  >
                    {renderFormattedMessage(m.message, isUser)}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "8px 12px",
                  background: "#ffffff",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0px",
                  fontSize: "12px",
                  fontStyle: "italic",
                }}
              >
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Suggested Questions from Runtime Role Engine */}
        {Array.isArray(initData?.suggestedQuestions) && initData.suggestedQuestions.length > 0 && (
          <div
            style={{
              background: "#f1f5f9",
              borderTop: "1px solid #e2e8f0",
              padding: "8px 12px",
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {initData.suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                disabled={loading}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  color: "#1e293b",
                  fontSize: "11px",
                  padding: "4px 8px",
                  borderRadius: "0px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Minimal Input Bar (border-radius: 0px) */}
        <div
          style={{
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            padding: "10px 12px",
            display: "flex",
            gap: "8px",
          }}
        >
          <input
            type="text"
            placeholder={
              initData?.identifiedBusNumber
                ? `Ask about ${initData.identifiedBusNumber}${initData.identifiedBusName ? ` (${initData.identifiedBusName})` : ""}, route, ETA, or driver...`
                : (currentUser?.role || initData?.userRole || "").toUpperCase() === "ADMIN"
                ? "Ask about fleet status, active buses, routes, moving vehicles, or any bus number..."
                : (currentUser?.role || initData?.userRole || "").toUpperCase() === "DRIVER"
                ? "Ask about your assigned route, stops, students, or schedule..."
                : (currentUser?.role || initData?.userRole || "").toUpperCase() === "PARENT"
                ? "Ask about your child's bus location, ETA, or driver details..."
                : (currentUser?.role || initData?.userRole || "").toUpperCase() === "STUDENT"
                ? "Ask about your bus arrival time, route, or live status..."
                : "Ask about bus routes, schedules, live tracking, or ETAs..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: "13px",
              border: "1px solid #cbd5e1",
              borderRadius: "0px",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              padding: "8px 16px",
              background: loading || !input.trim() ? "#94a3b8" : "#216ee5",
              color: "#ffffff",
              border: "1px solid #216ee5",
              borderRadius: "0px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
