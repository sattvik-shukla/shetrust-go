import React, { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";

import Navbar               from "./components/Navbar";
import RateModal            from "./components/RateModal";
import SurveyModal          from "./components/SurveyModal";
import Chatbot              from "./components/Chatbot";
import EmergencyButton      from "./components/EmergencyButton";
import OfflineBanner        from "./components/OfflineBanner";
import NotificationBell     from "./components/NotificationBell";
import IncidentReportModal  from "./components/IncidentReportModal";

import Home           from "./pages/Home";
import MapView        from "./pages/MapView";
import HowItWorks     from "./pages/HowItWorks";
import SafeRoutePage  from "./pages/SafeRoutePage";
import Auth           from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";

// Import socket for real-time notifications
import { useSocket } from "./hooks/useSocket";

export default function App() {
  const [rateOpen, setRateOpen]             = useState(false);
  const [surveyOpen, setSurveyOpen]         = useState(false);
  const [incidentOpen, setIncidentOpen]     = useState(false);
  const location = useLocation();

  const socket = useSocket();  // shared socket instance

  const isMap  = location.pathname === "/map" || location.pathname === "/route";
  const isAuth = location.pathname === "/auth";

  return (
    <AuthProvider>
      {/* Offline banner */}
      <OfflineBanner />

      {/* Navbar */}
      {!isAuth && (
        <Navbar
          onRateClick={() => setRateOpen(true)}
          onSurveyClick={() => setSurveyOpen(true)}
          onReportClick={() => setIncidentOpen(true)}
          notificationBell={<NotificationBell socket={socket} />}
        />
      )}

      {/* Routes */}
      <Routes>
        <Route path="/"      element={<Home onRateClick={() => setRateOpen(true)} onSurveyClick={() => setSurveyOpen(true)} onReportClick={() => setIncidentOpen(true)} />} />
        <Route path="/map"   element={<MapView />} />
        <Route path="/route" element={<SafeRoutePage />} />
        <Route path="/how"   element={<HowItWorks onRateClick={() => setRateOpen(true)} />} />
        <Route path="/auth"  element={<Auth />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*"      element={<Home onRateClick={() => setRateOpen(true)} onSurveyClick={() => setSurveyOpen(true)} />} />
      </Routes>

      {/* Global modals */}
      {!isMap && !isAuth && (
        <>
          <RateModal
            isOpen={rateOpen}
            onClose={() => setRateOpen(false)}
            onRated={() => setRateOpen(false)}
          />
          <SurveyModal
            isOpen={surveyOpen}
            onClose={() => setSurveyOpen(false)}
          />
          <IncidentReportModal
            isOpen={incidentOpen}
            onClose={() => setIncidentOpen(false)}
          />
        </>
      )}

      {/* Global widgets */}
      {!isAuth && <Chatbot />}
      {!isAuth && <EmergencyButton />}
    </AuthProvider>
  );
}
