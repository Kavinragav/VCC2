import React from "react";
import { buildApiUrl } from "../config/api";

interface AdminStats {
  totalRevenue: number;
  totalPurchases: number;
  totalStudents: number;
  recentCount: number;
  pendingRequestsCount: number;
  totalRequestsCount: number;
  class6PurchasesCount: number;
  class9PurchasesCount: number;
  papersCount: number;
  gateways: {
    paymentMode: string;
    upiId: string;
    upiPayeeName: string;
    upiQrImage: string;
    supportWhatsApp: string;
    razorpayDormant: boolean;
    razorpayConfigured: boolean;
    razorpayTestMode: boolean;
    googleAuthEnabled: boolean;
  };
}

interface PurchaseItem {
  paymentId: string;
  orderId: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
  verifiedAt: string;
  expiresAt: number;
  status: "verified" | "manually_granted" | "revoked";
  accessToken: string;
  method: "razorpay" | "manual" | "manual_upi";
  grantedBy?: string;
  classType?: "class-6" | "class-9";
  packageTitle?: string;
}

interface StudentItem {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  totalLogins: number;
  hasPurchased: boolean;
  class6Purchased?: boolean;
  class9Purchased?: boolean;
  purchaseDate: string | null;
  purchaseMethod: string | null;
}

interface AccessRequestItem {
  id: string;
  classType: "class-6" | "class-9";
  packageTitle: string;
  amount: number;
  currency: string;
  studentEmail: string;
  studentName: string;
  studentPicture?: string;
  utr: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  decidedBy?: string;
  notes?: string;
  isDuplicateUtr?: boolean;
}

declare global {
  interface Window {
    React?: typeof React;
  }
}

interface AdminDashboardProps {
  React?: typeof React;
  adminEmail: string;
  adminToken: string;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
  const { adminEmail, adminToken, onLogout } = props;
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;

  const [activeTab, setActiveTab] = R.useState<
    "overview" | "requests" | "purchases" | "students" | "access" | "settings"
  >("overview");

  const [stats, setStats] = R.useState<AdminStats | null>(null);
  const [accessRequests, setAccessRequests] = R.useState<AccessRequestItem[]>([]);
  const [purchases, setPurchases] = R.useState<PurchaseItem[]>([]);
  const [students, setStudents] = R.useState<StudentItem[]>([]);
  const [loading, setLoading] = R.useState(true);
  const [actionMessage, setActionMessage] = R.useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters & Search for Requests
  const [requestSearch, setRequestSearch] = R.useState("");
  const [requestStatusFilter, setRequestStatusFilter] = R.useState<string>("all");
  const [requestClassFilter, setRequestClassFilter] = R.useState<string>("all");

  // Filters & Search for Purchases
  const [purchaseSearch, setPurchaseSearch] = R.useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = R.useState<string>("all");
  const [purchaseClassFilter, setPurchaseClassFilter] = R.useState<string>("all");

  // Filters & Search for Students
  const [studentSearch, setStudentSearch] = R.useState("");

  // Manual Grant Form
  const [grantEmail, setGrantEmail] = R.useState("");
  const [grantName, setGrantName] = R.useState("");
  const [grantClassType, setGrantClassType] = R.useState<"class-6" | "class-9">("class-9");
  const [grantNote, setGrantNote] = R.useState("");
  const [grantLoading, setGrantLoading] = R.useState(false);

  // Action Dialog for Request Decision
  const [selectedRequest, setSelectedRequest] = R.useState<AccessRequestItem | null>(null);
  const [decisionNotes, setDecisionNotes] = R.useState("");
  const [decisionAction, setDecisionAction] = R.useState<"approve" | "reject" | null>(null);
  const [decisionLoading, setDecisionLoading] = R.useState(false);

