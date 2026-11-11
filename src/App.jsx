import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import authService from "./services/authService";
import busService from "./services/busService";
import driverService from "./services/driverService";
import studentService from "./services/studentService";
import routeService from "./services/routeService";
import trackingService from "./services/trackingService";
import tripService from "./services/tripService";
import websocketService from "./services/websocketService";
import api from "./services/api";
import LiveMap from "./components/LiveMap";
import routingService, { calculateEta } from "./services/routingService";
import RouteBuilderMap from "./components/RouteBuilderMap";
import RouteListPanel from "./components/RouteListPanel";
import SmartTransportAssistantModal from "./components/SmartTransportAssistantModal";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import DriverTripsPortal from "./components/DriverTripsPortal";
import MockLiveTrackingTestScreen from "./components/MockLiveTrackingTestScreen";
import { GlobalSpinner, ContainerSpinner, InlineSpinner } from "./components/Spinner";
import { LoadingProvider, useLoading } from "./context/LoadingContext";

const Store = createContext(null);
const useStore = () => useContext(Store);

function App() {
  const [user, setUser] = useState(() => authService.getUser());
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalLoadingMsg, setGlobalLoadingMsg] = useState("Processing...");

  // Listen for global loading events from API calls
  useEffect(() => {
    const handleLoadingEvent = (e) => {
      setGlobalLoading(Boolean(e.detail?.loading));
      if (e.detail?.message) setGlobalLoadingMsg(e.detail.message);
    };
    window.addEventListener("app:global-loading", handleLoadingEvent);
    return () => window.removeEventListener("app:global-loading", handleLoadingEvent);
  }, []);

  // High-performance entity-specific refresh functions (loads ONLY the active table in milliseconds)
  const refreshBuses = useCallback(async (silent = true) => {
    try {
      const data = await busService.getAll(silent ? { skipLoading: true } : {});
      if (data) setBuses(data);
      return data;
    } catch (err) {
      console.warn("Failed to refresh buses:", err);
    }
  }, []);

  const refreshDrivers = useCallback(async (silent = true) => {
    try {
      const data = await driverService.getAll(silent ? { skipLoading: true } : {});
      if (data) setDrivers(data);
      return data;
    } catch (err) {
      console.warn("Failed to refresh drivers:", err);
    }
  }, []);

  const refreshStudents = useCallback(async (silent = true) => {
    try {
      const data = await studentService.getAll(silent ? { skipLoading: true } : {});
      if (data) setStudents(data);
      return data;
    } catch (err) {
      console.warn("Failed to refresh students:", err);
    }
  }, []);

  const refreshRoutes = useCallback(async (silent = true) => {
    try {
      const data = await routeService.getAll(silent ? { skipLoading: true } : {});
      if (data) setRoutes(data);
      return data;
    } catch (err) {
      console.warn("Failed to refresh routes:", err);
    }
  }, []);

  // Fast parallel load on authentication or mount
  const hasLoadedRef = useRef(false);
  const loadData = useCallback(async (silent = true) => {
    if (!authService.isAuthenticated()) return;
    const reqConfig = silent ? { skipLoading: true } : {};
    try {
      if (!silent) setLoading(true);
      const [busesData, driversData, studentsData, routesData] = await Promise.all([
        busService.getAll(reqConfig).catch(() => []),
        driverService.getAll(reqConfig).catch(() => []),
        studentService.getAll(reqConfig).catch(() => []),
        routeService.getAll(reqConfig).catch(() => []),
      ]);
      setBuses(busesData || []);
      setDrivers(driversData || []);
      setStudents(studentsData || []);
      setRoutes(routesData || []);

      if (user?.role === "ADMIN" || user?.role === "SCHOOL_ADMIN") {
        trackingService.getDashboard(reqConfig).then((statsData) => {
          if (statsData) setStats(statsData);
        }).catch(() => {});
      }
      hasLoadedRef.current = true;
    } catch (err) {
      console.error("Failed to load backend data:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.role]);

  // Load data once when user is authenticated or on app mount
  useEffect(() => {
    if (authService.isAuthenticated() && !hasLoadedRef.current) {
      loadData(true);
    }
  }, [user?.id, loadData]);

  const value = {
    user,
    setUser,
    buses,
    setBuses,
    drivers,
    setDrivers,
    students,
    setStudents,
    routes,
    setRoutes,
    stats,
    loading,
    globalLoading,
    setGlobalLoading,
    refreshData: loadData,
    refreshBuses,
    refreshDrivers,
    refreshStudents,
    refreshRoutes,
  };

  return (
    <LoadingProvider>
      <Store.Provider value={value}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login />} />
          <Route path="/signup" element={<Login />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </Store.Provider>
    </LoadingProvider>
  );
}

// ============================================================
// LANDING PAGE
// ============================================================
function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-icon"><i className="bi bi-bus-front-fill" /></span> EduTrack
        </Link>
        <div className="landing-auth-buttons">
          <Link className="landing-btn-signup" to="/register">
            Sign up
          </Link>
          <Link className="landing-btn-signin" to="/login">
            Sign in <i className="bi bi-arrow-right ms-1" />
          </Link>
        </div>
      </nav>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><i className="bi bi-geo-alt-fill me-2" />SMART CAMPUS TRANSPORT</span>
          <h1>Every journey.<br /><span>Safer and smarter.</span></h1>
          <p>One connected platform for schools, colleges, parents and students to stay informed about campus transportation.</p>
          <div className="hero-cta-group">
            <Link to="/login" className="btn btn-primary btn-lg rounded-pill px-4 hero-cta-btn">
              Explore dashboard <i className="bi bi-arrow-up-right ms-2" />
            </Link>
            <Link to="/register" className="btn btn-outline-light btn-lg rounded-pill px-4 hero-cta-btn">
              Create account
            </Link>
          </div>
          <div className="hero-proof">
            <span><i className="bi bi-shield-check" /> Safer journeys</span>
            <span><i className="bi bi-broadcast" /> Live GPS updates</span>
            <span><i className="bi bi-bell" /> Timely alerts</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-bus"><i className="bi bi-bus-front-fill" /></div>
          <div className="float-card card-top"><i className="bi bi-geo-alt-fill text-primary" /> Bus location <b>On route</b></div>
          <div className="float-card card-bottom"><i className="bi bi-clock-history text-success" /> Estimated arrival <b>08:25 AM</b></div>
          <div className="map-dots" />
        </div>
      </section>
      <section id="features" className="feature-section container">
        <div className="text-center mb-5">
          <span className="eyebrow dark">ONE PLATFORM, EVERY ROLE</span>
          <h2>Transportation made transparent</h2>
          <p className="muted">Tools designed around the people who keep campus journeys moving.</p>
        </div>
        <div className="row g-4">
          {[
            ["bi-speedometer2", "Live bus tracking", "See bus positions and trip status on an interactive Leaflet map."],
            ["bi-people", "Role-based dashboards", "Dedicated views for administrators, drivers, parents and students."],
            ["bi-bell", "Journey notifications", "Keep families informed about arrival and trip updates."],
          ].map((x) => (
            <div className="col-md-4" key={x[1]}>
              <div className="feature-card">
                <div className="feature-icon"><i className={`bi ${x[0]}`} /></div>
                <h5>{x[1]}</h5>
                <p>{x[2]}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer className="landing-footer">EduTrack · Smart School &amp; College Bus Tracking System</footer>
    </div>
  );
}

// ============================================================
// LOGIN & REGISTRATION PAGE — Animated Card Transition & Gmail Verification
// ============================================================
function Login() {
  const { setUser, refreshData } = useStore();
  const nav = useNavigate();
  const location = useLocation();

  const isRegisterInitial = location.pathname.includes("register") || location.pathname.includes("signup");
  const [isRegister, setIsRegister] = useState(isRegisterInitial);
  const [animClass, setAnimClass] = useState(isRegisterInitial ? "auth-anim-create" : "auth-anim-signin");

  // Sign In State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign Up State
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("PARENT");

  // Email Verification State (Gmail SMTP)
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // OTP Popup Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState("");

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotStep, setForgotStep] = useState(1); // 1: request OTP, 2: enter OTP & reset
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotCountdown, setForgotCountdown] = useState(0);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sync route
  useEffect(() => {
    const shouldBeRegister = location.pathname.includes("register") || location.pathname.includes("signup");
    if (shouldBeRegister !== isRegister) {
      setAnimClass(shouldBeRegister ? "auth-anim-create" : "auth-anim-signin");
      setIsRegister(shouldBeRegister);
      setError("");
    }
  }, [location.pathname]);

  // Resend countdown timer for register OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Resend countdown timer for forgot password OTP
  useEffect(() => {
    if (forgotCountdown <= 0) return;
    const timer = setInterval(() => {
      setForgotCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotCountdown]);

  // Forgot Password: Request OTP
  const handleSendForgotOtp = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      setForgotError("Please enter a valid registered email address.");
      return;
    }
    setForgotError("");
    setForgotSuccess("");
    setForgotLoading(true);
    try {
      await authService.forgotPassword(forgotEmail.trim());
      setForgotStep(2);
      setForgotCountdown(60);
      setForgotOtp("");
      setForgotSuccess("A 6-digit verification code has been sent to " + forgotEmail.trim());
    } catch (err) {
      setForgotError(err.response?.data?.message || "Failed to send reset code. Please ensure the email is registered.");
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot Password: Submit New Password
  const handleResetPassword = async () => {
    if (!forgotOtp.trim() || forgotOtp.trim().length !== 6) {
      setForgotError("Please enter the complete 6-digit verification code.");
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError("New password must be at least 6 characters long.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match. Please re-enter.");
      return;
    }
    setForgotError("");
    setForgotSuccess("");
    setForgotLoading(true);
    try {
      await authService.resetPassword(forgotEmail.trim(), forgotOtp.trim(), forgotNewPassword);
      setForgotSuccess("Password reset successfully! You can now log in.");
      setEmail(forgotEmail.trim());
      setPassword("");
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotOtp("");
        setForgotNewPassword("");
        setForgotConfirmPassword("");
        setForgotSuccess("");
      }, 1500);
    } catch (err) {
      setForgotError(err.response?.data?.message || "Failed to reset password. Please check your verification code.");
    } finally {
      setForgotLoading(false);
    }
  };

  // Switch to Create Account with smooth animation
  const switchToRegister = (e) => {
    if (e) e.preventDefault();
    setError("");
    setAnimClass("auth-anim-create");
    setIsRegister(true);
  };

  // Switch to Sign In with smooth animation
  const switchToSignIn = (e) => {
    if (e) e.preventDefault();
    setError("");
    setAnimClass("auth-anim-signin");
    setIsRegister(false);
  };

  // Send 6-digit verification code via Gmail SMTP & Open Modal Popup
  const handleSendOtp = async (isResendFromModal = false) => {
    if (emailVerified) return;
    if (!isResendFromModal && showOtpModal) return;
    if (sendingOtp) return;

    if (!regEmail.trim() || !regEmail.includes("@")) {
      setError("Please enter a valid email address first.");
      return;
    }
    setError("");
    setSendingOtp(true);
    setOtpError("");
    setOtpSuccess("");
    try {
      await authService.sendOtp(regEmail.trim());
      setOtpSent(true);
      setCountdown(60);
      setOtp("");
      setOtpSuccess("");
      setShowOtpModal(true); // Open Verification Popup Modal!
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to send verification code. Please check the email address.";
      if (showOtpModal) {
        setOtpError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify the 6-digit code in Popup Modal
  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      setOtpError("Please enter the complete 6-digit verification code.");
      return;
    }
    setOtpError("");
    setVerifyingOtp(true);
    try {
      await authService.verifyOtp(regEmail.trim(), otp.trim());
      setEmailVerified(true);
      setOtpSuccess("✓ Email verified successfully!");
      setTimeout(() => {
        setShowOtpModal(false);
      }, 700);
    } catch (err) {
      setOtpError(err.response?.data?.message || "Invalid or expired verification code.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Submit Login
  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user } = await authService.login(email.trim(), password);
      setUser(user);
      if (refreshData) {
        refreshData(true).catch(() => {});
      }
      nav("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.message || "Invalid credentials. Please check your email and password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Submit Registration
  const submitRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (!regName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!regEmail.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!emailVerified) {
      setError("Please verify your email address using the 6-digit code before signing up.");
      return;
    }
    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await authService.register(regName.trim(), regEmail.trim(), regPassword, regRole, otp.trim());
      setUser(user);
      if (refreshData) {
        refreshData(true).catch(() => {});
      }
      nav("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.message || "Registration failed. Please check your details.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-side">
        <Link to="/" className="brand text-white">
          <span className="brand-icon"><i className="bi bi-bus-front-fill" /></span> EduTrack
        </Link>
        <div>
          <span className="eyebrow">WELCOME TO SMART TRANSPORT</span>
          <h1>Connected campuses.<br /><span>Confident families.</span></h1>
          <p>Access your transport workspace and stay up to date with every campus journey.</p>
        </div>
        <small>Smart School &amp; College Bus Tracking System</small>
      </div>

      <div className="login-main">
        {/* Mobile Header with brand & back button */}
        <div className="login-mobile-header">
          <Link to="/" className="login-mobile-brand">
            <span className="brand-icon"><i className="bi bi-bus-front-fill" /></span>
            <span className="login-mobile-title">EduTrack</span>
          </Link>
          <Link to="/" className="login-mobile-back">
            <i className="bi bi-arrow-left me-1" /> Home
          </Link>
        </div>

        <div className="auth-stage">
          {/* Animated Container */}
          <div key={isRegister ? "register-card" : "signin-card"} className={`login-card ${animClass}`}>
            <h2>{isRegister ? "Create your account" : "Sign in to EduTrack"}</h2>
            <p className="muted mb-4">
              {isRegister
                ? "Join the campus transport platform with verified email credentials."
                : "Enter your account credentials to continue to your dashboard."}
            </p>

            {error && <div className="alert alert-danger py-2">{error}</div>}

            {/* SIGN IN VIEW */}
            {!isRegister ? (
              <form onSubmit={submitLogin}>
                <label className="form-label">Email address</label>
                <input
                  className="form-control form-control-lg mb-3"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label mb-0">Password</label>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary text-decoration-none"
                    style={{ fontSize: "13px", fontWeight: "600" }}
                    onClick={() => {
                      setForgotEmail(email || "");
                      setShowForgotModal(true);
                      setForgotStep(1);
                      setForgotError("");
                      setForgotSuccess("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  className="form-control form-control-lg mb-3"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button className="btn btn-primary btn-auth-submit w-100 rounded-pill mt-2" disabled={loading}>
                  Sign in <i className="bi bi-arrow-right ms-2" />
                </button>

                {/* Quick Demo Credentials for Testing */}
                <div className="mt-3 p-2 bg-light rounded-3 border">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-muted fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                      <i className="bi bi-lightning-charge-fill text-warning me-1" />
                      QUICK DEMO ACCOUNTS
                    </span>
                  </div>
                  <div className="auth-demo-grid">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-warning text-dark py-1 px-2 fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={() => {
                        setEmail("driver@edutrack.com");
                        setPassword("driver123");
                      }}
                      title="Driver (Assigned Trips & GPS Live Tracking)"
                    >
                      <i className="bi bi-bus-front me-1 text-primary" /> Driver
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger text-dark py-1 px-2 fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={() => {
                        setEmail("mocktest@edutrack.com");
                        setPassword("mocktest123");
                      }}
                      title="Mock Live Tracking Test Screen (Isolated Mode)"
                    >
                      <i className="bi bi-cpu-fill me-1 text-danger" /> Mock Tester
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary text-dark py-1 px-2 fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={() => {
                        setEmail("admin@edutrack.com");
                        setPassword("admin123");
                      }}
                      title="Transport Admin"
                    >
                      <i className="bi bi-shield-lock me-1 text-primary" /> Admin
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success text-dark py-1 px-2 fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={() => {
                        setEmail("parent@edutrack.com");
                        setPassword("parent123");
                      }}
                      title="Parent Tracking"
                    >
                      <i className="bi bi-people me-1 text-success" /> Parent
                    </button>
                  </div>
                </div>

                <div className="text-center mt-4 pt-2 border-top auth-bottom-switch">
                  <span className="text-muted" style={{ fontSize: "14px" }}>
                    Don't have an account?{" "}
                  </span>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary fw-bold text-decoration-none auth-link-btn"
                    onClick={switchToRegister}
                  >
                    Sign Up <i className="bi bi-arrow-right ms-1" />
                  </button>
                </div>
              </form>
            ) : (
              /* CREATE ACCOUNT VIEW (with Gmail OTP Email Verification) */
              <form onSubmit={submitRegister}>
                <label className="form-label">Full Name</label>
                <input
                  className="form-control form-control-lg mb-3"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                />

                {/* Email with Send Code action */}
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label mb-0">Email address</label>
                  {emailVerified && (
                    <span className="verified-pill">
                      <i className="bi bi-check-circle-fill" /> Verified
                    </span>
                  )}
                </div>
                <div className="input-group mb-3">
                  <input
                    className={`form-control form-control-lg ${emailVerified ? "is-valid" : ""}`}
                    type="email"
                    value={regEmail}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      setEmailVerified(false);
                      setOtpSent(false);
                      setOtp("");
                    }}
                    disabled={emailVerified || sendingOtp}
                    required
                  />
                  {!emailVerified && (
                    <button
                      type="button"
                      className="btn btn-send-code px-3 fw-bold"
                      disabled={!regEmail.trim() || !regEmail.includes("@") || showOtpModal || sendingOtp || countdown > 0}
                      onClick={() => handleSendOtp(false)}
                    >
                      {sendingOtp ? (
                        "Sending..."
                      ) : countdown > 0 ? (
                        `Resend in ${countdown}s`
                      ) : otpSent ? (
                        "Resend Code"
                      ) : (
                        "Send Code"
                      )}
                    </button>
                  )}
                </div>

                {/* Password field */}
                <label className="form-label">Password (min 6 characters)</label>
                <input
                  className="form-control form-control-lg mb-3"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  minLength={6}
                  required
                />

                {/* Role selection */}
                <label className="form-label">I am joining as a:</label>
                <select
                  className="form-select form-select-lg mb-4"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  required
                >
                  <option value="PARENT">Parent / Guardian (Track child's bus)</option>
                  <option value="STUDENT">Student / Scholar</option>
                  <option value="DRIVER">Fleet Driver</option>
                  <option value="ADMIN">Transport Administrator</option>
                </select>

                <button
                  className="btn btn-primary btn-auth-submit w-100 rounded-pill mt-2"
                  disabled={loading || !emailVerified}
                >
                  Create Account <i className="bi bi-arrow-right ms-2" />
                </button>

                <div className="text-center mt-4 pt-2 border-top auth-bottom-switch">
                  <span className="text-muted" style={{ fontSize: "14px" }}>
                    Already have an account?{" "}
                  </span>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary fw-bold text-decoration-none auth-link-btn"
                    onClick={switchToSignIn}
                  >
                    Sign In <i className="bi bi-arrow-right ms-1" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* OTP Verification Modal Popup */}
        {showOtpModal && (
          <div
            className="modal-backdrop-custom"
            style={{
              zIndex: 10000,
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <div
              className="modal-card"
              style={{
                maxWidth: "440px",
                padding: "36px 32px",
                borderRadius: "0px",
                boxShadow: "0 25px 70px rgba(0,0,0,0.35)",
                animation: "authScaleIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              {/* Centered Header Security Icon (No cancel button) */}
              <div className="d-flex justify-content-center mb-3">
                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    borderRadius: "0px",
                    background: "#eaf2ff",
                    color: "#216ee5",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "26px",
                  }}
                >
                  <i className="bi bi-shield-lock-fill" />
                </div>
              </div>

              {/* Centered Title & Subheading */}
              <h4 className="fw-bold mb-2 text-center" style={{ color: "#0f172a" }}>Verify Email Address</h4>
              <p className="text-muted small mb-4 text-center" style={{ lineHeight: "1.6" }}>
                A 6-digit verification code has been sent to <b style={{ color: "#216ee5" }}>{regEmail}</b>. Enter it below to complete verification.
              </p>

              {otpError && (
                <div className="alert alert-danger py-2 px-3 mb-3 small text-center" style={{ borderRadius: "0px" }}>
                  <i className="bi bi-exclamation-circle-fill me-1" /> {otpError}
                </div>
              )}
              {otpSuccess && (
                <div className="alert alert-success py-2 px-3 mb-3 small text-center" style={{ borderRadius: "0px" }}>
                  <i className="bi bi-check-circle-fill me-1" /> {otpSuccess}
                </div>
              )}

              {/* Centered 6-Digit OTP Field */}
              <div className="mb-4 text-center">
                <label className="form-label text-muted small fw-bold mb-2 d-block text-center">
                  ENTER 6-DIGIT CODE
                </label>
                <input
                  type="text"
                  className="form-control form-control-lg otp-input-field text-center py-2"
                  style={{ borderRadius: "0px" }}
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ""));
                    setOtpError("");
                  }}
                />
              </div>

              {/* Centered Verify Button */}
              <button
                type="button"
                className="btn btn-primary btn-lg w-100 fw-bold mb-3"
                style={{ borderRadius: "0px" }}
                disabled={otp.length !== 6 || verifyingOtp}
                onClick={handleVerifyOtp}
              >
                {verifyingOtp ? "Verifying..." : <>Verify Code <i className="bi bi-check-lg ms-1" /></>}
              </button>

              {/* Resend Action */}
              <div className="text-center">
                <small className="text-muted">
                  Didn't receive the code?{" "}
                  <button
                    type="button"
                    className="btn btn-link p-0 text-primary fw-bold text-decoration-none"
                    style={{ fontSize: "13px" }}
                    disabled={countdown > 0 || sendingOtp}
                    onClick={() => handleSendOtp(true)}
                  >
                    {sendingOtp
                      ? "Sending..."
                      : countdown > 0
                      ? `Resend in ${countdown}s`
                      : "Resend Code"}
                  </button>
                </small>
              </div>
            </div>
          </div>
        )}

        {/* Forgot Password Modal Popup */}
        {showForgotModal && (
          <div
            className="modal-backdrop-custom"
            onClick={() => {
              if (!forgotLoading) setShowForgotModal(false);
            }}
          >
            <div
              className="modal-card"
              style={{ maxWidth: "440px", borderRadius: "16px", padding: "32px 28px", position: "relative" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Icon */}
              <button
                type="button"
                className="btn-close position-absolute top-0 end-0 m-3"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close"
              />

              {/* Icon Header */}
              <div className="text-center mb-3">
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "#eff6ff",
                    color: "#2563eb",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "26px",
                    margin: "0 auto",
                  }}
                >
                  <i className="bi bi-key-fill" />
                </div>
              </div>

              <h4 className="fw-bold mb-2 text-center" style={{ color: "#0f172a" }}>
                {forgotStep === 1 ? "Reset Password" : "Set New Password"}
              </h4>
              <p className="text-muted small mb-4 text-center" style={{ lineHeight: "1.6" }}>
                {forgotStep === 1
                  ? "Enter your registered email address and we will send you a 6-digit verification code."
                  : <>A 6-digit code has been sent to <b style={{ color: "#2563eb" }}>{forgotEmail}</b>. Enter it below with your new password.</>}
              </p>

              {forgotError && (
                <div className="alert alert-danger py-2 px-3 mb-3 small text-center" style={{ borderRadius: "8px" }}>
                  <i className="bi bi-exclamation-circle-fill me-1" /> {forgotError}
                </div>
              )}
              {forgotSuccess && (
                <div className="alert alert-success py-2 px-3 mb-3 small text-center" style={{ borderRadius: "8px" }}>
                  <i className="bi bi-check-circle-fill me-1" /> {forgotSuccess}
                </div>
              )}

              {forgotStep === 1 ? (
                <div>
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold mb-1">
                      REGISTERED EMAIL
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-lg"
                      placeholder="name@example.com"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        setForgotError("");
                      }}
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg w-100 fw-bold mb-2"
                    disabled={!forgotEmail.trim() || !forgotEmail.includes("@") || forgotLoading}
                    onClick={handleSendForgotOtp}
                  >
                    {forgotLoading ? "Sending..." : "Send Reset Code"}
                  </button>
                  <div className="text-center mt-3">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-muted"
                      style={{ fontSize: "13px" }}
                      onClick={() => setShowForgotModal(false)}
                    >
                      Cancel and return to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-3 text-center">
                    <label className="form-label text-muted small fw-bold mb-1 d-block text-center">
                      ENTER 6-DIGIT CODE
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg text-center fw-bold"
                      style={{ letterSpacing: "6px", fontSize: "20px" }}
                      maxLength={6}
                      autoFocus
                      placeholder="000000"
                      value={forgotOtp}
                      onChange={(e) => {
                        setForgotOtp(e.target.value.replace(/\D/g, ""));
                        setForgotError("");
                      }}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-muted small fw-bold mb-1">
                      NEW PASSWORD
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="At least 6 characters"
                      value={forgotNewPassword}
                      onChange={(e) => {
                        setForgotNewPassword(e.target.value);
                        setForgotError("");
                      }}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="form-label text-muted small fw-bold mb-1">
                      CONFIRM NEW PASSWORD
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Re-type new password"
                      value={forgotConfirmPassword}
                      onChange={(e) => {
                        setForgotConfirmPassword(e.target.value);
                        setForgotError("");
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-lg w-100 fw-bold mb-3"
                    disabled={forgotOtp.length !== 6 || !forgotNewPassword || forgotLoading}
                    onClick={handleResetPassword}
                  >
                    {forgotLoading ? "Resetting..." : "Reset Password"}
                  </button>

                  <div className="d-flex justify-content-between align-items-center">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-muted"
                      style={{ fontSize: "12px" }}
                      onClick={() => setForgotStep(1)}
                    >
                      ← Change Email
                    </button>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-primary fw-bold"
                      style={{ fontSize: "12px" }}
                      disabled={forgotCountdown > 0 || forgotLoading}
                      onClick={handleSendForgotOtp}
                    >
                      {forgotCountdown > 0 ? `Resend in ${forgotCountdown}s` : "Resend Code"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Navigation items filtered by role
const navItems = [
  ["dashboard", "Dashboard", "bi-grid-1x2-fill", ["ADMIN", "PARENT", "STUDENT", "Admin", "Parent", "Student"]],
  ["tracking",  "Live Tracking", "bi-geo-alt-fill",  ["ADMIN", "PARENT", "STUDENT", "Admin", "Parent", "Student"]],
  ["driver-trips", "My Assigned Trips", "bi-bus-front-fill", ["DRIVER", "Driver"]],
  ["mock-test", "Mock Live Tracking", "bi-play-circle-fill", ["TEST_USER", "Test_User"]],
  ["buses",     "Bus Management", "bi-bus-front-fill", ["ADMIN", "SCHOOL_ADMIN", "Admin"]],
  ["drivers",   "Driver Management", "bi-person-badge-fill", ["ADMIN", "SCHOOL_ADMIN", "Admin"]],
  ["students",  "Student Management", "bi-mortarboard-fill", ["ADMIN", "SCHOOL_ADMIN", "Admin"]],
  ["routes",    "Route Management", "bi-signpost-2-fill", ["ADMIN", "SCHOOL_ADMIN", "Admin"]],
];

// ============================================================
// PROFILE AVATAR HELPERS
// ============================================================
function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarRoleClass(role) {
  const r = (role || "").toUpperCase();
  if (r === "ADMIN" || r === "SCHOOL_ADMIN") return "avatar-role-admin";
  if (r === "DRIVER") return "avatar-role-driver";
  if (r === "PARENT") return "avatar-role-parent";
  if (r === "STUDENT") return "avatar-role-student";
  if (r === "TEST_USER") return "avatar-role-admin";
  return "avatar-role-default";
}

// ============================================================
// PROTECTED LAYOUT
// ============================================================
function ProtectedLayout() {
  const {
    user,
    setUser,
    drivers = [],
    buses = [],
    setBuses,
    setDrivers,
    setStudents,
    setRoutes,
    setStats,
    refreshBuses,
    refreshDrivers,
    refreshStudents,
    refreshRoutes,
    refreshData,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [isRouteBuilderOpen, setIsRouteBuilderOpen] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const nav = useNavigate();
  const location = useLocation();

  // Reset any in-flight global loading on route transition & auto-close mobile drawer
  useEffect(() => {
    api.resetLoading();
    setOpen(false);
  }, [location.pathname]);

  // Click outside and escape key handling for profile dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setShowProfileModal(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  if (!user) return <Navigate to="/login" replace />;

  const logout = () => {
    authService.logout();
    setUser(null);
    if (setBuses) setBuses([]);
    if (setDrivers) setDrivers([]);
    if (setStudents) setStudents([]);
    if (setRoutes) setRoutes([]);
    if (setStats) setStats(null);
    nav("/");
  };

  const userRole = user.role?.toUpperCase();

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPEG, PNG, WEBP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.85);

        const updated = { ...user, avatar: compressed };
        setUser(updated);
        localStorage.setItem("edutrack_user", JSON.stringify(updated));
        setUploadToast("Profile picture updated!");
        setTimeout(() => setUploadToast(""), 3000);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = () => {
    const updated = { ...user, avatar: null };
    setUser(updated);
    localStorage.setItem("edutrack_user", JSON.stringify(updated));
    setUploadToast("Profile picture removed.");
    setTimeout(() => setUploadToast(""), 3000);
  };

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop Overlay */}
      {open && (
        <div
          className="sidebar-backdrop show"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${open ? "show" : ""}`}>
        <div className="sidebar-brand-row">
          <Link to="/dashboard" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-icon"><i className="bi bi-bus-front-fill" /></span> EduTrack
          </Link>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav>
          {navItems
            .filter((n) => n[3].some((r) => r.toUpperCase() === userRole))
            .map((n) => (
              <NavLink
                key={n[0]}
                to={`/${n[0]}`}
                className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <i className={`bi ${n[2]}`} />
                {n[1]}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div
            className="support-card"
            onClick={() => setShowSupportModal(true)}
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            title="Click to contact transport administrator"
          >
            <i className="bi bi-headset" />
            <b>Need assistance?</b>
            <span>Contact your transport administrator.</span>
          </div>
          <button className="side-link logout" onClick={logout}>
            <i className="bi bi-box-arrow-left" />Sign out
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setOpen(!open)}>
            <i className="bi bi-list" />
          </button>
          <div>
            <span className="top-kicker">CAMPUS TRANSPORT PORTAL</span>
            <b>{navItems.find((n) => location.pathname.includes(n[0]))?.[1] || "Dashboard"}</b>
          </div>
          <div className="top-actions" ref={dropdownRef}>
            <button
              type="button"
              className={`user-chip-btn ${dropdownOpen ? "active" : ""}`}
              onClick={() => setDropdownOpen((prev) => !prev)}
              title="Click to view profile menu"
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <div className="header-avatar-wrapper">
                <div className={`header-avatar ${getAvatarRoleClass(userRole)}`}>
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="avatar-img" />
                  ) : (
                    <span>{getInitials(user.name)}</span>
                  )}
                </div>
                <span className="avatar-online-dot" title="Active" />
              </div>
              <div className="user-chip-meta">
                <span className="user-chip-name">{user.name}</span>
                <span className="user-chip-role">{user.role}</span>
              </div>
              <i className={`bi bi-chevron-down user-chevron ${dropdownOpen ? "rotate" : ""}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {dropdownOpen && (
              <div className="profile-dropdown-menu">
                <div className="profile-menu-header">
                  <div className={`profile-menu-avatar ${getAvatarRoleClass(userRole)}`}>
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="avatar-img" />
                    ) : (
                      <span>{getInitials(user.name)}</span>
                    )}
                  </div>
                  <div className="profile-menu-info">
                    <h6 className="profile-menu-name">{user.name}</h6>
                    <span className="profile-menu-email">{user.email || `${userRole.toLowerCase()}@edutrack.com`}</span>
                    <div className="profile-menu-badges">
                      <span className={`profile-badge-role badge-${userRole.toLowerCase()}`}>{user.role}</span>
                      <span className="profile-badge-status">
                        <span className="status-dot" /> Active
                      </span>
                    </div>
                  </div>
                </div>

                <div className="profile-dropdown-divider" />

                <div className="profile-menu-items">
                  <button
                    type="button"
                    className="profile-menu-btn"
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowProfileModal(true);
                    }}
                  >
                    <i className="bi bi-person-badge" />
                    <div className="profile-menu-btn-content">
                      <b>Account Profile</b>
                      <small>View details & update photo</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="profile-menu-btn"
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowSupportModal(true);
                    }}
                  >
                    <i className="bi bi-headset" />
                    <div className="profile-menu-btn-content">
                      <b>Helpdesk &amp; Support</b>
                      <small>Submit tickets &amp; view replies</small>
                    </div>
                  </button>
                </div>

                <div className="profile-dropdown-divider" />

                <button
                  type="button"
                  className="profile-menu-btn logout-btn"
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                >
                  <i className="bi bi-box-arrow-right" />
                  <div className="profile-menu-btn-content">
                    <b>Sign out</b>
                    <small>End current secure session</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </header>
        <div className={`page-content ${location.pathname === "/tracking" || (location.pathname === "/routes" && isRouteBuilderOpen) ? "page-content-flush" : ""}`}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/driver-trips" element={<Dashboard />} />
            <Route path="/mock-test" element={<Dashboard />} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/buses" element={<Buses />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/students" element={<Students />} />
            <Route path="/routes" element={<RoutesPage onBuilderStateChange={setIsRouteBuilderOpen} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      {/* Interactive Account & Photo Modal */}
      {showProfileModal && (
        <div className="modal-backdrop-custom" onClick={() => setShowProfileModal(false)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">User Account Profile</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowProfileModal(false)}
                aria-label="Close"
              />
            </div>

            {uploadToast && (
              <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
                <i className="bi bi-check-circle-fill" /> {uploadToast}
              </div>
            )}

            <div className="profile-modal-body">
              <div className="profile-photo-upload-section">
                <div className={`profile-photo-preview ${getAvatarRoleClass(userRole)}`}>
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} />
                  ) : (
                    <span>{getInitials(user.name)}</span>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: "none" }}
                  onChange={handlePhotoUpload}
                />

                <div className="profile-photo-buttons">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary rounded-pill px-3"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <i className="bi bi-camera me-1" />
                    {user.avatar ? "Change Photo" : "Upload Photo"}
                  </button>
                  {user.avatar && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger rounded-pill px-3"
                      onClick={handleRemovePhoto}
                    >
                      <i className="bi bi-trash me-1" />
                      Remove
                    </button>
                  )}
                </div>
                <small className="text-muted mt-2" style={{ fontSize: "11px" }}>
                  Supports PNG, JPG, or WEBP (automatically optimized)
                </small>
              </div>

              <div className="profile-detail-grid">
                <div className="profile-detail-card">
                  <label>Full Name</label>
                  <span>{user.name}</span>
                </div>
                <div className="profile-detail-card">
                  <label>Role</label>
                  <span className={`badge bg-light text-primary border`}>{user.role}</span>
                </div>
                <div className="profile-detail-card" style={{ gridColumn: "span 2" }}>
                  <label>Email Address</label>
                  <span>{user.email || `${userRole.toLowerCase()}@edutrack.com`}</span>
                </div>
                <div className="profile-detail-card">
                  <label>User ID</label>
                  <span>#{user.id || user.userId || "1"}</span>
                </div>
                <div className="profile-detail-card">
                  <label>Account Status</label>
                  <span className="text-success"><i className="bi bi-shield-check me-1" />Verified Active</span>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-2 border-top">
              <button
                type="button"
                className="btn btn-primary rounded-pill px-4"
                onClick={() => setShowProfileModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Transport Assistant Chatbot Modal */}
      <SmartTransportAssistantModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        currentUser={user}
      />
    </div>
  );
}

function PageTitle({ eyebrow, title, description, action }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow dark">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Stat({ icon, label, value, detail, tone = "blue" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><i className={`bi ${icon}`} /></div>
      <div>
        <span>{label}</span>
        <h3>{value ?? 0}</h3>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Status({ value }) {
  const norm = String(value || "").toUpperCase();
  const cls = norm === "ON_ROUTE" || norm === "ON ROUTE" || norm === "ACTIVE"
    ? "success"
    : norm === "AT_STOP" || norm === "AT STOP"
    ? "warning"
    : norm === "OFFLINE" || norm === "INACTIVE"
    ? "muted"
    : "info";
  return (
    <span className={`status status-${cls}`}>
      <i />{value}
    </span>
  );
}

// ============================================================
// ADMIN DASHBOARD — Centralized Live Fleet Telemetry & Shared Map
// ============================================================
function Dashboard() {
  const { user, buses, drivers, students, routes, stats, loading } = useStore();
  const [liveLocationsMap, setLiveLocationsMap] = useState({});

  const role = user.role?.toUpperCase();

  // Centralized single source of truth: fetch all latest locations on mount
  useEffect(() => {
    if (role === "PARENT" || role === "STUDENT" || role === "DRIVER" || role === "TEST_USER") return;

    trackingService
      .getAllLatest()
      .then((locs) => {
        if (locs && Array.isArray(locs)) {
          const map = {};
          locs.forEach((l) => { map[l.busId] = l; });
          setLiveLocationsMap(map);
        }
      })
      .catch(() => {});

    // Monotonic WebSocket subscription to prevent out-of-order packets
    const unsub = websocketService.subscribe("/topic/tracking", (incoming) => {
      if (!incoming || !incoming.busId) return;
      setLiveLocationsMap((prev) => {
        const existing = prev[incoming.busId];
        const existingTime = new Date(existing?.gpsTime || existing?.receivedAt || 0).getTime();
        const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || 0).getTime();
        if (incomingTime < existingTime) return prev; // Monotonic guard
        return { ...prev, [incoming.busId]: incoming };
      });
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [role]);

  if (role === "TEST_USER") return <MockLiveTrackingTestScreen />;
  if (role === "PARENT" || role === "STUDENT") return <FamilyDashboard />;
  if (role === "DRIVER") return <DriverTripsPortal user={user} />;

  if (loading && buses.length === 0 && !stats) {
    return <ContainerSpinner minHeight="350px" />;
  }

  const totalBuses = stats?.totalBuses ?? buses.length;
  const activeTrips = stats?.activeTrips ?? buses.filter((b) => {
    const live = liveLocationsMap[b.id];
    return (live?.speed && live.speed > 0) || live?.status === "ON_ROUTE" || b.status === "ON_ROUTE";
  }).length;
  const totalStudents = stats?.totalStudents ?? students.length;
  const totalDrivers = stats?.totalDrivers ?? drivers.length;

  // Adapt buses for shared LiveMap component — strictly active vehicles only (parked hidden)
  const adminMapBuses = buses
    .map((b) => {
      const live = liveLocationsMap[b.id];
      const isFresh = live && !live.isStale && live.gpsTime && (Date.now() - new Date(live.gpsTime).getTime()) < 180000;
      return {
        ...b,
        busId: b.id,
        busNumber: b.busNumber || b.number || `Bus ${b.id}`,
        busName: b.busName || b.name || "School Bus",
        driverName: b.driverName || "Assigned Driver",
        driverPhone: b.driverPhone || "",
        status: isFresh ? (live.status || b.status) : (b.status || "PARKED"),
        latitude: live?.latitude ?? b.latitude ?? 17.4475,
        longitude: live?.longitude ?? b.longitude ?? 78.3762,
        rawLatitude: live?.rawLatitude ?? live?.latitude ?? b.latitude,
        rawLongitude: live?.rawLongitude ?? live?.longitude ?? b.longitude,
        snappedLatitude: live?.snappedLatitude,
        snappedLongitude: live?.snappedLongitude,
        isRoadMatched: live?.isRoadMatched,
        roadName: live?.roadName,
        accuracy: live?.accuracy,
        accuracyDescription: live?.accuracyDescription,
        locationName: live?.locationName,
        nearbyLandmark: live?.nearbyLandmark,
        speed: isFresh ? (live.speed ?? 0) : 0,
        heading: isFresh && live.heading != null ? live.heading : null,
        gpsTime: live?.gpsTime ?? null,
        isStale: !isFresh,
      };
    })
    .filter((b) => {
      const status = String(b.status || "").toUpperCase();
      const isParkedOrInactive =
        status === "PARKED" ||
        status === "INACTIVE" ||
        status === "STANDBY" ||
        status === "STOPPED" ||
        status === "MAINTENANCE" ||
        status === "COMPLETED";

      if (isParkedOrInactive && b.speed <= 0 && status !== "ON_ROUTE" && status !== "IN_PROGRESS") {
        return false;
      }

      return status === "ON_ROUTE" || status === "IN_PROGRESS" || status === "ACTIVE" || b.speed > 0;
    });

  return (
    <>
      <PageTitle
        eyebrow="OVERVIEW"
        title="Good morning, Admin 👋"
        description="Here is what's happening across your campus transport network today."
        action={
          <span className="date-pill">
            <i className="bi bi-calendar3" />{" "}
            {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        }
      />
      <div className="stats-grid">
        <Stat icon="bi-bus-front" label="Total buses" value={totalBuses} detail="Registered fleet" tone="blue" />
        <Stat icon="bi-broadcast" label="Active trips" value={activeTrips} detail="Currently on route" tone="green" />
        <Stat icon="bi-people" label="Total students" value={totalStudents} detail="Transport assigned" tone="purple" />
        <Stat icon="bi-person-badge" label="Drivers" value={totalDrivers} detail="Registered drivers" tone="orange" />
      </div>

      {/* Centralized Live Fleet Map Widget (Admin / School Admin View) */}
      <section className="panel mb-4 p-0 overflow-hidden" style={{ borderRadius: "14px", border: "1px solid #e2e8f0" }}>
        <div className="p-3 bg-white border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h5 className="mb-0 fw-bold text-dark">
              <i className="bi bi-broadcast text-success me-2" />
              Live Fleet Movement &amp; Telemetry
            </h5>
            <small className="text-muted">
              Centralized Single Source of Truth · Real-time driver GPS synchronization across all campus vehicles
            </small>
          </div>
          <Link to="/tracking" className="btn btn-sm btn-primary rounded-pill px-3">
            Open Interactive Fleet Tracking <i className="bi bi-arrow-up-right ms-1" />
          </Link>
        </div>
        <div style={{ height: "340px", width: "100%", position: "relative" }}>
          <LiveMap buses={adminMapBuses} />
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h5>Live fleet overview</h5>
              <p>Real-time telemetry and verified locations for all buses</p>
            </div>
            <Link to="/tracking">View full map <i className="bi bi-arrow-up-right" /></Link>
          </div>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>BUS</th>
                  <th>ROUTE</th>
                  <th>DRIVER</th>
                  <th>CURRENT LOCATION</th>
                  <th>SPEED</th>
                  <th>STATUS</th>
                  <th>LAST UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {buses.map((b) => {
                  const live = liveLocationsMap[b.id];
                  const isFresh = live && !live.isStale && live.gpsTime && (Date.now() - new Date(live.gpsTime).getTime()) < 180000;
                  const curSpeed = isFresh ? Math.round(Number(live.speed || 0)) : 0;
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="table-primary">{b.busNumber || b.number}</div>
                        <small>{b.busName || b.name}</small>
                      </td>
                      <td>{b.routeName || routes.find((r) => r.id === b.routeId)?.name || "Unassigned"}</td>
                      <td>{b.driverName || drivers.find((d) => d.id === b.driverId)?.name || "Unassigned"}</td>
                      <td>
                        <div style={{ maxWidth: "200px" }}>
                          <span className="fw-semibold text-truncate d-block" style={{ fontSize: "12px" }} title={live?.locationName || "On Campus Route"}>
                            📍 {live?.locationName || "On Campus Network"}
                          </span>
                          {live?.nearbyLandmark && (
                            <small className="text-muted text-truncate d-block" style={{ fontSize: "10px" }} title={live.nearbyLandmark}>
                              🏛️ {live.nearbyLandmark}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <b style={{ color: curSpeed > 0 ? "#0284c7" : "#64748b" }}>
                          {curSpeed} km/h
                        </b>
                      </td>
                      <td><Status value={isFresh ? (live?.status || b.status) : (b.status || "PARKED")} /></td>
                      <td>
                        <small className="text-muted" style={{ fontSize: "11px" }}>
                          {live?.gpsTime
                            ? new Date(live.gpsTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                            : "Standby"}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h5>Quick actions</h5>
              <p>Manage your transport network</p>
            </div>
          </div>
          <Link to="/buses" className="quick-link">
            <span className="quick-icon"><i className="bi bi-plus-circle" /></span>
            <span><b>Add a bus</b><small>Register a new vehicle</small></span>
            <i className="bi bi-chevron-right" />
          </Link>
          <Link to="/students" className="quick-link">
            <span className="quick-icon purple"><i className="bi bi-person-plus" /></span>
            <span><b>Add a student</b><small>Manage student assignments</small></span>
            <i className="bi bi-chevron-right" />
          </Link>
          <Link to="/routes" className="quick-link">
            <span className="quick-icon orange"><i className="bi bi-signpost" /></span>
            <span><b>Manage routes</b><small>Update stops and routes</small></span>
            <i className="bi bi-chevron-right" />
          </Link>
        </section>
      </div>
      <section className="panel mt-4">
        <div className="panel-heading">
          <div>
            <h5>Transport directory</h5>
            <p>At-a-glance network summary</p>
          </div>
        </div>
        <div className="directory-grid">
          <div><i className="bi bi-signpost-2" /><span>{routes.length} routes configured</span></div>
          <div><i className="bi bi-person-check" /><span>{drivers.filter((d) => d.status === "ACTIVE" || d.status === "Active").length} active drivers</span></div>
          <div><i className="bi bi-mortarboard" /><span>{students.length} students assigned</span></div>
        </div>
      </section>
    </>
  );
}

// ============================================================
// FAMILY / STUDENT / PARENT DASHBOARD — with Student Search & Instant Telemetry
// ============================================================
function FamilyDashboard() {
  const { user, buses, students, routes, loading } = useStore();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(() => {
    const matched = students.find((s) => s.email === user.email || s.parentName === user.name || s.name === user.name);
    return matched ? matched.id : students[0]?.id || null;
  });

  const [busLive, setBusLive] = useState(null);
  const [routeStops, setRouteStops] = useState([]);

  useEffect(() => {
    if (!selectedStudentId && students.length > 0) {
      const matched = students.find((s) => s.email === user.email || s.parentName === user.name || s.name === user.name);
      setSelectedStudentId(matched ? matched.id : students[0].id);
    }
  }, [students, user, selectedStudentId]);

  const student = students.find((s) => s.id === selectedStudentId) ||
                  students.find((s) => s.email === user.email || s.name === user.name) ||
                  students[0];
  const bus = buses.find((b) => b.id === student?.busId) || buses[0];
  const route = routes.find((r) => r.id === bus?.routeId);

  // Centralized Single Source of Truth: load latest location for assigned bus on mount / student switch
  useEffect(() => {
    if (!bus?.id) return;

    trackingService
      .getLatestLocation(bus.id)
      .then((loc) => setBusLive(loc))
      .catch(() => {});

    if (bus.routeId) {
      routeService
        .getById(bus.routeId)
        .then((r) => setRouteStops(r?.stops || []))
        .catch(() => setRouteStops([]));
    }
  }, [bus?.id, bus?.routeId]);

  // Real-time synchronization via WebSocket with monotonic timestamp ordering guard
  useEffect(() => {
    if (!bus?.id) return;

    const unsubBus = websocketService.subscribe(`/topic/bus/${bus.id}`, (incoming) => {
      if (!incoming) return;
      setBusLive((prev) => {
        const existingTime = new Date(prev?.gpsTime || prev?.receivedAt || 0).getTime();
        const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || 0).getTime();
        if (incomingTime < existingTime) return prev; // Monotonic guard: discard out-of-order delayed update
        return { ...prev, ...incoming };
      });
    });

    const unsubAll = websocketService.subscribe("/topic/tracking", (incoming) => {
      if (!incoming || String(incoming.busId) !== String(bus.id)) return;
      setBusLive((prev) => {
        const existingTime = new Date(prev?.gpsTime || prev?.receivedAt || 0).getTime();
        const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || 0).getTime();
        if (incomingTime < existingTime) return prev; // Monotonic guard
        return { ...prev, ...incoming };
      });
    });

    return () => {
      if (typeof unsubBus === "function") unsubBus();
      if (typeof unsubAll === "function") unsubAll();
    };
  }, [bus?.id]);

  if (loading && students.length === 0) {
    return <ContainerSpinner minHeight="350px" />;
  }

  // Filter students based on parent search input
  const matchedStudents = useMemo(() => {
    if (!studentSearch.trim()) return [];
    const q = studentSearch.toLowerCase();
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.rollNumber?.toLowerCase().includes(q) ||
        s.className?.toLowerCase().includes(q) ||
        s.parentName?.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const isBusActive = (busLive?.speed && busLive.speed > 0) || busLive?.status === "ON_ROUTE" || bus?.status === "ON_ROUTE";

  return (
    <>
      <PageTitle
        eyebrow={`${user.role.toUpperCase()} PORTAL`}
        title={user.role.toUpperCase() === "PARENT" ? "Your child's journey" : "Your campus transport"}
        description="Stay informed with real-time student tracking, assigned bus details, and driver live coordinates."
      />

      {/* PARENT SEARCH STUDENT BAR */}
      <div className="panel mb-4 p-3" style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
        <div className="row g-2 align-items-center">
          <div className="col-lg-7 col-md-6">
            <label className="form-label mb-1" style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>
              <i className="bi bi-search text-primary me-1" /> SEARCH STUDENT NAME TO TRACK LIVE BUS:
            </label>
            <div className="input-group">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-mortarboard-fill text-primary" />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-0"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              {studentSearch && (
                <button
                  className="btn btn-outline-secondary border-start-0"
                  type="button"
                  onClick={() => setStudentSearch("")}
                >
                  <i className="bi bi-x-lg" />
                </button>
              )}
            </div>
          </div>
          <div className="col-lg-5 col-md-6 d-flex flex-column align-items-md-end justify-content-end">
            <label className="form-label mb-1" style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>
              SELECT REGISTERED STUDENT:
            </label>
            {students.length > 0 && (
              <select
                className="form-select"
                style={{ maxWidth: "280px" }}
                value={student?.id || ""}
                onChange={(e) => {
                  const sid = Number(e.target.value);
                  setSelectedStudentId(sid);
                }}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.rollNumber || s.className})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Search Results Dropdown/Chips */}
        {studentSearch.trim() && (
          <div className="mt-3 pt-2 border-top">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <small className="text-muted fw-bold">
                MATCHING STUDENTS ({matchedStudents.length})
              </small>
              <button
                className="btn btn-link btn-sm p-0 text-muted"
                onClick={() => setStudentSearch("")}
              >
                Close
              </button>
            </div>
            {matchedStudents.length === 0 ? (
              <div className="text-muted small py-2">
                No students found matching "{studentSearch}".
              </div>
            ) : (
              <div className="d-flex flex-wrap gap-2">
                {matchedStudents.map((s) => {
                  const sBus = buses.find((b) => b.id === s.busId);
                  const isCurrent = student?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn btn-sm text-start rounded-3 px-3 py-2 ${
                        isCurrent ? "btn-primary" : "btn-light border"
                      }`}
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setStudentSearch("");
                      }}
                    >
                      <div className="fw-bold">{s.name}</div>
                      <div className="small opacity-75" style={{ fontSize: "11px" }}>
                        {s.className} · Roll: {s.rollNumber || "N/A"}
                        {sBus ? ` · Bus: ${sBus.busNumber}` : " · No Bus Assigned"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="family-grid">
        <div className="panel child-card">
          <div className="child-head">
            <div className={`avatar large ${getAvatarRoleClass(userRole)}`}>
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="avatar-img" />
              ) : (
                <span>{getInitials(student?.name || user.name)}</span>
              )}
            </div>
            <div>
              <small>{user.role.toUpperCase() === "PARENT" ? "ACTIVE STUDENT PROFILE" : "MY PROFILE"}</small>
              <h4>{student?.name || user.name}</h4>
              <span>{student?.className} · Roll: {student?.rollNumber || student?.roll || "N/A"}</span>
            </div>
          </div>
          <div className="detail-line"><span>Assigned bus</span><b>{bus?.busNumber || bus?.number || "Not assigned"}</b></div>
          <div className="detail-line"><span>Assigned driver</span><b>{bus?.driverName || "Assigned Driver"}</b></div>
          {bus?.driverPhone && (
            <div className="detail-line">
              <span>Driver phone</span>
              <b>
                <a href={`tel:${bus.driverPhone}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                  <i className="bi bi-telephone-fill me-1" />{bus.driverPhone}
                </a>
              </b>
            </div>
          )}
          <div className="detail-line"><span>Pickup stop</span><b>{student?.pickupStopName || student?.stop || "Campus Stop"}</b></div>
          <div className="detail-line"><span>Route</span><b>{route?.name || "Campus Route"}</b></div>
          <Link
            to={bus ? `/tracking?studentId=${student?.id || ''}&busId=${bus?.id || ''}` : "/tracking"}
            className="btn btn-primary rounded-pill w-100 mt-3"
          >
            <i className="bi bi-geo-alt-fill me-1" /> Full Screen Bus Tracking <i className="bi bi-arrow-up-right ms-1" />
          </Link>
        </div>

        <div className="panel journey-card">
          <div className="panel-heading">
            <div>
              <h5>Today's journey</h5>
              <p>Real-time driver GPS telemetry &amp; live verified position</p>
            </div>
            <Status value={busLive?.status || (isBusActive ? "ON_ROUTE" : (bus?.status || "OFFLINE"))} />
          </div>
          <div className="journey-visual">
            <i className="bi bi-bus-front-fill" />
            <div>
              <b>{bus?.busNumber || bus?.number || "No bus assigned"}</b>
              <span>{isBusActive ? "Driver is currently on route with live GPS active" : "Vehicle is currently stationary / at campus terminal"}</span>
            </div>
          </div>
          <div className="detail-line">
            <span>Live GPS Telemetry</span>
            <b style={{ color: isBusActive ? "#15803d" : "#64748b" }}>
              <i className="bi bi-broadcast me-1" />
              {isBusActive
                ? `Active at ${Math.round(busLive?.speed ?? 0)} km/h · ${busLive?.accuracyDescription || "±8m"}`
                : (busLive?.isStale ? "Parked / Off-duty" : "Standing by")}
            </b>
          </div>
          {busLive?.locationName && (
            <div className="detail-line">
              <span>Verified Location</span>
              <b className="text-primary text-truncate" style={{ maxWidth: "220px" }} title={busLive.locationName}>
                📍 {busLive.locationName}
              </b>
            </div>
          )}
          {busLive?.nearbyLandmark && (
            <div className="detail-line">
              <span>Nearby Landmark</span>
              <b className="text-secondary text-truncate" style={{ maxWidth: "220px" }} title={busLive.nearbyLandmark}>
                🏛️ {busLive.nearbyLandmark}
              </b>
            </div>
          )}
          <div className="detail-line">
            <span>Last Updated</span>
            <b className="text-muted">
              {busLive?.gpsTime
                ? new Date(busLive.gpsTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : "Standby"}
            </b>
          </div>
          <div className="detail-line"><span>Assigned Driver</span><b>{bus?.driverName || "Assigned Driver"}</b></div>
          <div className="detail-line"><span>Route distance</span><b>{route?.distance || "12 km"}</b></div>
          <div className="notice"><i className="bi bi-shield-check" /> Driver live location is securely streamed to parents and students in real-time.</div>
        </div>
      </div>

      {/* Embedded Centralized Live Bus Map Widget (Parent / Student View) */}
      {bus && (
        <div className="panel mt-4 p-0 overflow-hidden" style={{ borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div className="p-3 bg-white border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h5 className="mb-0 fw-bold text-dark">
                <i className="bi bi-map-fill text-primary me-2" />
                Live Bus Location — {bus.busNumber || bus.number} ({bus.busName || "Campus Shuttle"})
              </h5>
              <small className="text-muted">
                Synchronized directly with driver's real-time hardware GPS · Single Source of Truth
              </small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className={`badge ${isBusActive ? "bg-success" : "bg-secondary"} px-3 py-2 rounded-pill`}>
                {isBusActive ? "🔴 LIVE IN TRANSIT" : (busLive?.status || "STANDBY")}
              </span>
              <Link to={`/tracking?busId=${bus.id}`} className="btn btn-sm btn-outline-primary rounded-pill px-3">
                Full Screen Tracking <i className="bi bi-arrow-up-right ms-1" />
              </Link>
            </div>
          </div>
          <div style={{ height: "360px", width: "100%", position: "relative" }}>
            <LiveMap
              buses={
                isBusActive
                  ? [{
                      ...bus,
                      latitude: busLive?.latitude ?? bus?.latitude ?? 17.4475,
                      longitude: busLive?.longitude ?? bus?.longitude ?? 78.3762,
                      rawLatitude: busLive?.rawLatitude ?? busLive?.latitude ?? bus?.latitude,
                      rawLongitude: busLive?.rawLongitude ?? busLive?.longitude ?? bus?.longitude,
                      snappedLatitude: busLive?.snappedLatitude,
                      snappedLongitude: busLive?.snappedLongitude,
                      isRoadMatched: busLive?.isRoadMatched,
                      roadName: busLive?.roadName,
                      speed: busLive?.speed ?? 0,
                      heading: busLive?.heading,
                      accuracy: busLive?.accuracy,
                      accuracyDescription: busLive?.accuracyDescription,
                      locationName: busLive?.locationName,
                      nearbyLandmark: busLive?.nearbyLandmark,
                      status: busLive?.status || bus?.status || "STANDBY",
                      gpsTime: busLive?.gpsTime,
                      isStale: busLive?.isStale,
                    }]
                  : []
              }
              selectedBusId={isBusActive ? bus.id : null}
              routeStops={isBusActive ? routeStops : []}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// DRIVER WORKSPACE — Assigned Trips & Direct Live Tracking
// ============================================================
function DriverDashboard() {
  const { user } = useStore();
  return <DriverTripsPortal user={user} />;
}

// ============================================================
// LIVE TRACKING — Real Leaflet Map with Yellow School Buses & Behance Fleet Slide-in
// Matches uploaded Behance design: All live buses, road routes for selected bus,
// slide-in panel with Active/Parked/All tabs, full telemetry and actions.
// ============================================================
function Tracking() {
  const { user, buses, routes, drivers, students, loading } = useStore();
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlBusId = queryParams.get("busId");

  const [liveLocations, setLiveLocations] = useState([]);
  // Initial selectedId is null unless explicitly passed in URL
  // Requirement 4: Before any bus is selected: Display all live buses on the map. Do NOT display any route lines or stop markers.
  const [selectedId, setSelectedId] = useState(urlBusId ? Number(urlBusId) : null);
  const [routeStops, setRouteStops] = useState([]);
  const [historyTrail, setHistoryTrail] = useState([]);
  const [showTrail, setShowTrail] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Behance Admin View Bus Tracking Slide-in State
  const [busSearchQuery, setBusSearchQuery] = useState("");
  const [drawerFilterTab, setDrawerFilterTab] = useState("ACTIVE"); // 'ACTIVE' | 'PARKED' | 'ALL'
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Live GPS telemetry refresh states
  const [lastUpdated, setLastUpdated] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [isGpsRefreshing, setIsGpsRefreshing] = useState(false);
  const [isStationaryPaused, setIsStationaryPaused] = useState(false);

  // Tracking polling & movement references
  const unchangedCountRef = useRef(0);
  const prevLocationHashRef = useRef("");

  // Role-based fleet filtering:
  // - PARENT & STUDENT: their student's assigned bus
  // - DRIVER: their vehicle
  // - ADMIN / SCHOOL_ADMIN: all vehicles in the fleet
  const visibleBuses = useMemo(() => {
    if (!user) return buses;
    if (user.role === "PARENT" || user.role === "STUDENT") {
      const myStudent = students.find((s) => s.email === user.email || s.parentName === user.name || s.name === user.name) || students[0];
      if (myStudent?.busId) {
        const myBus = buses.filter((b) => b.id === myStudent.busId);
        if (myBus.length > 0) return myBus;
      }
      return buses.slice(0, 1);
    }
    if (user.role === "DRIVER") {
      const myDriver = drivers.find((d) => d.email === user.email || d.name === user.name) || drivers[0];
      if (myDriver?.id) {
        const myBus = buses.filter((b) => b.driverId === myDriver.id);
        if (myBus.length > 0) return myBus;
      }
      return buses.slice(0, 1);
    }
    return buses;
  }, [user, buses, students, drivers]);

  // Selected bus object
  const selectedBus = useMemo(() => {
    if (!selectedId) return null;
    return visibleBuses.find((b) => b.id === Number(selectedId)) || null;
  }, [visibleBuses, selectedId]);

  const liveForSelected = useMemo(() => {
    if (!selectedBus) return null;
    return liveLocations.find((l) => String(l.busId) === String(selectedBus.id)) || null;
  }, [liveLocations, selectedBus]);

  const selectedRoute = useMemo(() => {
    if (!selectedBus?.routeId) return null;
    return routes.find((r) => r.id === selectedBus.routeId) || null;
  }, [routes, selectedBus]);

  // Filter live locations
  const visibleLiveLocations = useMemo(() => {
    const allowed = new Set(visibleBuses.map((b) => b.id));
    return liveLocations.filter((l) => allowed.has(l.busId));
  }, [liveLocations, visibleBuses]);

  // Behance Drawer Tabs: Active, Parked, and All count
  const activeBusesCount = useMemo(() => {
    return visibleBuses.filter((b) => {
      const live = visibleLiveLocations.find((l) => l.busId === b.id);
      return (live?.speed && live.speed > 0) || live?.status === "ON_ROUTE" || b.status === "ON_ROUTE" || b.status === "On Route";
    }).length;
  }, [visibleBuses, visibleLiveLocations]);

  const parkedBusesCount = useMemo(() => {
    return Math.max(0, visibleBuses.length - activeBusesCount);
  }, [visibleBuses, activeBusesCount]);

  const drawerFilteredBuses = useMemo(() => {
    return visibleBuses.filter((b) => {
      const live = visibleLiveLocations.find((l) => l.busId === b.id);
      const isActive = (live?.speed && live.speed > 0) || live?.status === "ON_ROUTE" || b.status === "ON_ROUTE" || b.status === "On Route";

      if (drawerFilterTab === "ACTIVE" && !isActive) return false;
      if (drawerFilterTab === "PARKED" && isActive) return false;

      if (busSearchQuery.trim()) {
        const q = busSearchQuery.toLowerCase();
        const num = (b.busNumber || b.number || "").toLowerCase();
        const name = (b.busName || b.name || "").toLowerCase();
        const rName = (b.routeName || "").toLowerCase();
        const dName = (b.driverName || "").toLowerCase();
        return num.includes(q) || name.includes(q) || rName.includes(q) || dName.includes(q);
      }
      return true;
    });
  }, [visibleBuses, visibleLiveLocations, drawerFilterTab, busSearchQuery]);

  // Location fingerprint to detect movement / stationary status
  const getLocationHash = (locations) => {
    if (!locations || locations.length === 0) return "";
    return locations
      .map((l) => `${l.busId}:${Number(l.latitude || 0).toFixed(5)}:${Number(l.longitude || 0).toFixed(5)}:${Number(l.speed || 0).toFixed(1)}`)
      .sort()
      .join("|");
  };

  // Poll latest GPS updates
  const fetchLocations = useCallback(async (isInitial = false) => {
    try {
      if (!isInitial) setIsGpsRefreshing(true);
      const locs = await trackingService.getAllLatest();
      if (locs && locs.length > 0) {
        setLiveLocations(locs);
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        );

        const currentHash = getLocationHash(locs);
        if (!isInitial) {
          if (currentHash && currentHash === prevLocationHashRef.current) {
            unchangedCountRef.current += 1;
            if (unchangedCountRef.current >= 3) {
              setIsStationaryPaused(true);
            }
          } else {
            prevLocationHashRef.current = currentHash;
            unchangedCountRef.current = 0;
            setIsStationaryPaused(false);
          }
        } else {
          prevLocationHashRef.current = currentHash;
          unchangedCountRef.current = 0;
        }
      }
    } catch {
      // ignore transient network glitch in background polling
    } finally {
      setIsGpsRefreshing(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchLocations(true);
  }, [fetchLocations]);

  // Adaptive polling interval
  useEffect(() => {
    if (isStationaryPaused) {
      const standbyTimer = setInterval(() => {
        fetchLocations(false);
      }, 30000);
      return () => clearInterval(standbyTimer);
    }

    const timer = setInterval(() => {
      fetchLocations(false);
    }, 3000);

    return () => clearInterval(timer);
  }, [isStationaryPaused, fetchLocations]);

  // Real-time WebSocket GPS telemetry updates without page refresh
  useEffect(() => {
    const unsubscribeAll = websocketService.subscribe("/topic/tracking", (incoming) => {
      if (!incoming || !incoming.busId) return;
      setLiveLocations((prev) => {
        const idx = prev.findIndex((l) => String(l.busId) === String(incoming.busId));
        if (idx >= 0) {
          const existingTime = new Date(prev[idx].gpsTime || prev[idx].receivedAt || 0).getTime();
          const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || 0).getTime();
          if (incomingTime < existingTime) return prev; // Monotonic guard: discard out-of-order delayed update
          const next = [...prev];
          next[idx] = { ...next[idx], ...incoming };
          return next;
        }
        return [...prev, incoming];
      });
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      setIsStationaryPaused(false);
    });

    return () => {
      if (typeof unsubscribeAll === "function") unsubscribeAll();
    };
  }, []);

  useEffect(() => {
    if (!selectedBus?.id) return;
    const unsubscribeBus = websocketService.subscribe(`/topic/bus/${selectedBus.id}`, (incoming) => {
      if (!incoming || !incoming.busId) return;
      setLiveLocations((prev) => {
        const idx = prev.findIndex((l) => String(l.busId) === String(incoming.busId));
        if (idx >= 0) {
          const existingTime = new Date(prev[idx].gpsTime || prev[idx].receivedAt || 0).getTime();
          const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || 0).getTime();
          if (incomingTime < existingTime) return prev; // Monotonic guard
          const next = [...prev];
          next[idx] = { ...next[idx], ...incoming };
          return next;
        }
        return [...prev, incoming];
      });
    });

    return () => {
      if (typeof unsubscribeBus === "function") unsubscribeBus();
    };
  }, [selectedBus?.id]);

  // Load route stops & GPS history trail for selected bus
  useEffect(() => {
    // Immediately clear previous bus stops and trail to guarantee ZERO cross-trip overlap
    setRouteStops([]);
    setHistoryTrail([]);

    if (!selectedBus) {
      return;
    }

    let isMounted = true;
    if (selectedBus.routeId) {
      routeService
        .getById(selectedBus.routeId)
        .then((r) => {
          if (isMounted) setRouteStops(r?.stops || []);
        })
        .catch(() => {
          if (isMounted) setRouteStops([]);
        });
    }

    trackingService
      .getHistory(selectedBus.id, 40)
      .then((history) => {
        if (isMounted) setHistoryTrail(history || []);
      })
      .catch(() => {
        if (isMounted) setHistoryTrail([]);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBus?.id, selectedBus?.routeId]);

  // Prepare buses for LiveMap — STRICTLY ACTIVE VEHICLES ONLY (parked/standby hidden on map)
  const mapBuses = useMemo(() => {
    return visibleBuses
      .map((b) => {
        const live = visibleLiveLocations.find((l) => String(l.busId) === String(b.id));
        // Fresh = live data exists, not stale, GPS < 3 minutes old
        const isFresh =
          live &&
          !live.isStale &&
          live.gpsTime &&
          Date.now() - new Date(live.gpsTime).getTime() < 180000;

        return {
          ...b,
          busId: b.id,
          busNumber: b.busNumber || b.number || `Bus ${b.id}`,
          busName: b.busName || b.name || "School Bus",
          driverName: b.driverName || "Assigned Driver",
          driverPhone: b.driverPhone || "",
          status: isFresh ? (live.status || b.status) : (b.status || "PARKED"),
          latitude: live?.latitude ?? b.latitude ?? 16.3235,
          longitude: live?.longitude ?? b.longitude ?? 80.4578,
          rawLatitude: live?.rawLatitude ?? live?.latitude ?? b.latitude,
          rawLongitude: live?.rawLongitude ?? live?.longitude ?? b.longitude,
          snappedLatitude: live?.snappedLatitude,
          snappedLongitude: live?.snappedLongitude,
          isRoadMatched: live?.isRoadMatched,
          roadName: live?.roadName,
          accuracy: live?.accuracy,
          accuracyDescription: live?.accuracyDescription,
          locationName: live?.locationName,
          nearbyLandmark: live?.nearbyLandmark,
          speed: isFresh ? (live.speed ?? 0) : 0,
          heading: isFresh && live.heading != null ? live.heading : null,
          gpsTime: live?.gpsTime ?? null,
          isStale: !isFresh,
        };
      })
      .filter((b) => {
        const status = String(b.status || "").toUpperCase();
        const isParkedOrInactive =
          status === "PARKED" ||
          status === "INACTIVE" ||
          status === "STANDBY" ||
          status === "STOPPED" ||
          status === "MAINTENANCE" ||
          status === "COMPLETED";

        if (isParkedOrInactive && b.speed <= 0 && status !== "ON_ROUTE" && status !== "IN_PROGRESS") {
          return false;
        }

        return status === "ON_ROUTE" || status === "IN_PROGRESS" || status === "ACTIVE" || b.speed > 0;
      });
  }, [visibleBuses, visibleLiveLocations]);

  // Derived telemetry metrics for selected bus — with staleness guard
  const isSelectedFresh = liveForSelected &&
    !liveForSelected.isStale &&
    liveForSelected.gpsTime &&
    (Date.now() - new Date(liveForSelected.gpsTime).getTime()) < 180000;
  const curSpeed = isSelectedFresh ? Math.round(Number(liveForSelected.speed || 0)) : 0;
  const curLat = liveForSelected?.latitude ?? selectedBus?.latitude ?? 16.3067;
  const curLng = liveForSelected?.longitude ?? selectedBus?.longitude ?? 80.4365;
  const curStatus = isSelectedFresh ? (liveForSelected?.status || "ON_ROUTE") : "STOPPED";
  const estDistance = selectedRoute?.distance ? `${selectedRoute.distance} km` : "4.8 km";
  const estEta = isSelectedFresh && curSpeed >= 5
    ? routingService.calculateEta(selectedRoute?.distance ? Number(selectedRoute.distance) : 4.8, curSpeed)
    : "Parked";
  const nextStop = routeStops.length > 1 ? routeStops[1]?.name || routeStops[0]?.name || "Next Stop" : "Campus Terminal";
  const isSignalLive = isSelectedFresh;

  // Geodesic distance calculation between 2 GPS coordinates in km
  const getDistanceKm = useCallback((lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 5.0;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c * 1.25).toFixed(2));
  }, []);

  // Adapt buses data to RouteListPanel RouteInfo model with dynamic Driver Speed & calculated ETA
  const panelRoutes = useMemo(() => {
    return visibleBuses.map((b) => {
      const live = visibleLiveLocations.find((l) => String(l.busId) === String(b.id));
      const bRoute = routes.find((r) => String(r.id) === String(b.routeId));

      // Check if telemetry is fresh (< 3 minutes old and not marked stale)
      const isFresh = live && !live.isStale && live.gpsTime && (Date.now() - new Date(live.gpsTime).getTime()) < 180000;

      // Real-time speed from driver GPS telemetry (km/h) - strictly 0 when parked/stale
      const curSpeed = isFresh ? Math.round(Number(live.speed || 0)) : 0;
      const isActive = isFresh && (curSpeed > 0 || live?.status === "ON_ROUTE");

      // Real live GPS coordinates of the bus right now
      const busLat = Number(live?.latitude ?? b.latitude ?? 16.3235);
      const busLng = Number(live?.longitude ?? b.longitude ?? 80.4578);

      // Resolve destination GPS coordinates from route stops or campus endpoint
      let destLat = 16.34;
      let destLng = 80.47;
      let startLat = 16.3067;
      let startLng = 80.4365;

      if (bRoute?.stops && bRoute.stops.length > 0) {
        const lastStop = bRoute.stops[bRoute.stops.length - 1];
        if (lastStop.latitude && lastStop.longitude) {
          destLat = Number(lastStop.latitude);
          destLng = Number(lastStop.longitude);
        }
        const firstStop = bRoute.stops[0];
        if (firstStop.latitude && firstStop.longitude) {
          startLat = Number(firstStop.latitude);
          startLng = Number(firstStop.longitude);
        }
      }

      // Dynamic distances based on live GPS tracking location:
      const fromStartKm = getDistanceKm(busLat, busLng, startLat, startLng);
      const remainingDistanceKm = getDistanceKm(busLat, busLng, destLat, destLng);
      const totalSpanKm = fromStartKm + remainingDistanceKm;

      // Dynamic progress based on live bus position:
      // Clamped between 0.08 (origin) and 0.92 (destination)
      let journeyProgress = 0.08;
      if (!isActive && curSpeed === 0) {
        journeyProgress = 0.08;
      } else if (remainingDistanceKm <= 0.15) {
        journeyProgress = 0.92;
      } else if (totalSpanKm > 0.1) {
        const rawRatio = fromStartKm / totalSpanKm;
        journeyProgress = Math.max(0.08, Math.min(0.92, rawRatio));
      }

      // Dynamic ETA calculated strictly from live remaining distance & driver speed using authoritative calculateEta
      let estEta = "Parked";
      if (isActive && curSpeed >= 3) {
        estEta = calculateEta(remainingDistanceKm, curSpeed);
      } else if (isActive) {
        estEta = calculateEta(remainingDistanceKm, 25);
      } else {
        estEta = "Parked";
      }

      return {
        id: String(b.id),
        route: b.routeName || bRoute?.name || `Route ${String(b.id).padStart(2, "0")}`,
        busNumber: b.busNumber || b.number || "BUS",
        from: bRoute?.startPoint || "Lakshmipuram",
        to: bRoute?.endPoint || "Main Campus",
        speed: curSpeed,
        eta: estEta,
        progress: journeyProgress,
        status: isActive ? "active" : "parked",
        driverName: b.driverName,
        driverPhone: b.driverPhone,
        locationName: live?.locationName,
        nearbyLandmark: live?.nearbyLandmark,
        accuracyDescription: live?.accuracyDescription,
        isRoadMatched: live?.isRoadMatched,
      };
    });
  }, [visibleBuses, visibleLiveLocations, routes, getDistanceKm]);

  return (
    <div className="tracking-container-behance">
      {/* Real-time Map with Yellow School Buses & Road Geometry */}
      <LiveMap
        buses={mapBuses}
        selectedBusId={selectedId}
        routeStops={routeStops}
        historyTrail={historyTrail}
        showTrail={showTrail}
        focusTrigger={focusTrigger}
        onSelectBus={(b) => {
          setSelectedId(b.busId || b.id);
          setIsDrawerOpen(true);
        }}
      />

      {/* Right Slide-in Drawer (Behance Layout) */}
      <div className={`tracking-slidein ${isDrawerOpen ? "" : "collapsed"}`}>
        {/* Toggle Button */}
        <button
          className="slidein-toggle-btn"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          title={isDrawerOpen ? "Collapse Fleet Panel" : "Open Fleet Panel"}
          aria-label={isDrawerOpen ? "Collapse Fleet Panel" : "Open Fleet Panel"}
        >
          <i className={`bi bi-chevron-${isDrawerOpen ? "right" : "left"}`} />
        </button>

        {/* Behance RouteListPanel Component using RouteCard */}
        <div style={{ flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
          <RouteListPanel
            routes={panelRoutes}
            selectedId={selectedId ? String(selectedId) : null}
            onSelect={(id) => {
              setSelectedId(Number(id));
            }}
            onClose={() => setIsDrawerOpen(false)}
            loading={loading && panelRoutes.length === 0}
          />
        </div>
      </div>

      {/* Floating button to reopen fleet panel on mobile when collapsed */}
      {!isDrawerOpen && (
        <button
          type="button"
          className="mobile-fleet-reopen-btn"
          onClick={() => setIsDrawerOpen(true)}
          title="Open Fleet List"
          aria-label="Open Fleet List"
        >
          <i className="bi bi-bus-front-fill" />
          <span>Fleet Buses</span>
          <span className="badge bg-white text-primary rounded-pill px-2 py-0.5 ms-1 fw-bold" style={{ fontSize: "11px" }}>
            {panelRoutes.length}
          </span>
        </button>
      )}
    </div>
  );
}

// GENERIC CRUD PAGE — Connected to Real Backend Services
// ============================================================
function CrudPage({ type, items, onSave, onDelete, fields, description, onAddCustom, onEditCustom }) {
  const { refreshBuses, refreshDrivers, refreshStudents, refreshRoutes, refreshData, loading } = useStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const mountAttemptedRef = useRef(false);

  // Scalable collection processing: pagination and instant in-memory sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Delete modal state
  const [deleteItem, setDeleteItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const confirmDelete = async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await onDelete(deleteItem.id);
      setDeleteItem(null);
      handleRefresh();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Failed to delete record.");
    } finally {
      setIsDeleting(false);
    }
  };

  const promptDelete = (item) => {
    setDeleteError("");
    setDeleteItem(item);
  };

  // Fast entity-specific refresh: loads ONLY this table in milliseconds!
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (type === "Buses") {
        await refreshBuses(true);
        if (refreshDrivers) refreshDrivers(true);
        if (refreshRoutes) refreshRoutes(true);
      } else if (type === "Drivers") {
        await refreshDrivers(true);
      } else if (type === "Students") {
        await refreshStudents(true);
        if (refreshBuses) refreshBuses(true);
      } else if (type === "Routes") {
        await refreshRoutes(true);
      } else {
        await refreshData(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Only silently fetch on mount IF items are currently empty
  useEffect(() => {
    if (items.length === 0 && authService.isAuthenticated()) {
      if (type === "Buses") {
        refreshBuses(true);
        if (refreshDrivers) refreshDrivers(true);
        if (refreshRoutes) refreshRoutes(true);
      } else if (type === "Drivers") {
        refreshDrivers(true);
      } else if (type === "Students") {
        refreshStudents(true);
        if (refreshBuses) refreshBuses(true);
      } else if (type === "Routes") {
        refreshRoutes(true);
      }
    }
  }, [type, items.length]);

  const blank = Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]));
  const [form, setForm] = useState(blank);

  const open = (item = null) => {
    if (type === "Routes") {
      if (item && onEditCustom) {
        onEditCustom(item);
        return;
      }
      if (!item && onAddCustom) {
        onAddCustom();
        return;
      }
    }
    setError("");
    setEditing(item);
    setForm(item ? { ...item } : blank);
    setShow(true);
  };

  const close = () => {
    setShow(false);
    setEditing(null);
    setForm(blank);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form, editing);
      close();
      handleRefresh();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save record.");
    } finally {
      setSaving(false);
    }
  };

  // Helper to format display values for foreign keys and select options
  const getDisplayValue = (item, f) => {
    const raw = item[f.key];
    if (raw === null || raw === undefined || raw === "") return "—";
    if (f.options && Array.isArray(f.options) && typeof f.options[0] === "object") {
      const match = f.options.find((opt) => String(opt.value) === String(raw));
      if (match) return match.value === "" ? "—" : match.label;
    }
    return String(raw);
  };

  // Ultra-fast collection filter
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) =>
      fields.some((f) => getDisplayValue(item, f).toLowerCase().includes(q))
    );
  }, [items, fields, query]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  // Instant in-memory sorting
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filtered, sortKey, sortAsc]);

  // Sliced pagination: renders only pageSize items in the DOM at any time
  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const singular = type === "Buses" ? "Bus" : type.slice(0, -1);

  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title={type}
        description={description}
        action={
          <div className="d-flex gap-2 align-items-center">
            <button
              className="btn btn-outline-secondary rounded-pill px-3"
              disabled={isRefreshing}
              onClick={handleRefresh}
              title="Refresh table data instantly"
            >
              <i className={`bi bi-arrow-clockwise me-1 ${isRefreshing ? "spin-animation" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button className="btn btn-primary rounded-pill px-4" onClick={() => open()}>
              <i className="bi bi-plus-lg me-2" />Add {singular}
            </button>
          </div>
        }
      />
      <section className="panel">
        <div className="panel-heading list-heading">
          <div>
            <h5>{type} directory</h5>
            <p>{items.length} records registered</p>
          </div>
          <div className="search-box">
            <i className="bi bi-search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th
                    key={f.key}
                    onClick={() => handleSort(f.key)}
                    style={{ cursor: "pointer", userSelect: "none" }}
                    title={`Sort by ${f.label}`}
                  >
                    <div className="d-flex align-items-center gap-1">
                      <span>{f.label.toUpperCase()}</span>
                      <i
                        className={`bi ${
                          sortKey === f.key
                            ? sortAsc
                              ? "bi-sort-up text-primary"
                              : "bi-sort-down text-primary"
                            : "bi-arrow-down-up opacity-25"
                        }`}
                        style={{ fontSize: "11px" }}
                      />
                    </div>
                  </th>
                ))}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="p-0 border-0">
                    <ContainerSpinner minHeight="200px" />
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id}>
                    {fields.map((f) => (
                      <td key={f.key}>
                        {f.key === "status" ? (
                          <Status value={item[f.key]} />
                        ) : (
                          getDisplayValue(item, f)
                        )}
                      </td>
                    ))}
                    <td>
                      <button className="icon-btn" title="Edit" onClick={() => open(item)}>
                        <i className="bi bi-pencil-square" />
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => promptDelete(item)}>
                        <i className="bi bi-trash3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {!loading && !filtered.length && (
                <tr>
                  <td colSpan={fields.length + 1} className="text-center text-muted py-5">
                    <i className="bi bi-inbox text-muted d-block mb-2" style={{ fontSize: "28px" }} />
                    No matching {type.toLowerCase()} records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Scalable Collection Pagination Bar */}
        <div className="d-flex flex-wrap align-items-center justify-content-between p-3 border-top gap-2" style={{ background: "#f8fafc", fontSize: "13px" }}>
          <div className="text-muted">
            Showing <b>{sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</b> to{" "}
            <b>{Math.min(currentPage * pageSize, sorted.length)}</b> of <b>{sorted.length}</b> records
          </div>
          <div className="d-flex align-items-center gap-2">
            <select
              className="form-select form-select-sm"
              style={{ width: "110px", fontSize: "12px" }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={15}>15 / page</option>
              <option value={30}>30 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <div className="btn-group btn-group-sm">
              <button
                className="btn btn-outline-secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <i className="bi bi-chevron-left" />
              </button>
              <span className="btn btn-light disabled px-3 text-dark fw-bold" style={{ fontSize: "12px" }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="btn btn-outline-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {show && (
        <div className="modal-backdrop-custom" onClick={close}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <span className="eyebrow dark">{editing ? "UPDATE RECORD" : "NEW RECORD"}</span>
                <h4 className="mb-0">{editing ? "Edit" : "Add"} {singular}</h4>
              </div>
              <button className="icon-btn" onClick={close}><i className="bi bi-x-lg" /></button>
            </div>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={submit}>
              <div className="row g-3">
                {fields.map((f) => (
                  <div className="col-md-6" key={f.key}>
                    <label className="form-label">{f.label}</label>
                    {f.options ? (
                      <select
                        className="form-select"
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        required={f.required !== false}
                      >
                        <option value="">Select {f.label}</option>
                        {f.options.map((o) => {
                          const isObj = typeof o === "object";
                          const val = isObj ? o.value : o;
                          const lbl = isObj ? o.label : o;
                          return (
                            <option key={val} value={val}>
                              {lbl}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        className="form-control"
                        type={f.type || "text"}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        required={f.required !== false}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="d-flex justify-content-end gap-2 mt-4">
                <button type="button" className="btn btn-light rounded-pill px-4" onClick={close}>
                  Cancel
                </button>
                <button className="btn btn-primary rounded-pill px-4" disabled={saving}>
                  {saving ? "Saving..." : "Save record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modern Accessible Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deleteItem)}
        title={`Delete ${singular}?`}
        itemTitle={
          deleteItem
            ? deleteItem.name ||
              deleteItem.busNumber ||
              deleteItem.busName ||
              deleteItem.fullName ||
              deleteItem.licenseNumber ||
              `Record #${deleteItem.id}`
            : ""
        }
        itemDetails={
          deleteItem
            ? deleteItem.email ||
              deleteItem.phone ||
              deleteItem.route ||
              (deleteItem.startPoint && `${deleteItem.startPoint} ➔ ${deleteItem.endPoint}`) ||
              ""
            : ""
        }
        message={`Are you sure you want to permanently delete this ${singular.toLowerCase()}? This action cannot be reversed.`}
        confirmLabel={`Yes, Delete ${singular}`}
        isDeleting={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteItem(null);
            setDeleteError("");
          }
        }}
      />
    </>
  );
}

// ============================================================
// BUSES MANAGEMENT
// ============================================================
function Buses() {
  const { buses, setBuses, routes, drivers, refreshData } = useStore();

  const routeOptions = [
    { label: "None (Unassigned)", value: "" },
    ...routes.map((r) => ({ label: `${r.name} (${r.startPoint} ➔ ${r.endPoint})`, value: r.id })),
  ];

  const driverOptions = [
    { label: "None (Unassigned)", value: "" },
    ...drivers.map((d) => ({ label: `${d.name} (${d.phone})`, value: d.id })),
  ];

  const fields = [
    { key: "busNumber", label: "Bus number" },
    { key: "busName", label: "Bus name" },
    { key: "capacity", label: "Capacity", type: "number" },
    { key: "routeId", label: "Assigned Route", options: routeOptions, required: false },
    { key: "driverId", label: "Assigned Driver", options: driverOptions, required: false },
    { key: "status", label: "Status", options: ["ON_ROUTE", "AT_STOP", "OFFLINE"] },
  ];

  const handleSave = async (data, editing) => {
    const payload = {
      ...data,
      capacity: Number(data.capacity),
      routeId: data.routeId ? Number(data.routeId) : null,
      driverId: data.driverId ? Number(data.driverId) : null,
    };
    if (editing) {
      const updated = await busService.update(editing.id, payload);
      setBuses((prev) => prev.map((b) => (b.id === editing.id ? (updated || { ...b, ...payload }) : b)));
    } else {
      const created = await busService.create(payload);
      setBuses((prev) => [created || { ...payload, id: Date.now() }, ...prev]);
    }
    await refreshData(true);
  };

  const handleDelete = async (id) => {
    await busService.delete(id);
    setBuses((prev) => prev.filter((b) => b.id !== id));
    await refreshData(true);
  };

  return (
    <CrudPage
      type="Buses"
      items={buses}
      onSave={handleSave}
      onDelete={handleDelete}
      fields={fields}
      description="Register vehicles and maintain the campus fleet with live cloud persistence."
    />
  );
}

// ============================================================
// DRIVERS MANAGEMENT
// ============================================================
function Drivers() {
  const { drivers, setDrivers, refreshData } = useStore();
  const fields = [
    { key: "name", label: "Driver name" },
    { key: "email", label: "Email address" },
    { key: "phone", label: "Phone number" },
    { key: "licenseNumber", label: "License number" },
    { key: "status", label: "Status", options: ["ACTIVE", "INACTIVE"] },
  ];

  const handleSave = async (data, editing) => {
    if (editing) {
      const updated = await driverService.update(editing.id, data);
      setDrivers((prev) => prev.map((d) => (d.id === editing.id ? (updated || { ...d, ...data }) : d)));
    } else {
      const created = await driverService.create(data);
      setDrivers((prev) => [created || { ...data, id: Date.now() }, ...prev]);
    }
    await refreshData(true);
  };

  const handleDelete = async (id) => {
    await driverService.delete(id);
    setDrivers((prev) => prev.filter((d) => d.id !== id));
    await refreshData(true);
  };

  return (
    <CrudPage
      type="Drivers"
      items={drivers}
      onSave={handleSave}
      onDelete={handleDelete}
      fields={fields}
      description="Maintain driver credentials, licenses, and phone contacts."
    />
  );
}

// ============================================================
// STUDENTS MANAGEMENT
// ============================================================
function Students() {
  const { students, setStudents, buses, refreshData } = useStore();

  const busOptions = [
    { label: "None (Unassigned)", value: "" },
    ...buses.map((b) => ({ label: `${b.busNumber || b.number} - ${b.busName || b.name}`, value: b.id })),
  ];

  const fields = [
    { key: "name", label: "Student name" },
    { key: "email", label: "Email address" },
    { key: "rollNumber", label: "Roll number" },
    { key: "className", label: "Class / course" },
    { key: "parentName", label: "Parent name" },
    { key: "parentPhone", label: "Parent phone" },
    { key: "busId", label: "Assigned Bus", options: busOptions, required: false },
  ];

  const handleSave = async (data, editing) => {
    const payload = {
      ...data,
      busId: data.busId ? Number(data.busId) : null,
    };
    if (editing) {
      const updated = await studentService.update(editing.id, payload);
      setStudents((prev) => prev.map((s) => (s.id === editing.id ? (updated || { ...s, ...payload }) : s)));
    } else {
      const created = await studentService.create(payload);
      setStudents((prev) => [created || { ...payload, id: Date.now() }, ...prev]);
    }
    await refreshData(true);
  };

  const handleDelete = async (id) => {
    await studentService.delete(id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
    await refreshData(true);
  };

  return (
    <CrudPage
      type="Students"
      items={students}
      onSave={handleSave}
      onDelete={handleDelete}
      fields={fields}
      description="Manage student profiles and assigned campus transportation."
    />
  );
}

// ============================================================
// ROUTES MANAGEMENT
// ============================================================
function RoutesPage({ onBuilderStateChange }) {
  const { routes, setRoutes, refreshData, buses } = useStore();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);

  useEffect(() => {
    if (onBuilderStateChange) {
      onBuilderStateChange(showBuilder);
    }
  }, [showBuilder, onBuilderStateChange]);

  useEffect(() => {
    return () => {
      if (onBuilderStateChange) onBuilderStateChange(false);
    };
  }, [onBuilderStateChange]);

  const fields = [
    { key: "name", label: "Route name" },
    { key: "startPoint", label: "Starting point" },
    { key: "endPoint", label: "Destination" },
    { key: "distance", label: "Distance" },
  ];

  const handleSave = async (data, editing) => {
    if (editing) {
      const updated = await routeService.update(editing.id, data);
      setRoutes((prev) => prev.map((r) => (r.id === editing.id ? (updated || { ...r, ...data }) : r)));
    } else {
      const created = await routeService.create(data);
      setRoutes((prev) => [created || { ...data, id: Date.now() }, ...prev]);
    }
    setShowBuilder(false);
    setEditingRoute(null);
    await refreshData(true);
  };

  const handleSaveFromMap = async (data) => {
    try {
      if (editingRoute && editingRoute.id) {
        const updated = await routeService.update(editingRoute.id, data);
        setRoutes((prev) => prev.map((r) => (r.id === editingRoute.id ? (updated || { ...r, ...data }) : r)));
      } else {
        const created = await routeService.create(data);
        setRoutes((prev) => [created || { ...data, id: Date.now() }, ...prev]);
      }
      setShowBuilder(false);
      setEditingRoute(null);
      await refreshData(true);
    } catch (err) {
      console.error("Save route failed:", err);
      throw err;
    }
  };

  const handleDelete = async (id) => {
    await routeService.delete(id);
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    await refreshData(true);
  };

  if (showBuilder) {
    return (
      <RouteBuilderMap
        initialRoute={editingRoute}
        onSave={handleSaveFromMap}
        onClose={() => {
          setShowBuilder(false);
          setEditingRoute(null);
        }}
        buses={buses}
      />
    );
  }

  return (
    <CrudPage
      type="Routes"
      items={routes}
      onSave={handleSave}
      onDelete={handleDelete}
      onAddCustom={() => {
        setEditingRoute(null);
        setShowBuilder(true);
      }}
      onEditCustom={(row) => {
        setEditingRoute(row);
        setShowBuilder(true);
      }}
      fields={fields}
      description="Create and manage transportation routes with real Indian locations using the interactive road map."
    />
  );
}

export default App;
