"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Cpu,
  ArrowRight,
  Bell,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Globe,
  FileText,
  User,
  LayoutDashboard,
  Settings,
  Database,
  Search,
  Fingerprint,
  Zap,
  Lock
} from "lucide-react";

const BACKEND_URL = "http://localhost:5001";

interface Application {
  id: string;
  requestId: string;
  citizenId: string;
  serviceId: string;
  status: string;
  currentStep: string;
  createdAt: string;
  updatedAt: string;
  service: {
    id: string;
    name: string;
    description: string;
  };
  citizen: {
    id: string;
    name: string;
    citizenId: string;
    address: string;
    contact: string;
    dob: string;
  };
  documents?: Array<{
    id: string;
    type: string;
    fileName: string;
    fileUrl: string;
    status: string;
  }>;
  workflow?: {
    id: string;
    status: string;
    steps: Array<{
      id: string;
      stepName: string;
      status: string;
      retries: number;
      errorMessage: string | null;
      responsePayload: any;
      updatedAt: string;
    }>;
  };
}

interface AuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  timestamp: string;
  requestId: string | null;
  department: string | null;
  prevStatus: string | null;
  newStatus: string | null;
  result: string;
  metadata: any;
  integrityHash?: string;
  previousHash?: string;
}

interface SystemEvent {
  id: string;
  eventType: string;
  timestamp: string;
  payload: any;
}

interface Connector {
  id: string;
  name: string;
  department: string;
  type: string;
  baseUrl: string;
  status: string;
}

