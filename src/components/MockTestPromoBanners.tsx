import React from "react";
import { PdfViewerModal, downloadPdfViaBlob } from "./PdfViewerModal";

export interface PromoProps {
  React?: typeof React;
  variant?: "both" | "class-6" | "class-9";
}

export const HomeMockTestShowcase: React.FC<PromoProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;
  const [activeSample, setActiveSample] = R.useState<{
    paperId: string;
    title: string;
    downloadUrl: string;
    downloadFilename: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = R.useState<string | null>(null);

  return (
    <section
      className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b"
      style={{
        background: "linear-gradient(180deg, #071328 0%, #0f2547 100%)",
        borderColor: "rgba(245, 158, 11, 0.3)",
        color: "#ffffff",
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div
            className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full mb-3 border"
            style={{
              backgroundColor: "rgba(245, 158, 11, 0.16)",
              borderColor: "#f59e0b",
              color: "#fbbf24",
            }}
          >
            <span>🔥 AISSEE 2026–27 Special Launch Offer &middot; ₹99 Only</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight" style={{ color: "#ffffff" }}>
            Super 9 Full-Length Mock Test Series{" "}
            <span style={{ color: "#fbbf24" }}>(Class 6 &amp; Class 9)</span>
          </h2>
          <p className="text-sm sm:text-base mt-3 leading-relaxed" style={{ color: "#cbd5e1" }}>
            Try <strong>1 Complete Full-Length Mock Paper + Step-by-Step Solutions 100% Free</strong>, and unlock{" "}
            <strong>9 Premium Full-Length Mock Papers with Detailed Solutions</strong> for just{" "}
            <strong style={{ color: "#fbbf24" }}>₹99</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* CLASS 6 SUPER 9 CARD */}
          <div
            className="rounded-2xl border-2 p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-center transition-all"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(56, 189, 248, 0.45)",
            }}
          >
            <a
              href="/blog/class-6-aissee-pyqs"
              className="w-44 sm:w-48 shrink-0 bg-white p-2 rounded-xl shadow-lg border hover:scale-[1.02] transition-transform block"
              style={{ borderColor: "#38bdf8" }}
            >
              <img
                src="/lovable-uploads/class6-mock-tests-poster.png"
                alt="Class 6 AISSEE Super 9 Mock Test Series - ₹99"
                className="w-full h-60 object-contain rounded-lg mx-auto"
              />
            </a>

            <div className="flex-1 space-y-3 text-left">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span style={{ color: "#38bdf8" }}>CLASS 6 AISSEE</span>
                <span style={{ color: "#64748b" }}>&middot;</span>
                <span style={{ color: "#fbbf24" }}>300 Marks &middot; 125 Qs</span>
              </div>

              <h3 className="text-xl font-black leading-snug" style={{ color: "#ffffff" }}>
                Class 6 Super 9 Full-Length Mock Papers + Solutions
              </h3>

              <p className="text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
                Includes <strong>1 Free Sample Mock Paper</strong> + <strong>9 Paid Super Mock Papers</strong> covering
                Maths (150m), Intelligence (50m), English (50m), and GK (50m) with step-by-step solutions.
              </p>

              <div className="flex flex-wrap items-baseline gap-2 pt-1">
                <span className="text-2xl font-black" style={{ color: "#fbbf24" }}>
                  ₹99
                </span>
                <span className="text-xs line-through" style={{ color: "#94a3b8" }}>
                  ₹499
                </span>
                <span className="text-xs font-bold" style={{ color: "#34d399" }}>
                  + 1st Mock Paper FREE
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveSample({
                      paperId: "c6-free-sample",
                      title: "AISSEE Class 6 Free Sample Mock Paper #1 (With Solutions)",
                      downloadUrl: "/api/sample/class-6-free-mock?download=1",
                      downloadFilename: "AISSEE_Class_6_Free_Sample_Mock_Paper_With_Solutions.pdf",
                    })
                  }
                  className="py-2.5 px-3.5 rounded-xl font-bold text-xs text-center border cursor-pointer transition-colors"
                  style={{
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderColor: "#10b981",
                    color: "#6ee7b7",
                  }}
                >
                  🎁 Try Free Sample PDF
                </button>
                <a
                  href="/blog/class-6-aissee-pyqs"
                  className="py-2.5 px-4 rounded-xl font-black text-xs text-center shadow-md transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  ⚡ Get Class 6 Super 9 (₹99) &rarr;
                </a>
              </div>
            </div>
          </div>

          {/* CLASS 9 SUPER 9 CARD */}
          <div
            className="rounded-2xl border-2 p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-center transition-all"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderColor: "rgba(245, 158, 11, 0.55)",
            }}
          >
            <a
              href="/blog/class-9-aissee-mock-tests-pyqs"
              className="w-44 sm:w-48 shrink-0 bg-white p-2 rounded-xl shadow-lg border hover:scale-[1.02] transition-transform block"
              style={{ borderColor: "#f59e0b" }}
            >
              <img
                src="/lovable-uploads/class9-mock-tests-poster.png"
                alt="Class 9 AISSEE Super 9 Mock Test Series - ₹99"
                className="w-full h-60 object-contain rounded-lg mx-auto"
              />
            </a>

            <div className="flex-1 space-y-3 text-left">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span style={{ color: "#fbbf24" }}>CLASS 9 AISSEE</span>
                <span style={{ color: "#64748b" }}>&middot;</span>
                <span style={{ color: "#38bdf8" }}>400 Marks &middot; 150 Qs</span>
              </div>

              <h3 className="text-xl font-black leading-snug" style={{ color: "#ffffff" }}>
                Class 9 Super 9 Full-Length Mock Papers + Solutions
              </h3>

              <p className="text-xs leading-relaxed" style={{ color: "#cbd5e1" }}>
                Includes <strong>1 Free Sample Mock Paper</strong> + <strong>9 Paid Super Mock Papers</strong> covering
                Maths (200m), Intelligence (50m), Science (50m), English (50m), &amp; SST (50m) with solutions.
              </p>

              <div className="flex flex-wrap items-baseline gap-2 pt-1">
                <span className="text-2xl font-black" style={{ color: "#fbbf24" }}>
                  ₹99
                </span>
                <span className="text-xs line-through" style={{ color: "#94a3b8" }}>
                  ₹499
                </span>
                <span className="text-xs font-bold" style={{ color: "#34d399" }}>
                  + Free Sample Mock Included
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setActiveSample({
                      paperId: "c9-free-sample",
                      title: "AISSEE Class 9 Free Sample Mock Paper (With Answer Key & Solutions)",
                      downloadUrl: "/api/sample/class-9-free-mock?download=1",
                      downloadFilename: "AISSEE_Class_9_Free_Sample_Mock_Paper_With_Solutions.pdf",
                    })
                  }
                  className="py-2.5 px-3.5 rounded-xl font-bold text-xs text-center border cursor-pointer transition-colors"
                  style={{
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderColor: "#10b981",
                    color: "#6ee7b7",
                  }}
                >
                  🎁 Try Free Sample PDF
                </button>
                <a
                  href="/blog/class-9-aissee-mock-tests-pyqs"
                  className="py-2.5 px-4 rounded-xl font-black text-xs text-center shadow-md transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: "#f59e0b", color: "#071328" }}
                >
                  ⚡ Get Class 9 Super 9 (₹99) &rarr;
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PdfViewerModal
        React={R}
        isOpen={Boolean(activeSample)}
        onClose={() => setActiveSample(null)}
        paperId={activeSample?.paperId || ""}
        title={activeSample?.title || ""}
        downloadUrl={activeSample?.downloadUrl || ""}
        downloadFilename={activeSample?.downloadFilename || ""}
        isFreeSample={true}
      />
    </section>
  );
};

