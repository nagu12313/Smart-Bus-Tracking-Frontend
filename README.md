# 🚌 EduTrack – Smart School & College Bus Tracking Frontend

Production-ready modern React + Vite application for campus transportation management and real-time student tracking.

- **Live Frontend**: [https://smart-bus-tracking-system-zeta.vercel.app](https://smart-bus-tracking-system-zeta.vercel.app)
- **Production Backend**: [https://smart-bus-tracking-backend.onrender.com](https://smart-bus-tracking-backend.onrender.com)
- **Backend Repository**: [https://github.com/nagu12313/Smart-Bus-Tracking-Backend.git](https://github.com/nagu12313/Smart-Bus-Tracking-Backend.git)

---

## 🚀 Features

- **Role-Based Access Control**: Tailored workflows for **Admin**, **Driver**, **Parent**, and **Student**.
- **Real-Time Bus Tracking**:
  - Live GPS bus position updates via WebSocket (STOMP protocol over `/topic/tracking`).
  - Interactive Leaflet map with speed, next stop, delay estimates, and vehicle indicators.
- **Secure Authentication**:
  - JWT stateless authentication.
  - Email verification OTP delivered securely over Gmail SMTPS (Port 465).
  - Complete 2-step Forgot Password and Reset Password workflow.
- **Fleet & Roster Management**:
  - Full CRUD operations for Buses, Drivers, Students, and Routes.
  - Route assignment and live trip management.
- **AI Campus Assistant**:
  - Integrated Gemini-powered chatbot for campus transport queries and schedule info.
- **Responsive Design**: Mobile-first responsive UI built with Bootstrap 5 and Bootstrap Icons.

---

## 🛠️ Tech Stack

- **Framework**: React 18 with Vite
- **Routing**: React Router v6 (SPA with HTML5 history rewrite)
- **Maps**: Leaflet & React-Leaflet
- **Real-time WebSockets**: `@stomp/stompjs` + `sockjs-client`
- **HTTP Client**: Axios with automatic JWT interceptors
- **Styling**: Bootstrap 5 + Bootstrap Icons + Custom CSS
- **Deployment**: Vercel (Optimized chunk splitting & caching headers)

---

## ⚙️ Environment Variables

Configure environment variables in `.env` or project settings:

```env
# Backend REST API Base URL
VITE_API_BASE_URL=https://smart-bus-tracking-backend.onrender.com

# WebSocket Base URL (STOMP over WebSocket)
VITE_WS_BASE_URL=wss://smart-bus-tracking-backend.onrender.com/ws
```

---

## 💻 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/nagu12313/Smart-Bus-Tracking-Frontend.git
cd Smart-Bus-Tracking-Frontend

# Install dependencies
npm install
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
npm run preview
```

---

## 🌐 Deployment to Vercel

This repository includes a pre-configured `vercel.json` with SPA routing rewrites:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Deploy instantly via Vercel CLI:
```bash
vercel --prod
```