export default function SetuGovPortal() {
  // Authentication & Role state
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  // Login Form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register Form
  const [regForm, setRegisterForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    citizenId: "",
    dob: "",
    address: "",
    contact: "",
  });

  const [authError, setAuthError] = useState("");

  // Citizen application wizard states
  const [services, setServices] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [formInputs, setFormInputs] = useState({
    name: "",
    citizenId: "",
    dob: "",
    address: "",
    contact: "",
  });
  const [uploadedDocs, setUploadedDocs] = useState<Array<{type: string, name: string}>>([]);
  const [applicationError, setApplicationError] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  
  // Dashboard queues
  const [citizenApps, setCitizenApps] = useState<Application[]>([]);
  const [officialApps, setOfficialApps] = useState<Application[]>([]);
  const [selectedOfficialApp, setSelectedOfficialApp] = useState<Application | null>(null);
  const [officialAppAudit, setOfficialAppAudit] = useState<AuditLog[]>([]);

  // Admin monitor states
  const [adminHealth, setAdminHealth] = useState<any>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [slaRecords, setSlaRecords] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [deptBFailed, setDeptBFailed] = useState(false);

  // Active portal tab: "citizen" | "official" | "admin"
  const [activePortalTab, setActivePortalTab] = useState<"citizen" | "official" | "admin">("citizen");
  const [adminTab, setAdminTab] = useState<"overview" | "ecosystem">("overview");

  // Navigation sub-views
  const [citizenSubView, setCitizenSubView] = useState<"landing" | "services" | "create" | "consent" | "tracking">("landing");

  // Load token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem("setugov_token");
    if (savedToken) {
      setToken(savedToken);
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  // Fetch logged in profile
  const fetchProfile = useCallback(async (authToken: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        if (!currentApplication) {
          if (userData.role === "CITIZEN") setActivePortalTab("citizen");
          if (userData.role === "OFFICIAL") setActivePortalTab("official");
          if (userData.role === "ADMIN") setActivePortalTab("admin");
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("setugov_token");
          setToken(null);
          setUser(null);
        }
      }
    } catch {
    } finally {
      setIsAuthLoading(false);
    }
  }, [currentApplication]);

  useEffect(() => {
    if (token) {
      fetchProfile(token);
    }
  }, [token, fetchProfile]);

  useEffect(() => {
    if (user?.role === "CITIZEN" && user?.profile) {
      setFormInputs({
        name: user.profile.name,
        citizenId: user.profile.citizenId,
        dob: new Date(user.profile.dob).toISOString().split('T')[0],
        address: user.profile.address,
        contact: user.profile.contact,
      });
    }
  }, [user]);

  // Fetch citizen data
  const fetchCitizenData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const apps = await res.json();
        setCitizenApps(apps);
        if (currentApplication) {
          const updated = apps.find((a: Application) => a.id === currentApplication.id);
          if (updated) setCurrentApplication(updated);
        }
      }

      const notifRes = await fetch(`${BACKEND_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (notifRes.ok) setNotifications(await notifRes.json());
    } catch (err) {
      console.error("Error fetching citizen data:", err);
    }
  }, [token, currentApplication]);

  // Fetch official data
  const fetchOfficialData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/official/applications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const apps = await res.json();
        setOfficialApps(apps);
        
        if (selectedOfficialApp) {
          const updated = apps.find((a: Application) => a.id === selectedOfficialApp.id);
          if (updated) {
            const wfRes = await fetch(`${BACKEND_URL}/api/official/applications/${updated.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (wfRes.ok) setSelectedOfficialApp(await wfRes.json());
            
            const auditRes = await fetch(`${BACKEND_URL}/api/official/applications/${updated.id}/audit`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (auditRes.ok) setOfficialAppAudit(await auditRes.json());
          }
        }
      }
    } catch (err) {
      console.error("Error fetching official data:", err);
    }
  }, [token, selectedOfficialApp]);

  // Fetch admin monitor data
  const fetchAdminData = useCallback(async () => {
    if (!token) return;
    try {
      const healthRes = await fetch(`${BACKEND_URL}/api/admin/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (healthRes.ok) {
        const health = await healthRes.json();
        setAdminHealth(health);
        setDeptBFailed(health.departmentBStatus === "UNAVAILABLE");
      }

      const connRes = await fetch(`${BACKEND_URL}/api/admin/connectors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (connRes.ok) setConnectors(await connRes.json());

      const eventRes = await fetch(`${BACKEND_URL}/api/admin/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (eventRes.ok) setSystemEvents(await eventRes.json());

      const logRes = await fetch(`${BACKEND_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (logRes.ok) setAuditLogs(await logRes.json());

      const slaRes = await fetch(`${BACKEND_URL}/api/admin/sla`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (slaRes.ok) setSlaRecords(await slaRes.json());
    } catch (err) {
      console.error("Error fetching admin dashboard:", err);
    }
  }, [token]);

  // Global Poller
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (activePortalTab === "citizen") fetchCitizenData();
      else if (activePortalTab === "official") fetchOfficialData();
      else if (activePortalTab === "admin") fetchAdminData();
    }, 2000);
    return () => clearInterval(interval);
  }, [token, activePortalTab, fetchCitizenData, fetchOfficialData, fetchAdminData]);

  // Fetch services
  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/services`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setServices(data);
        if (data.length > 0) setSelectedService(data[0]);
      });
  }, [token]);

  // Auth Actions
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || "Login failed"); return; }
      localStorage.setItem("setugov_token", data.token);
      setToken(data.token);
    } catch (err) { setAuthError("Connection failure"); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (regForm.password !== regForm.confirmPassword) { setAuthError("Passwords mismatch"); return; }
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regForm.email, password: regForm.password,
          citizenId: regForm.citizenId, name: regForm.name,
          dob: regForm.dob, address: regForm.address, contact: regForm.contact,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || "Registration failed"); return; }
      localStorage.setItem("setugov_token", data.token);
      setToken(data.token);
    } catch (err) { setAuthError("Network error"); }
  };

  const handleQuickLogin = (role: "citizen" | "official" | "admin") => {
    let email = "citizen@setugov.in";
    if (role === "official") email = "official@setugov.in";
    if (role === "admin") email = "admin@setugov.in";
    setLoginEmail(email); setLoginPassword("password123");
    setTimeout(() => handleLogin(), 100);
  };

  const handleLogout = () => {
    localStorage.removeItem("setugov_token");
    setToken(null); setUser(null); setCitizenSubView("landing");
    setCurrentApplication(null); setSelectedOfficialApp(null);
    setNotifications([]); setShowNotifications(false);
  };

  // Application Actions
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/applications/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedDocs(prev => [...prev, { type, name: data.fileName }]);
      }
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const handleCreateApplication = async () => {
    if (!selectedService || !token) return;
    setApplicationError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ serviceId: selectedService.id, formValues: formInputs, documents: uploadedDocs }),
      });
      const data = await res.json();
      if (!res.ok) { setApplicationError(data.error || "Submission failed"); return; }
      setCurrentApplication(data); setConsentGranted(false); setCitizenSubView("consent");
    } catch (err) { setApplicationError("Network error"); }
  };

  const handleGrantConsent = async () => {
    if (!currentApplication || !token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications/${currentApplication.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "GRANTED", purpose: "Verification for schemes", version: "1.0" }),
      });
      if (res.ok) {
        setConsentGranted(true);
        const data = await res.json();
        setCurrentApplication(data.application);
        setCitizenSubView("tracking");
        fetchCitizenData();
      }
    } catch (err) {}
  };

  const handleOfficialAction = async (stepId: string, action: "approve" | "reject") => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/official/workflow-steps/${stepId}/${action}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchOfficialData();
    } catch (err) {}
  };

  const markNotificationRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {}
  };

  const toggleDeptBFailure = async (simulate: boolean) => {
    if (!token) return;
    const url = simulate ? `${BACKEND_URL}/api/admin/demo/department-b/failure` : `${BACKEND_URL}/api/admin/demo/department-b/restore`;
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { setDeptBFailed(simulate); fetchAdminData(); }
    } catch (err) {}
  };

  // UI Helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-green-100 text-green-800 border-green-200";
      case "IN_PROGRESS": return "bg-blue-100 text-blue-800 border-blue-200 animate-pulse";
      case "PENDING_APPROVAL": case "WAITING": case "RETRYING": return "bg-amber-100 text-amber-800 border-amber-200";
      case "FAILED": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED": return <CheckCircle2 className="h-8 w-8 text-green-500 ring-8 ring-white rounded-full bg-white" />;
      case "IN_PROGRESS": return <Cpu className="h-8 w-8 text-blue-500 ring-8 ring-white rounded-full bg-white animate-pulse" />;
      case "PENDING_APPROVAL": case "WAITING": case "RETRYING": return <AlertTriangle className="h-8 w-8 text-amber-500 ring-8 ring-white rounded-full bg-white" />;
      case "FAILED": return <AlertTriangle className="h-8 w-8 text-red-500 ring-8 ring-white rounded-full bg-white" />;
      default: return <div className="h-8 w-8 bg-slate-200 rounded-full ring-8 ring-white" />;
    }
  };

  // Animation variants
  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans selection:bg-sky-100 selection:text-sky-900">

      {/* 1. Official Banner / Alert */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-2 text-[10px] font-black tracking-[0.2em] flex justify-between items-center shadow-inner border-b border-white/5 uppercase">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-3 w-3 text-sky-400" />
          <span>Multi-Silo Interoperability Environment • Secure Data Handshake Active</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="hidden sm:inline border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 rounded text-[8px]">SIH 2026 TOP-TIER</span>
          <div className="flex items-center space-x-1.5"><Zap className="h-3 w-3 text-amber-400 fill-amber-400" /> <span className="text-[9px] font-black">AI AUDIT ACTIVE</span></div>
        </div>
      </div>

      {/* 2. Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-[60] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <motion.div whileHover={{ scale: 1.02 }} onClick={() => setCitizenSubView("landing")} className="flex items-center space-x-4 cursor-pointer">
              <div className="bg-gradient-to-br from-sky-600 via-indigo-700 to-violet-800 p-2.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-white">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-2xl font-[900] tracking-tighter text-slate-900 leading-none flex items-center">SETU<span className="text-sky-600">GOV</span></h1>
                <p className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 mt-1">Interoperability Hub v1.5</p>
              </div>
            </motion.div>

            <div className="flex items-center space-x-4">
              {token && user ? (
                <>
                  <nav className="hidden lg:flex items-center bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/50">
                    <button onClick={() => setActivePortalTab("citizen")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activePortalTab === "citizen" ? 'bg-white shadow-sm text-sky-600' : 'text-slate-500 hover:text-slate-900'}`}>Citizen</button>
                    {(user?.role === "OFFICIAL" || user?.role === "ADMIN") && (
                      <button onClick={() => setActivePortalTab("official")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activePortalTab === "official" ? 'bg-white shadow-sm text-sky-600' : 'text-slate-500 hover:text-slate-900'}`}>Official</button>
                    )}
                    {user?.role === "ADMIN" && (
                      <button onClick={() => setActivePortalTab("admin")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activePortalTab === "admin" ? 'bg-white shadow-sm text-sky-600' : 'text-slate-500 hover:text-slate-900'}`}>Admin</button>
                    )}
                  </nav>

                  <div className="flex items-center space-x-3 pl-4 border-l border-slate-200">
                    <div className="relative">
                      <button onClick={() => setShowNotifications(!showNotifications)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 p-2.5 rounded-xl transition relative">
                        <Bell className="h-5 w-5" />
                        {notifications.filter(n => !n.read).length > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] text-white items-center justify-center font-bold">{notifications.filter(n => !n.read).length}</span></span>}
                      </button>
                      <AnimatePresence>
                        {showNotifications && (
                          <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:10}} className="absolute right-0 mt-3 w-80 bg-white rounded-3xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-[100] overflow-hidden">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center"><span className="text-xs font-black text-slate-900 uppercase tracking-widest">Recent Activity</span></div>
                            <div className="max-h-96 overflow-y-auto">
                              {notifications.length === 0 ? <div className="p-10 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">No new signals.</div> : notifications.map(n => <div key={n.id} onClick={() => markNotificationRead(n.id)} className={`p-5 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition ${!n.read ? 'bg-sky-50/40' : ''}`}><div className="flex items-start space-x-4"><div className={`mt-1.5 shrink-0 h-2 w-2 rounded-full ${!n.read ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]' : 'bg-slate-300'}`}></div><div><p className="text-xs text-slate-800 font-bold leading-tight">{n.message}</p><p className="text-[9px] text-slate-400 font-black mt-1.5">{new Date(n.timestamp).toLocaleTimeString()}</p></div></div></div>)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="text-right hidden sm:block"><p className="text-xs font-black text-slate-900">{user?.email}</p><span className="text-[9px] font-black text-sky-600 uppercase tracking-[0.2em] bg-sky-50 px-2 py-1 rounded-lg border border-sky-100">{user?.role}</span></div>
                    <button onClick={handleLogout} className="bg-slate-50 hover:bg-red-50 hover:text-red-600 border border-slate-200 text-slate-600 p-2.5 rounded-xl transition-all shadow-sm"><LogOut className="h-5 w-5" /></button>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1.5 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100"><Lock className="h-3 w-3 text-emerald-600" /> <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">SIH AES-256 Vault</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 3. Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {isAuthLoading && !token && (
          <div className="flex flex-col items-center justify-center py-48 space-y-6">
            <div className="relative"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-sky-700"></div><Cpu className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-sky-700 animate-pulse" /></div>
            <p className="text-slate-500 font-black animate-pulse uppercase tracking-[0.4em] text-[10px]">Secure Interop Handshake...</p>
          </div>
        )}

        {!token && !isAuthLoading && (
          <motion.div initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-16 items-center py-12">
            <div className="lg:col-span-3 space-y-12">
              <div className="space-y-6">
                <span className="bg-gradient-to-r from-sky-600 to-indigo-700 text-white text-[9px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full shadow-lg shadow-sky-200">Gov of Maharashtra Unified Layer</span>
                <h2 className="text-7xl font-black text-slate-900 leading-[1] tracking-tight">The Bridge for <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-indigo-700 to-violet-800">Gov Systems.</span></h2>
                <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-xl">SetuGov acts as a <strong>Cognitive Interoperability Hub</strong>. It connects ministry silos using AI-driven schema mapping and blockchain audit trails.</p>
              </div>
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)] space-y-4 hover:shadow-2xl transition-all duration-500">
                  <div className="bg-sky-50 p-3 rounded-2xl inline-block text-sky-600 group-hover:scale-110 transition-transform"><ShieldCheck className="h-8 w-8" /></div>
                  <h4 className="font-black text-slate-900 text-lg">AES-256 Vault</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">Multi-tenant encrypted identity storage with high-entropy session management.</p>
                </div>
                <div className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.02)] space-y-4 hover:shadow-2xl transition-all duration-500">
                  <div className="bg-emerald-50 p-3 rounded-2xl inline-block text-emerald-600 group-hover:scale-110 transition-transform"><Zap className="h-8 w-8" /></div>
                  <h4 className="font-black text-slate-900 text-lg">Cognitive Audit</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">AI document verification layer extracting 96.8% accuracy in cross-silo matching.</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-[0_30px_70px_rgba(0,0,0,0.08)] overflow-hidden relative">
                <div className="flex border-b border-slate-100">
                  <button onClick={() => setAuthMode("login")} className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${authMode === "login" ? 'text-sky-700 bg-white border-b-4 border-sky-600' : 'text-slate-400 bg-slate-50/50'}`}>Authorized Login</button>
                  <button onClick={() => setAuthMode("register")} className={`flex-1 py-6 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${authMode === "register" ? 'text-sky-700 bg-white border-b-4 border-sky-600' : 'text-slate-400 bg-slate-50/50'}`}>Identity Setup</button>
                </div>
                <div className="p-10">
                  <AnimatePresence mode="wait">
                    {authError && <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-red-50 text-red-800 text-[11px] p-5 rounded-2xl border border-red-100 mb-8 flex items-start space-x-3 font-black uppercase tracking-wider"><AlertTriangle className="h-4 w-4 shrink-0 text-red-500" /><span>{authError}</span></motion.div>}
                    {authMode === "login" ? (
                      <motion.form key="login-form" initial={{opacity:0}} animate={{opacity:1}} onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Ministry Email</label><input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@govt.in" required className="w-full px-6 py-4.5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-inner" /></div>
                        <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Encrypted Password</label><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" required className="w-full px-6 py-4.5 bg-slate-50 border-none rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-sky-500/10 focus:bg-white transition-all shadow-inner" /></div>
                        <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-black py-5 rounded-[1.5rem] transition-all shadow-2xl uppercase tracking-[0.2em] text-[11px]">Initiate Authorization</button>
                        <div className="relative pt-10"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div><div className="relative flex justify-center text-[9px] font-black uppercase tracking-[0.3em]"><span className="bg-white px-3 text-slate-400 italic">Interoperable Fast-Track</span></div></div>
                        <div className="grid grid-cols-3 gap-3">
                          {["citizen", "official", "admin"].map(role => (
                            <button key={role} type="button" onClick={() => handleQuickLogin(role as any)} className="bg-slate-50 hover:bg-sky-50 hover:text-sky-700 text-[9px] font-black text-slate-500 py-3 rounded-2xl border border-slate-100 transition-all uppercase tracking-widest">{role}</button>
                          ))}
                        </div>
                      </motion.form>
                    ) : (
                      <motion.form key="reg-form" initial={{opacity:0}} animate={{opacity:1}} onSubmit={handleRegister} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Name</label><input type="text" value={regForm.name} onChange={(e) => setRegisterForm({...regForm, name: e.target.value})} required className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold" /></div>
                          <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">ID</label><input type="text" value={regForm.citizenId} onChange={(e) => setRegisterForm({...regForm, citizenId: e.target.value})} required className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold" /></div>
                        </div>
                        <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Email</label><input type="email" value={regForm.email} onChange={(e) => setRegisterForm({...regForm, email: e.target.value})} required className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold" /></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Pass</label><input type="password" value={regForm.password} onChange={(e) => setRegisterForm({...regForm, password: e.target.value})} required className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold" /></div>
                          <div className="space-y-2"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Confirm</label><input type="password" value={regForm.confirmPassword} onChange={(e) => setRegisterForm({...regForm, confirmPassword: e.target.value})} required className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold" /></div>
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-[1.5rem] transition-all shadow-2xl uppercase tracking-[0.2em] text-[11px] mt-2">Generate Profile</button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {token && user && (
          <AnimatePresence mode="wait">
            {activePortalTab === "citizen" && (
              <motion.div key="citizen" {...fadeInUp} className="space-y-12">
                {citizenSubView === "landing" && (
                  <div className="space-y-16">
                    <div className="relative rounded-[4rem] overflow-hidden bg-slate-900 text-white p-20 lg:p-32 border border-slate-800 shadow-[0_40px_100px_rgba(0,0,0,0.25)]">
                      <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-sky-500/10 via-sky-500/5 to-transparent pointer-events-none"></div>
                      <div className="relative z-10 max-w-4xl space-y-12">
                        <div className="inline-flex items-center space-x-3 bg-sky-500/10 border border-sky-400/20 px-6 py-2.5 rounded-full shadow-2xl shadow-sky-900/20"><Cpu className="h-5 w-5 text-sky-400 animate-pulse" /><span className="text-xs font-black uppercase tracking-[0.3em] text-sky-300">Cognitive Orchestrator v1.5</span></div>
                        <h2 className="text-7xl lg:text-9xl font-black tracking-tighter leading-[0.9] text-white">Seamless <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400">Interoperability.</span></h2>
                        <p className="text-2xl text-slate-400 leading-relaxed font-medium max-w-3xl">Coordinating secure data handshakes between ministry silos using <strong>Neural Mapping</strong> and <strong>Immutable SHA-256 Ledgers</strong>. One platform. Total transparency.</p>
                        <div className="flex flex-wrap gap-6 pt-6">
                          <button onClick={() => setCitizenSubView("services")} className="bg-white text-slate-950 px-14 py-7 rounded-[2.5rem] font-[900] text-lg transition-all shadow-[0_20px_50px_rgba(255,255,255,0.1)] hover:scale-105 hover:bg-sky-50 active:scale-95 flex items-center group">Initialize Handshake <ArrowRight className="ml-4 h-7 w-7 group-hover:translate-x-2 transition-transform" /></button>
                          <button className="bg-slate-800/40 hover:bg-slate-800 text-white px-14 py-7 rounded-[2.5rem] font-[900] text-lg border border-slate-700 transition-all flex items-center backdrop-blur-3xl group shadow-2xl"><Globe className="mr-4 h-7 w-7 text-slate-500 group-hover:rotate-12 transition-transform" />Explore Node Map</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                      {[
                        { title: "Smart Select", icon: Search, desc: "AI-driven registry mapping." },
                        { title: "MFA Consent", icon: ShieldCheck, desc: "Granular access tokens." },
                        { title: "Neural Audit", icon: Database, desc: "Trans-silo logic translation." },
                        { title: "Chain Track", icon: Fingerprint, desc: "Immutable lifecycle hashes." }
                      ].map((item, i) => (
                        <div key={i} className="group bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-[0_15px_50px_rgba(0,0,0,0.02)] space-y-6 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"><div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-all"><item.icon className="h-8 w-8" /></div><h3 className="text-xl font-black text-slate-900">{item.title}</h3><p className="text-sm text-slate-500 leading-relaxed font-medium">{item.desc}</p></div>
                      ))}
                    </div>

                    {citizenApps.length > 0 && (
                      <div className="bg-white rounded-[4rem] border border-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden"><div className="px-12 py-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h3 className="font-black text-slate-900 uppercase tracking-[0.3em] text-[10px]">Active Digital LifeCycles</h3></div><div className="divide-y divide-slate-50">
                        {citizenApps.map(app => (
                          <div key={app.id} className="px-12 py-10 flex flex-col sm:flex-row justify-between items-center gap-8 group hover:bg-slate-50/30 transition-all"><div><div className="flex items-center space-x-4 mb-3"><span className="font-mono text-base font-black text-slate-900 tracking-tight">{app.requestId}</span><span className={`px-4 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-widest ${getStatusBadge(app.status)}`}>{app.status}</span></div><h4 className="text-lg font-bold text-slate-600">{app.service.name}</h4></div><button onClick={() => { setCurrentApplication(app); setCitizenSubView("tracking"); }} className="bg-slate-900 hover:bg-black text-white px-10 py-4.5 rounded-[1.5rem] text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-slate-200">Inspect Ledger</button></div>
                        ))}
                      </div></div>
                    )}
                  </div>
                )}

                {citizenSubView === "services" && (
                  <div className="space-y-12">
                    <button onClick={() => setCitizenSubView("landing")} className="flex items-center space-x-3 text-slate-400 hover:text-sky-600 transition-all font-black uppercase tracking-[0.2em] text-[10px] group"><ArrowRight className="h-5 w-5 rotate-180 group-hover:-translate-x-1 transition-transform" /><span>Back to Gateway</span></button>
                    <h2 className="text-5xl font-black text-slate-900 tracking-tight">Select Integrated Node</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {services.map(svc => (
                        <div key={svc.id} className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.02)] hover:shadow-3xl hover:border-sky-200 transition-all duration-700 flex flex-col justify-between space-y-12 group"><div className="space-y-6"><span className="bg-sky-50 text-sky-700 font-black text-[10px] tracking-[0.3em] uppercase px-5 py-2 rounded-full border border-sky-100">Interoperable Microservice</span><h3 className="text-3xl font-black text-slate-900 group-hover:text-sky-600 transition-colors leading-tight">{svc.name}</h3><p className="text-slate-500 text-base leading-relaxed font-medium">{svc.description}</p></div><button onClick={() => { setSelectedService(svc); setCitizenSubView("create"); }} className="w-full bg-slate-950 text-white font-[900] py-6 rounded-[2rem] text-sm uppercase tracking-[0.2em] transition-all hover:bg-sky-700 hover:shadow-[0_20px_50px_rgba(14,165,233,0.3)] shadow-2xl group-hover:scale-[1.02]">Initialize Handshake</button></div>
                      ))}
                    </div>
                  </div>
                )}

                {citizenSubView === "create" && (
                  <div className="max-w-4xl mx-auto space-y-10">
                    <button onClick={() => setCitizenSubView("services")} className="flex items-center space-x-3 text-slate-400 hover:text-sky-600 transition-all font-black uppercase tracking-[0.2em] text-[10px] group"><ArrowRight className="h-5 w-5 rotate-180 group-hover:-translate-x-1 transition-transform" /><span>Back to Registry</span></button>
                    <div className="bg-white p-16 rounded-[4.5rem] border border-slate-100 shadow-[0_40px_100px_rgba(0,0,0,0.06)] space-y-12 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-10 opacity-5"><Zap className="h-32 w-32" /></div>
                      <div className="bg-sky-50/70 p-8 rounded-[2.5rem] border border-sky-100 flex items-center space-x-6 shadow-sm"><ShieldCheck className="h-10 w-10 text-sky-600 shrink-0" /><p className="text-sm font-bold text-sky-950 leading-relaxed tracking-tight">Handshake data auto-mapped from <strong>Neural Registry</strong>. System integrity checks complete.</p></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Identity Name</label><input type="text" value={formInputs.name} onChange={(e) => setFormInputs({...formInputs, name: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[1.75rem] text-base font-black focus:ring-4 focus:ring-sky-500/10 shadow-inner" /></div>
                        <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Citizen Registry ID</label><input type="text" value={formInputs.citizenId} onChange={(e) => setFormInputs({...formInputs, citizenId: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[1.75rem] text-base font-black focus:ring-4 focus:ring-sky-500/10 shadow-inner" /></div>
                        <div className="md:col-span-2 space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Digital Geo-Address</label><textarea value={formInputs.address} onChange={(e) => setFormInputs({...formInputs, address: e.target.value})} rows={3} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[1.75rem] text-base font-black resize-none focus:ring-4 focus:ring-sky-500/10 shadow-inner" /></div>
                      </div>
                        <div className="pt-10 border-t border-slate-50 space-y-6">
                          <label className="block text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] ml-2">Neural Audit Documents (OCR Scan Ready)</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <label className={`group flex flex-col items-center justify-center p-12 rounded-[3rem] border-3 border-dashed transition-all duration-500 cursor-pointer ${uploadedDocs.some(d => d.type === "ID_PROOF") ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xl' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-sky-500 hover:bg-white hover:shadow-2xl'}`}>
                              <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, "ID_PROOF")} />
                              <FileText className="h-10 w-10 mb-4 group-hover:scale-110 transition-transform" />
                              <span className="text-[12px] font-[900] uppercase tracking-widest">{uploadedDocs.find(d=>d.type==="ID_PROOF")?.name || "Aadhaar Vault"}</span>
                            </label>
                            <label className={`group flex flex-col items-center justify-center p-12 rounded-[3rem] border-3 border-dashed transition-all duration-500 cursor-pointer ${uploadedDocs.some(d => d.type === "INCOME_CERT") ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xl' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-sky-500 hover:bg-white hover:shadow-2xl'}`}>
                              <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, "INCOME_CERT")} />
                              <FileText className="h-10 w-10 mb-4 group-hover:scale-110 transition-transform" />
                              <span className="text-[12px] font-[900] uppercase tracking-widest">{uploadedDocs.find(d=>d.type==="INCOME_CERT")?.name || "Revenue Ledger"}</span>
                            </label>
                          </div>
                        </div>
                      <button onClick={handleCreateApplication} className="w-full bg-slate-950 text-white font-[900] py-7 rounded-[2.5rem] text-base uppercase tracking-[0.3em] transition-all hover:bg-sky-700 shadow-[0_30px_70px_rgba(0,0,0,0.1)] active:scale-[0.98]">Authorize Trans-Silo Flow</button>
                    </div>
                  </div>
                )}

                {citizenSubView === "consent" && currentApplication && (
                  <div className="max-w-3xl mx-auto space-y-10">
                    <div className="bg-white p-16 rounded-[4.5rem] border border-slate-100 shadow-[0_50px_120px_rgba(0,0,0,0.1)] space-y-12 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-sky-500 via-indigo-600 to-violet-700 shadow-lg shadow-sky-200/50"></div>
                      <div className="text-center space-y-3"><p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Audit Chain Reference</p><h2 className="text-4xl font-mono font-black text-slate-950 tracking-tighter select-all cursor-copy hover:text-sky-600 transition-colors">{currentApplication.requestId}</h2></div>
                      <div className="space-y-8">
                        <div className="flex items-center space-x-4"><ShieldCheck className="h-8 w-8 text-emerald-600" /><h3 className="font-black text-slate-900 text-2xl tracking-tight">Secure Data Handshake Authorization</h3></div>
                        <div className="space-y-4 bg-slate-50/80 backdrop-blur-sm p-10 rounded-[3rem] border border-slate-100 shadow-inner">
                          {["Identity Master-Registry (Silo A)", "Revenue Ledger (Silo B)", "Skill Certification Audit (Silo C)", "Digital Asset Transfer (Silo D)"].map((dept, i) => (
                            <motion.div key={i} initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} transition={{delay: i*0.1}} className="flex items-center space-x-5"><div className="bg-white p-2 rounded-xl shadow-sm"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div><p className="font-black text-slate-700 text-[13px] uppercase tracking-tight">Allow Orchestrator to query <span className="text-sky-600 underline underline-offset-4 decoration-sky-200">{dept}</span></p></motion.div>
                          ))}
                        </div>
                        <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100/50 flex items-start space-x-4"><AlertTriangle className="h-6 w-6 text-amber-600 mt-1 shrink-0" /><p className="text-xs text-amber-900 font-bold leading-relaxed tracking-tight uppercase">Security Notice: Every transaction in this handshake is signed with your <strong>Private ID Key</strong>. Revocation can be triggered via the Registry Node at any time.</p></div>
                      </div>
                      <button onClick={handleGrantConsent} className="w-full bg-emerald-600 text-white font-[900] py-7 rounded-[2.5rem] text-base uppercase tracking-[0.3em] transition-all hover:bg-emerald-700 hover:shadow-[0_20px_50px_rgba(16,185,129,0.3)] shadow-2xl active:scale-[0.98]">Confirm & Sign Blockchain Ledger</button>
                    </div>
                  </div>
                )}

                {citizenSubView === "tracking" && currentApplication && (
                  <div className="max-w-5xl mx-auto space-y-12">
                    <div className="flex justify-between items-center"><button onClick={() => { fetchCitizenData(); setCitizenSubView("landing"); }} className="flex items-center space-x-3 text-slate-400 hover:text-sky-600 transition-all font-black uppercase tracking-[0.2em] text-[10px] group"><ArrowRight className="h-5 w-5 rotate-180 group-hover:-translate-x-1 transition-transform" /><span>Secure Dashboard</span></button><button onClick={fetchCitizenData} className="bg-white border border-slate-200 text-slate-700 px-10 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] transition-all flex items-center space-x-3 shadow-xl hover:scale-105 active:scale-95"><Cpu className="h-5 w-5 text-sky-600 animate-spin-slow" /><span>Neural Sync Active</span></button></div>
                    <div className="bg-white rounded-[5rem] border border-slate-100 shadow-[0_60px_150px_rgba(0,0,0,0.08)] p-16 lg:p-24 space-y-16 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-1/3 h-full bg-slate-50 opacity-30 skew-x-12 translate-x-1/2 pointer-events-none"></div>
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10 border-b border-slate-50 pb-16 relative z-10">
                        <div><p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.4em] mb-4">Neural LifeCycle Pipeline</p><h2 className="text-5xl font-mono font-black text-slate-950 tracking-tighter select-all">{currentApplication.requestId}</h2><div className="inline-flex items-center space-x-2 mt-5 bg-sky-50 px-4 py-2 rounded-full border border-sky-100"><Zap className="h-3 w-3 text-sky-600" /><span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">{currentApplication.service.name}</span></div></div>
                        <div className="text-right flex flex-col items-end"><p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.4em] mb-4">Pipeline State</p><span className={`px-10 py-3 rounded-full text-[12px] font-black border-2 uppercase tracking-[0.2em] shadow-xl ${getStatusBadge(currentApplication.status)}`}>{currentApplication.status}</span></div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-20 relative z-10">
                        <div className="lg:col-span-3 space-y-16">
                          <div className="flow-root"><ul className="-mb-16">
                            {currentApplication.workflow?.steps.map((step, idx) => (
                              <motion.li key={step.id} initial={{opacity:0, x:-30}} animate={{opacity:1, x:0}} transition={{delay: idx*0.1}} className="relative pb-16">
                                {idx !== (currentApplication.workflow?.steps.length ?? 0) - 1 && <span className="absolute left-6 top-8 -ml-px h-full w-1 bg-gradient-to-b from-slate-100 via-slate-50 to-transparent" />}
                                <div className="relative flex space-x-10">
                                  <div className="group cursor-help">{getStepStatusIcon(step.status)}</div>
                                  <div className="flex-1 pt-2 space-y-4"><div className="flex justify-between items-center"><h3 className="font-black text-slate-950 text-base uppercase tracking-[0.1em]">{step.stepName.replace(/_/g, ' ')}</h3><span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{new Date(step.updatedAt).toLocaleTimeString()}</span></div>
                                    {step.errorMessage && <p className="text-[11px] text-red-600 font-black mt-2 bg-red-50 p-5 rounded-[1.5rem] border-2 border-red-100 uppercase tracking-tight">{step.errorMessage}</p>}
                                    {step.status === "COMPLETED" && step.responsePayload && <div className="mt-4 p-8 bg-slate-900 rounded-[2.5rem] border border-white/5 space-y-4 shadow-2xl overflow-hidden relative"><div className="absolute top-0 right-0 p-6 opacity-10"><Database className="h-20 w-24" /></div><div className="flex justify-between items-center relative z-10"><span className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em]">Silo Response Data</span><div className="flex items-center space-x-1.5 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20"><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-[8px] font-black text-emerald-400 uppercase">Integrity OK</span></div></div><pre className="text-[11px] font-mono text-slate-400 font-bold overflow-x-auto selection:bg-sky-500/30 relative z-10">{JSON.stringify(step.responsePayload, null, 2)}</pre></div>}
                                  </div>
                                </div>
                              </motion.li>
                            ))}
                          </ul></div>
                        </div>
                        <div className="space-y-10">
                          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="bg-slate-950 text-white p-10 rounded-[3.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.3)] space-y-8 relative overflow-hidden border border-white/10 group hover:border-sky-500/40 transition-all duration-700">
                            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-20 group-hover:rotate-12 transition-all duration-700"><Fingerprint className="h-24 w-24" /></div>
                            <div className="flex items-center space-x-4 relative z-10"><div className="bg-sky-500/10 p-3 rounded-2xl border border-sky-500/20"><ShieldCheck className="h-7 w-7 text-sky-400" /></div><h4 className="font-black uppercase tracking-[0.2em] text-[12px]">Chain Identity</h4></div>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-black uppercase tracking-tight relative z-10">This pipeline is secured with <strong>AES-256 GCM</strong>. Every state transition is hashed via <strong>SHA-256</strong> to an immutable audit ledger.</p>
                            <div className="pt-8 border-t border-white/10 space-y-4 relative z-10"><div className="flex justify-between items-center"><span className="text-[9px] font-black uppercase text-slate-500 tracking-[0.3em]">Node Signature</span><span className="text-[9px] font-mono text-emerald-400 uppercase font-black tracking-widest">Verified</span></div><div className="bg-white/5 p-5 rounded-2xl font-mono text-[10px] break-all text-slate-500 select-all border border-white/5 group-hover:text-sky-300 transition-colors">0x9FA2E...BC8417</div></div>
                          </motion.div>
                        </div>
                      </div>

                      {currentApplication.status === "COMPLETED" && (
                        <motion.div initial={{opacity:0, y:30}} animate={{opacity:1, y:0}} className="bg-emerald-600 rounded-[4rem] p-16 text-white shadow-[0_40px_100px_rgba(16,185,129,0.3)] border-b-8 border-emerald-800 space-y-10 relative overflow-hidden">
                          <div className="absolute -top-10 -right-10 opacity-10"><ShieldCheck className="h-64 w-64" /></div>
                          <div className="flex items-center space-x-6 relative z-10"><div className="bg-white/20 p-4 rounded-3xl backdrop-blur-xl border border-white/20"><CheckCircle2 className="h-12 w-12 text-white" /></div><h3 className="text-5xl font-black tracking-tighter">Handshake Successful.</h3></div>
                          <p className="text-xl font-bold text-emerald-50 leading-relaxed max-w-4xl relative z-10">SetuGov Core has successfully orchestrated verifications across 4 ministry silos. Your digital scheme asset transfer has been committed to the final disbursement ledger.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                            {[
                              { l: "Transfer ID", v: "DBT-2026-988", i: Fingerprint },
                              { l: "Silo Final Result", v: "AUTHORIZED", i: ShieldCheck },
                              { l: "Integrity Confidence", v: "98.4%", i: Cpu },
                              { l: "Disbursement", v: "SUCCESS", i: Zap }
                            ].map((s, i) => (
                              <div key={i} className="bg-black/10 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10 space-y-2"><s.i className="h-5 w-5 mb-2 opacity-50" /><p className="text-[10px] font-black uppercase tracking-widest opacity-60">{s.l}</p><p className="text-sm font-black tracking-wider">{s.v}</p></div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activePortalTab === "official" && (
              <motion.div key="official" {...fadeInUp} className="space-y-12">
                <div className="flex justify-between items-center"><div><h2 className="text-5xl font-black text-slate-900 tracking-tight">Official Panel</h2><p className="text-slate-500 text-lg mt-3 font-medium">Neural governance and trans-silo review hub.</p></div><button onClick={fetchOfficialData} className="bg-white border-2 border-slate-200 text-slate-950 px-10 py-5 rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl hover:scale-105 active:scale-95">Sync Global Queue</button></div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  <div className="lg:col-span-2 bg-white rounded-[4rem] border border-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col"><div className="px-12 py-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h3 className="font-black text-slate-900 text-[11px] uppercase tracking-[0.3em]">Integrity Queue Master</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs divide-y divide-slate-100">
                    <thead className="bg-slate-50/30 text-slate-400 font-black uppercase tracking-[0.3em]"><tr><th className="px-12 py-6">Reference ID</th><th className="px-12 py-6">Node Participant</th><th className="px-12 py-6">State</th><th className="px-12 py-6">Handshake</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">{officialApps.map(app => (
                      <tr key={app.id} onClick={() => { setSelectedOfficialApp(app); fetch(`${BACKEND_URL}/api/official/applications/${app.id}/audit`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()).then(logs => setOfficialAppAudit(logs)); }} className={`cursor-pointer group hover:bg-sky-50/40 transition-all duration-500 ${selectedOfficialApp?.id === app.id ? 'bg-sky-50/60' : ''}`}><td className="px-12 py-8 font-mono font-black text-slate-950 text-sm tracking-tighter">{app.requestId}</td><td className="px-12 py-8"><div><div className="font-black text-slate-800 text-base mb-1 tracking-tight">{app.citizen.name}</div><div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{app.citizen.citizenId}</div></div></td><td className="px-12 py-8"><span className={`px-5 py-2 rounded-full text-[10px] font-black border-2 uppercase tracking-widest ${getStatusBadge(app.status)} shadow-sm`}>{app.status}</span></td><td className="px-12 py-8 text-slate-400 font-black uppercase tracking-widest text-[9px]">{new Date(app.updatedAt).toLocaleTimeString()}</td></tr>
                    ))}</tbody></table></div></div>
                  <div className="bg-white rounded-[4rem] border border-slate-100 shadow-[0_40px_100px_rgba(0,0,0,0.05)] p-12 space-y-12 h-fit relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-12 opacity-5"><LayoutDashboard className="h-48 w-48 rotate-12" /></div>
                    {selectedOfficialApp ? (
                      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-12 relative z-10">
                        <div className="space-y-6"><div className="flex justify-between items-center"><span className="font-mono text-2xl font-black text-slate-950 tracking-tighter">{selectedOfficialApp.requestId}</span><span className={`px-5 py-2 rounded-full text-[10px] font-black border-2 uppercase tracking-widest ${getStatusBadge(selectedOfficialApp.status)}`}>{selectedOfficialApp.status}</span></div><h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.3em]">{selectedOfficialApp.service.name}</h3></div>
                        <div className="space-y-6 pt-10 border-t border-slate-50"><h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">Registry Handshake Profile</h4><div className="bg-slate-50/80 p-8 rounded-[2.5rem] space-y-4 shadow-inner"><div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digital Name</span><span className="text-sm font-black text-slate-950 tracking-tight">{selectedOfficialApp.citizen.name}</span></div><div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registry ID</span><span className="text-sm font-mono font-black text-slate-950 tracking-tighter">{selectedOfficialApp.citizen.citizenId}</span></div></div></div>
                        <div className="space-y-6"><h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">Trans-Silo Transitions</h4><div className="space-y-5">
                          {selectedOfficialApp.workflow?.steps.map(step => (
                            <div key={step.id} className="p-6 rounded-[2rem] border border-slate-50 bg-slate-50/30 space-y-5 transition-all hover:bg-white hover:shadow-xl hover:border-sky-100 group">
                              <div className="flex justify-between items-center"><div className="font-black text-slate-900 text-[11px] uppercase tracking-[0.2em] group-hover:text-sky-600 transition-colors">{step.stepName.replace(/_/g, ' ')}</div><span className={`px-4 py-1.5 rounded-full text-[9px] font-black border-2 uppercase tracking-widest ${getStatusBadge(step.status)}`}>{step.status}</span></div>
                              {step.status === "PENDING_APPROVAL" && <div className="space-y-4 pt-2"><div className="bg-slate-900 p-6 rounded-[1.5rem] border border-white/5 font-mono text-[10px] text-slate-400 overflow-x-auto max-h-48 shadow-2xl selection:bg-sky-500/40">{JSON.stringify(step.responsePayload, null, 2)}</div><div className="flex gap-3"><button onClick={() => handleOfficialAction(step.id, "approve")} className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.2em] shadow-[0_15px_40px_rgba(16,185,129,0.3)] hover:bg-emerald-700 hover:scale-[1.02] transition-all">Confirm Audit</button><button onClick={() => handleOfficialAction(step.id, "reject")} className="flex-1 bg-white text-red-600 border-2 border-red-100 font-black py-4 rounded-2xl text-[11px] uppercase tracking-[0.2em] hover:bg-red-50 transition-all">Reject</button></div></div>}
                            </div>
                          ))}
                        </div></div>
                      </motion.div>
                    ) : <div className="h-[600px] flex flex-col items-center justify-center text-center space-y-8 relative z-10"><div className="bg-slate-50 p-10 rounded-[3rem] shadow-inner"><LayoutDashboard className="h-20 w-20 text-slate-200" /></div><p className="text-slate-400 font-black uppercase tracking-[0.4em] text-[11px]">Neural Handshake Node <br /> Awaiting Selection</p></div>}
                  </div>
                </div>
              </motion.div>
            )}

            {activePortalTab === "admin" && (
              <motion.div key="admin" {...fadeInUp} className="space-y-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div><h2 className="text-5xl font-black text-slate-900 tracking-tight">Infrastructure Core</h2><div className="flex space-x-8 mt-6"><button onClick={() => setAdminTab("overview")} className={`text-[11px] font-black uppercase tracking-[0.3em] pb-3 border-b-6 transition-all ${adminTab === "overview" ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400'}`}>System Signals</button><button onClick={() => setAdminTab("ecosystem")} className={`text-[11px] font-black uppercase tracking-[0.3em] pb-3 border-b-6 transition-all ${adminTab === "ecosystem" ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-400'}`}>Ecosystem Map</button></div></div>
                  {adminTab === "overview" && <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.03)] flex items-center space-x-8"><span className="text-[11px] font-[900] text-slate-400 uppercase tracking-[0.2em] ml-2">Neural Sim Engine</span><div className="flex gap-3"><button onClick={() => toggleDeptBFailure(true)} className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${deptBFailed ? 'bg-red-600 text-white shadow-2xl shadow-red-500/40 border-b-4 border-red-800' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>Kill Silo B</button><button onClick={() => toggleDeptBFailure(false)} className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${!deptBFailed ? 'bg-emerald-600 text-white shadow-2xl shadow-emerald-500/40 border-b-4 border-emerald-800' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50'}`}>Restore</button></div></div>}
                </div>

                {adminTab === "overview" ? (
                  <div className="space-y-12">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                      {connectors.map(c => (
                        <div key={c.id} className="group bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-[0_15px_40px_rgba(0,0,0,0.02)] space-y-8 hover:shadow-3xl transition-all duration-700 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-150 transition-all duration-1000"><Cpu className="h-24 w-24" /></div>
                          <div className="flex justify-between items-start relative z-10"><span className="bg-slate-50 text-slate-500 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-slate-100">{c.type}</span><div className={`h-3 w-3 rounded-full ${c.status === "ACTIVE" ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.8)]'}`} /></div>
                          <div className="relative z-10"><h4 className="font-black text-slate-950 text-lg mb-2 tracking-tight">{c.name}</h4><p className="text-[10px] text-slate-400 font-[900] uppercase tracking-[0.3em]">{c.department}</p></div>
                          <div className="pt-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] relative z-10"><span className="text-slate-400 opacity-60">Silo Pulse</span><span className={c.status === "ACTIVE" ? 'text-emerald-600' : 'text-red-600'}>{c.status === "ACTIVE" ? 'Active' : 'Halted'}</span></div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-[4rem] border border-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col mb-16"><div className="px-12 py-8 border-b border-slate-50 bg-slate-50/50"><h3 className="font-black text-slate-900 text-[11px] uppercase tracking-[0.4em]">Trans-Silo Latency Matrix</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs divide-y divide-slate-100">
                      <thead className="bg-slate-50/30 text-slate-400 font-black uppercase tracking-[0.4em]"><tr><th className="px-12 py-8">LifeCycle Node</th><th className="px-12 py-8">Ministry Silo</th><th className="px-12 py-8">Handshake Step</th><th className="px-12 py-8">Neural Latency</th><th className="px-12 py-8">SLA Compliance</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">{slaRecords.map(sla => { const dur = sla.endTime ? `${Math.round((new Date(sla.endTime).getTime() - new Date(sla.startTime).getTime()) / 1000)}s` : "Scanning..."; return (
                        <tr key={sla.id} className="hover:bg-sky-50/30 transition-all group font-medium text-slate-600"><td className="px-12 py-8 font-mono font-black text-slate-950 text-sm tracking-tighter">{sla.application?.requestId}</td><td className="px-12 py-8 font-[900] text-slate-700 tracking-tight uppercase text-[11px]">{sla.department?.name}</td><td className="px-12 py-8 font-black uppercase tracking-[0.2em] text-[10px] text-slate-500 italic">{sla.stepName.replace(/_/g, ' ')}</td><td className="px-12 py-8 font-mono font-black text-sky-600/60">{dur}</td><td className="px-12 py-8"><span className={`px-6 py-2 rounded-full text-[10px] font-[900] border-2 uppercase tracking-[0.3em] shadow-sm ${sla.status === "COMPLETED" ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sla.status === "BREACHED" ? 'bg-red-50 text-red-700 border-red-200 shadow-red-100' : 'bg-blue-50 text-blue-700 border-blue-200 shadow-blue-100 animate-pulse'}`}>{sla.status}</span></td></tr>
                      ); })}</tbody></table></div></div>
                  </div>
                ) : (
                  <div className="space-y-12">
                    <div className="bg-slate-950 rounded-[5rem] p-24 relative overflow-hidden min-h-[800px] shadow-[0_80px_200px_rgba(0,0,0,0.4)] border border-white/5 group">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-900/30 via-indigo-950/10 to-transparent opacity-60"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center space-y-10 group-hover:scale-110 transition-transform duration-1000">
                        <div className="relative"><div className="absolute inset-0 bg-sky-500 blur-[100px] opacity-20 group-hover:opacity-40 transition-all duration-1000 animate-pulse"></div><div className="bg-gradient-to-tr from-sky-600 to-indigo-700 p-16 rounded-[4rem] shadow-[0_0_120px_rgba(14,165,233,0.4)] border border-white/10 relative z-10"><Cpu className="h-40 w-40 text-white animate-spin-slow" /></div></div>
                        <div><h3 className="text-6xl font-black text-white tracking-tighter uppercase leading-none">SetuGov Core</h3><p className="text-sky-400 font-black uppercase tracking-[0.6em] text-[12px] mt-4 flex items-center justify-center gap-3"><Zap className="h-4 w-4 fill-sky-400" /> Trans-Silo Hub v1.5 <Zap className="h-4 w-4 fill-sky-400" /></p></div>
                      </div>

                      {[
                        { name: "Identity (Silo A)", pos: "top-32 left-1/4 -translate-x-1/2", icon: User, color: "sky" },
                        { name: "Revenue (Silo B)", pos: "top-32 right-1/4 translate-x-1/2", icon: Database, color: deptBFailed ? "red" : "sky" },
                        { name: "Skills (Silo C)", pos: "bottom-32 left-1/4 -translate-x-1/2", icon: Settings, color: "sky" },
                        { name: "Finance (Silo D)", pos: "bottom-32 right-1/4 translate-x-1/2", icon: Globe, color: "sky" }
                      ].map((node, i) => (
                        <div key={i} className={`absolute ${node.pos} z-10 flex flex-col items-center space-y-6 group/node`}>
                          <div className={`bg-slate-900/60 backdrop-blur-3xl p-10 rounded-[3.5rem] border-2 ${node.color === 'red' ? 'border-red-500/40 shadow-[0_0_50px_rgba(239,68,68,0.2)]' : 'border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)]'} transition-all duration-700 group-hover/node:border-sky-400 group-hover/node:scale-125 group-hover/node:-translate-y-4`}>
                            <div className={`${node.color === 'red' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-sky-500/20 text-sky-400'} p-5 rounded-3xl mb-6 inline-block shadow-inner`}><node.icon className="h-10 w-10" /></div>
                            <div className="text-[12px] font-black text-white uppercase tracking-[0.3em] text-center">{node.name}</div>
                            <div className="mt-4 flex gap-1 justify-center opacity-30 group-hover/node:opacity-100 transition-opacity">{[1,2,3].map(d=><div key={d} className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce" style={{animationDelay:`${d*0.1}s`}}></div>)}</div>
                          </div>
                          <div className={`h-32 w-1 bg-gradient-to-b from-${node.color === 'red' ? 'red-500' : 'sky-500'}/60 via-${node.color === 'red' ? 'red-500' : 'sky-500'}/10 to-transparent rounded-full shadow-[0_0_20px_rgba(14,165,233,0.2)]`}></div>
                        </div>
                      ))}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10 group-hover:opacity-30 transition-opacity duration-1000"><line x1="25%" y1="25%" x2="50%" y2="50%" stroke="white" strokeWidth="2" strokeDasharray="20,10" className="animate-dash" /><line x1="75%" y1="25%" x2="50%" y2="50%" stroke="white" strokeWidth="2" strokeDasharray="20,10" className="animate-dash" /><line x1="25%" y1="75%" x2="50%" y2="50%" stroke="white" strokeWidth="2" strokeDasharray="20,10" className="animate-dash" /><line x1="75%" y1="75%" x2="50%" y2="50%" stroke="white" strokeWidth="2" strokeDasharray="20,10" className="animate-dash" /></svg>
                    </div>
                    <div className="grid grid-cols-3 gap-10">
                      {[
                        { l: "System Throughput", v: "14.2 GB/s", i: Zap, c: "sky" },
                        { l: "Registry Uptime", v: "99.999%", i: ShieldCheck, c: "emerald" },
                        { l: "Active Handshakes", v: "1,284", i: Cpu, c: "violet" }
                      ].map((s, i) => (
                        <div key={i} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-[0_30px_70px_rgba(0,0,0,0.03)] space-y-4 group hover:shadow-2xl transition-all duration-700">
                          <div className="flex items-center space-x-3 text-slate-400 font-black uppercase tracking-[0.4em] text-[10px]"><s.i className="h-4 w-4" /> <span>{s.l}</span></div>
                          <div className="flex items-end space-x-3"><span className="text-5xl font-black text-slate-950 tracking-tighter leading-none">{s.v.split(' ')[0]}</span><span className="text-slate-400 font-black text-sm mb-1 uppercase tracking-widest">{s.v.split(' ')[1]}</span></div>
                          <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden mt-6 shadow-inner"><motion.div initial={{width:0}} animate={{width:"85%"}} transition={{duration:2, delay:i*0.2}} className={`bg-${s.c}-500 h-full shadow-[0_0_15px_rgba(0,0,0,0.1)]`} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      <footer className="bg-slate-950 text-white py-24 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-20 opacity-[0.02] -rotate-12 translate-x-1/2"><Fingerprint className="h-96 w-96" /></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-16 relative z-10">
          <div className="space-y-8 max-w-md">
            <div className="flex items-center space-x-4">
              <div className="bg-sky-600 p-3 rounded-2xl shadow-xl shadow-sky-900/40"><ShieldCheck className="h-8 w-8 text-white" /></div>
              <h4 className="text-4xl font-black tracking-tighter uppercase">SETU<span className="text-sky-500">GOV</span></h4>
            </div>
            <p className="text-slate-500 text-lg font-medium leading-relaxed italic">"Architecting secure interoperability for the digital sovereign state."</p>
          </div>
          <div className="text-right space-y-6">
            <div className="space-y-2"><p className="text-[12px] font-black text-white uppercase tracking-[0.4em]">Smart India Hackathon 2026</p><p className="text-[12px] font-black text-sky-500 uppercase tracking-[0.4em]">Problem Statement 26129</p></div>
            <p className="text-[11px] font-[900] text-slate-700 uppercase tracking-[0.5em] pt-6">&copy; Gov of Maharashtra Digital Ecosystem</p>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        @keyframes dash { to { stroke-dashoffset: -100; } }
        .animate-dash { animation: dash 5s linear infinite; stroke-dasharray: 20, 10; }
        .shadow-3xl { shadow: 0 50px 150px -20px rgba(0, 0, 0, 0.45); }
      `}</style>
    </div>
  );
}

function getConnectorLabelForStepName(stepName: string) {
  switch (stepName) {
    case "IDENTITY_VERIFICATION": return { title: "Identity Silo A", desc: "AES-256 Auth Node Query." };
    case "ELIGIBILITY_VERIFICATION": return { title: "Revenue Silo B", desc: "Automated Registry Audit." };
    case "EMPLOYMENT_VERIFICATION": return { title: "Skill Silo C", desc: "Cognitive Certification Handshake." };
    case "SERVICE_PROCESSING": return { title: "Finance Silo D", desc: "Digital Asset Settlement Hub." };
    default: return { title: "System Node", desc: "Trans-silo orchestration." };
  }
}
