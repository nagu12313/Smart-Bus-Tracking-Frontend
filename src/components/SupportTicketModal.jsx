import React, { useState, useEffect, useRef } from "react";
import supportService from "../services/supportService";
import { InlineSpinner } from "./Spinner";
import TransportChatbot from "./TransportChatbot";

const CATEGORIES = [
  { value: "BUS_DELAY", label: "Bus Delay / Schedule Issue" },
  { value: "ROUTE_ISSUE", label: "Route or Stop Location Problem" },
  { value: "DRIVER_BEHAVIOR", label: "Driver / Vehicle Concern" },
  { value: "SAFETY_CONCERN", label: "Student Safety or Emergency" },
  { value: "APP_ISSUE", label: "Tracking App / GPS Telemetry Glitch" },
  { value: "OTHER", label: "General Assistance / Other" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low", color: "#64748b", bg: "#f1f5f9" },
  { value: "MEDIUM", label: "Medium", color: "#0284c7", bg: "#e0f2fe" },
  { value: "HIGH", label: "High", color: "#d97706", bg: "#fef3c7" },
  { value: "URGENT", label: "Urgent", color: "#dc2626", bg: "#fee2e2" },
];

const STATUS_CONFIG = {
  OPEN: { label: "Open", color: "#2563eb", bg: "#eff6ff", icon: "bi-envelope-open" },
  IN_PROGRESS: { label: "In Progress", color: "#d97706", bg: "#fef3c7", icon: "bi-arrow-repeat" },
  WAITING_FOR_USER: { label: "Waiting for User", color: "#7c3aed", bg: "#ede9fe", icon: "bi-clock-history" },
  RESOLVED: { label: "Resolved", color: "#16a34a", bg: "#dcfce7", icon: "bi-check-circle" },
  CLOSED: { label: "Closed", color: "#475569", bg: "#f1f5f9", icon: "bi-x-circle" },
};

export default function SupportTicketModal({
  isOpen,
  onClose,
  currentUser,
  buses = [],
}) {
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "SCHOOL_ADMIN";

  // Active top-level section: 'menu' (2 options), 'ticket' (raise ticket / my tickets), or 'chatbot'
  // Admins are locked directly into 'ticket' section (tickets received from users)
  const [activeSection, setActiveSection] = useState(isAdmin ? "ticket" : "menu");

  // Navigation tab in ticket section: 'list' (admin), 'my' (user tickets), 'new' (submit ticket), 'detail'
  const [activeTab, setActiveTab] = useState(isAdmin ? "list" : "new");
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New ticket form state
  const [category, setCategory] = useState("BUS_DELAY");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [busId, setBusId] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Reply form state
  const [replyMessage, setReplyMessage] = useState("");
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState("");

  // Admin filter state
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [emailingReport, setEmailingReport] = useState(false);
  const [emailToast, setEmailToast] = useState("");

  const messagesEndRef = useRef(null);

  // Debounce search query to prevent excessive backend calls
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset section and tab view when modal opens
  useEffect(() => {
    if (isOpen) {
      if (isAdmin) {
        setActiveSection("ticket");
        setActiveTab("list");
      } else {
        setActiveSection("menu");
        setActiveTab("new");
      }
    }
  }, [isOpen, isAdmin]);

  // Load tickets on open or filter change
  useEffect(() => {
    if (!isOpen) return;
    loadTickets();
  }, [isOpen, activeTab, statusFilter, priorityFilter, debouncedSearch]);

  // Scroll to bottom of message thread
  useEffect(() => {
    if (selectedTicket?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedTicket?.messages]);

  async function loadTickets() {
    setLoadingTickets(true);
    try {
      if (isAdmin) {
        const params = {};
        if (statusFilter) params.status = statusFilter;
        if (priorityFilter) params.priority = priorityFilter;
        if (debouncedSearch) params.search = debouncedSearch;
        const res = await supportService.getAllTicketsAdmin(params);
        setTickets(res.content || res || []);
      } else {
        const data = await supportService.getMyTickets();
        setTickets(data);
      }
    } catch (err) {
      console.warn("Failed to fetch support tickets:", err);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function openTicketDetail(ticketId) {
    setLoadingDetail(true);
    try {
      const data = await supportService.getTicketDetails(ticketId);
      setSelectedTicket(data);
      setActiveTab("detail");
    } catch (err) {
      console.warn("Failed to load ticket details:", err);
    } finally {
      setLoadingDetail(false);
    }
  }

  // Handle file attachment encoding
  function handleFileSelect(e, setter) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be under 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setter({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileData: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }

  // Submit new ticket
  async function handleSubmitTicket(e) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!subject.trim() || !description.trim()) {
      setFormError("Please fill in both Subject and Description.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        busId: busId ? Number(busId) : null,
        attachments: attachment ? [attachment] : [],
      };

      const created = await supportService.createTicket(payload);
      setFormSuccess(`Support ticket ${created.ticketNumber} created successfully! Our transport team has been notified.`);
      setSubject("");
      setDescription("");
      setAttachment(null);
      await loadTickets();
      setTimeout(() => {
        setFormSuccess("");
        openTicketDetail(created.id);
      }, 1200);
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to submit support ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Post reply message
  async function handleSendReply(e) {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    setSendingReply(true);
    setReplyError("");
    try {
      const payload = {
        message: replyMessage.trim(),
        attachments: replyAttachment ? [replyAttachment] : [],
      };

      if (isAdmin) {
        await supportService.adminReply(selectedTicket.id, payload);
      } else {
        await supportService.postMessage(selectedTicket.id, payload);
      }

      setReplyMessage("");
      setReplyAttachment(null);
      // Reload ticket details to see updated thread & auto-status change
      const updated = await supportService.getTicketDetails(selectedTicket.id);
      setSelectedTicket(updated);
      loadTickets();
    } catch (err) {
      setReplyError(err.response?.data?.message || "Failed to send message. Please retry.");
    } finally {
      setSendingReply(false);
    }
  }

  // Admin status update
  async function handleStatusChange(newStatus) {
    if (!selectedTicket || !isAdmin) return;
    try {
      const updated = await supportService.updateStatus(selectedTicket.id, {
        status: newStatus,
        notes: `Status changed to ${newStatus} by ${currentUser?.name || "Admin"}`,
      });
      setSelectedTicket(updated);
      loadTickets();
    } catch (err) {
      alert("Failed to update status: " + (err.response?.data?.message || err.message));
    }
  }

  // Admin priority update
  async function handlePriorityChange(newPriority) {
    if (!selectedTicket || !isAdmin) return;
    try {
      const updated = await supportService.updatePriority(selectedTicket.id, {
        priority: newPriority,
        notes: `Priority adjusted to ${newPriority}`,
      });
      setSelectedTicket(updated);
      loadTickets();
    } catch (err) {
      alert("Failed to update priority: " + (err.response?.data?.message || err.message));
    }
  }

  // Admin email report dispatch
  async function handleEmailReport() {
    setEmailingReport(true);
    setEmailToast("");
    try {
      await supportService.emailAdminReport("bollanagu6868@gmail.com");
      setEmailToast("Report sent to bollanagu6868@gmail.com!");
      setTimeout(() => setEmailToast(""), 4000);
    } catch (err) {
      alert("Failed to send email report: " + (err.response?.data?.message || err.message));
    } finally {
      setEmailingReport(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div
        className="modal-card"
        style={{
          maxWidth: "850px",
          width: "92vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          overflow: "hidden",
          borderRadius: "16px",
          boxShadow: "0 20px 45px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: isAdmin ? "rgba(59, 130, 246, 0.25)" : "rgba(16, 185, 129, 0.2)",
                color: isAdmin ? "#60a5fa" : "#34d399",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
              }}
            >
              <i className={isAdmin ? "bi bi-inbox-fill" : "bi bi-headset"} />
            </div>
            <div>
              <h5 style={{ margin: 0, fontWeight: 700, fontSize: "17px", color: "#f8fafc" }}>
                {isAdmin
                  ? "Tickets Received from Users"
                  : activeSection === "chatbot"
                  ? "Campus Transport Chatbot"
                  : activeSection === "ticket"
                  ? "Raise a Support Ticket"
                  : "Need Assistance? Contact Transport"}
              </h5>
              <small style={{ color: "#94a3b8", fontSize: "11px" }}>
                {isAdmin
                  ? "Review, assign, update, and resolve support requests submitted by parents, students, and drivers"
                  : activeSection === "chatbot"
                  ? "Instant automated answers 24/7 for bus schedules, locations, and transport FAQs"
                  : activeSection === "ticket"
                  ? "Submit official tickets directly to campus transport administrators"
                  : "Choose an option below: Raise an official support ticket or chat with the Transport Bot"}
              </small>
            </div>
          </div>
          <button
            type="button"
            className="btn-close btn-close-white"
            onClick={onClose}
            aria-label="Close"
          />
        </div>

        {/* MODAL TABS / NAVIGATION BAR */}
        <div
          style={{
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            padding: "8px 20px 0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {isAdmin ? (
            /* ADMIN VIEW: ONLY TICKETS RECEIVED FROM OTHERS */
            <div className="d-flex align-items-center gap-2 mb-2">
              {activeTab === "detail" ? (
                <button
                  className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                  onClick={() => setActiveTab("list")}
                  style={{ fontSize: "12px", borderRadius: "8px", fontWeight: 600 }}
                >
                  <i className="bi bi-arrow-left" /> Back to Tickets Received
                </button>
              ) : (
                <div className="d-flex align-items-center gap-2 py-1">
                  <span
                    className="badge bg-primary-subtle text-primary border border-primary-subtle d-flex align-items-center gap-1"
                    style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px" }}
                  >
                    <i className="bi bi-inbox-fill" /> Tickets Received from Others ({tickets.length})
                  </span>
                  <small className="text-muted">Showing all incoming user support requests</small>
                </div>
              )}
            </div>
          ) : (
            /* NON-ADMIN VIEW: 2 OPTIONS (RAISE TICKET & CHATBOT) */
            <div className="d-flex align-items-center gap-2 mb-2 w-100 justify-content-between flex-wrap">
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${
                    activeSection === "menu" ? "btn-secondary" : "btn-outline-secondary"
                  } d-flex align-items-center gap-1`}
                  onClick={() => setActiveSection("menu")}
                  style={{ fontWeight: 600, fontSize: "12px", borderRadius: "8px" }}
                >
                  <i className="bi bi-grid-fill" /> Options Menu
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${
                    activeSection === "ticket" ? "btn-primary" : "btn-light border"
                  } d-flex align-items-center gap-1`}
                  onClick={() => {
                    setActiveSection("ticket");
                    if (activeTab !== "my" && activeTab !== "detail") {
                      setActiveTab("new");
                    }
                  }}
                  style={{ fontWeight: 600, fontSize: "12px", borderRadius: "8px" }}
                >
                  <i className="bi bi-ticket-perforated-fill" />
                  Option 1: Raise a Ticket
                  {tickets.length > 0 && (
                    <span className="badge bg-secondary ms-1">{tickets.length}</span>
                  )}
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${
                    activeSection === "chatbot" ? "btn-success" : "btn-light border"
                  } d-flex align-items-center gap-1`}
                  onClick={() => setActiveSection("chatbot")}
                  style={{ fontWeight: 600, fontSize: "12px", borderRadius: "8px" }}
                >
                  <span>🤖</span>
                  Option 2: Chatbot
                  <span className="badge bg-success-subtle text-success ms-1">Online</span>
                </button>
              </div>

              {/* Sub-tabs when inside 'ticket' section */}
              {activeSection === "ticket" && (
                <div className="d-flex align-items-center gap-1">
                  {activeTab === "detail" ? (
                    <button
                      className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                      onClick={() => setActiveTab("my")}
                      style={{ fontSize: "11px", borderRadius: "6px" }}
                    >
                      <i className="bi bi-arrow-left" /> Back to My Tickets
                    </button>
                  ) : (
                    <>
                      <button
                        className={`btn btn-sm ${
                          activeTab === "new" ? "btn-primary" : "btn-light"
                        } py-1 px-2`}
                        style={{ fontSize: "11px", fontWeight: 600, borderRadius: "6px" }}
                        onClick={() => {
                          setActiveTab("new");
                          setFormError("");
                          setFormSuccess("");
                        }}
                      >
                        <i className="bi bi-plus-circle me-1" /> New Ticket
                      </button>
                      <button
                        className={`btn btn-sm ${
                          activeTab === "my" ? "btn-primary" : "btn-light"
                        } py-1 px-2`}
                        style={{ fontSize: "11px", fontWeight: 600, borderRadius: "6px" }}
                        onClick={() => setActiveTab("my")}
                      >
                        <i className="bi bi-list-check me-1" /> My Tickets ({tickets.length})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL BODY */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* VIEW: NON-ADMIN 2 OPTIONS SELECTION MENU */}
          {!isAdmin && activeSection === "menu" && (
            <div className="py-3 px-1">
              <div className="text-center mb-4">
                <span
                  className="badge bg-primary-subtle text-primary border border-primary-subtle mb-2 px-3 py-2"
                  style={{ borderRadius: "20px", fontSize: "12px" }}
                >
                  CAMPUS TRANSPORT ASSISTANCE
                </span>
                <h4 style={{ fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
                  How can we assist you today?
                </h4>
                <p style={{ color: "#64748b", fontSize: "14px", maxWidth: "560px", margin: "0 auto" }}>
                  Please choose one of the two options below to get instant automated answers or submit an official ticket to transport administration.
                </p>
              </div>

              <div className="row g-4 justify-content-center mx-auto" style={{ maxWidth: "780px" }}>
                {/* CARD 1: RAISE A TICKET */}
                <div className="col-md-6">
                  <div
                    className="card h-100 p-4 border-2"
                    style={{
                      borderRadius: "18px",
                      border: "2px solid #e2e8f0",
                      cursor: "pointer",
                      background: "#ffffff",
                      boxShadow: "0 4px 18px rgba(0,0,0,0.05)",
                      transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    onClick={() => {
                      setActiveSection("ticket");
                      setActiveTab("new");
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.borderColor = "#3b82f6";
                      e.currentTarget.style.boxShadow = "0 14px 30px rgba(59, 130, 246, 0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "0 4px 18px rgba(0,0,0,0.05)";
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "16px",
                        background: "#eff6ff",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        marginBottom: "16px",
                      }}
                    >
                      <i className="bi bi-ticket-perforated-fill" />
                    </div>

                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h5 style={{ fontWeight: 800, color: "#0f172a", margin: 0, fontSize: "18px" }}>
                        Raise a Ticket
                      </h5>
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "11px" }}>
                        Official Desk
                      </span>
                    </div>

                    <p style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.6", flex: 1 }}>
                      Submit an official support ticket directly to transport administrators for bus delays, route/stop changes, lost items, or vehicle/driver concerns. View and reply to administrator updates.
                    </p>

                    <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-3">
                      <small className="text-muted fw-semibold">
                        {tickets.length > 0 ? `${tickets.length} submitted ticket(s)` : "Submit new request"}
                      </small>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary d-flex align-items-center gap-1"
                        style={{ borderRadius: "8px", fontWeight: 700 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSection("ticket");
                          setActiveTab("new");
                        }}
                      >
                        Raise Ticket <i className="bi bi-arrow-right" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARD 2: CHATBOT */}
                <div className="col-md-6">
                  <div
                    className="card h-100 p-4 border-2"
                    style={{
                      borderRadius: "18px",
                      border: "2px solid #e2e8f0",
                      cursor: "pointer",
                      background: "#ffffff",
                      boxShadow: "0 4px 18px rgba(0,0,0,0.05)",
                      transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    onClick={() => setActiveSection("chatbot")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.borderColor = "#10b981";
                      e.currentTarget.style.boxShadow = "0 14px 30px rgba(16, 185, 129, 0.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "0 4px 18px rgba(0,0,0,0.05)";
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "16px",
                        background: "#ecfdf5",
                        color: "#059669",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        marginBottom: "16px",
                      }}
                    >
                      🤖
                    </div>

                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h5 style={{ fontWeight: 800, color: "#0f172a", margin: 0, fontSize: "18px" }}>
                        Transport Chatbot
                      </h5>
                      <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "11px" }}>
                        Instant Answers
                      </span>
                    </div>

                    <p style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.6", flex: 1 }}>
                      Chat with the automated transport assistant 24/7 for instant answers on live bus locations, morning &amp; evening schedules, delay policies, driver info, and emergency contacts.
                    </p>

                    <div className="d-flex align-items-center justify-content-between pt-3 border-top mt-3">
                      <small className="text-success fw-semibold">
                        ● Online 24/7
                      </small>
                      <button
                        type="button"
                        className="btn btn-sm btn-success d-flex align-items-center gap-1"
                        style={{ borderRadius: "8px", fontWeight: 700 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSection("chatbot");
                        }}
                      >
                        Launch Chatbot <i className="bi bi-chat-dots-fill" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: TRANSPORT CHATBOT */}
          {!isAdmin && activeSection === "chatbot" && (
            <TransportChatbot
              currentUser={currentUser}
              buses={buses}
              onRaiseTicket={({ category: cat, subject: subj }) => {
                setActiveSection("ticket");
                setActiveTab("new");
                if (cat) setCategory(cat);
                if (subj) setSubject(subj);
              }}
            />
          )}

          {/* VIEW: TICKET SYSTEM (ADMIN OR NON-ADMIN RAISE TICKET) */}
          {(isAdmin || activeSection === "ticket") && (
            <>
          {/* TAB 1: NEW TICKET FORM */}
          {activeTab === "new" && (
            <form onSubmit={handleSubmitTicket}>
              {formSuccess && (
                <div className="alert alert-success d-flex align-items-center gap-2" role="alert">
                  <i className="bi bi-check-circle-fill fs-5" />
                  <div>{formSuccess}</div>
                </div>
              )}
              {formError && (
                <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
                  <i className="bi bi-exclamation-triangle-fill fs-5" />
                  <div>{formError}</div>
                </div>
              )}

              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    ISSUE CATEGORY <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    ASSOCIATED VEHICLE (OPTIONAL)
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={busId}
                    onChange={(e) => setBusId(e.target.value)}
                  >
                    <option value="">-- No specific bus --</option>
                    {buses.map((b) => (
                      <option key={b.id || b.busId} value={b.id || b.busId}>
                        {b.busNumber || b.number} - {b.busName || b.name || "Campus Shuttle"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-8">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    SUBJECT <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Brief description of the problem (e.g. Bus 1 delayed 20 mins)"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={180}
                    required
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    PRIORITY
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label} Priority
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    DETAILED DESCRIPTION <span className="text-danger">*</span>
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={4}
                    placeholder="Provide full details: what happened, time, stop location, or student details..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={4000}
                    required
                  />
                </div>

                <div className="col-12">
                  <label className="form-label fw-bold" style={{ fontSize: "12px", color: "#334155" }}>
                    ATTACH SCREENSHOT / DOCUMENT (OPTIONAL)
                  </label>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="file"
                      className="form-control form-control-sm"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => handleFileSelect(e, setAttachment)}
                    />
                    {attachment && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setAttachment(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {attachment && (
                    <small className="text-muted d-block mt-1">
                      📎 Selected: <b>{attachment.fileName}</b> (
                      {Math.round(attachment.fileSize / 1024)} KB)
                    </small>
                  )}
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    if (tickets.length > 0) {
                      setActiveTab("my");
                    } else {
                      setActiveSection("menu");
                    }
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary d-flex align-items-center gap-2 px-4"
                  disabled={submitting}
                >
                  {submitting && <InlineSpinner size="14px" />}
                  {submitting ? "Submitting Request..." : "Submit Support Request"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: TICKETS LIST (ADMIN OR USER) */}
          {(activeTab === "list" || activeTab === "my") && (
            <div>
              {/* Admin filters toolbar */}
              {isAdmin && (
                <div
                  className="p-2 mb-3 rounded"
                  style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                >
                  {emailToast && (
                    <div className="alert alert-success py-1 px-2 mb-2 d-flex align-items-center gap-2 small">
                      <i className="bi bi-envelope-check-fill" /> {emailToast}
                    </div>
                  )}
                  <div className="row g-2 align-items-center">
                    <div className="col-md-3">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white">
                          <i className="bi bi-search" />
                        </span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search tickets..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <select
                        className="form-select form-select-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="">All Statuses</option>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <select
                        className="form-select form-select-sm"
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                      >
                        <option value="">All Priorities</option>
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label} Priority
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3 text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary w-100 d-flex align-items-center justify-content-center gap-1"
                        style={{ fontSize: "11px", fontWeight: 700 }}
                        onClick={handleEmailReport}
                        disabled={emailingReport}
                        title="Email ticket report to bollanagu6868@gmail.com"
                      >
                        {emailingReport ? <InlineSpinner size="12px" /> : <i className="bi bi-envelope-fill" />}
                        {emailingReport ? "Sending..." : "Email to bollanagu6868"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loadingTickets ? (
                <div className="text-center py-5">
                  <InlineSpinner size="32px" color="#2563eb" />
                  <p className="text-muted mt-2 small">Loading support tickets...</p>
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-5">
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "50%",
                      background: "#f1f5f9",
                      color: "#94a3b8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px auto",
                      fontSize: "26px",
                    }}
                  >
                    <i className="bi bi-inbox" />
                  </div>
                  <h6 className="fw-bold text-dark">No support tickets found</h6>
                  <p className="text-muted small">
                    {isAdmin
                      ? "There are currently no tickets matching your filter."
                      : "You have not submitted any support tickets yet. Click 'New Support Request' if you need assistance."}
                  </p>
                  {!isAdmin && (
                    <button
                      className="btn btn-sm btn-primary mt-2"
                      onClick={() => setActiveTab("new")}
                    >
                      <i className="bi bi-plus-circle me-1" /> Create First Ticket
                    </button>
                  )}
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {tickets.map((t) => {
                    const st = STATUS_CONFIG[t.status] || STATUS_CONFIG.OPEN;
                    const pr = PRIORITIES.find((p) => p.value === t.priority) || PRIORITIES[1];

                    return (
                      <div
                        key={t.id}
                        className="p-3 rounded border hover-shadow"
                        onClick={() => openTicketDetail(t.id)}
                        style={{
                          background: "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          borderColor: "#e2e8f0",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#93c5fd")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="badge"
                              style={{
                                background: "#0f172a",
                                color: "#f8fafc",
                                fontFamily: "monospace",
                                fontSize: "11px",
                              }}
                            >
                              {t.ticketNumber}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background: st.bg,
                                color: st.color,
                                border: `1px solid ${st.color}33`,
                                fontSize: "11px",
                              }}
                            >
                              <i className={`bi ${st.icon} me-1`} />
                              {st.label}
                            </span>
                            <span
                              className="badge"
                              style={{
                                background: pr.bg,
                                color: pr.color,
                                fontSize: "10px",
                              }}
                            >
                              {pr.label}
                            </span>
                          </div>

                          <small className="text-muted" style={{ fontSize: "11px" }}>
                            {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}
                          </small>
                        </div>

                        <h6 className="fw-bold mb-1" style={{ color: "#0f172a", fontSize: "14px" }}>
                          {t.subject}
                        </h6>

                        <p
                          className="text-muted mb-2 small"
                          style={{
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            fontSize: "12px",
                          }}
                        >
                          {t.description}
                        </p>

                        <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                          <div className="d-flex align-items-center gap-2 small text-muted" style={{ fontSize: "11px" }}>
                            {isAdmin && (
                              <span>
                                👤 <b>{t.userName || "User"}</b> ({t.userRole})
                              </span>
                            )}
                            {t.busNumber && (
                              <span>
                                🚌 <b>{t.busNumber}</b>
                              </span>
                            )}
                            <span>
                              🏷️ {CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                            </span>
                          </div>

                          <div className="d-flex align-items-center gap-1 text-primary small fw-bold">
                            <i className="bi bi-chat-dots" />
                            <span>{t.messageCount || 0} messages</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TICKET DETAIL & CONVERSATION THREAD */}
          {activeTab === "detail" && selectedTicket && (
            <div className="d-flex flex-column h-100">
              {/* Ticket Overview Card */}
              <div
                className="p-3 mb-3 rounded"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              >
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="badge bg-dark" style={{ fontFamily: "monospace" }}>
                        {selectedTicket.ticketNumber}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: STATUS_CONFIG[selectedTicket.status]?.bg,
                          color: STATUS_CONFIG[selectedTicket.status]?.color,
                          border: `1px solid ${STATUS_CONFIG[selectedTicket.status]?.color}44`,
                        }}
                      >
                        {STATUS_CONFIG[selectedTicket.status]?.label}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: PRIORITIES.find((p) => p.value === selectedTicket.priority)?.bg,
                          color: PRIORITIES.find((p) => p.value === selectedTicket.priority)?.color,
                        }}
                      >
                        {selectedTicket.priority}
                      </span>
                    </div>
                    <h5 className="fw-bold mb-0" style={{ color: "#0f172a" }}>
                      {selectedTicket.subject}
                    </h5>
                  </div>

                  {/* Admin Action Controls */}
                  {isAdmin && (
                    <div className="d-flex align-items-center gap-2">
                      <div className="dropdown">
                        <button
                          className="btn btn-sm btn-outline-primary dropdown-toggle"
                          type="button"
                          data-bs-toggle="dropdown"
                          style={{ fontSize: "12px" }}
                        >
                          Change Status
                        </button>
                        <ul className="dropdown-menu dropdown-menu-end">
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <li key={k}>
                              <button
                                className="dropdown-item small"
                                onClick={() => handleStatusChange(k)}
                              >
                                Mark as {v.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="dropdown">
                        <button
                          className="btn btn-sm btn-outline-secondary dropdown-toggle"
                          type="button"
                          data-bs-toggle="dropdown"
                          style={{ fontSize: "12px" }}
                        >
                          Priority
                        </button>
                        <ul className="dropdown-menu dropdown-menu-end">
                          {PRIORITIES.map((p) => (
                            <li key={p.value}>
                              <button
                                className="dropdown-item small"
                                onClick={() => handlePriorityChange(p.value)}
                              >
                                {p.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "14px",
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px dashed #cbd5e1",
                  }}
                >
                  <span>
                    👤 <b>Submitted by:</b> {selectedTicket.userName} ({selectedTicket.userRole})
                  </span>
                  <span>
                    📅 <b>Date:</b> {new Date(selectedTicket.createdAt).toLocaleString()}
                  </span>
                  {selectedTicket.busNumber && (
                    <span>
                      🚌 <b>Vehicle:</b> {selectedTicket.busNumber}
                    </span>
                  )}
                  <span>
                    🏷️ <b>Category:</b>{" "}
                    {CATEGORIES.find((c) => c.value === selectedTicket.category)?.label ||
                      selectedTicket.category}
                  </span>
                </div>
              </div>

              {/* Message Thread */}
              <div
                style={{
                  maxHeight: "360px",
                  overflowY: "auto",
                  padding: "10px",
                  background: "#f1f5f9",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Initial Ticket Description as first post */}
                <div
                  style={{
                    background: "#ffffff",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    borderLeft: "4px solid #3b82f6",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fw-bold small text-primary">
                      {selectedTicket.userName} (Original Request)
                    </span>
                    <small className="text-muted" style={{ fontSize: "10px" }}>
                      {new Date(selectedTicket.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#1e293b", whiteSpace: "pre-wrap" }}>
                    {selectedTicket.description}
                  </p>

                  {/* Ticket attachments */}
                  {selectedTicket.attachments?.length > 0 && (
                    <div className="mt-2 pt-2 border-top">
                      {selectedTicket.attachments.map((att) => (
                        <div key={att.id} className="small">
                          {att.fileType?.startsWith("image/") && att.fileData ? (
                            <img
                              src={att.fileData}
                              alt={att.fileName}
                              style={{
                                maxHeight: "160px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                marginTop: "4px",
                              }}
                            />
                          ) : (
                            <span className="badge bg-light text-dark border">
                              📎 {att.fileName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Follow-up messages */}
                {selectedTicket.messages?.map((m) => {
                  const isSenderAdmin = m.isAdminReply;
                  return (
                    <div
                      key={m.id}
                      style={{
                        background: isSenderAdmin ? "#eff6ff" : "#ffffff",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        borderLeft: isSenderAdmin ? "4px solid #2563eb" : "4px solid #10b981",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <div className="d-flex align-items-center gap-1">
                          <span
                            className="fw-bold small"
                            style={{ color: isSenderAdmin ? "#1e40af" : "#047857" }}
                          >
                            {m.senderName}
                          </span>
                          <span
                            className="badge"
                            style={{
                              fontSize: "9px",
                              background: isSenderAdmin ? "#bfdbfe" : "#d1fae5",
                              color: isSenderAdmin ? "#1e3a8a" : "#065f46",
                            }}
                          >
                            {isSenderAdmin ? "Transport Admin" : "User"}
                          </span>
                        </div>
                        <small className="text-muted" style={{ fontSize: "10px" }}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                      <p style={{ margin: 0, fontSize: "13px", color: "#1e293b", whiteSpace: "pre-wrap" }}>
                        {m.message}
                      </p>

                      {m.attachments?.length > 0 && (
                        <div className="mt-2 pt-2 border-top">
                          {m.attachments.map((att) => (
                            <div key={att.id}>
                              {att.fileType?.startsWith("image/") && att.fileData ? (
                                <img
                                  src={att.fileData}
                                  alt={att.fileName}
                                  style={{
                                    maxHeight: "150px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    marginTop: "4px",
                                  }}
                                />
                              ) : (
                                <span className="badge bg-light text-dark border">
                                  📎 {att.fileName}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Composer */}
              <form onSubmit={handleSendReply} className="mt-auto">
                {replyError && (
                  <div className="alert alert-danger py-1 px-2 small mb-2">{replyError}</div>
                )}
                <div className="d-flex flex-column gap-2">
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder={
                      isAdmin
                        ? "Type official response to user..."
                        : "Reply to transport administrator..."
                    }
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    required
                  />

                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <label
                        className="btn btn-sm btn-light border d-flex align-items-center gap-1"
                        style={{ fontSize: "11px", cursor: "pointer", margin: 0 }}
                      >
                        <i className="bi bi-paperclip" />
                        {replyAttachment ? replyAttachment.fileName : "Attach file"}
                        <input
                          type="file"
                          hidden
                          accept="image/*,.pdf"
                          onChange={(e) => handleFileSelect(e, setReplyAttachment)}
                        />
                      </label>
                      {replyAttachment && (
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0 small"
                          onClick={() => setReplyAttachment(null)}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="btn btn-sm btn-primary d-flex align-items-center gap-1 px-3"
                      disabled={sendingReply}
                    >
                      {sendingReply && <InlineSpinner size="12px" />}
                      <i className="bi bi-send-fill" /> Send Reply
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