export const CourseMockTestCallout: React.FC<PromoProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;
  const variant = props.variant || "both";
  const [activeSample, setActiveSample] = R.useState<{
    paperId: string;
    title: string;
    downloadUrl: string;
    downloadFilename: string;
  } | null>(null);

  if (variant === "both") {
    return <HomeMockTestShowcase React={R} />;
  }

  const isClass6 = variant === "class-6";
  const poster = isClass6
    ? "/lovable-uploads/class6-mock-tests-poster.png"
    : "/lovable-uploads/class9-mock-tests-poster.png";
  const targetHref = isClass6 ? "/blog/class-6-aissee-pyqs" : "/blog/class-9-aissee-mock-tests-pyqs";
  const samplePaperId = isClass6 ? "c6-free-sample" : "c9-free-sample";
  const sampleDownloadUrl = isClass6
    ? "/api/sample/class-6-free-mock?download=1"
    : "/api/sample/class-9-free-mock?download=1";
  const sampleDownloadName = isClass6
    ? "AISSEE_Class_6_Free_Sample_Mock_Paper_With_Solutions.pdf"
    : "AISSEE_Class_9_Free_Sample_Mock_Paper_With_Solutions.pdf";

  return (
    <section
      className="rounded-2xl border-2 p-5 sm:p-7 shadow-xl my-8"
      style={{
        backgroundColor: "#071328",
        borderColor: "#f59e0b",
        color: "#ffffff",
      }}
    >
      <div className="flex flex-col md:flex-row items-center gap-6">
        <a
          href={targetHref}
          className="w-44 sm:w-52 shrink-0 bg-white p-2 rounded-xl shadow-lg border hover:scale-[1.02] transition-transform block"
          style={{ borderColor: "#f59e0b" }}
        >
          <img
            src={poster}
            alt={`${isClass6 ? "Class 6" : "Class 9"} Super 9 Mock Test Series - ₹99`}
            className="w-full max-h-64 object-contain rounded-lg mx-auto"
          />
        </a>

        <div className="flex-1 space-y-3 text-left">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wider">
            <span style={{ color: "#fbbf24" }}>
              🔥 {isClass6 ? "Class 6" : "Class 9"} AISSEE Super 9 Test Series &middot; ₹99 Offer
            </span>
            <span style={{ color: "#64748b" }}>&middot;</span>
            <span style={{ color: "#34d399" }}>1 Free Full-Length Sample Mock Included</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black leading-snug" style={{ color: "#ffffff" }}>
            Practice with Our {isClass6 ? "Class 6 (300 Marks)" : "Class 9 (400 Marks)"} Super 9 Full-Length Mock Papers
            &amp; Step-by-Step Solutions
          </h3>

          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
            Download the <strong>Free Sample Full-Length Mock Paper (with Master Answer Key &amp; Solutions)</strong>{" "}
            instantly, or unlock all <strong>9 Full-Length Super Mock Papers</strong> designed by Vivekanandha Coaching
            Center faculty for just <strong style={{ color: "#fbbf24" }}>₹99</strong>.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setActiveSample({
                  paperId: samplePaperId,
                  title: `AISSEE ${isClass6 ? "Class 6" : "Class 9"} Free Sample Mock Paper (With Solutions)`,
                  downloadUrl: sampleDownloadUrl,
                  downloadFilename: sampleDownloadName,
                })
              }
              className="py-2.5 px-4 rounded-xl font-bold text-xs text-center border cursor-pointer"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.16)",
                borderColor: "#10b981",
                color: "#6ee7b7",
              }}
            >
              👁️ View Free Sample Paper + Solutions
            </button>

            <a
              href={targetHref}
              className="py-2.5 px-5 rounded-xl font-black text-xs text-center shadow-lg"
              style={{ backgroundColor: "#f59e0b", color: "#071328" }}
            >
              ⚡ Unlock {isClass6 ? "Class 6" : "Class 9"} Super 9 Series (₹99) &rarr;
            </a>
          </div>
        </div>
      </div>

      <PdfViewerModal
        React={R}
        isOpen={Boolean(activeSample)}
        onClose={() => setActiveSample(null)}
        paperId={activeSample?.paperId || ""}
        title={activeSample?.title || ""}
        downloadUrl={activeSample?.downloadUrl || ""}
        downloadFilename={activeSample?.downloadFilename || ""}
        isFreeSample={true}
      />
    </section>
  );
};

