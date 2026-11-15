import React from "react";
import { PdfViewerModal, downloadPdfViaBlob } from "./PdfViewerModal";
import { apiFetch, buildApiUrl, safeResponseJson } from "../config/api";

declare global {
  interface Window {
    React?: typeof React;
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (err: { error?: { description?: string } }) => void) => void;
    };
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface MockPaper {
  id: string;
  paperNumber: number;
  title: string;
  totalMarks: number;
  duration: string;
  sections: string[];
  hasDetailedSolutions: boolean;
}

interface StudentUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AccessRequestRecord {
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
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  isDuplicateUtr?: boolean;
}

interface VerificationSuccessData {
  paymentId: string;
  orderId: string;
  accessToken: string;
  customer: {
    name: string;
    email: string;
  };
  package: {
    title: string;
    inauguralPrice: number;
    papersCount: number;
    papers: MockPaper[];
  };
}

export interface Class6MockPaymentSectionProps {
  React?: typeof React;
}

export const Class6MockPaymentSection: React.FC<Class6MockPaymentSectionProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;

  const [paymentConfig, setPaymentConfig] = R.useState<{
    paymentMode: string;
    supportWhatsApp: string;
    supportWhatsAppUrl: string;
    price: number;
    googleClientId: string | null;
    razorpayKeyId: string | null;
    razorpayConfigured: boolean;
    razorpayDormant: boolean;
  }>({
    paymentMode: "razorpay",
    supportWhatsApp: "+91 8940399717",
    supportWhatsAppUrl: "https://wa.me/8940399717",
    price: 99,
    googleClientId: null,
    razorpayKeyId: (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_RAZORPAY_KEY_ID || null,
    razorpayConfigured: true,
    razorpayDormant: false,
  });

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

  const [isModalOpen, setIsModalOpen] = R.useState(false);
  const [isLoading, setIsLoading] = R.useState(false);
  const [errorMessage, setErrorMessage] = R.useState<string | null>(null);

  // Manual Google Account Fallback Inputs
  const [loginNameInput, setLoginNameInput] = R.useState("");
  const [loginEmailInput, setLoginEmailInput] = R.useState("");

  // Access Request & Purchase Status
  const [latestRequest, setLatestRequest] = R.useState<AccessRequestRecord | null>(null);
  const [verifiedPurchase, setVerifiedPurchase] = R.useState<VerificationSuccessData | null>(null);

  // In-App PDF Viewer & Blob Download State
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

  // Check student status for Class 6 without triggering 403 Forbidden on unpurchased accounts
  const checkStudentStatus = R.useCallback((email: string, token?: string | null) => {
    const fetchStatusByEmail = (studentEmail: string) => {
      if (!studentEmail) return;
      apiFetch(`/api/student/status?email=${encodeURIComponent(studentEmail)}&classType=class-6`)
        .then((res) => safeResponseJson(res))
        .then((statusData) => {
          if (statusData?.success) {
            if (statusData.hasPurchased && statusData.activePurchase?.accessToken) {
              const activeToken = statusData.activePurchase.accessToken;
              if (typeof localStorage !== "undefined") {
                localStorage.setItem("vcc_c6_access_token", activeToken);
              }
              apiFetch(`/api/access-portal?token=${encodeURIComponent(activeToken)}&classType=class-6`)
                .then((r) => safeResponseJson(r))
                .then((portalData) => {
                  if (portalData?.success) {
                    setVerifiedPurchase({
                      paymentId: statusData.activePurchase.paymentId || "CONFIRMED_ACCOUNT",
                      orderId: statusData.activePurchase.orderId || "VERIFIED",
                      accessToken: activeToken,
                      customer: {
                        name: portalData.student || statusData.student?.name || "Student",
                        email: portalData.email || studentEmail,
                      },
                      package: {
                        title: "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions",
                        inauguralPrice: 99,
                        papersCount: portalData.papers?.length || 9,
                        papers: portalData.papers || [],
                      },
                    });
                  }
                })
                .catch(() => {});
            } else if (statusData.latestRequest) {
              setLatestRequest(statusData.latestRequest);
            }
          }
        })
        .catch(() => {});
    };

    if (token) {
      apiFetch(`/api/access-portal?token=${encodeURIComponent(token)}&classType=class-6`)
        .then((res) => safeResponseJson(res))
        .then((data) => {
          if (data?.success && (!data.classType || data.classType === "class-6")) {
            if (data.accessToken && typeof localStorage !== "undefined") {
              localStorage.setItem("vcc_c6_access_token", data.accessToken);
            }
            setVerifiedPurchase({
              paymentId: "CONFIRMED_ACCOUNT",
              orderId: "VERIFIED",
              accessToken: data.accessToken || token || "",
              customer: {
                name: data.student,
                email: data.email,
              },
              package: {
                title: "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions",
                inauguralPrice: 99,
                papersCount: data.papers?.length || 9,
                papers: data.papers || [],
              },
            });
          } else {
            if (typeof localStorage !== "undefined") {
              localStorage.removeItem("vcc_c6_access_token");
            }
            fetchStatusByEmail(email);
          }
        })
        .catch(() => {
          fetchStatusByEmail(email);
        });
    } else if (email) {
      fetchStatusByEmail(email);
    }
  }, []);

  R.useEffect(() => {
    apiFetch("/api/auth/config")
      .then((res) => safeResponseJson(res))
      .then((data) => {
        const envKeyId =
          (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_RAZORPAY_KEY_ID || null;
        setPaymentConfig({
          paymentMode: data.paymentMode || "razorpay",
          supportWhatsApp: data.supportWhatsApp || "+91 8940399717",
          supportWhatsAppUrl: data.supportWhatsAppUrl || "https://wa.me/8940399717",
          price: data.price || 99,
          googleClientId: data.googleClientId || null,
          razorpayKeyId: data.razorpayKeyId || envKeyId,
          razorpayConfigured: Boolean(data.razorpayConfigured || data.razorpayKeyId || envKeyId),
          razorpayDormant: false,
        });
      })
      .catch((err) => console.error("Failed to load auth config:", err));

    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlToken = urlParams ? urlParams.get("token") : null;
    const savedToken =
      urlToken || (typeof localStorage !== "undefined" ? localStorage.getItem("vcc_c6_access_token") : null);
    const savedStudent =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("vcc_student_user") ||
          localStorage.getItem("vcc_c6_student") ||
          localStorage.getItem("vcc_c9_student")
        : null;

    let studentEmail = "";
    if (savedStudent) {
      try {
        const parsed = JSON.parse(savedStudent);
        if (parsed?.email && parsed.email.toLowerCase() !== "cadet.student@gmail.com") {
          studentEmail = parsed.email;
        }
      } catch {
        studentEmail = "";
      }
    }

    if (savedToken || studentEmail) {
      checkStudentStatus(studentEmail, savedToken);
    }
  }, [checkStudentStatus]);

  // Google Sign-In SDK Button
  R.useEffect(() => {
    if (paymentConfig.googleClientId && window.google?.accounts?.id && isModalOpen && !currentUser) {
      try {
        window.google.accounts.id.initialize({
          client_id: paymentConfig.googleClientId,
          callback: handleGoogleAuthCallback,
        });

        const btnContainer = document.getElementById("student-google-btn-c6");
        if (btnContainer) {
          btnContainer.innerHTML = "";
          window.google.accounts.id.renderButton(btnContainer, {
            theme: "filled_blue",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: 320,
          });
        }
      } catch (err) {
        console.error("Google button init error:", err);
      }
    }
  }, [paymentConfig.googleClientId, isModalOpen, currentUser]);

  const ensureRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayCheckout = async (userOverride?: StudentUser) => {
    const activeUser = userOverride || currentUser;
    if (!activeUser) {
      setErrorMessage("Please sign in with your Google Account first to proceed with payment.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const sdkLoaded = await ensureRazorpayScript();
      if (!sdkLoaded || !window.Razorpay) {
        setErrorMessage("Unable to load Razorpay Checkout SDK. Please check your internet connection and try again.");
        setIsLoading(false);
        return;
      }

      const orderPayload = {
        amount: 9900,
        currency: "INR",
        receipt: `c6_${Date.now()}`,
        classType: "class-6",
        email: activeUser.email,
        name: activeUser.name,
      };

      let orderRes = await apiFetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      if (orderRes.status === 404) {
        orderRes = await apiFetch("/api/payment/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        });
      }

      let orderData = await safeResponseJson(orderRes);
      const envKeyId =
        (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_RAZORPAY_KEY_ID ||
        "rzp_test_U0TyApnugcdw0F";

      if (orderRes.status === 404 && (paymentConfig.razorpayKeyId || envKeyId)) {
        orderData = {
          success: true,
          order_id: null,
          direct_checkout: true,
          amount: 9900,
          currency: "INR",
          key_id: paymentConfig.razorpayKeyId || envKeyId,
        };
      } else if (!orderRes.ok || (!orderData?.order_id && !orderData?.direct_checkout)) {
        setErrorMessage(orderData?.message || "Could not create payment order. Please try again.");
        setIsLoading(false);
        return;
      }

      const keyId = orderData.key_id || paymentConfig.razorpayKeyId || envKeyId;

      if (!keyId) {
        setErrorMessage("Razorpay Key ID is missing. Please contact support.");
        setIsLoading(false);
        return;
      }

      const options: Record<string, unknown> = {
        key: keyId,
        amount: orderData.amount || 9900,
        currency: orderData.currency || "INR",
        name: "Vivekanandha Sainik Coaching Center",
        description: "Class 6 AISSEE Super 9 Mock Test Series (9 Papers + Solutions)",
        ...(orderData.order_id ? { order_id: orderData.order_id } : {}),
        prefill: {
          name: activeUser.name,
          email: activeUser.email,
        },
        notes: {
          classType: "class-6",
          studentEmail: activeUser.email,
          studentName: activeUser.name,
        },
        theme: {
          color: "#071328",
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
            setErrorMessage("Payment was cancelled. You can click Pay ₹99 with Razorpay below whenever you're ready.");
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id?: string;
          razorpay_signature?: string;
        }) => {
          setIsLoading(true);
          setErrorMessage(null);
          try {
            const verifyRes = await apiFetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                direct_checkout: !orderData.order_id,
                classType: "class-6",
                email: activeUser.email,
                name: activeUser.name,
                picture: activeUser.picture,
              }),
            });

            const verifyData = await safeResponseJson(verifyRes);
            if (verifyRes.ok && verifyData?.success) {
              if (verifyData.accessToken && typeof localStorage !== "undefined") {
                localStorage.setItem("vcc_c6_access_token", verifyData.accessToken);
              }
              setVerifiedPurchase({
                paymentId: verifyData.paymentId || response.razorpay_payment_id,
                orderId: verifyData.orderId || response.razorpay_order_id,
                accessToken: verifyData.accessToken,
                customer: {
                  name: activeUser.name,
                  email: activeUser.email,
                },
                package: {
                  title: "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions",
                  inauguralPrice: 99,
                  papersCount: verifyData.papers?.length || 9,
                  papers: verifyData.papers || [],
                },
              });
              setIsModalOpen(false);
            } else {
              setErrorMessage(
                verifyData?.message ||
                  "Payment signature verification failed. If your amount was debited, please contact WhatsApp support."
              );
            }
          } catch {
            setErrorMessage("Network error while verifying payment. Please refresh or contact support.");
          } finally {
            setIsLoading(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (err: { error?: { description?: string } }) => {
        setIsLoading(false);
        setErrorMessage(err?.error?.description || "Payment failed. Please try again with another payment method.");
      });
      rzp.open();
    } catch {
      setErrorMessage("Network error while initializing Razorpay Checkout. Please check your connection.");
      setIsLoading(false);
    }
  };

  const handleGoogleAuthCallback = async (response: { credential: string }) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential, classType: "class-6" }),
      });

      const data = await safeResponseJson(res);
      if (res.ok && data?.success) {
        await processLoggedInStudent(data);
      } else {
        setErrorMessage(data?.message || "Failed to authenticate with Google. Please try again.");
        setIsLoading(false);
      }
    } catch {
      setErrorMessage("Network error during Google Sign-In.");
      setIsLoading(false);
    }
  };

  const handleManualStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = loginNameInput.trim();
    const trimmedEmail = loginEmailInput.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@") || trimmedEmail === "cadet.student@gmail.com") {
      setErrorMessage("Please enter your valid Google email ID (e.g. yourname@gmail.com).");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfile: {
            email: trimmedEmail,
            name: trimmedName,
          },
          classType: "class-6",
        }),
      });

      const data = await safeResponseJson(res);
      if (res.ok && data?.success) {
        await processLoggedInStudent(data);
      } else {
        setErrorMessage(data?.message || "Failed to sign in.");
        setIsLoading(false);
      }
    } catch {
      setErrorMessage("Network error during sign-in.");
      setIsLoading(false);
    }
  };

  const processLoggedInStudent = async (data: {
    student: StudentUser;
    hasPurchased: boolean;
    purchase?: {
      paymentId: string;
      orderId: string;
      accessToken: string;
    };
    accessRequest?: AccessRequestRecord;
  }) => {
    setCurrentUser(data.student);
    localStorage.setItem("vcc_student_user", JSON.stringify(data.student));
    localStorage.setItem("vcc_c6_student", JSON.stringify(data.student));
    localStorage.setItem("vcc_c9_student", JSON.stringify(data.student));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("vcc-auth-changed"));
    }

    if (data.hasPurchased && data.purchase) {
      localStorage.setItem("vcc_c6_access_token", data.purchase.accessToken);
      try {
        const res = await apiFetch(`/api/access-portal?token=${encodeURIComponent(data.purchase.accessToken)}&classType=class-6`);
        const portalData = await safeResponseJson(res);
        if (portalData?.success) {
          setVerifiedPurchase({
            paymentId: data.purchase.paymentId,
            orderId: data.purchase.orderId,
            accessToken: data.purchase.accessToken,
            customer: {
              name: data.student.name,
              email: data.student.email,
            },
            package: {
              title: "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions",
              inauguralPrice: 99,
              papersCount: portalData.papers?.length || 9,
              papers: portalData.papers || [],
            },
          });
          setIsModalOpen(false);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      if (data.accessRequest) {
        setLatestRequest(data.accessRequest);
      }
      await handleRazorpayCheckout(data.student);
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setVerifiedPurchase(null);
    setLatestRequest(null);
    localStorage.removeItem("vcc_student_user");
    localStorage.removeItem("vcc_c6_student");
    localStorage.removeItem("vcc_c9_student");
    localStorage.removeItem("vcc_c6_access_token");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("vcc-auth-changed"));
    }
  };

  const handleOpenPayNowModal = () => {
    setErrorMessage(null);
    setIsModalOpen(true);
    if (currentUser) {
      handleRazorpayCheckout(currentUser);
    }
  };

  return (
    <div className="my-8">
      {/* 0. FREE SAMPLE FULL-LENGTH MOCK TEST #1 (WITH SOLUTIONS) — LEAD MAGNET FOR SUPER 9 */}
      <section
        className="mb-6 rounded-2xl border-2 shadow-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 65%, #fef3c7 100%)",
          borderColor: "#10b981",
        }}
      >
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider shadow-sm"
                style={{ backgroundColor: "#059669", color: "#ffffff" }}
              >
                🎁 100% Free Sample Mock Paper #1 (With Solutions)
              </span>
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border"
                style={{ backgroundColor: "#ffffff", borderColor: "#a7f3d0", color: "#065f46" }}
              >
                300 Marks &middot; 125 Questions &middot; Instant Download
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-black leading-snug" style={{ color: "#071328" }}>
              Try Before You Buy: Full-Length Class 6 AISSEE Mock Test #1 + Step-by-Step Solutions
            </h3>

            <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#334155" }}>
              Experience the exact standard of our <strong>Super 9 Paid Mock Test Series</strong>! Download this
              complete 125-question full-length paper (Mathematics 50 Qs, Intelligence 25 Qs, English 25 Qs, GK 25 Qs)
              along with the <strong>Master Answer Key &amp; Detailed Step-by-Step Solutions</strong> completely free.
            </p>
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
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
              className="py-2.5 px-4 rounded-xl font-extrabold text-xs text-center border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#071328",
                color: "#071328",
              }}
            >
              <span>👁️ View PDF</span>
            </button>

            <button
              type="button"
              disabled={downloadingId === "c6-free-sample"}
              onClick={() =>
                downloadPdfViaBlob(
                  buildApiUrl("/api/sample/class-6-free-mock?download=1"),
                  "AISSEE_Class_6_Free_Sample_Mock_Paper_With_Solutions.pdf",
                  (loading) => setDownloadingId(loading ? "c6-free-sample" : null)
                )
              }
              className="py-2.5 px-5 rounded-xl font-black text-xs text-center shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: "#059669",
                color: "#ffffff",
              }}
            >
              <span>
                {downloadingId === "c6-free-sample"
                  ? "⏳ Preparing PDF Download..."
                  : "⬇️ Download Complete Paper + Solutions PDF"}
              </span>
            </button>
          </div>
        </div>

        {!verifiedPurchase && (
          <div
            className="px-5 py-2.5 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
            style={{ backgroundColor: "#071328", borderColor: "#0f2547", color: "#e2e8f0" }}
          >
            <span>
              ⭐ <strong style={{ color: "#fbbf24" }}>Want 9 more full-length papers like this?</strong> Unlock the
              complete <strong>Class 6 Super 9 Full-Length Mock Test Series (with Solutions)</strong> for just{" "}
              <strong style={{ color: "#fbbf24" }}>₹99</strong>!
            </span>
            <button
              type="button"
              onClick={() => handleOpenPayNowModal()}
              className="font-extrabold underline shrink-0 cursor-pointer"
              style={{ color: "#fbbf24" }}
            >
              Unlock Super 9 Series (₹99) &rarr;
            </button>
          </div>
        )}
      </section>

      {/* 1. DIGITAL DELIVERY PORTAL (WHEN ACCESS IS APPROVED & UNLOCKED) */}
      {verifiedPurchase ? (
        <section className="bg-white border-2 border-emerald-500 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8 animate-fade-in">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-gray-100 pb-6 mb-6 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Payment Verified &middot; Super 9 Series Unlocked
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-navy-900">
                Welcome, Cadet {verifiedPurchase.customer.name}!
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Your <strong>Super 9 Full-Length Class 6 AISSEE Mock Papers</strong> (each complete with 125 Questions,
                Master Answer Key, and Step-by-Step Solutions) are ready to view and download below.
              </p>
            </div>
            <div className="text-left md:text-right bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-xs text-gray-500">Verified Cadet Account</div>
              <div className="text-sm font-semibold text-gray-800 font-mono">{verifiedPurchase.customer.email}</div>
              <div className="text-xs text-gray-400 mt-0.5">Ref: {verifiedPurchase.paymentId.substring(0, 16)}</div>
              <button
                onClick={handleSignOut}
                className="mt-2 text-[11px] text-red-600 hover:underline font-semibold block md:inline cursor-pointer"
              >
                Sign Out / Switch Account
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {verifiedPurchase.package.papers.map((paper) => {
              const dlUrl = buildApiUrl(
                `/api/download/${paper.id}?token=${encodeURIComponent(
                  verifiedPurchase.accessToken
                )}&email=${encodeURIComponent(verifiedPurchase.customer.email)}&download=1`
              );
              const dlName = `AISSEE_Class_6_Super9_Mock_Paper_0${paper.paperNumber}_With_Solutions.pdf`;

              return (
                <div
                  key={paper.id}
                  className="border border-gray-200 rounded-xl p-4 bg-slate-50 hover:bg-white hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs font-bold px-2.5 py-0.5 rounded"
                        style={{ backgroundColor: "#071328", color: "#fbbf24" }}
                      >
                        Super 9 &middot; Mock #{paper.paperNumber}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">300 Marks &middot; 2.5 Hrs</span>
                    </div>
                    <h4 className="font-bold text-gray-900 text-sm mb-1.5">{paper.title}</h4>
                    <p className="text-xs text-emerald-700 font-semibold mb-2">
                      ✓ Includes 125 Qs + Answer Key + Step-by-Step Solutions
                    </p>
                    <p className="text-xs text-gray-600 mb-4">
                      Maths (150m) &middot; Intelligence (50m) &middot; English (50m) &middot; GK (50m)
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() =>
                        setActivePdfModal({
                          paperId: paper.id,
                          title: paper.title,
                          downloadUrl: dlUrl,
                          downloadFilename: dlName,
                          token: verifiedPurchase.accessToken,
                          email: verifiedPurchase.customer.email,
                        })
                      }
                      className="w-full text-center py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer"
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
                        downloadPdfViaBlob(dlUrl, dlName, (loading) => setDownloadingId(loading ? paper.id : null))
                      }
                      className="w-full text-center py-2.5 px-3 rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
                      style={{
                        backgroundColor: "#059669",
                        color: "#ffffff",
                      }}
                    >
                      {downloadingId === paper.id
                        ? "⏳ Downloading PDF..."
                        : "⬇️ Download Complete Paper + Solutions PDF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-blue-900">
              <span className="font-bold">Need mentor assistance or doubt clearing?</span> Connect directly with our
              senior Sainik School entrance mentors on WhatsApp.
            </div>
            <a
              href={`https://wa.me/8940399717?text=${encodeURIComponent(
                `Hello VCC Team, I have access to Class 6 AISSEE 9-Mock Papers. I am Cadet ${verifiedPurchase.customer.name} (${verifiedPurchase.customer.email}).`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-colors"
            >
              💬 WhatsApp Support (+91 8940399717)
            </a>
          </div>
        </section>
      ) : (
        /* 2. COMPACT PROMOTIONAL SHOWCASE CARD WITH RAZORPAY CHECKOUT */
        <div className="space-y-5">
          {latestRequest && latestRequest.status === "pending" && (
            <div
              className="rounded-2xl p-4 sm:p-5 shadow-md border-2 animate-fade-in"
              style={{ backgroundColor: "#fffbeb", borderColor: "#f59e0b", color: "#78350f" }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full uppercase tracking-wider"
                    style={{ backgroundColor: "#fde68a", color: "#78350f" }}
                  >
                    ⏳ Access Request Submitted &middot; Verification in Progress
                  </div>
                  <h3 className="text-base font-extrabold" style={{ color: "#451a03" }}>
                    Payment verification pending for Cadet {latestRequest.studentName}
                  </h3>
                  <p className="text-xs leading-relaxed max-w-2xl" style={{ color: "#92400e" }}>
                    Your previous access request (UTR: <span className="font-mono font-bold">{latestRequest.utr}</span>)
                    is pending review, or you can unlock instantly using Razorpay Standard Checkout below.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => checkStudentStatus(latestRequest.studentEmail)}
                    className="py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer"
                    style={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#1e293b" }}
                  >
                    🔄 Refresh Status
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SINGLE UNIFIED SHOWCASE CARD WITH ADEQUATELY SIZED POSTER + PAY NOW CTA */}
          <section
            className="relative overflow-hidden rounded-2xl shadow-xl border-2"
            style={{
              backgroundColor: "#071328",
              borderColor: "#f59e0b",
              color: "#ffffff",
            }}
          >
            <div className="p-5 sm:p-7 flex flex-col md:flex-row items-center gap-6 lg:gap-8">
              {/* Left: Adequately Sized Promotional Poster */}
              <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col items-center">
                <div
                  onClick={() => handleOpenPayNowModal()}
                  className="bg-white p-2 rounded-xl shadow-lg border cursor-pointer hover:scale-[1.02] transition-transform"
                  style={{ borderColor: "#f59e0b" }}
                  title="Click to Pay ₹99 Securely via Razorpay & Unlock 9 Mock Papers"
                >
                  <img
                    src="/lovable-uploads/class6-mock-tests-poster.png"
                    alt="Class 6 AISSEE 9-Mock Test Series & Solutions - ₹99 Offer"
                    className="w-full max-w-[260px] max-h-[340px] object-contain rounded-lg mx-auto"
                  />
                </div>
              </div>

              {/* Right: Package Information & Pay Now Action */}
              <div className="flex-1 space-y-4 text-left">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="inline-flex items-center text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border"
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.18)",
                      borderColor: "#f59e0b",
                      color: "#fbbf24",
                    }}
                  >
                    🔥 Inaugural Offer &middot; ₹99 Only
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
                    Class 6 AISSEE (2026–2027) Exam Pattern
                  </span>
                </div>

                <h2
                  className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-snug"
                  style={{ color: "#ffffff" }}
                >
                  Super 9 Full-Length Mock Test Papers{" "}
                  <span style={{ color: "#f59e0b" }}>With Step-by-Step Solutions</span>
                </h2>

                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
                  Prescribed &amp; recommended by All India State Toppers and senior Sainik School entrance mentors of
                  Vivekanandha Coaching Center. Matches the official 300-mark NTA pattern (Maths 150m, Intelligence 50m,
                  English 50m, General Knowledge 50m) with complete step-by-step solutions.
                </p>

                {/* Compact Feature Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div
                    className="rounded-xl p-2.5 border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.07)",
                      borderColor: "rgba(255, 255, 255, 0.16)",
                    }}
                  >
                    <div className="font-black text-base" style={{ color: "#fbbf24" }}>
                      9 Tests
                    </div>
                    <div className="text-[11px]" style={{ color: "#e2e8f0" }}>
                      Full-Length Papers
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5 border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.07)",
                      borderColor: "rgba(255, 255, 255, 0.16)",
                    }}
                  >
                    <div className="font-black text-base" style={{ color: "#fbbf24" }}>
                      300 Marks
                    </div>
                    <div className="text-[11px]" style={{ color: "#e2e8f0" }}>
                      NTA Pattern
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5 border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.07)",
                      borderColor: "rgba(255, 255, 255, 0.16)",
                    }}
                  >
                    <div className="font-black text-base" style={{ color: "#fbbf24" }}>
                      100% Solved
                    </div>
                    <div className="text-[11px]" style={{ color: "#e2e8f0" }}>
                      Step-by-Step Keys
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5 border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.07)",
                      borderColor: "rgba(255, 255, 255, 0.16)",
                    }}
                  >
                    <div className="font-black text-base" style={{ color: "#fbbf24" }}>
                      Instant
                    </div>
                    <div className="text-[11px]" style={{ color: "#e2e8f0" }}>
                      Razorpay Unlock
                    </div>
                  </div>
                </div>

                {/* Price + Pay Now CTA Bar */}
                <div
                  className="pt-4 mt-2 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4"
                  style={{ borderColor: "rgba(255, 255, 255, 0.15)" }}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl sm:text-4xl font-black" style={{ color: "#ffffff" }}>
                      ₹99
                    </span>
                    <span className="text-sm line-through font-semibold" style={{ color: "#94a3b8" }}>
                      ₹499
                    </span>
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "#dcfce7", color: "#15803d" }}
                    >
                      Save 80%
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <button
                      onClick={() => handleOpenPayNowModal()}
                      disabled={isLoading}
                      className="py-3 px-7 rounded-xl font-black text-sm shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: "#f59e0b",
                        color: "#071328",
                      }}
                    >
                      <span>{isLoading ? "⏳ Opening Razorpay..." : "⚡ Pay Now — ₹99"}</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Returning Student Footer Bar */}
            <div
              className="border-t py-2.5 px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
              style={{
                backgroundColor: "#040b17",
                borderColor: "rgba(255, 255, 255, 0.1)",
                color: "#94a3b8",
              }}
            >
              <div>
                {currentUser ? (
                  <span>
                    Signed in as <strong style={{ color: "#ffffff" }}>{currentUser.name}</strong> ({currentUser.email})
                    &middot;{" "}
                    <a
                      href="/student"
                      className="underline font-bold"
                      style={{ color: "#38bdf8" }}
                    >
                      My Dashboard
                    </a>
                    {" "}&middot;{" "}
                    <button
                      onClick={handleSignOut}
                      className="underline cursor-pointer"
                      style={{ color: "#f87171" }}
                    >
                      Sign Out
                    </button>
                  </span>
                ) : (
                  <span>
                    Already paid?{" "}
                    <button
                      onClick={() => handleOpenPayNowModal()}
                      className="underline font-bold cursor-pointer"
                      style={{ color: "#fbbf24" }}
                    >
                      Sign in with Google
                    </button>{" "}
                    or visit{" "}
                    <a href="/student" className="underline font-bold" style={{ color: "#38bdf8" }}>
                      Student Dashboard
                    </a>
                  </span>
                )}
              </div>
              <a
                href={`https://wa.me/8940399717?text=${encodeURIComponent(
                  "Hello VCC Team, I have a query regarding the Class 6 AISSEE 9-Mock Test Series (₹99)."
                )}`}
                target="_blank"
                rel="noreferrer"
                className="font-bold hover:underline"
                style={{ color: "#f59e0b" }}
              >
                💬 WhatsApp Support: +91 8940399717
              </a>
            </div>
          </section>
        </div>
      )}

      {/* 3. RAZORPAY CHECKOUT & GOOGLE SIGN-IN MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-7 my-8 border-2"
            style={{ backgroundColor: "#ffffff", borderColor: "#f59e0b", color: "#0f172a" }}
          >
            <button
              onClick={() => !isLoading && setIsModalOpen(false)}
              className="absolute top-3.5 right-4 p-1 rounded-full text-xl font-bold cursor-pointer"
              style={{ color: "#64748b" }}
              disabled={isLoading}
            >
              &times;
            </button>

            <div className="text-center mb-4">
              <span
                className="inline-block text-[11px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider mb-1.5"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                Class 6 AISSEE &middot; ₹99 Offer
              </span>
              <h3 className="text-xl font-black" style={{ color: "#0f172a" }}>
                {!currentUser ? "Sign In with Google to Continue" : "Pay ₹99 via Razorpay Checkout"}
              </h3>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div
                className="mb-4 p-3 rounded-xl border text-xs leading-relaxed font-medium"
                style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}
              >
                {errorMessage}
              </div>
            )}

            {!currentUser ? (
              /* STATE 1: GOOGLE SIGN-IN FIRST */
              <div className="space-y-4">
                <div
                  className="rounded-xl p-3.5 border text-xs space-y-1"
                  style={{ backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1e3a8a" }}
                >
                  <div className="font-bold">🔒 Step 1: Sign in with your Google Account</div>
                  <p style={{ color: "#334155" }}>
                    Your 9 mock papers and step-by-step solutions will be unlocked immediately after payment and bound
                    to your verified Google email.
                  </p>
                </div>

                {paymentConfig.googleClientId && (
                  <div className="flex flex-col items-center justify-center pt-1">
                    <div id="student-google-btn-c6" className="min-h-[44px]"></div>
                  </div>
                )}

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t" style={{ borderColor: "#e2e8f0" }}></div>
                  <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                    Or Enter Your Google Account Details
                  </span>
                  <div className="flex-grow border-t" style={{ borderColor: "#e2e8f0" }}></div>
                </div>

                <form onSubmit={handleManualStudentLogin} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: "#334155" }}>
                      Student Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={loginNameInput}
                      onChange={(e) => setLoginNameInput(e.target.value)}
                      placeholder="Enter Student Full Name"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium focus:outline-none"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: "#334155" }}>
                      Google Email ID (Gmail) *
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmailInput}
                      onChange={(e) => setLoginEmailInput(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium focus:outline-none"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl font-bold text-xs shadow transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    style={{ backgroundColor: "#071328", color: "#ffffff" }}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                    </svg>
                    <span>{isLoading ? "Proceeding to Razorpay..." : "Continue & Pay ₹99"}</span>
                  </button>
                </form>
              </div>
            ) : (
              /* STATE 2: SIGNED IN — LAUNCH RAZORPAY STANDARD CHECKOUT */
              <div className="space-y-4">
                <div
                  className="rounded-xl p-2.5 border flex items-center justify-between text-xs"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                >
                  <div className="truncate">
                    <span className="text-[10px] block" style={{ color: "#64748b" }}>
                      Cadet Google Account
                    </span>
                    <span className="font-bold" style={{ color: "#0f172a" }}>
                      {currentUser.name}
                    </span>{" "}
                    <span className="font-mono text-[11px]" style={{ color: "#475569" }}>
                      ({currentUser.email})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-[11px] font-semibold hover:underline shrink-0 ml-2 cursor-pointer"
                    style={{ color: "#dc2626" }}
                  >
                    Switch
                  </button>
                </div>

                <div
                  className="p-4 rounded-xl border-2 space-y-2.5"
                  style={{ backgroundColor: "#f8fafc", borderColor: "#cbd5e1" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "#071328" }}>
                      Class 6 Super 9 Mock Series
                    </span>
                    <span className="text-lg font-black" style={{ color: "#15803d" }}>
                      ₹99
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "#334155" }}>
                    Pay securely via <strong>Razorpay Standard Checkout</strong> using UPI (Google Pay, PhonePe, Paytm),
                    Debit/Credit Cards, or NetBanking. Your 9 full-length Mock Test PDFs &amp; Solutions unlock{" "}
                    <strong>instantly</strong> after payment verification.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleRazorpayCheckout(currentUser)}
                  className="w-full py-3.5 px-4 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  <span>
                    {isLoading ? "⏳ Opening Razorpay Checkout..." : "💳 Pay ₹99 Securely with Razorpay"}
                  </span>
                  <span>&rarr;</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. IN-APP HIGH-RESOLUTION PDF VIEWER MODAL (NO NEW-TAB 403 ERRORS) */}
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
        onUnlockSuper9={!verifiedPurchase ? () => handleOpenPayNowModal() : undefined}
      />
    </div>
  );
};

export default Class6MockPaymentSection;
