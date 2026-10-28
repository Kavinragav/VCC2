import React from "react";
import AdminDashboard from "./AdminDashboard";

declare global {
  interface Window {
    React?: typeof React;
  }
}

export interface AdminPortalProps {
  React?: typeof React;
}

export const AdminPortal: React.FC<AdminPortalProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;

  const [adminToken, setAdminToken] = R.useState<string | null>(() => {
    return typeof localStorage !== "undefined" ? localStorage.getItem("vcc_admin_token") : null;
  });
  const [adminUser, setAdminUser] = R.useState<string | null>(() => {
    return typeof localStorage !== "undefined" ? localStorage.getItem("vcc_admin_user") : null;
  });

  const [loading, setLoading] = R.useState(true);
  const [usernameInput, setUsernameInput] = R.useState("");
  const [passwordInput, setPasswordInput] = R.useState("");
  const [showPassword, setShowPassword] = R.useState(false);
  const [isSubmitting, setIsSubmitting] = R.useState(false);
  const [errorMessage, setErrorMessage] = R.useState<string | null>(null);

  const handleLogout = R.useCallback(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("vcc_admin_token");
      localStorage.removeItem("vcc_admin_user");
      localStorage.removeItem("vcc_admin_email");
    }
    setAdminToken(null);
    setAdminUser(null);
    setLoading(false);
  }, []);

  // Verify existing session token on mount
  R.useEffect(() => {
    if (adminToken) {
      fetch("/api/admin/verify-session", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && (data.admin?.username || data.admin?.email)) {
            setAdminUser(data.admin.username || data.admin.email);
            setLoading(false);
          } else {
            handleLogout();
          }
        })
        .catch(() => {
          handleLogout();
        });
    } else {
      setLoading(false);
    }
  }, [adminToken, handleLogout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        const user = data.admin?.username || data.admin?.email || "VccAdmin";
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("vcc_admin_token", data.token);
          localStorage.setItem("vcc_admin_user", user);
        }
        setAdminToken(data.token);
        setAdminUser(user);
      } else {
        setErrorMessage(data.message || "Invalid username or password.");
      }
    } catch {
      setErrorMessage("Network error occurred while signing in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: "#071328", color: "#ffffff" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-4 rounded-full animate-spin"
            style={{ borderColor: "#f59e0b", borderTopColor: "transparent" }}
          ></div>
          <span className="text-sm font-semibold" style={{ color: "#cbd5e1" }}>
            Verifying Administrator Session...
          </span>
        </div>
      </div>
    );
  }

  // If authenticated, render the Admin Dashboard
  if (adminToken && adminUser) {
    return <AdminDashboard React={R} adminEmail={adminUser} adminToken={adminToken} onLogout={handleLogout} />;
  }

  // Single Administrator Login Screen (Username & Password Only — No Google Sign-In)
  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 font-sans"
      style={{ backgroundColor: "#071328", color: "#ffffff" }}
    >
      {/* Top Navigation Links */}
      <div className="w-full max-w-md mb-6 flex justify-between items-center text-xs" style={{ color: "#94a3b8" }}>
        <a href="/" className="inline-flex items-center gap-1.5 hover:underline" style={{ color: "#cbd5e1" }}>
          <span>&larr;</span>
          <span>Back to Main Website</span>
        </a>
        <div className="flex items-center gap-3">
          <a href="/blog/class-6-aissee-pyqs" className="hover:underline" style={{ color: "#fbbf24" }}>
            Class 6 Mocks
          </a>
          <span>&middot;</span>
          <a href="/blog/class-9-aissee-mock-tests-pyqs" className="hover:underline" style={{ color: "#fbbf24" }}>
            Class 9 Mocks
          </a>
        </div>
      </div>

      {/* Login Card */}
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border-2"
        style={{ backgroundColor: "#ffffff", borderColor: "#f59e0b", color: "#0f172a" }}
      >
        {/* Card Header */}
        <div
          className="p-6 sm:p-8 text-center border-b"
          style={{ backgroundColor: "#0b1d3a", borderColor: "#1e293b", color: "#ffffff" }}
        >
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center shadow-lg font-black text-xl"
            style={{ backgroundColor: "#f59e0b", color: "#071328" }}
          >
            🛡️
          </div>
          <div
            className="text-[11px] font-bold uppercase tracking-widest mb-1"
            style={{ color: "#fbbf24" }}
          >
            Vivekanandha Sainik Coaching Center
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#ffffff" }}>
            Administrator Portal
          </h1>
          <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            Authorized access for managing Class 6 &amp; Class 9 Mock Test requests
          </p>
        </div>

        {/* Login Form */}
        <div className="p-6 sm:p-8" style={{ backgroundColor: "#ffffff", color: "#0f172a" }}>
          {errorMessage && (
            <div
              className="mb-5 p-3.5 rounded-xl border text-xs font-semibold flex items-start gap-2"
              style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}
            >
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="admin-username"
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "#334155" }}
              >
                Admin Username
              </label>
              <input
                id="admin-username"
                type="text"
                required
                autoComplete="username"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Enter admin username"
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none"
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#cbd5e1",
                  color: "#0f172a",
                }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-bold uppercase tracking-wider"
                  style={{ color: "#334155" }}
                >
                  Admin Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-semibold hover:underline cursor-pointer"
                  style={{ color: "#2563eb" }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none"
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#cbd5e1",
                  color: "#0f172a",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-6 rounded-xl font-black text-sm shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              style={{
                backgroundColor: isSubmitting ? "#94a3b8" : "#071328",
                color: "#ffffff",
              }}
            >
              {isSubmitting ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <span>&rarr;</span>
                </>
              )}
            </button>
          </form>

          <div
            className="mt-6 pt-4 border-t text-center text-[11px]"
            style={{ borderColor: "#f1f5f9", color: "#64748b" }}
          >
            🔒 Restricted to authorized Vivekanandha Coaching Center administration.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;