export const StickyMockTestBar: React.FC<PromoProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;
  const [dismissed, setDismissed] = R.useState(false);

  if (dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t shadow-2xl px-3 py-2.5 sm:px-6"
      style={{
        backgroundColor: "rgba(7, 19, 40, 0.97)",
        borderColor: "#f59e0b",
        color: "#ffffff",
      }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 pr-14 sm:pr-20">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm text-center sm:text-left">
          <span
            className="hidden md:inline-block font-extrabold uppercase text-[11px] px-2.5 py-0.5 rounded"
            style={{ backgroundColor: "#f59e0b", color: "#071328" }}
          >
            ₹99 Offer
          </span>
          <span className="font-semibold" style={{ color: "#f8fafc" }}>
            🎁 <strong>1 Free Sample Mock + Solutions</strong> &amp; <strong>Super 9 Mock Test Series (₹99)</strong> for
            AISSEE Class 6 &amp; Class 9!
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/blog/class-6-aissee-pyqs"
            className="py-1.5 px-3 rounded-lg font-extrabold text-xs transition-colors"
            style={{ backgroundColor: "#38bdf8", color: "#071328" }}
          >
            Class 6 Mocks (₹99)
          </a>
          <a
            href="/blog/class-9-aissee-mock-tests-pyqs"
            className="py-1.5 px-3 rounded-lg font-extrabold text-xs transition-colors"
            style={{ backgroundColor: "#f59e0b", color: "#071328" }}
          >
            Class 9 Mocks (₹99)
          </a>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss promotional banner"
            className="p-1 rounded hover:bg-white/10 text-xs font-bold cursor-pointer ml-1"
            style={{ color: "#94a3b8" }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
