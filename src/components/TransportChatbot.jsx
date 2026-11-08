import React, { useState, useRef, useEffect } from "react";

/**
 * Intelligent Campus Transport Chatbot
 * Provides instant automated help for students, parents, and drivers.
 */
export default function TransportChatbot({
  currentUser,
  buses = [],
  onRaiseTicket,
}) {
  const [messages, setMessages] = useState([
    {
      id: "welcome-1",
      sender: "bot",
      text: `Hello ${currentUser?.name || "there"}! 👋 I'm your Campus Transport Assistant. How can I help you today?`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
    {
      id: "welcome-2",
      sender: "bot",
      text: "You can ask me about bus schedules, live tracking, delays, emergency helpline, or click any quick topic below:",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef(null);

  const QUICK_QUESTIONS = [
    { label: "📍 Where is my bus?", query: "Where is my bus right now?" },
    { label: "⏰ Route & bus timings", query: "What are the bus schedules and route timings?" },
    { label: "⚠️ Bus delayed", query: "My bus is delayed, how do I check?" },
    { label: "🎒 Lost item on bus", query: "I left a bag or phone on the bus" },
    { label: "📞 Transport helpline", query: "Emergency transport helpline contacts" },
    { label: "🗺️ How to track live?", query: "How do I track my bus live on the map?" },
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Generate intelligent contextual response
    setTimeout(() => {
      const botReply = generateBotReply(query, buses);
      setMessages((prev) => [...prev, botReply]);
      setIsTyping(false);
    }, 600);
  };

  const generateBotReply = (query, busList) => {
    const q = query.toLowerCase();
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Live bus tracking / location
    if (q.includes("where") || q.includes("location") || q.includes("track") || q.includes("live map")) {
      const activeBuses = busList.filter((b) => b.status === "ACTIVE" || b.status === "IN_TRANSIT" || b.speed > 0);
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `You can track all campus buses live in real-time on the **Live Map** tab in the sidebar! 🗺️\n\nCurrently, there are **${busList.length}** registered buses in the fleet (${activeBuses.length} actively transmitting GPS). Clicking any vehicle on the map reveals its current road speed, driver name, and upcoming stops with live ETA.`,
        time,
        action: {
          label: "Open Live Map",
          type: "navigate_map",
        },
      };
    }

    // 2. Schedule / Timings
    if (q.includes("timing") || q.includes("schedule") || q.includes("time") || q.includes("morning") || q.includes("evening")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `🕒 **Standard Campus Transport Timings:**\n\n• **Morning Shift (Pickups):** 07:15 AM – 08:45 AM\n• **Mid-day Shuttle (Between Campuses):** 12:30 PM – 02:00 PM\n• **Evening Shift (Drop-offs):** 04:30 PM – 06:15 PM\n\nAll routes are scheduled with automatic buffer calculation for traffic. If your bus is running late, real-time alerts appear on the dashboard.`,
        time,
      };
    }

    // 3. Delay / Breakdown
    if (q.includes("delay") || q.includes("late") || q.includes("breakdown") || q.includes("traffic") || q.includes("stuck")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `⚠️ **Bus Delay Protocol:**\n\nIf your bus is delayed by more than 10–15 minutes, drivers automatically report transit congestion to the transport control room.\n\nWould you like to notify the transport administrator immediately? You can raise a high-priority ticket with 1 click:`,
        time,
        action: {
          label: "🎫 Raise Delay Ticket",
          type: "raise_ticket",
          category: "BUS_DELAY",
          subject: "Bus delayed at stop",
        },
      };
    }

    // 4. Lost & Found
    if (q.includes("lost") || q.includes("left") || q.includes("forgot") || q.includes("bag") || q.includes("phone") || q.includes("item")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `🎒 **Lost Property on Bus:**\n\nAll items found on buses are deposited at the **Central Transport Cell (Ground Floor, Admin Block)** at the end of each shift.\n\nPlease raise an official support ticket right now with the Bus Number, seat location, and item description so the supervisor can inspect the vehicle immediately!`,
        time,
        action: {
          label: "🎫 Report Lost Item Ticket",
          type: "raise_ticket",
          category: "LOST_AND_FOUND",
          subject: "Lost item on bus",
        },
      };
    }

    // 5. Emergency Helpline / Contact
    if (q.includes("emergency") || q.includes("helpline") || q.includes("contact") || q.includes("phone") || q.includes("call") || q.includes("number")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `📞 **Campus Transport Emergency Contacts:**\n\n• **Transport Control Room:** +91 (040) 2345-6789\n• **Transport Manager Desk:** +91 98765 43210\n• **Admin Email:** bollanagu6868@gmail.com\n• **Campus Security Control (24/7):** +91 98765 00100\n\nFor non-emergency queries, you can also raise an official ticket anytime through this portal.`,
        time,
      };
    }

    // 6. Driver feedback / complaint
    if (q.includes("driver") || q.includes("rash") || q.includes("complaint") || q.includes("speeding") || q.includes("behavior")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `🛡️ **Safety & Driver Feedback:**\n\nStudent and passenger safety is our highest priority. All vehicles are monitored for over-speeding, harsh braking, and route deviation.\n\nIf you observed unsafe driving or improper behavior, please submit a formal report so transport supervisors can review the vehicle telemetry and take immediate corrective action.`,
        time,
        action: {
          label: "🎫 Submit Driver Incident Report",
          type: "raise_ticket",
          category: "DRIVER_BEHAVIOR",
          subject: "Driver feedback / Safety concern",
        },
      };
    }

    // 7. Route change / stop change
    if (q.includes("route") || q.includes("stop") || q.includes("pickup point") || q.includes("change")) {
      return {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `📍 **Pickup / Drop-off Stop Changes:**\n\nTo request an adjustment to your registered bus route or pickup stop, transport administrators require an official request with your address proof.\n\nPlease submit a ticket under **"Route Change Request"** with your desired stop location.`,
        time,
        action: {
          label: "🎫 Request Route Change",
          type: "raise_ticket",
          category: "ROUTE_INQUIRY",
          subject: "Request for stop / route change",
        },
      };
    }

    // Fallback response
    return {
      id: `bot-${Date.now()}`,
      sender: "bot",
      text: `Thanks for reaching out! I understand you're asking about "${query}".\n\nFor questions not covered in the automated guide, our transport administrators are available to assist you personally. Click below to submit an official support ticket:`,
      time,
      action: {
        label: "🎫 Submit Official Support Ticket",
        type: "raise_ticket",
        category: "OTHER",
        subject: query.slice(0, 100),
      },
    };
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "560px",
        background: "#ffffff",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
      }}
    >
      {/* Bot Chat Header */}
      <div
        style={{
          padding: "14px 18px",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#ffffff",
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>
              Campus Transport Chatbot
            </div>
            <div style={{ fontSize: "11px", color: "#4ade80", display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }}></span>
              Online 24/7 &bull; Instant Answers
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-outline-light py-0 px-2"
          style={{ fontSize: "11px", borderRadius: "6px" }}
          onClick={() => {
            setMessages([
              {
                id: "welcome-reset",
                sender: "bot",
                text: "Chat reset. How can I help you with campus transport today?",
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ]);
          }}
          title="Clear conversation history"
        >
          <i className="bi bi-arrow-counterclockwise me-1" /> Clear
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          background: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: m.sender === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              gap: "8px",
            }}
          >
            {m.sender === "bot" && (
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  flexShrink: 0,
                }}
              >
                🤖
              </div>
            )}

            <div
              style={{
                maxWidth: "78%",
                background: m.sender === "user" ? "#2563eb" : "#ffffff",
                color: m.sender === "user" ? "#ffffff" : "#1e293b",
                padding: "10px 14px",
                borderRadius: m.sender === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                fontSize: "13px",
                lineHeight: "1.55",
                whiteSpace: "pre-line",
                border: m.sender === "user" ? "none" : "1px solid #e2e8f0",
              }}
            >
              {m.text}

              {/* Action button inside message */}
              {m.action && m.action.type === "raise_ticket" && (
                <div className="mt-2 pt-2 border-top" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary w-100 d-flex align-items-center justify-content-center gap-1"
                    style={{ fontSize: "12px", fontWeight: 700, borderRadius: "6px" }}
                    onClick={() => {
                      if (onRaiseTicket) {
                        onRaiseTicket({
                          category: m.action.category || "OTHER",
                          subject: m.action.subject || "",
                        });
                      }
                    }}
                  >
                    {m.action.label || "🎫 Raise Support Ticket"}
                  </button>
                </div>
              )}

              <div
                style={{
                  fontSize: "10px",
                  color: m.sender === "user" ? "rgba(255,255,255,0.7)" : "#94a3b8",
                  marginTop: "4px",
                  textAlign: "right",
                }}
              >
                {m.time}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="d-flex align-items-center gap-2">
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
              }}
            >
              🤖
            </div>
            <div
              style={{
                background: "#ffffff",
                padding: "8px 14px",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                fontSize: "12px",
                color: "#64748b",
                fontStyle: "italic",
              }}
            >
              Assistant is typing...
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div
        style={{
          padding: "8px 14px",
          background: "#f1f5f9",
          borderTop: "1px solid #e2e8f0",
          overflowX: "auto",
          whiteSpace: "nowrap",
          display: "flex",
          gap: "6px",
        }}
      >
        {QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn-sm btn-outline-secondary py-1 px-2"
            style={{
              fontSize: "11px",
              borderRadius: "20px",
              whiteSpace: "nowrap",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#334155",
            }}
            onClick={() => handleSend(q.query)}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div
        style={{
          padding: "10px 14px",
          background: "#ffffff",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Ask a question about buses, schedules, routes..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ borderRadius: "8px", fontSize: "13px" }}
        />

        <button
          type="button"
          className="btn btn-sm btn-primary px-3 d-flex align-items-center gap-1"
          style={{ borderRadius: "8px", fontWeight: 600, fontSize: "13px" }}
          onClick={() => handleSend()}
          disabled={!input.trim()}
        >
          <span>Send</span>
          <i className="bi bi-send-fill" />
        </button>
      </div>
    </div>
  );
}