  const fetchDashboardData = R.useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };

      const [statsRes, requestsRes, purchasesRes, studentsRes] = await Promise.all([
        fetch(buildApiUrl("/api/admin/stats"), { headers }),
        fetch(buildApiUrl("/api/admin/access-requests"), { headers }),
        fetch(buildApiUrl("/api/admin/purchases"), { headers }),
        fetch(buildApiUrl("/api/admin/students"), { headers }),
      ]);

      if (statsRes.status === 401 || purchasesRes.status === 401) {
        onLogout();
        return;
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (requestsRes.ok) {
        const reqData = await requestsRes.json();
        setAccessRequests(reqData.requests || []);
      }

      if (purchasesRes.ok) {
        const purchasesData = await purchasesRes.json();
        setPurchases(purchasesData.purchases || []);
      }

      if (studentsRes.ok) {
        const studentsData = await studentsRes.json();
        setStudents(studentsData.students || []);
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onLogout]);

  R.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle Approve Request
  const handleApproveRequest = async (requestId: string, notes?: string) => {
    setDecisionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(buildApiUrl("/api/admin/approve-request"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ requestId, notes }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ type: "success", text: data.message || "Access granted successfully!" });
        setSelectedRequest(null);
        setDecisionAction(null);
        setDecisionNotes("");
        fetchDashboardData();
      } else {
        setActionMessage({ type: "error", text: data.message || "Failed to approve request." });
      }
    } catch {
      setActionMessage({ type: "error", text: "Network error approving request." });
    } finally {
      setDecisionLoading(false);
    }
  };

  // Handle Reject Request
  const handleRejectRequest = async (requestId: string, notes?: string) => {
    setDecisionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(buildApiUrl("/api/admin/reject-request"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ requestId, notes }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ type: "success", text: data.message || "Request rejected." });
        setSelectedRequest(null);
        setDecisionAction(null);
        setDecisionNotes("");
        fetchDashboardData();
      } else {
        setActionMessage({ type: "error", text: data.message || "Failed to reject request." });
      }
    } catch {
      setActionMessage({ type: "error", text: "Network error rejecting request." });
    } finally {
      setDecisionLoading(false);
    }
  };

  // Manual Grant for Class 6 or Class 9
  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail || !grantEmail.includes("@")) {
      setActionMessage({ type: "error", text: "Please enter a valid student email address." });
      return;
    }

    setGrantLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(buildApiUrl("/api/admin/grant-access"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email: grantEmail.trim(),
          name: grantName.trim() || "Student Cadet",
          classType: grantClassType,
          note: grantNote.trim() || "Manual grant via Admin Dashboard",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: "success",
          text: `Success! Granted 180-day Mock Papers access to ${grantEmail} for ${
            grantClassType === "class-6" ? "Class 6" : "Class 9"
          }.`,
        });
        setGrantEmail("");
        setGrantName("");
        setGrantNote("");
        fetchDashboardData();
      } else {
        setActionMessage({ type: "error", text: data.message || "Failed to grant access." });
      }
    } catch {
      setActionMessage({ type: "error", text: "Network error occurred while granting access." });
    } finally {
      setGrantLoading(false);
    }
  };

  // Revoke Access
  const handleRevokeAccess = async (purchase: PurchaseItem) => {
    try {
      const res = await fetch(buildApiUrl("/api/admin/revoke-access"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          accessToken: purchase.accessToken,
          email: purchase.email,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({ type: "success", text: `Access revoked for ${purchase.email}.` });
        fetchDashboardData();
      } else {
        setActionMessage({ type: "error", text: data.message || "Failed to revoke access." });
      }
    } catch {
      setActionMessage({ type: "error", text: "Network error while revoking access." });
    }
  };

  const handleExportCSV = () => {
    const link = document.createElement("a");
    link.href = buildApiUrl(`/api/admin/export?adminToken=${encodeURIComponent(adminToken)}`);
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Access Requests
  const filteredRequests = accessRequests.filter((r) => {
    const matchesSearch =
      r.studentName.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.studentEmail.toLowerCase().includes(requestSearch.toLowerCase()) ||
      r.utr.toLowerCase().includes(requestSearch.toLowerCase());
    const matchesStatus = requestStatusFilter === "all" || r.status === requestStatusFilter;
    const matchesClass = requestClassFilter === "all" || r.classType === requestClassFilter;
    return matchesSearch && matchesStatus && matchesClass;
  });

  // Filtered Purchases
  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
      p.email.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
      p.paymentId.toLowerCase().includes(purchaseSearch.toLowerCase());
    const matchesStatus = purchaseStatusFilter === "all" || p.status === purchaseStatusFilter;
    const matchesClass =
      purchaseClassFilter === "all" ||
      (purchaseClassFilter === "class-6" && p.classType === "class-6") ||
      (purchaseClassFilter === "class-9" && p.classType !== "class-6");
    return matchesSearch && matchesStatus && matchesClass;
  });

  // Filtered Students
  const filteredStudents = students.filter((s) => {
    return (
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
    );
  });

  const pendingRequestsCount = accessRequests.filter((r) => r.status === "pending").length;

  return (
    <div
      className="min-h-screen flex flex-col font-sans"
      style={{ backgroundColor: "#f1f5f9", color: "#1e293b" }}
    >
      {/* Top Admin Navbar */}
      <header
        className="shadow-lg sticky top-0 z-40 border-b"
        style={{ backgroundColor: "#071328", borderColor: "#1e293b", color: "#ffffff" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-md text-lg"
                style={{ backgroundColor: "#f59e0b", color: "#071328" }}
              >
                🛡️
              </div>
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-wider block"
                  style={{ color: "#fbbf24" }}
                >
                  VIVEKANANDHA SAINIK COACHING
                </span>
                <span className="text-sm sm:text-base font-extrabold" style={{ color: "#ffffff" }}>
                  Executive Admin Dashboard
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-bold" style={{ color: "#f8fafc" }}>
                  User: {adminEmail}
                </span>
                <span
                  className="text-[10px] flex items-center justify-end gap-1 font-mono"
                  style={{ color: "#34d399" }}
                >
                  ● Authenticated Admin
                </span>
              </div>

              <a
                href="/"
                className="text-xs font-bold py-1.5 px-3 rounded-lg border transition-colors"
                style={{ borderColor: "#334155", color: "#cbd5e1", backgroundColor: "#0f172a" }}
              >
                Website
              </a>

              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-xs font-bold py-1.5 px-3.5 rounded-lg transition-colors cursor-pointer"
                style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
                title="Sign out of Admin Dashboard"
              >
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sub-header Navigation Tabs */}
        <div style={{ backgroundColor: "#040b17", borderTop: "1px solid #1e293b" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto space-x-1.5 py-2 text-xs">
            {(
              [
                { id: "overview", label: "📊 Overview" },
                {
                  id: "requests",
                  label: `⏳ Access Requests${pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ""}`,
                },
                { id: "purchases", label: `💳 Enrolments (${purchases.length})` },
                { id: "students", label: `🎓 Students (${students.length})` },
                { id: "access", label: "➕ Grant Access & Papers" },
                { id: "settings", label: "⚙️ Admin & UPI Config" },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: isActive ? "#f59e0b" : "transparent",
                    color: isActive ? "#071328" : "#cbd5e1",
                  }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Alert Banner */}
        {actionMessage && (
          <div
            className="mb-6 p-4 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm border"
            style={{
              backgroundColor: actionMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
              borderColor: actionMessage.type === "success" ? "#34d399" : "#f87171",
              color: actionMessage.type === "success" ? "#065f46" : "#991b1b",
            }}
          >
            <div className="flex items-center gap-2">
              <span>{actionMessage.type === "success" ? "✅" : "⚠️"}</span>
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="font-bold p-1 cursor-pointer"
              style={{ color: "#475569" }}
            >
              &times;
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW & KPIS */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Pending Requests Alert Banner */}
            {pendingRequestsCount > 0 && (
              <div
                className="rounded-2xl p-5 shadow-sm border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                style={{ backgroundColor: "#fffbeb", borderColor: "#f59e0b", color: "#78350f" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0 text-lg"
                    style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                  >
                    ⏳
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm" style={{ color: "#451a03" }}>
                      {pendingRequestsCount} Pending Manual UPI Access Request{pendingRequestsCount > 1 ? "s" : ""}
                    </h3>
                    <p className="text-xs" style={{ color: "#92400e" }}>
                      Students have made manual UPI payments and submitted their UTRs. Verify in your UPI app and
                      approve.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("requests")}
                  className="font-black text-xs py-2.5 px-4 rounded-xl shadow transition-colors shrink-0 cursor-pointer"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  Review Access Requests ({pendingRequestsCount}) &rarr;
                </button>
              </div>
            )}

            {/* KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div
                className="rounded-2xl p-6 shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                    Total Sales Revenue
                  </span>
                  <span className="text-lg">💰</span>
                </div>
                <div className="text-3xl font-black" style={{ color: "#0f172a" }}>
                  ₹{stats?.totalRevenue ? stats.totalRevenue.toLocaleString("en-IN") : 0}
                </div>
                <p className="text-xs mt-2" style={{ color: "#64748b" }}>
                  <strong style={{ color: "#059669" }}>₹99</strong> per Class 6 / Class 9 Mock package
                </p>
              </div>

              <div
                className="rounded-2xl p-6 shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                    Paid Enrolments
                  </span>
                  <span className="text-lg">✅</span>
                </div>
                <div className="text-3xl font-black" style={{ color: "#0f172a" }}>
                  {stats?.totalPurchases ?? purchases.length}
                </div>
                <p className="text-xs mt-2" style={{ color: "#64748b" }}>
                  Class 6: <strong style={{ color: "#0f172a" }}>{stats?.class6PurchasesCount || 0}</strong> &middot;
                  Class 9: <strong style={{ color: "#0f172a" }}>{stats?.class9PurchasesCount || 0}</strong>
                </p>
              </div>

              <div
                className="rounded-2xl p-6 shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                    Registered Students
                  </span>
                  <span className="text-lg">🎓</span>
                </div>
                <div className="text-3xl font-black" style={{ color: "#0f172a" }}>
                  {stats?.totalStudents ?? students.length}
                </div>
                <p className="text-xs mt-2" style={{ color: "#64748b" }}>
                  Verified Google student accounts
                </p>
              </div>

              <div
                className="rounded-2xl p-6 shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                    Payment Gateway Mode
                  </span>
                  <span className="text-lg">🛡️</span>
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "#475569" }}>Manual UPI:</span>
                    <span
                      className="font-bold px-2 py-0.5 rounded text-[11px]"
                      style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
                    >
                      ACTIVE (₹99)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "#475569" }}>Razorpay:</span>
                    <span
                      className="font-bold px-2 py-0.5 rounded text-[11px]"
                      style={{ backgroundColor: "#e2e8f0", color: "#334155" }}
                    >
                      DORMANT
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div
                className="rounded-2xl p-6 shadow-md flex flex-col justify-between"
                style={{ backgroundColor: "#071328", color: "#ffffff" }}
              >
                <div>
                  <h3 className="font-extrabold text-base mb-1" style={{ color: "#fbbf24" }}>
                    Manual Access Requests
                  </h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: "#cbd5e1" }}>
                    Verify UPI transaction reference IDs submitted by students and grant instant watermarked access.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("requests")}
                  className="w-full font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  Open Access Requests &rarr;
                </button>
              </div>

              <div
                className="rounded-2xl p-6 shadow-sm border flex flex-col justify-between"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div>
                  <h3 className="font-extrabold text-base mb-1" style={{ color: "#0f172a" }}>
                    Export Accounting Data
                  </h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: "#64748b" }}>
                    Download a CSV audit spreadsheet containing all student emails, transaction IDs, timestamps, and
                    fees.
                  </p>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="w-full font-bold text-xs py-2.5 px-4 rounded-xl border transition-all cursor-pointer"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#1e293b" }}
                >
                  📥 Download Purchases (.CSV)
                </button>
              </div>

              <div
                className="rounded-2xl p-6 shadow-sm border flex flex-col justify-between"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div>
                  <h3 className="font-extrabold text-base mb-1" style={{ color: "#0f172a" }}>
                    Grant Direct Access
                  </h3>
                  <p className="text-xs leading-relaxed mb-4" style={{ color: "#64748b" }}>
                    Manually unlock Class 6 or Class 9 mock test packages for any student Google email.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("access")}
                  className="w-full font-bold text-xs py-2.5 px-4 rounded-xl border transition-all cursor-pointer"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#1e293b" }}
                >
                  ➕ Grant Access &amp; Inspect Papers
                </button>
              </div>
            </div>

            {/* Recent Purchases Table */}
            <div
              className="rounded-2xl shadow-sm border overflow-hidden"
              style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <div
                className="px-6 py-4 border-b flex items-center justify-between"
                style={{ borderColor: "#e2e8f0" }}
              >
                <div>
                  <h3 className="font-extrabold text-base" style={{ color: "#0f172a" }}>
                    Recent Transactions
                  </h3>
                  <p className="text-xs" style={{ color: "#64748b" }}>
                    Latest confirmed enrolments and approved requests
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("purchases")}
                  className="text-xs font-bold cursor-pointer"
                  style={{ color: "#071328" }}
                >
                  View All ({purchases.length}) &rarr;
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead
                    className="border-b uppercase font-bold text-[11px]"
                    style={{ backgroundColor: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}
                  >
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Google Email</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Payment Ref</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
                    {purchases.slice(0, 5).map((p) => (
                      <tr key={p.paymentId}>
                        <td className="py-3.5 px-4 font-bold" style={{ color: "#0f172a" }}>
                          {p.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]" style={{ color: "#475569" }}>
                          {p.email}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor: p.classType === "class-6" ? "#f3e8ff" : "#dbeafe",
                              color: p.classType === "class-6" ? "#6b21a8" : "#1e40af",
                            }}
                          >
                            {p.classType === "class-6" ? "Class 6" : "Class 9"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px]" style={{ color: "#64748b" }}>
                          {p.paymentId}
                        </td>
                        <td className="py-3.5 px-4 font-bold" style={{ color: "#0f172a" }}>
                          ₹{p.amount}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase"
                            style={{
                              backgroundColor:
                                p.status === "verified" || p.status === "manually_granted" ? "#d1fae5" : "#fee2e2",
                              color:
                                p.status === "verified" || p.status === "manually_granted" ? "#065f46" : "#991b1b",
                            }}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[11px]" style={{ color: "#64748b" }}>
                          {new Date(p.verifiedAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                    {purchases.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8" style={{ color: "#94a3b8" }}>
                          No enrolments recorded yet. Approved requests will appear here automatically.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACCESS REQUESTS */}
        {activeTab === "requests" && (
          <div
            className="rounded-2xl shadow-sm border overflow-hidden"
            style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
          >
            <div
              className="p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{ borderColor: "#e2e8f0" }}
            >
              <div>
                <h3 className="font-extrabold text-lg flex items-center gap-2" style={{ color: "#0f172a" }}>
                  <span>Manual UPI Access Requests</span>
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
                  >
                    {accessRequests.length} Total
                  </span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  Verify UTRs against your ICICI / UPI merchant statement and approve access for Class 6 or Class 9.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name, email, UTR..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                  className="text-xs px-3 py-2 border rounded-lg w-52"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                />

                <select
                  value={requestClassFilter}
                  onChange={(e) => setRequestClassFilter(e.target.value)}
                  className="text-xs py-2 px-3 border rounded-lg"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                >
                  <option value="all">All Classes</option>
                  <option value="class-6">Class 6 (300 Marks)</option>
                  <option value="class-9">Class 9 (400 Marks)</option>
                </select>

                <select
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  className="text-xs py-2 px-3 border rounded-lg"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending ({pendingRequestsCount})</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <button
                  onClick={fetchDashboardData}
                  className="py-2 px-3 border rounded-lg text-xs font-bold cursor-pointer"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#f8fafc", color: "#334155" }}
                >
                  {loading ? "Loading..." : "🔄 Refresh"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className="border-b uppercase font-bold text-[11px]"
                  style={{ backgroundColor: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}
                >
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">UTR / Transaction Ref</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Submitted At</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
                  {filteredRequests.map((req) => (
                    <tr
                      key={req.id}
                      style={{
                        backgroundColor: req.status === "pending" ? "#fffbeb" : "#ffffff",
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold" style={{ color: "#0f172a" }}>
                          {req.studentName}
                        </div>
                        <div className="text-[11px] font-mono" style={{ color: "#64748b" }}>
                          {req.studentEmail}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-bold"
                          style={{
                            backgroundColor: req.classType === "class-6" ? "#f3e8ff" : "#dbeafe",
                            color: req.classType === "class-6" ? "#6b21a8" : "#1e40af",
                          }}
                        >
                          {req.classType === "class-6" ? "Class 6 (300m)" : "Class 9 (400m)"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div
                          className="font-mono font-bold select-all px-2 py-0.5 rounded inline-block text-[11px]"
                          style={{ backgroundColor: "#f1f5f9", color: "#0f172a" }}
                        >
                          {req.utr}
                        </div>
                        {req.isDuplicateUtr && (
                          <div className="text-[10px] font-bold mt-0.5" style={{ color: "#dc2626" }}>
                            ⚠️ Duplicate UTR used elsewhere!
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-bold" style={{ color: "#0f172a" }}>
                        ₹{req.amount || 99}
                      </td>

                      <td className="py-3 px-4 text-[11px]" style={{ color: "#64748b" }}>
                        <div>
                          {new Date(req.submittedAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[10px]" style={{ color: "#94a3b8" }}>
                          {new Date(req.submittedAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className="px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase"
                          style={{
                            backgroundColor:
                              req.status === "approved"
                                ? "#d1fae5"
                                : req.status === "pending"
                                ? "#fde68a"
                                : "#fee2e2",
                            color:
                              req.status === "approved"
                                ? "#065f46"
                                : req.status === "pending"
                                ? "#92400e"
                                : "#991b1b",
                          }}
                        >
                          {req.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`https://wa.me/8940399717?text=${encodeURIComponent(
                              `Hello Cadet ${req.studentName}, regarding your ${
                                req.classType === "class-6" ? "Class 6" : "Class 9"
                              } AISSEE Mock access request (UTR: ${req.utr}):`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded-lg text-xs font-bold border"
                            style={{ borderColor: "#cbd5e1", color: "#059669", backgroundColor: "#ffffff" }}
                            title="WhatsApp"
                          >
                            💬
                          </a>

                          {req.status === "pending" ? (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                                style={{ backgroundColor: "#059669", color: "#ffffff" }}
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setDecisionAction("reject");
                                  setDecisionNotes("");
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                                style={{ backgroundColor: "#fee2e2", color: "#b91c1c" }}
                              >
                                ✕ Reject
                              </button>
                            </>
                          ) : req.status === "rejected" ? (
                            <button
                              onClick={() => handleApproveRequest(req.id, "Re-verified and approved")}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                              style={{ backgroundColor: "#e2e8f0", color: "#1e293b" }}
                            >
                              Re-Approve
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold" style={{ color: "#059669" }}>
                              ✓ Active
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12" style={{ color: "#94a3b8" }}>
                        No access requests match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PURCHASES & ENROLMENTS */}
        {activeTab === "purchases" && (
          <div
            className="rounded-2xl shadow-sm border overflow-hidden"
            style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
          >
            <div
              className="p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{ borderColor: "#e2e8f0" }}
            >
              <div>
                <h3 className="font-extrabold text-lg flex items-center gap-2" style={{ color: "#0f172a" }}>
                  <span>Enrolments &amp; Access Licences</span>
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
                  >
                    {purchases.length} Total
                  </span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  All active, verified, and manually granted 180-day access records.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name, email, ref..."
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  className="text-xs px-3 py-2 border rounded-lg w-52"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                />

                <select
                  value={purchaseClassFilter}
                  onChange={(e) => setPurchaseClassFilter(e.target.value)}
                  className="text-xs py-2 px-3 border rounded-lg"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                >
                  <option value="all">All Classes</option>
                  <option value="class-6">Class 6</option>
                  <option value="class-9">Class 9</option>
                </select>

                <select
                  value={purchaseStatusFilter}
                  onChange={(e) => setPurchaseStatusFilter(e.target.value)}
                  className="text-xs py-2 px-3 border rounded-lg"
                  style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="verified">Verified</option>
                  <option value="manually_granted">Manually Granted</option>
                  <option value="revoked">Revoked</option>
                </select>

                <button
                  onClick={handleExportCSV}
                  className="text-xs font-bold py-2 px-3 rounded-lg cursor-pointer"
                  style={{ backgroundColor: "#071328", color: "#ffffff" }}
                >
                  📥 Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className="border-b uppercase font-bold text-[11px]"
                  style={{ backgroundColor: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}
                >
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Payment Ref</th>
                    <th className="py-3 px-4">Fee</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
                  {filteredPurchases.map((p) => (
                    <tr key={p.paymentId}>
                      <td className="py-3.5 px-4 font-bold" style={{ color: "#0f172a" }}>
                        {p.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]" style={{ color: "#475569" }}>
                        {p.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: p.classType === "class-6" ? "#f3e8ff" : "#dbeafe",
                            color: p.classType === "class-6" ? "#6b21a8" : "#1e40af",
                          }}
                        >
                          {p.classType === "class-6" ? "Class 6" : "Class 9"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]" style={{ color: "#64748b" }}>
                        {p.paymentId}
                      </td>
                      <td className="py-3.5 px-4 font-bold" style={{ color: "#0f172a" }}>
                        ₹{p.amount}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase"
                          style={{
                            backgroundColor:
                              p.status === "verified" || p.status === "manually_granted" ? "#d1fae5" : "#fee2e2",
                            color:
                              p.status === "verified" || p.status === "manually_granted" ? "#065f46" : "#991b1b",
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[11px]" style={{ color: "#64748b" }}>
                        {new Date(p.verifiedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {p.status !== "revoked" ? (
                          <button
                            onClick={() => handleRevokeAccess(p)}
                            className="font-bold text-[11px] hover:underline cursor-pointer"
                            style={{ color: "#dc2626" }}
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: "#94a3b8" }}>
                            Revoked
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredPurchases.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12" style={{ color: "#94a3b8" }}>
                        No purchases found matching your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: STUDENTS DIRECTORY */}
        {activeTab === "students" && (
          <div
            className="rounded-2xl shadow-sm border overflow-hidden"
            style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
          >
            <div
              className="p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{ borderColor: "#e2e8f0" }}
            >
              <div>
                <h3 className="font-extrabold text-lg flex items-center gap-2" style={{ color: "#0f172a" }}>
                  <span>Student Profiles</span>
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
                  >
                    {students.length} Profiles
                  </span>
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  Verified Google accounts registered during authentication.
                </p>
              </div>

              <input
                type="text"
                placeholder="Search students..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="text-xs px-3 py-2 border rounded-lg w-64"
                style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className="border-b uppercase font-bold text-[11px]"
                  style={{ backgroundColor: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}
                >
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Google Email</th>
                    <th className="py-3 px-4">Class 6 Access</th>
                    <th className="py-3 px-4">Class 9 Access</th>
                    <th className="py-3 px-4">Last Active</th>
                    <th className="py-3 px-4 text-right">Logins</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
                  {filteredStudents.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3.5 px-4 font-bold" style={{ color: "#0f172a" }}>
                        {s.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]" style={{ color: "#475569" }}>
                        {s.email}
                      </td>
                      <td className="py-3.5 px-4">
                        {s.class6Purchased ? (
                          <span
                            className="inline-block font-bold px-2 py-0.5 rounded text-[10px]"
                            style={{ backgroundColor: "#f3e8ff", color: "#6b21a8" }}
                          >
                            ✓ Unlocked
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {s.class9Purchased ? (
                          <span
                            className="inline-block font-bold px-2 py-0.5 rounded text-[10px]"
                            style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
                          >
                            ✓ Unlocked
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]" style={{ color: "#64748b" }}>
                        {new Date(s.lastLoginAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold" style={{ color: "#334155" }}>
                        {s.totalLogins}
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12" style={{ color: "#94a3b8" }}>
                        No students found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: MANUAL GRANT & PAPERS REPOSITORY */}
        {activeTab === "access" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div
              className="lg:col-span-1 p-6 rounded-2xl shadow-sm border"
              style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <h3 className="font-extrabold text-base mb-1" style={{ color: "#0f172a" }}>
                ➕ Manual Access Grant
              </h3>
              <p className="text-xs mb-6 leading-relaxed" style={{ color: "#64748b" }}>
                Grant immediate 180-day access to Class 6 or Class 9 mock test packages for any student Google email.
              </p>

              <form onSubmit={handleManualGrant} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#334155" }}>
                    Select Target Package *
                  </label>
                  <select
                    value={grantClassType}
                    onChange={(e) => setGrantClassType(e.target.value as "class-6" | "class-9")}
                    className="w-full text-xs px-3 py-2 border rounded-lg font-medium"
                    style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                  >
                    <option value="class-6">Class 6 AISSEE (9 Mocks &middot; 300 Marks)</option>
                    <option value="class-9">Class 9 AISSEE (9 Mocks &middot; 400 Marks)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#334155" }}>
                    Student Google Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="student@gmail.com"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 border rounded-lg"
                    style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#334155" }}>
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter student name"
                    value={grantName}
                    onChange={(e) => setGrantName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border rounded-lg"
                    style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#334155" }}>
                    Internal Note / Reason
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid offline via WhatsApp +91 8940399717"
                    value={grantNote}
                    onChange={(e) => setGrantNote(e.target.value)}
                    className="w-full text-xs px-3 py-2 border rounded-lg"
                    style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={grantLoading}
                  className="w-full font-bold text-xs py-2.5 px-4 rounded-xl shadow transition-colors cursor-pointer"
                  style={{ backgroundColor: "#071328", color: "#ffffff" }}
                >
                  {grantLoading
                    ? "Processing..."
                    : `Unlock ${grantClassType === "class-6" ? "Class 6" : "Class 9"} Mocks`}
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div
                className="p-5 rounded-2xl shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div
                  className="flex items-center justify-between border-b pb-3 mb-3"
                  style={{ borderColor: "#f1f5f9" }}
                >
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: "#7e22ce" }}>
                      Standard VI Examination
                    </span>
                    <h3 className="font-extrabold text-base" style={{ color: "#0f172a" }}>
                      Class 6 AISSEE 9-Mock Papers &amp; Solutions
                    </h3>
                  </div>
                  <span
                    className="font-extrabold text-xs px-3 py-1 rounded-full"
                    style={{ backgroundColor: "#f3e8ff", color: "#581c87" }}
                  >
                    300 Marks &middot; 9 Tests
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <div
                      key={n}
                      className="p-2.5 rounded-lg border"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                    >
                      <div className="font-bold" style={{ color: "#0f172a" }}>
                        Mock #{n}
                      </div>
                      <div className="text-[10px]" style={{ color: "#64748b" }}>
                        Maths, IQ, Eng, GK
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="p-5 rounded-2xl shadow-sm border"
                style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div
                  className="flex items-center justify-between border-b pb-3 mb-3"
                  style={{ borderColor: "#f1f5f9" }}
                >
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: "#1d4ed8" }}>
                      Standard IX Examination
                    </span>
                    <h3 className="font-extrabold text-base" style={{ color: "#0f172a" }}>
                      Class 9 AISSEE 9-Mock Papers &amp; Solutions
                    </h3>
                  </div>
                  <span
                    className="font-extrabold text-xs px-3 py-1 rounded-full"
                    style={{ backgroundColor: "#dbeafe", color: "#1e3a8a" }}
                  >
                    400 Marks &middot; 9 Tests
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <div
                      key={n}
                      className="p-2.5 rounded-lg border"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                    >
                      <div className="font-bold" style={{ color: "#0f172a" }}>
                        Mock #{n}
                      </div>
                      <div className="text-[10px]" style={{ color: "#64748b" }}>
                        Maths, IQ, Sci, Eng, SST
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS & KEYS */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div
              className="p-6 rounded-2xl shadow-sm border space-y-4"
              style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <h3 className="font-extrabold text-base" style={{ color: "#0f172a" }}>
                🔒 Administrator Account Configuration
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                The admin portal is restricted to a single authorized administrator login (no Google Sign-In on admin).
              </p>

              <div
                className="p-4 rounded-xl border space-y-3 text-xs"
                style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Admin Username:
                  </span>
                  <span className="font-mono font-bold" style={{ color: "#0f172a" }}>
                    VccAdmin
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Auth Method:
                  </span>
                  <span className="font-bold" style={{ color: "#059669" }}>
                    Single User Login (Username &amp; Password Only)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Session Validity:
                  </span>
                  <span className="font-bold" style={{ color: "#0f172a" }}>
                    24 Hours (HMAC Signed Token)
                  </span>
                </div>
              </div>
            </div>

            <div
              className="p-6 rounded-2xl shadow-sm border space-y-4"
              style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <h3 className="font-extrabold text-base" style={{ color: "#0f172a" }}>
                💳 Payment &amp; System Configuration
              </h3>

              <div
                className="p-4 rounded-xl border space-y-3 text-xs"
                style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Payment Mode:
                  </span>
                  <span className="font-mono font-bold" style={{ color: "#059669" }}>
                    MANUAL UPI (Active)
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Merchant UPI ID:
                  </span>
                  <span className="font-mono font-bold select-all" style={{ color: "#0f172a" }}>
                    kavinakshara6240@okicici
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Payee Name:
                  </span>
                  <span className="font-bold" style={{ color: "#0f172a" }}>
                    Kavin Ragav
                  </span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#e2e8f0" }}>
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Support WhatsApp:
                  </span>
                  <span className="font-mono font-bold" style={{ color: "#0f172a" }}>
                    +91 8940399717
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold" style={{ color: "#334155" }}>
                    Razorpay Gateway:
                  </span>
                  <span className="font-bold" style={{ color: "#64748b" }}>
                    Dormant &middot; Safely Preserved
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Reject Request Modal Dialog */}
      {selectedRequest && decisionAction === "reject" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl shadow-2xl p-6"
            style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
          >
            <button
              onClick={() => {
                setSelectedRequest(null);
                setDecisionAction(null);
              }}
              className="absolute top-4 right-4 p-1 font-bold text-lg cursor-pointer"
              style={{ color: "#64748b" }}
            >
              &times;
            </button>

            <h3 className="text-lg font-bold mb-2" style={{ color: "#0f172a" }}>
              Reject Access Request
            </h3>
            <p className="text-xs mb-4" style={{ color: "#475569" }}>
              Are you sure you want to reject this request for Cadet{" "}
              <strong style={{ color: "#0f172a" }}>{selectedRequest.studentName}</strong> (UTR:{" "}
              <span className="font-mono font-bold">{selectedRequest.utr}</span>)?
            </p>

            <div className="space-y-2 mb-4">
              <label className="block text-xs font-bold" style={{ color: "#334155" }}>
                Reason / Note for Student
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="e.g. UTR not found in bank statement or amount mismatch."
                rows={3}
                className="w-full text-xs p-3 border rounded-xl"
                style={{ borderColor: "#cbd5e1", backgroundColor: "#ffffff", color: "#0f172a" }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleRejectRequest(selectedRequest.id, decisionNotes)}
                disabled={decisionLoading}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold cursor-pointer"
                style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
              >
                {decisionLoading ? "Rejecting..." : "Confirm Rejection"}
              </button>
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setDecisionAction(null);
                }}
                className="py-2.5 px-4 rounded-xl text-xs font-bold cursor-pointer"
                style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
