"use client";

import React, { useState, useEffect, useCallback } from "react";

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
        // Switch tab based on role if current application is not being tracked
        if (!currentApplication) {
          if (userData.role === "CITIZEN") setActivePortalTab("citizen");
          if (userData.role === "OFFICIAL") setActivePortalTab("official");
          if (userData.role === "ADMIN") setActivePortalTab("admin");
        }
      } else {
        // Only wipe token if it's actually invalid (401/403)
        if (res.status === 401 || res.status === 403) {
          console.error("Auth session expired or invalid");
          localStorage.removeItem("setugov_token");
          setToken(null);
          setUser(null);
        }
      }
    } catch {
      // Network error, don't necessarily logout
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
        // If there's an active application being tracked, refresh it
        if (currentApplication) {
          const updated = apps.find((a: Application) => a.id === currentApplication.id);
          if (updated) {
            setCurrentApplication(updated);
          }
        }
      }

      // Fetch notifications
      const notifRes = await fetch(`${BACKEND_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (notifRes.ok) {
        setNotifications(await notifRes.json());
      }
    } catch (err) {
      console.error("Error fetching citizen apps:", err);
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
        
        // Refresh selected official application details
        if (selectedOfficialApp) {
          const updated = apps.find((a: Application) => a.id === selectedOfficialApp.id);
          if (updated) {
            // Also fetch workflow & logs for details view
            const wfRes = await fetch(`${BACKEND_URL}/api/official/applications/${updated.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (wfRes.ok) {
              const fullDetails = await wfRes.json();
              setSelectedOfficialApp(fullDetails);
            }
            
            const auditRes = await fetch(`${BACKEND_URL}/api/official/applications/${updated.id}/audit`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (auditRes.ok) {
              const logs = await auditRes.json();
              setOfficialAppAudit(logs);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching official apps:", err);
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
      if (connRes.ok) {
        setConnectors(await connRes.json());
      }

      const eventRes = await fetch(`${BACKEND_URL}/api/admin/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (eventRes.ok) {
        setSystemEvents(await eventRes.json());
      }

      const logRes = await fetch(`${BACKEND_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (logRes.ok) {
        setAuditLogs(await logRes.json());
      }

      const slaRes = await fetch(`${BACKEND_URL}/api/admin/sla`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (slaRes.ok) {
        setSlaRecords(await slaRes.json());
      }
    } catch (err) {
      console.error("Error fetching admin dashboard:", err);
    }
  }, [token]);

  // Global Poller (auto refresh databases for real-time tracking)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (activePortalTab === "citizen") {
        fetchCitizenData();
      } else if (activePortalTab === "official") {
        fetchOfficialData();
      } else if (activePortalTab === "admin") {
        fetchAdminData();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [token, activePortalTab, fetchCitizenData, fetchOfficialData, fetchAdminData]);

  // Fetch services when loading
  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/services`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setServices(data);
        if (data.length > 0) {
          setSelectedService(data[0]);
        }
      });
  }, [token]);

  // Sign In Action
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
      if (!res.ok) {
        setAuthError(data.error || "Login failed");
        return;
      }

      localStorage.setItem("setugov_token", data.token);
      setToken(data.token);
      // fetchProfile will be triggered by token change
    } catch (err) {
      setAuthError("Failed to connect to backend server");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (regForm.password !== regForm.confirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regForm.email,
          password: regForm.password,
          citizenId: regForm.citizenId,
          name: regForm.name,
          dob: regForm.dob,
          address: regForm.address,
          contact: regForm.contact,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Registration failed");
        return;
      }

      localStorage.setItem("setugov_token", data.token);
      setToken(data.token);
    } catch (err) {
      setAuthError("Network error during registration");
    }
  };

  // Quick credentials picker for SIH presentation
  const handleQuickLogin = (role: "citizen" | "official" | "admin") => {
    let email = "citizen@setugov.in";
    if (role === "official") email = "official@setugov.in";
    if (role === "admin") email = "admin@setugov.in";
    
    setLoginEmail(email);
    setLoginPassword("password123");
    
    // Automatically trigger form submit
    setTimeout(() => {
      fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            localStorage.setItem("setugov_token", data.token);
            setToken(data.token);
            setUser(data.user);
          }
        });
    }, 100);
  };

  const handleLogout = () => {
    localStorage.removeItem("setugov_token");
    setToken(null);
    setUser(null);
    setCitizenSubView("landing");
    setCurrentApplication(null);
    setSelectedOfficialApp(null);
    setNotifications([]);
    setShowNotifications(false);
  };

  // Submit Application Form Action
  const handleCreateApplication = async () => {
    if (!selectedService || !token) return;
    setApplicationError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceId: selectedService.id,
          formValues: formInputs,
          documents: uploadedDocs, // Pass uploaded docs
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setApplicationError(data.error || "Failed to submit application");
        return;
      }

      setCurrentApplication(data);
      setConsentGranted(false);
      setCitizenSubView("consent");
    } catch (err) {
      setApplicationError("Could not submit request. Check network connection.");
    }
  };

  // Submit Consent Action
  const handleGrantConsent = async () => {
    if (!currentApplication || !token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/applications/${currentApplication.id}/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "GRANTED",
          purpose: "Verification of identity and eligibility for social schemes",
          version: "1.0",
        }),
      });

      if (res.ok) {
        setConsentGranted(true);
        const data = await res.json();
        setCurrentApplication(data.application);
        setCitizenSubView("tracking");
        fetchCitizenData();
      }
    } catch (err) {
      console.error("Error submitting consent:", err);
    }
  };

  // Official Approval Action
  const handleOfficialAction = async (stepId: string, action: "approve" | "reject") => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/official/workflow-steps/${stepId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchOfficialData();
      }
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error("Error marking notification read:", err);
    }
  };

  // Toggle failure states (Admin Dashboard Controls)
  const toggleDeptBFailure = async (simulate: boolean) => {
    if (!token) return;
    const url = simulate 
      ? `${BACKEND_URL}/api/admin/demo/department-b/failure` 
      : `${BACKEND_URL}/api/admin/demo/department-b/restore`;
      
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeptBFailed(simulate);
        fetchAdminData();
      }
    } catch (err) {
      console.error("Error toggling failure state:", err);
    }
  };

  // Helper for tracking page status color badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800 border-green-200";
      case "IN_PROGRESS":
        return "bg-blue-100 text-blue-800 border-blue-200 animate-pulse";
      case "PENDING_APPROVAL":
      case "WAITING":
      case "RETRYING":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "FAILED":
      case "EXCEPTION":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white ring-8 ring-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white ring-8 ring-white animate-pulse">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        );
      case "PENDING_APPROVAL":
      case "WAITING":
      case "RETRYING":
        return (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white ring-8 ring-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
        );
      case "FAILED":
        return (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white ring-8 ring-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        );
      default:
        return (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-slate-600 ring-8 ring-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
            </svg>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* 1. Official Banner / Alert */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-4 py-2 text-xs font-semibold tracking-wide flex justify-between items-center shadow-inner">
        <div className="flex items-center space-x-2">
          <svg className="h-4 w-4 text-amber-200 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>DEMONSTRATION ENVIRONMENT: DEPARTMENT APIS ARE SIMULATED SCHEMAS. NO CITIZEN DATA IS SHARED.</span>
        </div>
        <span className="hidden sm:inline border border-amber-400 bg-amber-800/40 px-2 py-0.5 rounded text-[10px]">SIH 2026 MVP</span>
      </div>

      {/* 2. Government Styled Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo area */}
            <div className="flex items-center space-x-4 cursor-pointer" onClick={() => setCitizenSubView("landing")}>
              {/* Symbolic seal icon */}
              <div className="bg-gradient-to-tr from-sky-800 to-indigo-900 p-2.5 rounded-xl shadow-md text-white">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center">
                  <span>SETU</span>
                  <span className="text-sky-700">GOV</span>
                </h1>
                <p className="text-[9px] uppercase font-black tracking-widest text-slate-400">Maharashtra Middleware Gateway</p>
              </div>
            </div>

            {/* Quick Access Switcher & Profiles */}
            <div className="flex items-center space-x-4">
              {token ? (
                <>
                  <nav className="hidden lg:flex items-center space-x-1 bg-slate-100/50 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setActivePortalTab("citizen")}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        activePortalTab === "citizen" ? "bg-white shadow-sm text-sky-700" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      Citizen
                    </button>
                    {(user?.role === "OFFICIAL" || user?.role === "ADMIN") && (
                      <button
                        onClick={() => setActivePortalTab("official")}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          activePortalTab === "official" ? "bg-white shadow-sm text-sky-700" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Official
                      </button>
                    )}
                    {user?.role === "ADMIN" && (
                      <button
                        onClick={() => setActivePortalTab("admin")}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          activePortalTab === "admin" ? "bg-white shadow-sm text-sky-700" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Admin
                      </button>
                    )}
                  </nav>

                  <div className="flex items-center space-x-3 pl-3 border-l border-slate-200">
                    {/* Notification Bell */}
                    <div className="relative">
                      <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 p-2 rounded-lg transition relative"
                        title="Notifications"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {notifications.filter(n => !n.read).length > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] text-white items-center justify-center font-bold">
                              {notifications.filter(n => !n.read).length}
                            </span>
                          </span>
                        )}
                      </button>

                      {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl z-[100] overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-900 uppercase tracking-widest">Recent Activity</span>
                            <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                              <div className="p-8 text-center text-slate-400 text-xs font-medium">No new activity to show.</div>
                            ) : (
                              notifications.map(n => (
                                <div
                                  key={n.id}
                                  onClick={() => markNotificationRead(n.id)}
                                  className={`p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition ${!n.read ? 'bg-sky-50/30' : ''}`}
                                >
                                  <div className="flex items-start space-x-3">
                                    <div className={`mt-1 shrink-0 h-2 w-2 rounded-full ${!n.read ? 'bg-sky-500' : 'bg-slate-300'}`}></div>
                                    <div>
                                      <p className="text-xs text-slate-800 leading-tight">{n.message}</p>
                                      <p className="text-[10px] text-slate-400 mt-1">{new Date(n.timestamp).toLocaleTimeString()}</p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">{user?.email}</div>
                      <span className="inline-block text-[9px] uppercase font-bold tracking-widest text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded mt-0.5">
                        {user?.role}
                      </span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 p-2 rounded-lg transition"
                      title="Log Out"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">Quick Demo Login:</span>
                  <button
                    onClick={() => handleQuickLogin("citizen")}
                    className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    Citizen
                  </button>
                  <button
                    onClick={() => handleQuickLogin("official")}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    Official
                  </button>
                  <button
                    onClick={() => handleQuickLogin("admin")}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                  >
                    Admin
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 3. Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Loading State */}
        {isAuthLoading && !token && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-700"></div>
            <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-[10px]">Secure Gateway Handshake...</p>
          </div>
        )}

        {/* Unauthenticated View */}
        {!token && !isAuthLoading && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12 items-center py-12">
            
            {/* Left Side: Brand & Mission */}
            <div className="lg:col-span-3 space-y-8">
              <div className="space-y-4">
                <span className="bg-sky-100 text-sky-700 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-sky-200">
                  Government of Maharashtra Initiative
                </span>
                <h2 className="text-5xl font-black text-slate-900 leading-[1.1] tracking-tight">
                  The Bridge Between <span className="text-sky-700 underline decoration-sky-300 underline-offset-8">Government</span> and <span className="text-indigo-700 underline decoration-indigo-300 underline-offset-8">Citizens</span>.
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
                  SetuGov is the unified interoperability layer that streamlines cross-departmental coordination. No more repeated uploads. No more fragmented status tracking. One portal for all your service needs.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                  <div className="bg-sky-50 p-2 rounded-lg inline-block text-sky-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-slate-900">Unified Identity</h4>
                  <p className="text-xs text-slate-500">Secure SSO integration across all ministry departments.</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                  <div className="bg-emerald-50 p-2 rounded-lg inline-block text-emerald-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-slate-900">Consent Led</h4>
                  <p className="text-xs text-slate-500">You control who accesses your sensitive government records.</p>
                </div>
              </div>
            </div>

            {/* Right Side: Auth Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="flex border-b border-slate-100">
                  <button
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${authMode === "login" ? 'text-sky-700 bg-white border-b-2 border-sky-600' : 'text-slate-400 bg-slate-50/50 hover:text-slate-600'}`}
                  >
                    Citizen Login
                  </button>
                  <button
                    onClick={() => setAuthMode("register")}
                    className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${authMode === "register" ? 'text-sky-700 bg-white border-b-2 border-sky-600' : 'text-slate-400 bg-slate-50/50 hover:text-slate-600'}`}
                  >
                    Register Profile
                  </button>
                </div>

                <div className="p-8">
                  {authError && (
                    <div className="bg-red-50 text-red-800 text-xs p-4 rounded-xl border border-red-100 flex items-start space-x-3 mb-6 animate-shake">
                      <svg className="h-4 w-4 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold">{authError}</span>
                    </div>
                  )}

                  {authMode === "login" ? (
                    <form onSubmit={handleLogin} className="space-y-5">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                        <input
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="name@govt.in"
                          required
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white transition-all"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                          <a href="#" className="text-[10px] font-bold text-sky-600 hover:text-sky-700 uppercase tracking-widest">Forgot?</a>
                        </div>
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white transition-all"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 px-4 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] uppercase tracking-widest text-xs"
                      >
                        Authorize & Login
                      </button>

                      {/* QUICK LOGIN DEMO FAST-TRACK (Now inside the form) */}
                      <div className="relative pt-6">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t border-slate-100"></div>
                        </div>
                        <div className="relative flex justify-center text-[9px] font-bold uppercase tracking-widest">
                          <span className="bg-white px-2 text-slate-400">Demo Fast-Track</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <button type="button" onClick={() => handleQuickLogin("citizen")} className="bg-slate-50 hover:bg-slate-100 text-[9px] font-black text-slate-500 py-2 rounded-xl border border-slate-200 transition uppercase">Citizen</button>
                        <button type="button" onClick={() => handleQuickLogin("official")} className="bg-slate-50 hover:bg-slate-100 text-[9px] font-black text-slate-500 py-2 rounded-xl border border-slate-200 transition uppercase">Official</button>
                        <button type="button" onClick={() => handleQuickLogin("admin")} className="bg-slate-50 hover:bg-slate-100 text-[9px] font-black text-slate-500 py-2 rounded-xl border border-slate-200 transition uppercase">Admin</button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</label>
                          <input
                            type="text"
                            value={regForm.name}
                            placeholder="e.g. Rahul Sharma"
                            onChange={(e) => setRegisterForm({...regForm, name: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Citizen ID</label>
                          <input
                            type="text"
                            value={regForm.citizenId}
                            placeholder="MH12345"
                            onChange={(e) => setRegisterForm({...regForm, citizenId: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</label>
                          <input
                            type="date"
                            value={regForm.dob}
                            onChange={(e) => setRegisterForm({...regForm, dob: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</label>
                          <input
                            type="text"
                            value={regForm.contact}
                            placeholder="9876543210"
                            onChange={(e) => setRegisterForm({...regForm, contact: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Residential Address</label>
                        <input
                          type="text"
                          value={regForm.address}
                          placeholder="Flat 402, Sector 15..."
                          onChange={(e) => setRegisterForm({...regForm, address: e.target.value})}
                          required
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</label>
                        <input
                          type="email"
                          value={regForm.email}
                          placeholder="rahul@example.com"
                          onChange={(e) => setRegisterForm({...regForm, email: e.target.value})}
                          required
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                          <input
                            type="password"
                            value={regForm.password}
                            placeholder="••••••••"
                            onChange={(e) => setRegisterForm({...regForm, password: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm</label>
                          <input
                            type="password"
                            value={regForm.confirmPassword}
                            placeholder="••••••••"
                            onChange={(e) => setRegisterForm({...regForm, confirmPassword: e.target.value})}
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest text-xs"
                      >
                        Create Profile
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Authenticated views */}
        {token && user && (
          <div>
            
            {/* Citizen View Content */}
            {activePortalTab === "citizen" && (
              <div className="space-y-6">
                
                {/* Citizen Landing Sub-View */}
                {citizenSubView === "landing" && (
                  <div className="space-y-8">
                    {/* Hero Section */}
                    <div className="bg-gradient-to-r from-sky-850 to-indigo-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-700/20 via-transparent to-transparent"></div>
                      <div className="relative z-10 space-y-6 max-w-2xl">
                        <span className="bg-sky-500/25 border border-sky-400/30 text-sky-300 font-bold px-3 py-1 rounded-full text-xs tracking-wider uppercase">
                          Seamless Interoperability
                        </span>
                        <h2 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight">
                          One request.<br />
                          Multiple government systems.<br />
                          One unified journey.
                        </h2>
                        <p className="text-slate-350 text-sm sm:text-base leading-relaxed">
                          SetuGov orchestrates secure connections directly between identity systems, income databases, skill credentials, and benefits processing centers. You fill out a single application; our connectors handle translation, consent validation, and track the workflow step-by-step.
                        </p>
                        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-2">
                          <button
                            onClick={() => setCitizenSubView("services")}
                            className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-6 py-3 rounded-lg shadow-lg transition text-center"
                          >
                            Apply for Services
                          </button>
                          <button
                            onClick={() => {
                              if (citizenApps.length > 0) {
                                setCurrentApplication(citizenApps[0]);
                                setCitizenSubView("tracking");
                              } else {
                                setCitizenSubView("services");
                              }
                            }}
                            className="bg-transparent hover:bg-white/10 text-white border border-white/30 font-bold px-6 py-3 rounded-lg transition text-center"
                          >
                            Track Existing Request
                          </button>
                        </div>
                      </div>
                      <div className="relative z-10 mt-8 md:mt-0 flex flex-col space-y-4 bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-white/10 max-w-xs shadow-2xl">
                        <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
                          <div className="bg-green-500/25 text-green-300 p-2 rounded-lg">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Connectors Status</div>
                            <span className="text-xs font-bold text-white">4 Adapters Operational</span>
                          </div>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Identity Verify (Dept A)</span>
                            <span className="text-green-400 font-bold">● Active</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Eligibility Check (Dept B)</span>
                            <span className={deptBFailed ? "text-amber-400 font-bold animate-pulse" : "text-green-400 font-bold"}>
                              {deptBFailed ? "▲ Failing (Demo)" : "● Active"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Skill Service (Dept C)</span>
                            <span className="text-green-400 font-bold">● Active</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Benefits Payout (Dept D)</span>
                            <span className="text-green-400 font-bold">● Active</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* How It Works Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="bg-sky-50 text-sky-700 font-black h-10 w-10 rounded-lg flex items-center justify-center text-lg shadow-inner">1</div>
                        <h3 className="font-bold text-slate-900">Select Service</h3>
                        <p className="text-xs text-slate-500">Pick unified benefits program. No need to visit different ministry portals.</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="bg-sky-50 text-sky-700 font-black h-10 w-10 rounded-lg flex items-center justify-center text-lg shadow-inner">2</div>
                        <h3 className="font-bold text-slate-900">Grant Consent</h3>
                        <p className="text-xs text-slate-500">Enable SetuGov Core to request information on your behalf via secure translation connectors.</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="bg-sky-50 text-sky-700 font-black h-10 w-10 rounded-lg flex items-center justify-center text-lg shadow-inner">3</div>
                        <h3 className="font-bold text-slate-900">Translation Core</h3>
                        <p className="text-xs text-slate-500">Automated connectors translate schemas, verify values, and checks parameters concurrently.</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <div className="bg-sky-50 text-sky-700 font-black h-10 w-10 rounded-lg flex items-center justify-center text-lg shadow-inner">4</div>
                        <h3 className="font-bold text-slate-900">Unified Track</h3>
                        <p className="text-xs text-slate-500">Monitor status transitions step-by-step until the final service is completed.</p>
                      </div>
                    </div>

                    {/* Applications Queue */}
                    {citizenApps.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="border-b border-slate-200 px-6 py-4">
                          <h3 className="font-bold text-slate-900">Your Submitted Applications</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {citizenApps.map((app) => (
                            <div key={app.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-sm font-bold text-slate-900">{app.requestId}</span>
                                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(app.status)}`}>
                                    {app.status}
                                  </span>
                                </div>
                                <h4 className="font-semibold text-slate-700 text-sm mt-1">{app.service.name}</h4>
                                <p className="text-xs text-slate-400 mt-1">Submitted: {new Date(app.createdAt).toLocaleString()}</p>
                              </div>
                              <button
                                onClick={() => {
                                  setCurrentApplication(app);
                                  setCitizenSubView("tracking");
                                }}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5"
                              >
                                <span>View Lifecycle</span>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Service Selection Sub-view */}
                {citizenSubView === "services" && (
                  <div className="space-y-6">
                    <div className="flex items-center space-x-2">
                      <button onClick={() => setCitizenSubView("landing")} className="text-slate-500 hover:text-slate-900 font-bold text-xs flex items-center space-x-1">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back</span>
                      </button>
                      <h2 className="text-2xl font-bold text-slate-900">Select Available Service</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {services.map((svc) => (
                        <div key={svc.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                          <div>
                            <span className="bg-sky-50 text-sky-700 font-bold text-[9px] tracking-widest uppercase px-2 py-0.5 rounded border border-sky-200">
                              Integrated Scheme
                            </span>
                            <h3 className="text-lg font-bold text-slate-900 mt-2">{svc.name}</h3>
                            <p className="text-slate-500 text-xs mt-2 leading-relaxed">{svc.description}</p>
                            
                            {/* Department Icons / Summary */}
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
                              <span>Dependencies:</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Dept A</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Dept B</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Dept C</span>
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Dept D</span>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              setSelectedService(svc);
                              setCitizenSubView("create");
                            }}
                            className="w-full bg-sky-700 hover:bg-sky-800 text-white font-bold py-2 rounded-lg text-xs shadow-md transition text-center"
                          >
                            Initialize Application
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Create Request Form Sub-view */}
                {citizenSubView === "create" && (
                  <div className="max-w-xl mx-auto space-y-6">
                    <div className="flex items-center space-x-2">
                      <button onClick={() => setCitizenSubView("services")} className="text-slate-500 hover:text-slate-900 font-bold text-xs flex items-center space-x-1">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back</span>
                      </button>
                      <h2 className="text-2xl font-bold text-slate-900">Application Form</h2>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-4">
                      {applicationError && (
                        <div className="bg-red-50 text-red-800 text-xs p-3 rounded-lg border border-red-200">
                          {applicationError}
                        </div>
                      )}

                      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-800">
                        <span className="font-bold">Notice:</span> The form values below have been pre-populated with fictional profile parameters of citizen <strong>Rahul Sharma</strong> for demonstrating SIH scenario testing.
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                          <input
                            type="text"
                            value={formInputs.name}
                            onChange={(e) => setFormInputs({ ...formInputs, name: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Citizen ID (Aadhaar Sim)</label>
                            <input
                              type="text"
                              value={formInputs.citizenId}
                              onChange={(e) => setFormInputs({ ...formInputs, citizenId: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Birth</label>
                            <input
                              type="date"
                              value={formInputs.dob}
                              onChange={(e) => setFormInputs({ ...formInputs, dob: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Residential Address</label>
                          <textarea
                            value={formInputs.address}
                            onChange={(e) => setFormInputs({ ...formInputs, address: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Number</label>
                          <input
                            type="text"
                            value={formInputs.contact}
                            onChange={(e) => setFormInputs({ ...formInputs, contact: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>

                        {/* Document Upload Simulation */}
                        <div className="pt-4 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Required Documents (Simulated Upload)</label>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => setUploadedDocs(prev => [...prev, {type: "ID_PROOF", name: "Aadhaar_Rahul.pdf"}])}
                              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed transition ${
                                uploadedDocs.some(d => d.type === "ID_PROOF") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-sky-300 hover:text-sky-600"
                              }`}
                            >
                              <svg className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span className="text-[10px] font-bold">Identity Proof</span>
                              {uploadedDocs.some(d => d.type === "ID_PROOF") && <span className="text-[8px] mt-1 font-mono">Aadhaar_Rahul.pdf ✓</span>}
                            </button>
                            <button
                              onClick={() => setUploadedDocs(prev => [...prev, {type: "INCOME_CERT", name: "Income_Cert_2026.pdf"}])}
                              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed transition ${
                                uploadedDocs.some(d => d.type === "INCOME_CERT") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-sky-300 hover:text-sky-600"
                              }`}
                            >
                              <svg className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-[10px] font-bold">Income Certificate</span>
                              {uploadedDocs.some(d => d.type === "INCOME_CERT") && <span className="text-[8px] mt-1 font-mono">Income_Cert_2026.pdf ✓</span>}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleCreateApplication}
                        className="w-full bg-sky-700 hover:bg-sky-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition"
                      >
                        Submit Request & Proceed to Consent
                      </button>
                    </div>
                  </div>
                )}

                {/* Consent Sub-view */}
                {citizenSubView === "consent" && currentApplication && (
                  <div className="max-w-xl mx-auto space-y-6">
                    <h2 className="text-2xl font-bold text-slate-900 text-center">Citizen Consent Agreement</h2>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-6">
                      <div className="border-b border-slate-200 pb-4 text-center">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Request Reference ID</div>
                        <div className="text-lg font-mono font-bold text-slate-950">{currentApplication.requestId}</div>
                      </div>

                      <div className="space-y-4 text-xs leading-relaxed text-slate-650">
                        <p className="font-bold text-slate-900 text-sm">
                          I hereby grant consent to SetuGov Interoperability Gateway to perform the following actions:
                        </p>
                        
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                          <div className="p-3 bg-slate-50 flex items-start space-x-3">
                            <span className="text-emerald-600 mt-0.5">✓</span>
                            <div>
                              <strong className="text-slate-900">Identity Sharing (Department A):</strong> Translate and share my citizen registration details to confirm identification validity.
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 flex items-start space-x-3">
                            <span className="text-emerald-600 mt-0.5">✓</span>
                            <div>
                              <strong className="text-slate-900">Income Verification (Department B):</strong> Request household income assessment to calculate eligibility thresholds.
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 flex items-start space-x-3">
                            <span className="text-emerald-600 mt-0.5">✓</span>
                            <div>
                              <strong className="text-slate-900">Skill / Job Credentials (Department C):</strong> Fetch technical skill verification parameters.
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 flex items-start space-x-3">
                            <span className="text-emerald-600 mt-0.5">✓</span>
                            <div>
                              <strong className="text-slate-900">Direct Scheme Payment (Department D):</strong> Issue Direct Benefit Transfer processing upon matching all verified schemas.
                            </div>
                          </div>
                        </div>

                        <p>
                          SetuGov acts as a transient orchestration layer. Data retrieved from the respective departments is normalized in memory and is only shared with authorized actors. Consent status is fully logged in an immutable audit timeline.
                        </p>
                      </div>

                      <button
                        onClick={handleGrantConsent}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition text-center uppercase tracking-wide text-xs"
                      >
                        I Agree - Authenticate & Start Workflow
                      </button>
                    </div>
                  </div>
                )}

                {/* Tracking Sub-view */}
                {citizenSubView === "tracking" && currentApplication && (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          fetchCitizenData();
                          setCitizenSubView("landing");
                        }}
                        className="text-slate-500 hover:text-slate-900 font-bold text-xs flex items-center space-x-1"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back to Dashboard</span>
                      </button>
                      <button
                        onClick={() => {
                          fetchCitizenData();
                        }}
                        className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17.77" />
                        </svg>
                        <span>Sync</span>
                      </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-6">
                      
                      {/* Application Header Status */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100">
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Application Tracking</div>
                          <h2 className="text-xl font-mono font-bold text-slate-950">{currentApplication.requestId}</h2>
                          <div className="text-xs font-semibold text-slate-500 mt-1">{currentApplication.service.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Global Status</div>
                          <span className={`inline-block border px-3 py-1 rounded-full text-xs font-bold ${getStatusBadge(currentApplication.status)}`}>
                            {currentApplication.status}
                          </span>
                        </div>
                      </div>

                      {/* Exception Notice for Demo */}
                      {currentApplication.status === "WAITING" && (
                        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-4 space-y-2 text-xs">
                          <h4 className="font-bold flex items-center space-x-1.5 text-amber-800">
                            <span>⚠️ SIMULATED DEPENDENCY EXCEPTION DETECTED</span>
                          </h4>
                          <p>
                            Department B Income / Eligibility API returned an HTTP 503 error. The orchestrator has preserved your application lifecycle state.
                          </p>
                          <p className="font-bold text-amber-700">
                            SetuGov is currently in WAITING state and will automatically retry when Department B is restored.
                          </p>
                          <div className="flex items-center space-x-2 pt-1.5">
                            <span className="flex h-2.5 w-2.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                            </span>
                            <span className="font-mono text-[10px]">Autoretry scheduled...</span>
                          </div>
                        </div>
                      )}

                      {/* Unified Lifecycle Timeline */}
                      <div className="flow-root py-4">
                        <ul role="list" className="-mb-8">
                          
                          {/* Step: Created */}
                          <li>
                            <div className="relative pb-8">
                              <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white ring-8 ring-white">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4" />
                                    </svg>
                                  </span>
                                </div>
                                <div className="flex min-w-0 flex-grow justify-between space-x-4 pt-1.5">
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">Request Created & Validated</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">SetuGov form parameters checks validated successfully.</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>

                          {/* Step: Consent */}
                          <li>
                            <div className="relative pb-8">
                              <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                              <div className="relative flex space-x-3">
                                <div>
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white ring-8 ring-white">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4" />
                                    </svg>
                                  </span>
                                </div>
                                <div className="flex min-w-0 flex-grow justify-between space-x-4 pt-1.5">
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">Consent Verified</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Direct share authorisation recorded from IP: 127.0.0.1.</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>

                          {/* Dynamic steps from Workflow steps database */}
                          {currentApplication.workflow?.steps.map((step, idx) => {
                            const isLast = idx === (currentApplication.workflow?.steps.length ?? 0) - 1;
                            const connector = getConnectorLabelForStepName(step.stepName);
                            return (
                              <li key={step.id}>
                                <div className="relative pb-8">
                                  {!isLast && <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />}
                                  <div className="relative flex space-x-3">
                                    <div>{getStepStatusIcon(step.status)}</div>
                                    <div className="flex min-w-0 flex-grow justify-between space-x-4 pt-1.5">
                                      <div>
                                        <p className="text-xs font-bold text-slate-850">{connector.title}</p>
                                        <p className="text-[10px] text-slate-450 mt-0.5">{connector.desc}</p>
                                        {step.errorMessage && (
                                          <p className="text-[10px] text-red-600 font-semibold mt-1 bg-red-50 p-1.5 rounded border border-red-100">
                                            Error: {step.errorMessage}
                                          </p>
                                        )}
                                        {step.responsePayload && step.status === "COMPLETED" && (
                                          <div className="text-[9px] bg-slate-50 font-mono text-slate-500 mt-1.5 p-2 rounded-lg border border-slate-100 space-y-0.5">
                                            {step.stepName === "IDENTITY_VERIFICATION" && (
                                              <div>Verification status: {step.responsePayload.verificationStatus}</div>
                                            )}
                                            {step.stepName === "ELIGIBILITY_VERIFICATION" && (
                                              <div>Eligibility: {step.responsePayload.eligibilityStatus} (Income: ₹{step.responsePayload.annualIncome})</div>
                                            )}
                                            {step.stepName === "EMPLOYMENT_VERIFICATION" && (
                                              <div>Status: {step.responsePayload.employmentStatus} (Skills: {step.responsePayload.skills.join(", ")})</div>
                                            )}
                                            {step.stepName === "SERVICE_PROCESSING" && (
                                              <div>Status: {step.responsePayload.benefitStatus} (Txn: {step.responsePayload.transactionId})</div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-right text-[10px] text-slate-400">
                                        {step.status === "COMPLETED" && <span>Complete ✓</span>}
                                        {step.status === "IN_PROGRESS" && <span className="text-blue-600 font-semibold">Running...</span>}
                                        {step.status === "WAITING" && <span className="text-amber-600 font-semibold">Retry Pending</span>}
                                        {step.status === "PENDING" && <span>Queued</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {/* Final Unified Response */}
                      {currentApplication.status === "COMPLETED" && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4">
                          <h3 className="font-bold text-emerald-950 text-sm flex items-center space-x-2">
                            <span>✓ UNIFIED BENEFITS APPROVED</span>
                          </h3>
                          <div className="text-xs text-slate-700 space-y-2">
                            <p>
                              SetuGov has completed processing through all integrated departments. Your direct scheme benefit payout transaction has been authorized.
                            </p>
                            
                            <div className="bg-white border border-emerald-100 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="block text-[10px] text-slate-400 font-bold uppercase">Disbursed Benefit Amount</span>
                                <strong className="text-slate-800 text-sm">₹5,000.00</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-bold uppercase">DBT Transaction ID</span>
                                <strong className="text-slate-800 text-sm font-mono">TXN-SG-99887766</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-bold uppercase">Identity Verified</span>
                                <strong className="text-slate-850">Rahul Sharma (MH12345)</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-bold uppercase">Certified Skills</span>
                                <strong className="text-slate-850 text-[10px]">Computer Literacy, Customer Support Level 2</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Official Dashboard */}
            {activePortalTab === "official" && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Official Orchestration Console</h2>
                    <p className="text-slate-500 text-xs mt-1">Review active cross-system applications and audit lifecycles.</p>
                  </div>
                  <button
                    onClick={fetchOfficialData}
                    className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17.77" />
                    </svg>
                    <span>Refresh Queue</span>
                  </button>
                </div>

                {/* Queue Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Total Requests</span>
                    <strong className="text-2xl font-black text-slate-950 mt-1">{officialApps.length}</strong>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Active Workflows</span>
                    <strong className="text-2xl font-black text-sky-700 mt-1">
                      {officialApps.filter((a) => ["IN_PROGRESS", "WAITING", "RETRYING"].includes(a.status)).length}
                    </strong>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Completed Tasks</span>
                    <strong className="text-2xl font-black text-emerald-700 mt-1">
                      {officialApps.filter((a) => a.status === "COMPLETED").length}
                    </strong>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Pending Exceptions</span>
                    <strong className="text-2xl font-black text-red-700 mt-1">
                      {officialApps.filter((a) => ["WAITING", "FAILED"].includes(a.status)).length}
                    </strong>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">SLA Breaches</span>
                    <strong className="text-2xl font-black text-amber-700 mt-1">
                      {adminHealth?.statistics?.slaBreaches || 0}
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Applications Queue Table */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70">
                      <h3 className="font-bold text-slate-900 text-sm">Applications Queue</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs divide-y divide-slate-200">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                          <tr>
                            <th className="px-6 py-3">Request ID</th>
                            <th className="px-6 py-3">Citizen</th>
                            <th className="px-6 py-3">Current Step</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {officialApps.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-medium">
                                No applications found in queue.
                              </td>
                            </tr>
                          ) : (
                            officialApps.map((app) => (
                              <tr
                                key={app.id}
                                onClick={() => {
                                  setSelectedOfficialApp(app);
                                  // Fetch audit for details panel
                                  fetch(`${BACKEND_URL}/api/official/applications/${app.id}/audit`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  })
                                    .then((res) => res.json())
                                    .then((logs) => setOfficialAppAudit(logs));
                                }}
                                className={`cursor-pointer hover:bg-slate-50 transition ${
                                  selectedOfficialApp?.id === app.id ? "bg-sky-50/50" : ""
                                }`}
                              >
                                <td className="px-6 py-4 font-mono font-bold text-slate-900">{app.requestId}</td>
                                <td className="px-6 py-4">
                                  <div className="font-bold text-slate-700">{app.citizen.name}</div>
                                  <div className="text-[10px] text-slate-400">{app.citizen.citizenId}</div>
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-600">
                                  {app.currentStep.replace("_", " ")}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(app.status)}`}>
                                    {app.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-450">{new Date(app.updatedAt).toLocaleTimeString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Inspector Panel */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
                    {selectedOfficialApp ? (
                      <div className="space-y-6">
                        <div className="border-b border-slate-200 pb-4">
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-sm font-black text-slate-950">{selectedOfficialApp.requestId}</span>
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(selectedOfficialApp.status)}`}>
                              {selectedOfficialApp.status}
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm mt-2">{selectedOfficialApp.service.name}</h3>
                        </div>

                        {/* Citizen Form Details */}
                        <div className="space-y-2 text-xs">
                          <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Citizen Credentials</h4>
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div>
                              <span className="block text-[9px] text-slate-400 uppercase font-bold">Name</span>
                              <strong>{selectedOfficialApp.citizen.name}</strong>
                            </div>
                            <div>
                              <span className="block text-[9px] text-slate-400 uppercase font-bold">Citizen ID</span>
                              <strong>{selectedOfficialApp.citizen.citizenId}</strong>
                            </div>
                            <div className="col-span-2">
                              <span className="block text-[9px] text-slate-400 uppercase font-bold">Address</span>
                              <strong className="text-[10px] font-normal text-slate-700">{selectedOfficialApp.citizen.address}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Uploaded Documents */}
                        {selectedOfficialApp.documents && selectedOfficialApp.documents.length > 0 && (
                          <div className="space-y-2 text-xs">
                            <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Submitted Documents</h4>
                            <div className="grid grid-cols-1 gap-2">
                              {selectedOfficialApp.documents.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-white">
                                  <div className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-[10px]">{doc.fileName}</span>
                                  </div>
                                  <a href="#" className="text-sky-600 font-bold hover:underline">View</a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Integration Steps */}
                        <div className="space-y-2 text-xs">
                          <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Department Dependencies</h4>
                          <div className="space-y-1.5">
                            {selectedOfficialApp.workflow?.steps.map((step) => {
                              const label = getConnectorLabelForStepName(step.stepName);
                              return (
                                <div key={step.id} className="p-3 rounded-lg border border-slate-100 bg-white space-y-3">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <div className="font-semibold text-slate-800 text-[11px]">{label.title}</div>
                                      {step.errorMessage && (
                                        <span className="text-[9px] text-red-600 block mt-0.5">Error: {step.errorMessage}</span>
                                      )}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getStatusBadge(step.status)}`}>
                                      {step.status}
                                    </span>
                                  </div>

                                  {step.status === "PENDING_APPROVAL" && (
                                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-2">
                                      <div className="text-[9px] text-slate-500 font-bold uppercase">Automated Verification Payload:</div>
                                      <pre className="text-[9px] font-mono text-slate-600 max-h-24 overflow-y-auto bg-white p-2 rounded border border-slate-100">
                                        {JSON.stringify(step.responsePayload, null, 2)}
                                      </pre>
                                      <div className="flex space-x-2 pt-1">
                                        <button
                                          onClick={() => handleOfficialAction(step.id, "approve")}
                                          className="flex-grow bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded text-[10px] font-bold shadow-sm transition"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleOfficialAction(step.id, "reject")}
                                          className="flex-grow bg-white hover:bg-slate-50 text-red-600 border border-red-200 py-1.5 rounded text-[10px] font-bold shadow-sm transition"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Timeline Audit log */}
                        <div className="space-y-2 text-xs border-t border-slate-100 pt-4">
                          <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Audit Timeline</h4>
                          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                            {officialAppAudit.map((log) => (
                              <div key={log.id} className="flex space-x-2 text-[10px]">
                                <span className="text-slate-400 mt-0.5 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <div>
                                  <div className="font-bold text-slate-800">{log.action.replace("_", " ")}</div>
                                  <p className="text-[9px] text-slate-500 mt-0.5">{log.metadata?.detail}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8 space-y-3">
                        <svg className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                        <p className="font-medium text-xs">Select an application from the queue to inspect workflow orchestration and exception diagnostics.</p>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* Admin Dashboard */}
            {activePortalTab === "admin" && (
              <div className="space-y-6">
                
                {/* Title and Action Controls (Common to all Admin tabs) */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Admin Control Panel</h2>
                    <div className="flex items-center space-x-4 mt-2">
                      <button
                        onClick={() => setAdminTab("overview")}
                        className={`text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition ${adminTab === "overview" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-400"}`}
                      >
                        Overview
                      </button>
                      <button
                        onClick={() => setAdminTab("ecosystem")}
                        className={`text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition ${adminTab === "ecosystem" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-400"}`}
                      >
                        Ecosystem Map
                      </button>
                    </div>
                  </div>

                  {adminTab === "overview" && (
                    /* SIMULATION SWITCH CONTROLS */
                    <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 flex items-center space-x-4 shadow-inner">
                      <span className="text-xs font-bold text-slate-700">Simulate Department B Failure:</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleDeptBFailure(true)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border ${
                            deptBFailed
                              ? "bg-red-600 text-white border-red-700"
                              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-350"
                          }`}
                        >
                          Simulate Failure
                        </button>
                        <button
                          onClick={() => toggleDeptBFailure(false)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border ${
                            !deptBFailed
                              ? "bg-emerald-600 text-white border-emerald-700"
                              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-350"
                          }`}
                        >
                          Restore Service
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {adminTab === "overview" ? (
                  <>
                    {/* Connectors Health Status grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {connectors.map((c) => (
                        <div key={c.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-start">
                            <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold">
                              {c.type}
                            </span>
                            <span className={`flex h-2.5 w-2.5 rounded-full ${c.status === "ACTIVE" ? "bg-green-500" : "bg-red-500 animate-pulse"}`}></span>
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                            <div className="text-[10px] text-slate-400 mt-1">{c.department}</div>
                            <code className="block text-[9px] bg-slate-50 p-1 rounded font-mono text-slate-500 mt-2 truncate">{c.baseUrl}</code>
                          </div>
                          <div className="flex justify-between items-center text-[10px] pt-2 border-t border-slate-100">
                            <span className="text-slate-400">Endpoint Status:</span>
                            <strong className={c.status === "ACTIVE" ? "text-green-600" : "text-red-650"}>
                              {c.status === "ACTIVE" ? "OPERATIONAL" : "UNAVAILABLE"}
                            </strong>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* SLA Monitoring Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mb-6">
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <h3 className="font-bold text-slate-900 text-sm">SLA Performance Monitoring</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs divide-y divide-slate-200">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                            <tr>
                              <th className="px-6 py-3">Request ID</th>
                              <th className="px-6 py-3">Department</th>
                              <th className="px-6 py-3">Step</th>
                              <th className="px-6 py-3">Duration</th>
                              <th className="px-6 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {slaRecords.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-medium">
                                  No SLA records found.
                                </td>
                              </tr>
                            ) : (
                              slaRecords.map((sla) => {
                                const duration = sla.endTime
                                  ? `${Math.round((new Date(sla.endTime).getTime() - new Date(sla.startTime).getTime()) / 60000)}m`
                                  : "Active";
                                return (
                                  <tr key={sla.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{sla.application?.requestId}</td>
                                    <td className="px-6 py-4">{sla.department?.name}</td>
                                    <td className="px-6 py-4 font-medium">{sla.stepName.replace("_", " ")}</td>
                                    <td className="px-6 py-4 text-slate-500">{duration}</td>
                                    <td className="px-6 py-4">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        sla.status === "COMPLETED" ? "bg-green-100 text-green-800 border-green-200" :
                                        sla.status === "BREACHED" ? "bg-red-100 text-red-800 border-red-200" :
                                        "bg-blue-100 text-blue-800 border-blue-200"
                                      }`}>
                                        {sla.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Audit & Event Log Feeders */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                      {/* System Events Feed */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                          <h3 className="font-bold text-slate-900 text-sm">System Event Dispatcher Logs</h3>
                        </div>
                        <div className="p-6 divide-y divide-slate-100 overflow-y-auto space-y-3.5">
                          {systemEvents.length === 0 ? (
                            <div className="text-center text-slate-400 py-8 text-xs font-semibold">No system events logged.</div>
                          ) : (
                            systemEvents.map((evt) => (
                              <div key={evt.id} className="pt-3.5 first:pt-0 flex items-start justify-between text-xs gap-4">
                                <div>
                                  <strong className="text-slate-900 text-[11px] font-mono">{evt.eventType}</strong>
                                  <pre className="text-[9px] bg-slate-50 font-mono text-slate-500 p-2 rounded-lg border border-slate-100 mt-1.5 overflow-x-auto">
                                    {JSON.stringify(evt.payload, null, 2)}
                                  </pre>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Audit Logs Table */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[400px]">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                          <h3 className="font-bold text-slate-900 text-sm">Central Audit Logs</h3>
                        </div>
                        <div className="overflow-y-auto">
                          <table className="w-full text-left text-xs divide-y divide-slate-200">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                              <tr>
                                <th className="px-4 py-3">Actor / Role</th>
                                <th className="px-4 py-3">Action</th>
                                <th className="px-4 py-3">Ref ID</th>
                                <th className="px-4 py-3">Outcome</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {auditLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-slate-750">{log.actor}</div>
                                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 bg-slate-100 px-1 rounded">
                                      {log.role}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-600 text-[10px]">{log.action}</td>
                                  <td className="px-4 py-3 font-mono font-bold text-slate-700">{log.requestId || "N/A"}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      log.result === "SUCCESS" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                                    }`}>
                                      {log.result}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    {/* Ecosystem Map Section */}
                    <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden min-h-[600px] shadow-2xl border border-slate-800">
                      {/* Grid Background */}
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                      <div className="absolute inset-0 bg-gradient-to-tr from-sky-900/40 via-transparent to-transparent"></div>

                      {/* Central Orchestrator Node */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                        <div className="flex flex-col items-center space-y-4">
                          <div className="bg-gradient-to-tr from-sky-500 to-indigo-600 p-6 rounded-3xl shadow-[0_0_50px_rgba(14,165,233,0.4)] border border-sky-400/30 animate-pulse">
                            <svg className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <div className="text-center">
                            <h3 className="text-xl font-black text-white tracking-tighter">SETUGOV CORE</h3>
                            <span className="text-[10px] text-sky-400 font-bold uppercase tracking-widest">Orchestration Engine v1.0</span>
                          </div>
                        </div>
                      </div>

                      {/* Dependency Nodes */}
                      <div className="absolute top-20 left-1/4 -translate-x-1/2 z-10">
                        <div className="flex flex-col items-center space-y-2 group">
                          <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl group-hover:border-sky-500/50 transition duration-500">
                            <div className="bg-green-500/20 text-green-400 p-2 rounded-lg mb-2 inline-block">
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div className="text-xs font-bold text-white">IDENTITY SERVICE</div>
                            <div className="text-[9px] text-slate-500 font-mono mt-1">dept-a.govt.in</div>
                          </div>
                          <div className="h-20 w-px bg-gradient-to-b from-green-500/50 to-transparent"></div>
                        </div>
                      </div>

                      <div className="absolute top-20 right-1/4 translate-x-1/2 z-10">
                        <div className="flex flex-col items-center space-y-2 group">
                          <div className={`bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border transition duration-500 shadow-xl ${deptBFailed ? 'border-red-500/50 shadow-red-500/10' : 'border-slate-700 group-hover:border-sky-500/50'}`}>
                            <div className={`${deptBFailed ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-green-500/20 text-green-400'} p-2 rounded-lg mb-2 inline-block`}>
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="text-xs font-bold text-white">REVENUE SERVICE</div>
                            <div className="text-[9px] text-slate-500 font-mono mt-1">dept-b.govt.in</div>
                          </div>
                          <div className={`h-20 w-px bg-gradient-to-b from-${deptBFailed ? 'red-500' : 'green-500'}/50 to-transparent`}></div>
                        </div>
                      </div>

                      <div className="absolute bottom-20 left-1/4 -translate-x-1/2 z-10">
                        <div className="flex flex-col-reverse items-center space-y-reverse space-y-2 group">
                          <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl group-hover:border-sky-500/50 transition duration-500">
                            <div className="bg-green-500/20 text-green-400 p-2 rounded-lg mb-2 inline-block">
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="text-xs font-bold text-white">SKILL DEVELOPMENT</div>
                            <div className="text-[9px] text-slate-500 font-mono mt-1">dept-c.govt.in</div>
                          </div>
                          <div className="h-20 w-px bg-gradient-to-t from-green-500/50 to-transparent"></div>
                        </div>
                      </div>

                      <div className="absolute bottom-20 right-1/4 translate-x-1/2 z-10">
                        <div className="flex flex-col-reverse items-center space-y-reverse space-y-2 group">
                          <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl group-hover:border-sky-500/50 transition duration-500">
                            <div className="bg-green-500/20 text-green-400 p-2 rounded-lg mb-2 inline-block">
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </div>
                            <div className="text-xs font-bold text-white">BENEFIT DISBURSEMENT</div>
                            <div className="text-[9px] text-slate-500 font-mono mt-1">dept-d.govt.in</div>
                          </div>
                          <div className="h-20 w-px bg-gradient-to-t from-green-500/50 to-transparent"></div>
                        </div>
                      </div>

                      {/* Connection Lines (SVGs) */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex: 5}}>
                        <line x1="25%" y1="20%" x2="50%" y2="50%" stroke="rgba(14,165,233,0.2)" strokeWidth="1" strokeDasharray="5,5" />
                        <line x1="75%" y1="20%" x2="50%" y2="50%" stroke={deptBFailed ? "rgba(239,68,68,0.3)" : "rgba(14,165,233,0.2)"} strokeWidth="1" strokeDasharray="5,5" />
                        <line x1="25%" y1="80%" x2="50%" y2="50%" stroke="rgba(14,165,233,0.2)" strokeWidth="1" strokeDasharray="5,5" />
                        <line x1="75%" y1="80%" x2="50%" y2="50%" stroke="rgba(14,165,233,0.2)" strokeWidth="1" strokeDasharray="5,5" />
                      </svg>
                    </div>

                    {/* Stats overlay */}
                    <div className="grid grid-cols-3 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Avg System Latency</div>
                        <div className="flex items-end space-x-2">
                          <span className="text-3xl font-black text-slate-900">142</span>
                          <span className="text-slate-400 font-bold text-xs mb-1.5">ms</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                          <div className="bg-emerald-500 h-full w-[85%]"></div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Network Throughput</div>
                        <div className="flex items-end space-x-2">
                          <span className="text-3xl font-black text-slate-900">8.4</span>
                          <span className="text-slate-400 font-bold text-xs mb-1.5">GB/s</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                          <div className="bg-sky-500 h-full w-[62%]"></div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Active Integrations</div>
                        <div className="flex items-end space-x-2">
                          <span className="text-3xl font-black text-slate-900">38</span>
                          <span className="text-slate-400 font-bold text-xs mb-1.5">Depts</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                          <div className="bg-indigo-500 h-full w-[94%]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>

      {/* 4. Footer */}
      <footer className="bg-slate-900 text-white mt-12 py-8 border-t-4 border-slate-750">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-black tracking-tight text-sm">
              <span>Setu</span>
              <span className="text-sky-400">Gov</span>
            </div>
            <p className="text-slate-400">"Connect the systems. Don't replace them."</p>
          </div>
          <div className="text-slate-500 text-center sm:text-right space-y-1">
            <p>Smart India Hackathon 2026 - Problem Statement 26129</p>
            <p>&copy; Maharashtra State Innovation Society, Department of Skills and Employment.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Helpers for visual labels mapping
function getConnectorLabelForStepName(stepName: string) {
  switch (stepName) {
    case "IDENTITY_VERIFICATION":
      return {
        title: "Identity Verification (Dept A)",
        desc: "Checks Citizen ID details via snake_case payload mapping.",
      };
    case "ELIGIBILITY_VERIFICATION":
      return {
        title: "Eligibility Assessment (Dept B)",
        desc: "Checks household income parameters via camelCase payload mapping.",
      };
    case "EMPLOYMENT_VERIFICATION":
      return {
        title: "Employment Skill Verification (Dept C)",
        desc: "Resolves certificates via hyphenated payload structure.",
      };
    case "SERVICE_PROCESSING":
      return {
        title: "Direct Benefit Payout (Dept D)",
        desc: "Disburses financial payout via transaction ledger logging.",
      };
    default:
      return {
        title: "System Task",
        desc: "Processing core data.",
      };
  }
}
