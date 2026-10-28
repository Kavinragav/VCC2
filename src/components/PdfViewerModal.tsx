import React from "react";
import { buildApiUrl } from "../config/api";

export async function downloadPdfViaBlob(
  url: string,
  filename: string,
  onStatusChange?: (loading: boolean, error?: string | null) => void
) {
  try {
    if (onStatusChange) onStatusChange(true, null);
    const res = await fetch(buildApiUrl(url), {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `Download failed (${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename || "AISSEE_Class_6_Mock_Paper_With_Solutions.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 10000);

    if (onStatusChange) onStatusChange(false, null);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to download PDF.";
    console.error("[PDF Download Error]:", err);
    if (onStatusChange) onStatusChange(false, message);
  }
}

export interface PdfViewerModalProps {
  React?: typeof React;
  isOpen: boolean;
  onClose: () => void;
  paperId: string;
  title: string;
  subtitle?: string;
  token?: string;
  email?: string;
  downloadUrl: string;
  downloadFilename: string;
  isFreeSample?: boolean;
  onUnlockSuper9?: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = (props) => {
  const R = props?.React || (typeof window !== "undefined" && window.React) || React;

  const {
    isOpen,
    onClose,
    paperId,
    title,
    subtitle,
    token,
    email,
    downloadUrl,
    downloadFilename,
    isFreeSample,
    onUnlockSuper9,
  } = props;

  const [pages, setPages] = R.useState<string[]>([]);
  const [isLoadingPages, setIsLoadingPages] = R.useState(false);
  const [loadError, setLoadError] = R.useState<string | null>(null);
  const [zoom, setZoom] = R.useState<number>(100);
  const [isDownloading, setIsDownloading] = R.useState(false);

  R.useEffect(() => {
    if (!isOpen || !paperId) return;

    setIsLoadingPages(true);
    setLoadError(null);
    setPages([]);

    const query = new URLSearchParams();
    if (token) query.set("token", token);
    if (email) query.set("email", email);

    fetch(buildApiUrl(`/api/pdf-pages/${encodeURIComponent(paperId)}?${query.toString()}`), {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const msg = await res.text().catch(() => "Failed to load paper pages.");
          throw new Error(msg || `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.success && Array.isArray(data.pages)) {
          setPages(data.pages.map((pagePath: string) => buildApiUrl(pagePath)));
        } else {
          setLoadError(data.message || "Could not load paper preview.");
        }
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Network error loading paper preview.");
      })
      .finally(() => {
        setIsLoadingPages(false);
      });
  }, [isOpen, paperId, token, email]);

  if (!isOpen) return null;

  const handleDownloadClick = () => {
    downloadPdfViaBlob(downloadUrl, downloadFilename, (loading) => {
      setIsDownloading(loading);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(7, 19, 40, 0.92)", backdropFilter: "blur(4px)" }}
    >
      {/* Top Toolbar */}
      <div
        className="px-4 sm:px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg"
        style={{ backgroundColor: "#071328", borderColor: "rgba(255, 255, 255, 0.15)", color: "#ffffff" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase shrink-0"
            style={{
              backgroundColor: isFreeSample ? "#059669" : "#f59e0b",
              color: isFreeSample ? "#ffffff" : "#071328",
            }}
          >
            {isFreeSample ? "🎁 Free Sample" : "Super 9 PDF"}
          </span>
          <div className="truncate">
            <h3 className="text-sm sm:text-base font-black truncate" style={{ color: "#ffffff" }}>
              {title}
            </h3>
            <p className="text-[11px] truncate" style={{ color: "#94a3b8" }}>
              {subtitle ||
                (pages.length > 0
                  ? `${pages.length} Pages · Complete 125 Questions + Master Answer Key + Step-by-Step Solutions`
                  : "Complete Question Paper + Answer Key + Step-by-Step Solutions")}
            </p>
          </div>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div
            className="hidden sm:flex items-center rounded-xl border px-1.5 py-1 gap-1"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.18)" }}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(60, z - 15))}
              className="px-2 py-0.5 rounded text-xs font-black hover:bg-white/10 cursor-pointer"
              style={{ color: "#ffffff" }}
              title="Zoom Out"
            >
              &minus;
            </button>
            <span className="text-xs font-mono font-bold px-1.5" style={{ color: "#fbbf24" }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(160, z + 15))}
              className="px-2 py-0.5 rounded text-xs font-black hover:bg-white/10 cursor-pointer"
              style={{ color: "#ffffff" }}
              title="Zoom In"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadClick}
            disabled={isDownloading}
            className="py-2 px-3.5 sm:px-4 rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            style={{ backgroundColor: "#059669", color: "#ffffff" }}
          >
            <span>⬇️</span>
            <span>{isDownloading ? "Downloading PDF..." : "Download PDF"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3 rounded-xl font-bold text-xs border transition-colors cursor-pointer"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderColor: "rgba(255, 255, 255, 0.25)",
              color: "#ffffff",
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Main Scrollable Document Pages Container */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 flex flex-col items-center">
        {isLoadingPages ? (
          <div className="my-auto text-center p-8 rounded-2xl max-w-md" style={{ backgroundColor: "#0f2547", color: "#ffffff" }}>
            <div
              className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: "#f59e0b", borderTopColor: "transparent" }}
            />
            <div className="text-base font-black">Loading Mock Paper &amp; Step-by-Step Solutions...</div>
            <p className="text-xs mt-1" style={{ color: "#cbd5e1" }}>
              Preparing high-resolution exam pages for instant viewing.
            </p>
          </div>
        ) : loadError ? (
          <div
            className="my-auto text-center p-6 sm:p-8 rounded-2xl max-w-lg border-2 space-y-4"
            style={{ backgroundColor: "#ffffff", borderColor: "#f87171", color: "#0f172a" }}
          >
            <div className="text-lg font-black" style={{ color: "#b91c1c" }}>
              Unable to preview paper pages
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#475569" }}>
              {loadError}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownloadClick}
                className="py-2.5 px-5 rounded-xl font-black text-xs cursor-pointer"
                style={{ backgroundColor: "#059669", color: "#ffffff" }}
              >
                ⬇️ Download PDF Directly
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl font-bold text-xs border cursor-pointer"
                style={{ borderColor: "#cbd5e1", color: "#334155" }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          pages.map((pageUrl, idx) => (
            <div
              key={pageUrl}
              className="bg-white rounded-xl shadow-2xl overflow-hidden border transition-all"
              style={{
                width: `${Math.min(100, zoom)}%`,
                maxWidth: `${Math.round((900 * zoom) / 100)}px`,
                borderColor: "#cbd5e1",
              }}
            >
              <div
                className="px-4 py-1.5 border-b flex items-center justify-between text-[11px] font-bold"
                style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0", color: "#475569" }}
              >
                <span>{title}</span>
                <span>
                  Page {idx + 1} of {pages.length}
                </span>
              </div>
              <img
                src={pageUrl}
                alt={`${title} - Page ${idx + 1}`}
                loading={idx < 3 ? "eager" : "lazy"}
                className="w-full h-auto block select-none"
              />
            </div>
          ))
        )}
      </div>

      {/* Bottom Promotional Bar when viewing Free Sample */}
      {isFreeSample && onUnlockSuper9 && (
        <div
          className="px-4 sm:px-6 py-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0"
          style={{ backgroundColor: "#040b17", borderColor: "#f59e0b", color: "#ffffff" }}
        >
          <div className="text-xs sm:text-sm text-center sm:text-left">
            🔥 <strong style={{ color: "#fbbf24" }}>Liked this Free Sample Paper &amp; Step-by-Step Solutions?</strong>{" "}
            Get the remaining <strong>9 Full-Length Class 6 Super 9 Mock Papers</strong> for just{" "}
            <strong style={{ color: "#fbbf24" }}>₹99</strong>!
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onUnlockSuper9();
            }}
            className="py-2 px-5 rounded-xl font-black text-xs shrink-0 shadow-lg cursor-pointer"
            style={{ backgroundColor: "#f59e0b", color: "#071328" }}
          >
            ⚡ Unlock Super 9 Papers (₹99) &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfViewerModal;
