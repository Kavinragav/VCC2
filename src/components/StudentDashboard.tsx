import React from "react";
import { PdfViewerModal, downloadPdfViaBlob } from "./PdfViewerModal";
import { buildApiUrl } from "../config/api";

interface MockPaper {
  id: string;
  paperNumber: number;
  title: string;
  totalMarks: number;
  duration: string;
  sections: string[];
  hasDetailedSolutions: boolean;
  classType?: "class-6" | "class-9";
}

interface StudentUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface PurchaseWithPapers {
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
  classType: "class-6" | "class-9";
  packageTitle: string;
  papers?: MockPaper[];
}

interface AccessRequestRecord {
  id: string;
  classType: "class-6" | "class-9";
  packageTitle: string;
  amount: number;
  currency: string;
  studentEmail: string;
  studentName: string;
  utr: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string;
}

export interface StudentDashboardProps {
  React?: typeof React;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;

  const [currentUser, setCurrentUser] = R.useState<StudentUser | null>(() => {
    if (typeof localStorage !== "undefined") {
      const saved =
        localStorage.getItem("vcc_student_user") ||
        localStorage.getItem("vcc_c6_student") ||
        localStorage.getItem("vcc_c9_student");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.email && parsed.email.toLowerCase() !== "cadet.student@gmail.com") {
            return parsed;
          } else {
            localStorage.removeItem("vcc_student_user");
            localStorage.removeItem("vcc_c6_student");
            localStorage.removeItem("vcc_c9_student");
          }
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const [googleClientId, setGoogleClientId] = R.useState<string | null>(null);
  const [loginNameInput, setLoginNameInput] = R.useState("");
  const [loginEmailInput, setLoginEmailInput] = R.useState("");
  const [authError, setAuthError] = R.useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = R.useState(false);

  const [purchases, setPurchases] = R.useState<PurchaseWithPapers[]>([]);
  const [requests, setRequests] = R.useState<AccessRequestRecord[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = R.useState(false);
  const [lastRefreshed, setLastRefreshed] = R.useState<string | null>(null);

  const [activePdfModal, setActivePdfModal] = R.useState<{
    paperId: string;
    title: string;
    downloadUrl: string;
    downloadFilename: string;
    isFreeSample?: boolean;
    token?: string;
    email?: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = R.useState<string | null>(null);

  const fetchStudentDashboardData = R.useCallback(async (email: string, silent = false) => {
    if (!email) return;
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await fetch(buildApiUrl(`/api/student/status?email=${encodeURIComponent(email)}`));
      const data = await res.json();
      if (res.ok && data.success) {
        setPurchases(Array.isArray(data.purchases) ? data.purchases : []);
        setRequests(Array.isArray(data.allRequests) ? data.allRequests : []);
        setLastRefreshed(new Date().toLocaleTimeString());

        if (Array.isArray(data.purchases)) {
          for (const p of data.purchases) {
            if (p.classType === "class-6" && p.accessToken) {
              localStorage.setItem("vcc_c6_access_token", p.accessToken);
            }
            if (p.classType === "class-9" && p.accessToken) {
              localStorage.setItem("vcc_c9_access_token", p.accessToken);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching student status:", err);
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  }, []);

  R.useEffect(() => {
    fetch(buildApiUrl("/api/auth/config"))
      .then((res) => res.json())
      .then((data) => {
        if (data.googleClientId) {
          setGoogleClientId(data.googleClientId);
        }
      })
      .catch(() => {});
  }, []);

  R.useEffect(() => {
    if (currentUser?.email) {
      fetchStudentDashboardData(currentUser.email);
      const interval = setInterval(() => {
        fetchStudentDashboardData(currentUser.email, true);
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [currentUser?.email, fetchStudentDashboardData]);

  const handleGoogleAuthCallback = async (response: { credential: string }) => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await fetch(buildApiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.student) {
        saveAndSetStudent(data.student);
      } else {
        setAuthError(data.message || "Google sign-in failed. Please try again.");
      }
    } catch {
      setAuthError("Network error during Google sign-in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  R.useEffect(() => {
    if (googleClientId && window.google?.accounts?.id && !currentUser) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleAuthCallback,
        });
        const container = document.getElementById("student-dashboard-google-btn");
        if (container) {
          container.innerHTML = "";
          window.google.accounts.id.renderButton(container, {
            theme: "filled_blue",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: 320,
          });
        }
      } catch (err) {
        console.error("Google button render error:", err);
      }
    }
  }, [googleClientId, currentUser]);

  const saveAndSetStudent = (student: StudentUser) => {
    setCurrentUser(student);
    localStorage.setItem("vcc_student_user", JSON.stringify(student));
    localStorage.setItem("vcc_c6_student", JSON.stringify(student));
    localStorage.setItem("vcc_c9_student", JSON.stringify(student));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("vcc-auth-changed"));
    }
    fetchStudentDashboardData(student.email);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = loginNameInput.trim();
    const trimmedEmail = loginEmailInput.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setAuthError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@") || trimmedEmail === "cadet.student@gmail.com") {
      setAuthError("Please enter your valid Google email ID (e.g. yourname@gmail.com).");
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await fetch(buildApiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfile: {
            name: trimmedName,
            email: trimmedEmail,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.student) {
        saveAndSetStudent(data.student);
      } else {
        setAuthError(data.message || "Unable to sign in. Please check your details.");
      }
    } catch {
      setAuthError("Network error while signing in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setPurchases([]);
    setRequests([]);
    localStorage.removeItem("vcc_student_user");
    localStorage.removeItem("vcc_c6_student");
    localStorage.removeItem("vcc_c9_student");
    localStorage.removeItem("vcc_c6_access_token");
    localStorage.removeItem("vcc_c9_access_token");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("vcc-auth-changed"));
    }
  };

  const hasClass6Purchased = purchases.some((p) => p.classType === "class-6");
  const hasClass9Purchased = purchases.some((p) => p.classType === "class-9");

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f8fafc", color: "#0f172a" }}>
      {/* Top Navigation Header */}
      <header
        className="sticky top-0 z-40 shadow-md"
        style={{ backgroundColor: "#071328", color: "#ffffff" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/lovable-uploads/671c3aa7-ad8e-43c4-ad06-c6476069cc04.png"
              alt="Vivekanandha Sainik Coaching Center"
              className="h-10 object-contain"
            />
            <div className="hidden sm:block">
              <div className="font-extrabold text-sm tracking-wide" style={{ color: "#ffffff" }}>
                VIVEKANANDHA SAINIK
              </div>
              <div className="text-[11px]" style={{ color: "#38bdf8" }}>
                Cadet Student Portal
              </div>
            </div>
          </a>

          <div className="flex items-center gap-3 sm:gap-5 text-xs sm:text-sm font-semibold">
            <a href="/" className="hover:underline" style={{ color: "#e2e8f0" }}>
              Home
            </a>
            <a href="/blog/class-6-aissee-pyqs" className="hover:underline" style={{ color: "#fbbf24" }}>
              Class 6 Tests
            </a>
            <a href="/blog/class-9-aissee-mock-tests-pyqs" className="hover:underline" style={{ color: "#fbbf24" }}>
              Class 9 Tests
            </a>
            <a href="/blog" className="hidden sm:inline hover:underline" style={{ color: "#e2e8f0" }}>
              Blog
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {!currentUser ? (
          /* STUDENT LOGIN CARD */
          <div className="max-w-md mx-auto">
            <div
              className="rounded-2xl shadow-xl border-2 overflow-hidden"
              style={{ backgroundColor: "#ffffff", borderColor: "#071328" }}
            >
              <div
                className="p-6 text-center"
                style={{
                  background: "linear-gradient(135deg, #071328 0%, #0f2547 100%)",
                  color: "#ffffff",
                }}
              >
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center font-black text-xl shadow-md"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-2xl font-black">Student Account Login</h1>
                <p className="text-xs mt-1.5" style={{ color: "#cbd5e1" }}>
                  Sign in with your Google Account to view your account details and download your purchased AISSEE Mock
                  Tests.
                </p>
              </div>

              <div className="p-6 space-y-4">
                {authError && (
                  <div
                    className="p-3 rounded-xl border text-xs font-semibold"
                    style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}
                  >
                    {authError}
                  </div>
                )}

                {googleClientId && (
                  <div className="flex flex-col items-center justify-center pt-1">
                    <div id="student-dashboard-google-btn" className="min-h-[44px]"></div>
                  </div>
                )}

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t" style={{ borderColor: "#e2e8f0" }}></div>
                  <span
                    className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "#64748b" }}
                  >
                    Or Sign In with Your Google Email
                  </span>
                  <div className="flex-grow border-t" style={{ borderColor: "#e2e8f0" }}></div>
                </div>

                <form onSubmit={handleManualLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: "#1e293b" }}>
                      Student Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={loginNameInput}
                      onChange={(e) => setLoginNameInput(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: "#1e293b" }}>
                      Google Email ID (Gmail) *
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmailInput}
                      onChange={(e) => setLoginEmailInput(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full py-3.5 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    style={{ backgroundColor: "#071328", color: "#ffffff" }}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                    </svg>
                    <span>{isSigningIn ? "Signing In..." : "Sign In to Student Dashboard"}</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* LOGGED-IN STUDENT DASHBOARD */
          <div className="space-y-8">
            {/* 1. ACCOUNT DETAILS BANNER */}
            <section
              className="rounded-2xl shadow-lg border overflow-hidden"
              style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
            >
              <div
                className="p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                style={{
                  background: "linear-gradient(135deg, #071328 0%, #0f2547 100%)",
                  color: "#ffffff",
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shrink-0 shadow-lg"
                    style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                  >
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "S"}
                  </div>
                  <div>
                    <span
                      className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1.5"
                      style={{ backgroundColor: "rgba(56, 189, 248, 0.2)", color: "#38bdf8" }}
                    >
                      Verified Student Account
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "#ffffff" }}>
                      {currentUser.name}
                    </h1>
                    <p className="text-xs sm:text-sm font-mono mt-0.5" style={{ color: "#cbd5e1" }}>
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => fetchStudentDashboardData(currentUser.email)}
                    disabled={isLoadingStatus}
                    className="py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      borderColor: "rgba(255, 255, 255, 0.25)",
                      color: "#ffffff",
                    }}
                  >
                    {isLoadingStatus ? "Refreshing..." : "↻ Refresh Access Status"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="py-2.5 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Account Details Summary Grid */}
              <div
                className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x border-t text-xs"
                style={{ borderColor: "#e2e8f0", backgroundColor: "#f8fafc" }}
              >
                <div className="p-4">
                  <div className="uppercase font-bold text-[10px]" style={{ color: "#64748b" }}>
                    Student Name
                  </div>
                  <div className="font-extrabold text-sm mt-0.5" style={{ color: "#0f172a" }}>
                    {currentUser.name}
                  </div>
                </div>
                <div className="p-4">
                  <div className="uppercase font-bold text-[10px]" style={{ color: "#64748b" }}>
                    Registered Email ID
                  </div>
                  <div className="font-mono font-bold text-sm mt-0.5" style={{ color: "#0f172a" }}>
                    {currentUser.email}
                  </div>
                </div>
                <div className="p-4">
                  <div className="uppercase font-bold text-[10px]" style={{ color: "#64748b" }}>
                    Tests Purchased / Unlocked
                  </div>
                  <div className="font-extrabold text-sm mt-0.5" style={{ color: "#15803d" }}>
                    {purchases.length} {purchases.length === 1 ? "Package Active" : "Packages Active"}
                    {lastRefreshed && (
                      <span className="font-normal text-[11px] ml-2" style={{ color: "#64748b" }}>
                        (Updated {lastRefreshed})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. PURCHASED & APPROVED MOCK TESTS */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black" style={{ color: "#071328" }}>
                    Tests Purchased &amp; Unlocked Materials
                  </h2>
                  <p className="text-xs" style={{ color: "#64748b" }}>
                    Once the administrator approves your UPI payment, your 9 Mock Question Papers and Step-by-Step
                    Solutions appear here automatically.
                  </p>
                </div>
              </div>

              {purchases.length === 0 ? (
                <div
                  className="rounded-2xl border-2 border-dashed p-8 text-center space-y-3"
                  style={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1" }}
                >
                  <div className="text-base font-extrabold" style={{ color: "#0f172a" }}>
                    No Approved Mock Test Packages Yet
                  </div>
                  <p className="text-xs max-w-lg mx-auto" style={{ color: "#64748b" }}>
                    If you have already paid ₹99 via UPI and submitted your 12-digit UTR number, your request will be
                    verified by the admin within 1 hour and your mock papers will unlock here automatically.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <a
                      href="/blog/class-6-aissee-pyqs"
                      className="py-2.5 px-5 rounded-xl font-black text-xs shadow"
                      style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                    >
                      Get Class 6 Mock Test Series (₹99) &rarr;
                    </a>
                    <a
                      href="/blog/class-9-aissee-mock-tests-pyqs"
                      className="py-2.5 px-5 rounded-xl font-black text-xs shadow"
                      style={{ backgroundColor: "#071328", color: "#ffffff" }}
                    >
                      Get Class 9 Mock Test Series (₹99) &rarr;
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.paymentId}
                      className="rounded-2xl border-2 shadow-lg overflow-hidden"
                      style={{ backgroundColor: "#ffffff", borderColor: "#10b981" }}
                    >
                      <div
                        className="p-5 sm:p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        style={{ backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }}
                      >
                        <div>
                          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ backgroundColor: "#10b981", color: "#ffffff" }}>
                            <span>✓</span>
                            <span>Admin Approved &middot; Unlocked</span>
                          </div>
                          <h3 className="text-lg sm:text-xl font-black" style={{ color: "#064e3b" }}>
                            {purchase.packageTitle ||
                              (purchase.classType === "class-6"
                                ? "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions"
                                : "Class 9 AISSEE 9-Mock Test Series & Step-by-Step Solutions")}
                          </h3>
                          <p className="text-xs mt-0.5" style={{ color: "#047857" }}>
                            Approved on {new Date(purchase.verifiedAt).toLocaleDateString()} &middot; Reference:{" "}
                            <span className="font-mono">{purchase.paymentId}</span>
                          </p>
                        </div>

                        <a
                          href={
                            purchase.classType === "class-6"
                              ? "/blog/class-6-aissee-pyqs"
                              : "/blog/class-9-aissee-mock-tests-pyqs"
                          }
                          className="py-2.5 px-4 rounded-xl font-bold text-xs shrink-0 text-center"
                          style={{ backgroundColor: "#065f46", color: "#ffffff" }}
                        >
                          Open Full {purchase.classType === "class-6" ? "Class 6" : "Class 9"} Page &rarr;
                        </a>
                      </div>

                      {purchase.papers && purchase.papers.length > 0 && (
                        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                          {purchase.papers.map((paper) => (
                            <div
                              key={paper.id}
                              className="rounded-xl border p-4 flex flex-col justify-between"
                              style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                            >
                              <div>
                                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                                  <span
                                    className="px-2.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: "#071328", color: "#fbbf24" }}
                                  >
                                    MOCK #{paper.paperNumber}
                                  </span>
                                  <span style={{ color: "#64748b" }}>
                                    {paper.totalMarks} Marks &middot; {paper.duration}
                                  </span>
                                </div>
                                <h4 className="font-bold text-sm mb-3" style={{ color: "#0f172a" }}>
                                  {paper.title}
                                </h4>
                              </div>

                              <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "#e2e8f0" }}>
                                  {purchase.classType === "class-6" || paper.paperNumber >= 5 ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActivePdfModal({
                                            paperId: paper.id,
                                            title: paper.title,
                                            downloadUrl: buildApiUrl(
                                              `/api/download/${paper.id}?token=${encodeURIComponent(
                                                purchase.accessToken
                                              )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                            ),
                                            downloadFilename:
                                              purchase.classType === "class-6"
                                                ? `AISSEE_Class_6_Super9_Mock_Paper_0${paper.paperNumber}_With_Solutions.pdf`
                                                : `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_With_Solutions.pdf`,
                                            token: purchase.accessToken,
                                            email: purchase.email,
                                          })
                                        }
                                        className="py-2 px-2.5 rounded-lg font-bold text-xs text-center border transition-colors cursor-pointer"
                                        style={{
                                          backgroundColor: "#ffffff",
                                          borderColor: "#071328",
                                          color: "#071328",
                                        }}
                                      >
                                        👁️ View PDF
                                      </button>
                                      <button
                                        type="button"
                                        disabled={downloadingId === paper.id}
                                        onClick={() =>
                                          downloadPdfViaBlob(
                                            buildApiUrl(
                                              `/api/download/${paper.id}?token=${encodeURIComponent(
                                                purchase.accessToken
                                              )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                            ),
                                            purchase.classType === "class-6"
                                              ? `AISSEE_Class_6_Super9_Mock_Paper_0${paper.paperNumber}_With_Solutions.pdf`
                                              : `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_With_Solutions.pdf`,
                                            (loading) => setDownloadingId(loading ? paper.id : null)
                                          )
                                        }
                                        className="py-2 px-2.5 rounded-lg font-bold text-xs text-center transition-colors cursor-pointer"
                                        style={{ backgroundColor: "#059669", color: "#ffffff" }}
                                      >
                                        {downloadingId === paper.id
                                          ? "⏳ Downloading PDF..."
                                          : "⬇️ Download Complete Paper + Solutions PDF"}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActivePdfModal({
                                              paperId: `${paper.id}-question`,
                                              title: `Class 9 Mock #${paper.paperNumber} — Question Paper`,
                                              downloadUrl: buildApiUrl(
                                                `/api/download/${paper.id}-question?token=${encodeURIComponent(
                                                  purchase.accessToken
                                                )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                              ),
                                              downloadFilename: `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_Questions.pdf`,
                                              token: purchase.accessToken,
                                              email: purchase.email,
                                            })
                                          }
                                          className="py-2 px-2 rounded-lg font-bold text-[11px] text-center border transition-colors cursor-pointer"
                                          style={{ backgroundColor: "#ffffff", borderColor: "#071328", color: "#071328" }}
                                        >
                                          👁️ View Questions
                                        </button>
                                        <button
                                          type="button"
                                          disabled={downloadingId === `${paper.id}-question`}
                                          onClick={() =>
                                            downloadPdfViaBlob(
                                              buildApiUrl(
                                                `/api/download/${paper.id}-question?token=${encodeURIComponent(
                                                  purchase.accessToken
                                                )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                              ),
                                              `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_Questions.pdf`,
                                              (loading) =>
                                                setDownloadingId(loading ? `${paper.id}-question` : null)
                                            )
                                          }
                                          className="py-2 px-2 rounded-lg font-bold text-[11px] text-center transition-colors cursor-pointer"
                                          style={{ backgroundColor: "#071328", color: "#ffffff" }}
                                        >
                                          {downloadingId === `${paper.id}-question` ? "⏳..." : "⬇️ Question PDF"}
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActivePdfModal({
                                              paperId: `${paper.id}-solution`,
                                              title: `Class 9 Mock #${paper.paperNumber} — Step-by-Step Solutions`,
                                              downloadUrl: buildApiUrl(
                                                `/api/download/${paper.id}-solution?token=${encodeURIComponent(
                                                  purchase.accessToken
                                                )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                              ),
                                              downloadFilename: `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_Solutions.pdf`,
                                              token: purchase.accessToken,
                                              email: purchase.email,
                                            })
                                          }
                                          className="py-2 px-2 rounded-lg font-bold text-[11px] text-center border transition-colors cursor-pointer"
                                          style={{ backgroundColor: "#ecfdf5", borderColor: "#059669", color: "#065f46" }}
                                        >
                                          👁️ View Solutions
                                        </button>
                                        <button
                                          type="button"
                                          disabled={downloadingId === `${paper.id}-solution`}
                                          onClick={() =>
                                            downloadPdfViaBlob(
                                              buildApiUrl(
                                                `/api/download/${paper.id}-solution?token=${encodeURIComponent(
                                                  purchase.accessToken
                                                )}&email=${encodeURIComponent(purchase.email)}&download=1`
                                              ),
                                              `AISSEE_Class_9_Super9_Mock_Paper_0${paper.paperNumber}_Solutions.pdf`,
                                              (loading) =>
                                                setDownloadingId(loading ? `${paper.id}-solution` : null)
                                            )
                                          }
                                          className="py-2 px-2 rounded-lg font-bold text-[11px] text-center transition-colors cursor-pointer"
                                          style={{ backgroundColor: "#059669", color: "#ffffff" }}
                                        >
                                          {downloadingId === `${paper.id}-solution` ? "⏳..." : "⬇️ Solutions PDF"}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. PAYMENT VERIFICATION REQUEST HISTORY */}
              {requests.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-lg font-black" style={{ color: "#071328" }}>
                    Your Payment Verification Requests
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-xl border p-4 flex flex-col justify-between gap-3"
                        style={{
                          backgroundColor: "#ffffff",
                          borderColor:
                            req.status === "approved"
                              ? "#34d399"
                              : req.status === "rejected"
                              ? "#fca5a5"
                              : "#fcd34d",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span
                              className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full mb-1"
                              style={{
                                backgroundColor:
                                  req.status === "approved"
                                    ? "#d1fae5"
                                    : req.status === "rejected"
                                    ? "#fee2e2"
                                    : "#fef3c7",
                                color:
                                  req.status === "approved"
                                    ? "#065f46"
                                    : req.status === "rejected"
                                    ? "#991b1b"
                                    : "#92400e",
                              }}
                            >
                              {req.status === "approved"
                                ? "✓ Approved by Admin"
                                : req.status === "rejected"
                                ? "✕ Verification Declined"
                                : "⏳ Pending Admin Verification"}
                            </span>
                            <h3 className="font-bold text-sm" style={{ color: "#0f172a" }}>
                              {req.packageTitle}
                            </h3>
                          </div>
                          <span className="font-black text-sm" style={{ color: "#0f172a" }}>
                            ₹{req.amount}
                          </span>
                        </div>

                        <div className="text-xs space-y-1" style={{ color: "#475569" }}>
                          <div>
                            UTR / Ref No: <strong className="font-mono" style={{ color: "#0f172a" }}>{req.utr}</strong>
                          </div>
                          <div>Submitted: {new Date(req.submittedAt).toLocaleString()}</div>
                        </div>

                        {req.status === "pending" && (
                          <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: "#f1f5f9" }}>
                            <span style={{ color: "#b45309" }}>Verification within 1 hour</span>
                            <a
                              href={`https://wa.me/8940399717?text=${encodeURIComponent(
                                `Hello VCC Team, please verify my ${req.classType.toUpperCase()} Mock Test request. Name: ${currentUser.name}, Email: ${currentUser.email}, UTR: ${req.utr}`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold hover:underline"
                              style={{ color: "#059669" }}
                            >
                              💬 WhatsApp Support
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 4. AVAILABLE TESTS & FREE PYQs */}
              <section className="space-y-3">
                <h2 className="text-lg font-black" style={{ color: "#071328" }}>
                  Explore AISSEE PYQs &amp; Mock Test Series
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className="rounded-2xl border p-5 flex flex-col justify-between gap-4"
                    style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#eff6ff", color: "#1d4ed8" }}
                        >
                          Class 6 AISSEE
                        </span>
                        <span
                          className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
                        >
                          🎁 1 Free Mock + Solutions Included
                        </span>
                      </div>
                      <h3 className="text-base font-black" style={{ color: "#0f172a" }}>
                        Class 6 Free Sample Mock, PYQs &amp; Super 9 Series (₹99)
                      </h3>
                      <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                        Download Mock Paper #1 (with Answer Key &amp; Step-by-Step Solutions) free, or unlock the Super 9
                        Full-Length Class 6 Mock Papers (300 Marks pattern).
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActivePdfModal({
                            paperId: "c6-free-sample",
                            title: "AISSEE Class 6 Free Sample Mock Paper #1 (With Solutions)",
                            downloadUrl: buildApiUrl("/api/sample/class-6-free-mock?download=1"),
                            downloadFilename: "AISSEE_Class_6_Free_Sample_Mock_Paper_With_Solutions.pdf",
                            isFreeSample: true,
                          })
                        }
                        className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-center cursor-pointer"
                        style={{ backgroundColor: "#059669", color: "#ffffff" }}
                      >
                        👁️ View Free Sample + Solutions PDF
                      </button>
                      <a
                        href="/blog/class-6-aissee-pyqs"
                        className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-center"
                        style={{ backgroundColor: "#071328", color: "#ffffff" }}
                      >
                        {hasClass6Purchased ? "Open Super 9 Papers →" : "Class 6 Super 9 (₹99) →"}
                      </a>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl border p-5 flex flex-col justify-between gap-4"
                    style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                        >
                          Class 9 AISSEE
                        </span>
                        <span
                          className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
                        >
                          🎁 1 Free Mock + Solutions Included
                        </span>
                      </div>
                      <h3 className="text-base font-black" style={{ color: "#0f172a" }}>
                        Class 9 Free Sample Mock, PYQs &amp; Super 9 Series (₹99)
                      </h3>
                      <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                        Download the Free Sample Class 9 Mock Paper (with Master Answer Key &amp; Solutions) free, or
                        unlock the Super 9 Full-Length Class 9 Mock Papers (400 Marks pattern).
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActivePdfModal({
                            paperId: "c9-free-sample",
                            title: "AISSEE Class 9 Free Sample Full-Length Mock Paper (With Solutions)",
                            downloadUrl: buildApiUrl("/api/sample/class-9-free-mock?download=1"),
                            downloadFilename: "AISSEE_Class_9_Free_Sample_Mock_Paper_With_Solutions.pdf",
                            isFreeSample: true,
                          })
                        }
                        className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-center cursor-pointer"
                        style={{ backgroundColor: "#059669", color: "#ffffff" }}
                      >
                        👁️ View Free Sample + Solutions PDF
                      </button>
                      <a
                        href="/blog/class-9-aissee-mock-tests-pyqs"
                        className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-center"
                        style={{ backgroundColor: "#071328", color: "#ffffff" }}
                      >
                        {hasClass9Purchased ? "Open Super 9 Papers →" : "Class 9 Super 9 (₹99) →"}
                      </a>
                    </div>
                  </div>
                </div>
              </section>
          </div>
        )}
      </main>

      <PdfViewerModal
        React={R}
        isOpen={Boolean(activePdfModal)}
        onClose={() => setActivePdfModal(null)}
        paperId={activePdfModal?.paperId || ""}
        title={activePdfModal?.title || ""}
        downloadUrl={activePdfModal?.downloadUrl || ""}
        downloadFilename={activePdfModal?.downloadFilename || ""}
        isFreeSample={activePdfModal?.isFreeSample}
        token={activePdfModal?.token}
        email={activePdfModal?.email}
      />
    </div>
  );
};

export default StudentDashboard;
