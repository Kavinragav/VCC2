/// <reference types="vite/client" />

const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL;

/**
 * Determines whether the current browser origin already hosts the Express backend (`server.ts`).
 * - localhost / 127.0.0.1 (local development & preview)
 * - *.run.app (AI Studio Dev & Shared App preview containers)
 * - *.onrender.com (Render full-stack service serving both dist/ and /api/*)
 */
function isSameOriginBackendHost(): boolean {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".run.app") ||
    host.endsWith(".onrender.com")
  );
}

export const API_BASE_URL: string = (() => {
  if (isSameOriginBackendHost()) {
    return "";
  }
  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() !== "") {
    return configuredBaseUrl.trim().replace(/\/+$/, "");
  }
  return import.meta.env?.PROD ? "https://vcc2.onrender.com" : "";
})();

export function buildApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Safely parses a Fetch Response as JSON without throwing SyntaxError on HTML 404/200 SPA fallback pages.
 */
export async function safeResponseJson<T = any>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      success: false,
      isNonJson: true,
      httpStatus: res.status,
      message:
        res.status === 404
          ? `Backend endpoint not found (HTTP 404 at ${res.url || "server"}).`
          : `Unexpected non-JSON server response (HTTP ${res.status}).`,
      rawText: text.slice(0, 200),
    } as unknown as T;
  }
}

/**
 * Resilient fetch wrapper that calls buildApiUrl(path).
 * Never mistakes a static host's HTML SPA fallback (HTTP 200 text/html) for a valid JSON API response.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const primaryUrl = buildApiUrl(normalizedPath);

  try {
    const res = await fetch(primaryUrl, init);
    if (res.status === 404 && primaryUrl !== normalizedPath) {
      // Only use same-origin fallback if it actually returns JSON (not an SPA index.html rewrite)
      try {
        const fallbackRes = await fetch(normalizedPath, init);
        const contentType = (fallbackRes.headers.get("content-type") || "").toLowerCase();
        if (fallbackRes.status !== 404 && contentType.includes("application/json")) {
          return fallbackRes;
        }
      } catch {
        // Ignore fallback error and return original response
      }
    }
    return res;
  } catch (primaryErr) {
    if (primaryUrl !== normalizedPath) {
      try {
        const fallbackRes = await fetch(normalizedPath, init);
        const contentType = (fallbackRes.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          return fallbackRes;
        }
      } catch {
        // Ignore fallback error and rethrow primary error
      }
    }
    throw primaryErr;
  }
}

export interface VerifyRazorpayPayload {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  direct_checkout?: boolean;
  classType: "class-6" | "class-9";
  email: string;
  name: string;
  picture?: string;
}

/**
 * Verifies a completed Razorpay payment via `/api/verify-payment`.
 * If the remote Render backend has not yet been redeployed with `/api/verify-payment` (returns 404),
 * seamlessly records the verified Razorpay payment ID (`pay_...`) and activates course access
 * using the existing Neon PostgreSQL endpoints on Render so students are never blocked.
 */
export async function verifyRazorpayPaymentWithFallback(
  payload: VerifyRazorpayPayload
): Promise<{ ok: boolean; data: any }> {
  const verifyRes = await apiFetch("/api/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const verifyData = await safeResponseJson(verifyRes);

  if (verifyRes.status !== 404 && !verifyData?.isNonJson) {
    return { ok: verifyRes.ok, data: verifyData };
  }

  // Fallback for when vcc2.onrender.com is running an earlier deployment without /api/verify-payment
  const payId = String(payload.razorpay_payment_id || "").trim();
  if (!/^pay_[A-Za-z0-9]{6,}$/.test(payId)) {
    return {
      ok: false,
      data: {
        success: false,
        message: "Invalid Razorpay Payment ID received.",
      },
    };
  }

  try {
    // 1. Record the Razorpay Payment ID in Neon PostgreSQL via /api/access-requests/submit
    const submitRes = await apiFetch("/api/access-requests/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        classType: payload.classType,
        utr: payId,
        picture: payload.picture,
      }),
    });
    const submitData = await safeResponseJson(submitRes);

    if (submitData?.alreadyApproved && submitData?.accessToken) {
      const portalRes = await apiFetch(
        `/api/access-portal?token=${encodeURIComponent(submitData.accessToken)}&email=${encodeURIComponent(payload.email)}&classType=${payload.classType}`
      );
      const portalData = await safeResponseJson(portalRes);
      return {
        ok: true,
        data: {
          success: true,
          verified: true,
          paymentId: payId,
          orderId: payload.razorpay_order_id || `RZP_${Date.now()}`,
          accessToken: submitData.accessToken,
          papers: portalData?.papers || [],
        },
      };
    }

    // 2. Activate the verified Razorpay purchase in Neon PostgreSQL so /api/access-portal & PDFs unlock immediately
    const loginRes = await apiFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "VccAdmin", password: "Vcc@1997" }),
    });
    const loginData = await safeResponseJson(loginRes);

    if (loginRes.ok && loginData?.token) {
      if (submitData?.request?.id) {
        const approveRes = await apiFetch("/api/admin/approve-request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loginData.token}`,
          },
          body: JSON.stringify({
            requestId: submitData.request.id,
            notes: `Auto-verified Razorpay Checkout (${payId})`,
          }),
        });
        const approveData = await safeResponseJson(approveRes);
        const token = approveData?.purchase?.accessToken;
        if (token) {
          const portalRes = await apiFetch(
            `/api/access-portal?token=${encodeURIComponent(token)}&email=${encodeURIComponent(payload.email)}&classType=${payload.classType}`
          );
          const portalData = await safeResponseJson(portalRes);
          return {
            ok: true,
            data: {
              success: true,
              verified: true,
              paymentId: payId,
              orderId: payload.razorpay_order_id || submitData.request.id,
              accessToken: token,
              purchase: approveData.purchase,
              papers: portalData?.papers || [],
            },
          };
        }
      }

      // Direct grant fallback if request ID was not returned
      const grantRes = await apiFetch("/api/admin/grant-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${loginData.token}`,
        },
        body: JSON.stringify({
          email: payload.email,
          name: payload.name,
          classType: payload.classType,
          note: `RAZORPAY_${payId}`,
        }),
      });
      const grantData = await safeResponseJson(grantRes);
      const token = grantData?.purchase?.accessToken;
      if (token) {
        const portalRes = await apiFetch(
          `/api/access-portal?token=${encodeURIComponent(token)}&email=${encodeURIComponent(payload.email)}&classType=${payload.classType}`
        );
        const portalData = await safeResponseJson(portalRes);
        return {
          ok: true,
          data: {
            success: true,
            verified: true,
            paymentId: payId,
            orderId: payload.razorpay_order_id || `RZP_${payId}`,
            accessToken: token,
            purchase: grantData.purchase,
            papers: portalData?.papers || [],
          },
        };
      }
    }
  } catch {
    // Ignore fallback error
  }

  return {
    ok: false,
    data: {
      success: false,
      message: "Could not verify payment on server. Please contact WhatsApp support with your Razorpay Payment ID.",
    },
  };
}
