import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "5mb" }));

// ==========================================
// Serve /lovable-uploads/:filename locally if present,
// otherwise redirect to official production asset host
// ==========================================
app.get("/lovable-uploads/:filename", (req: Request, res: Response, next: NextFunction) => {
  const filename = req.params.filename;
  const publicPath = path.join(__dirname, "public", "lovable-uploads", filename);
  const distPath = path.join(__dirname, "dist", "lovable-uploads", filename);

  if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  }
  if (fs.existsSync(distPath)) {
    return res.sendFile(distPath);
  }

  return res.redirect(302, `https://www.vivekanandhasainik.in/lovable-uploads/${encodeURIComponent(filename)}`);
});

// ==========================================
// Configuration & Persistent Storage Setup
// ==========================================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PURCHASES_FILE = path.join(DATA_DIR, "purchases.json");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const ACCESS_REQUESTS_FILE = path.join(DATA_DIR, "access_requests.json");

const SESSION_SECRET = process.env.SESSION_SECRET || "vcc-aissee-secret-key-2026-vivekanandha";
const ADMIN_USERNAME = "VccAdmin";
const ADMIN_PASSWORD = "Vcc@1997";

const UPI_ID = process.env.UPI_ID || "kavinakshara6240@okicici";
const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || "Kavin Ragav";
const UPI_QR_IMAGE = process.env.UPI_QR_IMAGE_PATH || "/lovable-uploads/upi-payment-qr.jpg";
const SUPPORT_WHATSAPP = "+91 8940399717";
const SUPPORT_WHATSAPP_URL = "https://wa.me/8940399717";
const PAYMENT_MODE = process.env.PAYMENT_MODE || "manual_upi";

// ==========================================
// Data Models
// ==========================================
interface PurchaseRecord {
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
  classType: "class-6" | "class-9";
  packageTitle: string;
}

interface StudentProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  totalLogins: number;
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
  decidedAt?: string;
  decidedBy?: string;
  notes?: string;
  reviewNotes?: string;
  isDuplicateUtr?: boolean;
}

// Load / Save helpers
function loadJsonMap<T>(filePath: string): Map<string, T> {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Map<string, T>(arr);
      }
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return new Map<string, T>();
}

function saveJsonMap<T>(filePath: string, map: Map<string, T>) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(Array.from(map.entries()), null, 2), "utf8");
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

const purchasesMap = loadJsonMap<PurchaseRecord>(PURCHASES_FILE);
const studentsMap = loadJsonMap<StudentProfile>(STUDENTS_FILE);
const accessRequestsMap = loadJsonMap<AccessRequestRecord>(ACCESS_REQUESTS_FILE);

function savePurchases() {
  saveJsonMap(PURCHASES_FILE, purchasesMap);
}
function saveStudents() {
  saveJsonMap(STUDENTS_FILE, studentsMap);
}
function saveAccessRequests() {
  saveJsonMap(ACCESS_REQUESTS_FILE, accessRequestsMap);
}

// ==========================================
// Mock Test Catalog (Class 6 & Class 9)
// ==========================================
const CLASS_9_MOCK_PAPERS = Array.from({ length: 9 }, (_, i) => ({
  id: `c9-mock-${i + 1}`,
  paperNumber: i + 1,
  title:
    i < 4
      ? `AISSEE Class 9 Super 9 Full-Length Mock Test #${i + 1} (Question Paper + Separate Solutions PDF)`
      : `AISSEE Class 9 Super 9 Full-Length Mock Test #${i + 1} (Complete Paper + Answer Key + Solutions)`,
  totalMarks: 400,
  duration: "3 Hours (180 Mins)",
  sections: [
    "Mathematics (50 Qs · 200 Marks)",
    "Intelligence (25 Qs · 50 Marks)",
    "English (25 Qs · 50 Marks)",
    "General Science (25 Qs · 50 Marks)",
    "Social Studies (25 Qs · 50 Marks)",
  ],
  hasDetailedSolutions: true,
  isCombinedPdf: i >= 4,
  classType: "class-9" as const,
}));

const CLASS_9_PDF_FILES: Record<
  string,
  { filePath: string; fallbackPath: string; pagesDir: string; downloadName: string; title: string }
> = {
  "c9-free-sample": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-free-sample.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_10_1032ea36.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-free-sample"),
    downloadName: "AISSEE_Class_9_Free_Sample_Mock_Paper_With_Solutions.pdf",
    title: "AISSEE Class 9 Free Sample Full-Length Mock Paper (With Master Answer Key & Solutions)",
  },
  "c9-mock-1-question": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-1-question.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "CLASS9-MOCK1_8fe4737a.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-1-question"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_01_Questions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #1 — Question Paper (150 Qs · 400 Marks)",
  },
  "c9-mock-1-solution": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-1-solution.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "class9_aissee_mock1_solutions_v2_bb24b133.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-1-solution"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_01_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #1 — Step-by-Step Solutions & Answer Key",
  },
  "c9-mock-2-question": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-2-question.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "CLASS9-MOCK2_4eab3ac8.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-2-question"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_02_Questions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #2 — Question Paper (150 Qs · 400 Marks)",
  },
  "c9-mock-2-solution": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-2-solution.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "class9_aissee_mock2_solutions_v2_e1639c28.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-2-solution"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_02_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #2 — Step-by-Step Solutions & Answer Key",
  },
  "c9-mock-3-question": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-3-question.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "CLASS9-MOCK3_eca1bf5f.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-3-question"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_03_Questions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #3 — Question Paper (150 Qs · 400 Marks)",
  },
  "c9-mock-3-solution": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-3-solution.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "class9_aissee_mock3_solutions_v2_85574fe8.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-3-solution"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_03_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #3 — Step-by-Step Solutions & Answer Key",
  },
  "c9-mock-4-question": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-4-question.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "CLASS9-MOCK4_1746fd71.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-4-question"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_04_Questions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #4 — Question Paper (150 Qs · 400 Marks)",
  },
  "c9-mock-4-solution": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-4-solution.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "class9_aissee_mock4_solutions_v2_27d56dfa.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-4-solution"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_04_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Mock Test #4 — Step-by-Step Solutions & Answer Key",
  },
  "c9-mock-5": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-5.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_05_9d357811.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-5"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_05_With_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Full-Length Mock Paper #5 (With Answer Key & Solutions)",
  },
  "c9-mock-6": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-6.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_06_3e004e95.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-6"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_06_With_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Full-Length Mock Paper #6 (With Answer Key & Solutions)",
  },
  "c9-mock-7": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-7.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_07_9118ac7c.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-7"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_07_With_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Full-Length Mock Paper #7 (With Answer Key & Solutions)",
  },
  "c9-mock-8": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-8.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_08_169dbe49.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-8"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_08_With_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Full-Length Mock Paper #8 (With Answer Key & Solutions)",
  },
  "c9-mock-9": {
    filePath: path.join(__dirname, "public", "assets", "class9-pdfs", "c9-mock-9.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_9_Mock_Paper_09_e7e3bfd0.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class9-pdf-pages", "c9-mock-9"),
    downloadName: "AISSEE_Class_9_Super9_Mock_Paper_09_With_Solutions.pdf",
    title: "AISSEE Class 9 Super 9 Full-Length Mock Paper #9 (With Answer Key & Solutions)",
  },
};

const CLASS_6_PDF_FILES: Record<
  string,
  { filePath: string; fallbackPath: string; pagesDir: string; downloadName: string; title: string }
> = {
  "c6-free-sample": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "free-sample-paper-01.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_01_71ff7beb.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-free-sample"),
    downloadName: "AISSEE_Class_6_Free_Sample_Mock_Paper_With_Solutions.pdf",
    title: "AISSEE Class 6 Free Sample Full-Length Mock Paper #1 (With Answer Key & Solutions)",
  },
  "c6-mock-1": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-1.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_02_6ed030e4.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-1"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_01_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #1 (With Answer Key & Solutions)",
  },
  "c6-mock-2": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-2.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_03_2830d3c1.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-2"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_02_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #2 (With Answer Key & Solutions)",
  },
  "c6-mock-3": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-3.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_04_17469a1d.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-3"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_03_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #3 (With Answer Key & Solutions)",
  },
  "c6-mock-4": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-4.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_5_4a0a10cd.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-4"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_04_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #4 (With Answer Key & Solutions)",
  },
  "c6-mock-5": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-5.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_06_849180f5.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-5"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_05_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #5 (With Answer Key & Solutions)",
  },
  "c6-mock-6": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-6.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_07_03b7a779.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-6"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_06_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #6 (With Answer Key & Solutions)",
  },
  "c6-mock-7": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-7.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_08_03adb50a.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-7"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_07_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #7 (With Answer Key & Solutions)",
  },
  "c6-mock-8": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-8.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_09_e788c21b.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-8"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_08_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #8 (With Answer Key & Solutions)",
  },
  "c6-mock-9": {
    filePath: path.join(__dirname, "public", "assets", "class6-pdfs", "c6-mock-9.pdf"),
    fallbackPath: path.join(__dirname, "public", "assets", "aistudio", "AISSEE_Class_6_Mock_Paper_10_90a6a0b2.pdf"),
    pagesDir: path.join(__dirname, "public", "assets", "class6-pdf-pages", "c6-mock-9"),
    downloadName: "AISSEE_Class_6_Super9_Mock_Paper_09_With_Solutions.pdf",
    title: "AISSEE Class 6 Super 9 Full-Length Mock Paper #9 (With Answer Key & Solutions)",
  },
};

const ALL_PDF_FILES: Record<
  string,
  { filePath: string; fallbackPath: string; pagesDir: string; downloadName: string; title: string; classType: "class-6" | "class-9" }
> = {
  ...Object.fromEntries(
    Object.entries(CLASS_6_PDF_FILES).map(([k, v]) => [k, { ...v, classType: "class-6" as const }])
  ),
  ...Object.fromEntries(
    Object.entries(CLASS_9_PDF_FILES).map(([k, v]) => [k, { ...v, classType: "class-9" as const }])
  ),
};

const CLASS_6_MOCK_PAPERS = Array.from({ length: 9 }, (_, i) => ({
  id: `c6-mock-${i + 1}`,
  paperNumber: i + 1,
  title: `AISSEE Class 6 Super 9 Full-Length Mock Paper #${i + 1} (With Solutions)`,
  totalMarks: 300,
  duration: "2.5 Hours (150 Mins)",
  sections: [
    "Mathematics (50 Qs · 150 Marks)",
    "Intelligence (25 Qs · 50 Marks)",
    "Language / English (25 Qs · 50 Marks)",
    "General Knowledge (25 Qs · 50 Marks)",
  ],
  hasDetailedSolutions: true,
  isCombinedPdf: true,
  classType: "class-6" as const,
}));

// ==========================================
// Token Helpers
// ==========================================
function createAccessToken(email: string, classType: "class-6" | "class-9", paymentId: string): string {
  const expiresAt = Date.now() + 180 * 24 * 60 * 60 * 1000;
  const payload = `${email.toLowerCase()}|${classType}|${paymentId}|${expiresAt}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

function verifyAccessToken(token: string): {
  valid: boolean;
  email?: string;
  classType?: "class-6" | "class-9";
  paymentId?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 5) return { valid: false };
    const [email, classType, paymentId, expiresAtStr, sig] = parts;
    if (email.toLowerCase() === "cadet.student@gmail.com") return { valid: false };
    const payload = `${email}|${classType}|${paymentId}|${expiresAtStr}`;
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (sig !== expectedSig) return { valid: false };
    if (Date.now() > Number(expiresAtStr)) return { valid: false };

    const record = purchasesMap.get(paymentId);
    if (record && record.status === "revoked") return { valid: false };

    return {
      valid: true,
      email,
      classType: (classType === "class-6" ? "class-6" : "class-9"),
      paymentId,
    };
  } catch {
    return { valid: false };
  }
}

function createAdminToken(username: string): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${username}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

function verifyAdminToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [username, expiresAtStr, sig] = decoded.split(":");
    if (!username || !expiresAtStr || !sig) return null;
    if (Date.now() > Number(expiresAtStr)) return null;
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(`${username}:${expiresAtStr}`).digest("hex");
    if (sig !== expectedSig) return null;
    if (username !== ADMIN_USERNAME) return null;
    return username;
  } catch {
    return null;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : String(req.query.adminToken || "");
  const adminUser = verifyAdminToken(token);
  if (!adminUser) {
    return res.status(401).json({ success: false, message: "Unauthorized admin access." });
  }
  (req as unknown as { adminEmail: string }).adminEmail = adminUser;
  next();
}

function getActivePurchaseForEmail(email: string, classType: "class-6" | "class-9"): PurchaseRecord | null {
  const norm = email.toLowerCase().trim();
  if (!norm || norm === "cadet.student@gmail.com") return null;
  for (const rec of purchasesMap.values()) {
    const recClass = rec.classType || "class-9";
    if (rec.email.toLowerCase() === norm && recClass === classType && rec.status !== "revoked" && rec.expiresAt > Date.now()) {
      return rec;
    }
  }
  return null;
}

function getAllActivePurchasesForEmail(email: string): PurchaseRecord[] {
  const norm = email.toLowerCase().trim();
  if (!norm || norm === "cadet.student@gmail.com") return [];
  const list: PurchaseRecord[] = [];
  for (const rec of purchasesMap.values()) {
    if (rec.email.toLowerCase() === norm && rec.status !== "revoked" && rec.expiresAt > Date.now()) {
      list.push(rec);
    }
  }
  return list;
}

function isAuthorizedForPaper(paperId: string, token: string, email: string): boolean {
  if (
    paperId === "c6-free-sample" ||
    paperId === "c9-free-sample" ||
    paperId === "free-sample"
  ) {
    return true;
  }
  const requiredClass: "class-6" | "class-9" = paperId.startsWith("c6-") ? "class-6" : "class-9";
  const verified = verifyAccessToken(token);
  if (verified.valid && verified.email) {
    if (verified.classType === requiredClass) return true;
    if (getActivePurchaseForEmail(verified.email, requiredClass)) return true;
  }
  if (email && getActivePurchaseForEmail(email, requiredClass)) {
    return true;
  }
  return false;
}

function resolvePdfPaperKey(rawId: string, typeQuery?: string): string {
  if (rawId === "free-sample") return "c6-free-sample";
  if (ALL_PDF_FILES[rawId]) return rawId;
  if (/^c9-mock-[1-4]$/.test(rawId)) {
    return typeQuery === "solution" ? `${rawId}-solution` : `${rawId}-question`;
  }
  return rawId;
}

// ==========================================
// Public & Student API Routes
// ==========================================
app.get("/api/auth/config", (_req: Request, res: Response) => {
  res.json({
    paymentMode: PAYMENT_MODE,
    upiId: UPI_ID,
    upiPayeeName: UPI_PAYEE_NAME,
    upiQrImage: UPI_QR_IMAGE,
    supportWhatsApp: SUPPORT_WHATSAPP,
    supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
    price: 99,
    googleClientId:
      process.env.GOOGLE_CLIENT_ID ||
      "835720758781-s15sg4l7d11b4qm23vmjh8btaqik4fom.apps.googleusercontent.com",
    razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    razorpayDormant: PAYMENT_MODE !== "razorpay",
  });
});

app.post("/api/auth/google", async (req: Request, res: Response) => {
  try {
    const { credential, testUser, studentProfile, classType } = req.body;
    const targetClass: "class-6" | "class-9" = classType === "class-6" ? "class-6" : "class-9";

    let email = "";
    let name = "";
    let picture = "";

    if (credential) {
      const parts = String(credential).split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        email = String(payload.email || "").toLowerCase().trim();
        name = String(payload.name || email.split("@")[0]);
        picture = String(payload.picture || "");
      }
    } else if (studentProfile && studentProfile.email) {
      email = String(studentProfile.email).toLowerCase().trim();
      name = String(studentProfile.name || email.split("@")[0]).trim();
    } else if (testUser && testUser.email) {
      email = String(testUser.email).toLowerCase().trim();
      name = String(testUser.name || email.split("@")[0]).trim();
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Please enter a valid Google email address." });
    }

    const now = new Date().toISOString();
    const existing = studentsMap.get(email);
    const student: StudentProfile = {
      id: existing?.id || `stu_${Date.now().toString(36)}`,
      email,
      name: name || existing?.name || email.split("@")[0],
      picture: picture || existing?.picture,
      createdAt: existing?.createdAt || now,
      lastLoginAt: now,
      totalLogins: (existing?.totalLogins || 0) + 1,
    };

    studentsMap.set(email, student);
    saveStudents();

    const activePurchase = getActivePurchaseForEmail(email, targetClass);
    const allPurchases = getAllActivePurchasesForEmail(email).map((p) => ({
      ...p,
      papers: p.classType === "class-6" ? CLASS_6_MOCK_PAPERS : CLASS_9_MOCK_PAPERS,
    }));
    const latestRequest =
      Array.from(accessRequestsMap.values())
        .filter((r) => r.studentEmail.toLowerCase() === email && r.classType === targetClass)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0] || null;

    return res.json({
      success: true,
      student,
      hasPurchased: Boolean(activePurchase),
      purchase: activePurchase,
      purchases: allPurchases,
      accessRequest: latestRequest,
    });
  } catch (err) {
    console.error("[Google Auth Error]:", err);
    return res.status(500).json({ success: false, message: "Authentication error." });
  }
});

app.post("/api/access-requests/submit", (req: Request, res: Response) => {
  try {
    const { email, name, classType, utr, picture } = req.body;
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const studentName = String(name || normalizedEmail.split("@")[0] || "Student").trim();
    const targetClass: "class-6" | "class-9" = classType === "class-6" ? "class-6" : "class-9";
    const cleanedUtr = String(utr || "").trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ success: false, message: "Please sign in with Google first." });
    }
    if (!cleanedUtr || cleanedUtr.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 12-digit UPI Transaction ID / UTR number.",
      });
    }

    const existingPurchase = getActivePurchaseForEmail(normalizedEmail, targetClass);
    if (existingPurchase) {
      return res.json({
        success: true,
        alreadyApproved: true,
        accessToken: existingPurchase.accessToken,
        message: "Your account already has active access to this mock test package!",
      });
    }

    let isDuplicateUtr = false;
    let existingRequestId: string | null = null;
    for (const [id, reqRecord] of accessRequestsMap.entries()) {
      if (
        reqRecord.utr.toLowerCase() === cleanedUtr.toLowerCase() &&
        (reqRecord.studentEmail.toLowerCase() !== normalizedEmail || reqRecord.classType !== targetClass)
      ) {
        isDuplicateUtr = true;
      }
      if (reqRecord.studentEmail.toLowerCase() === normalizedEmail && reqRecord.classType === targetClass) {
        existingRequestId = id;
      }
    }

    const packageTitle =
      targetClass === "class-6"
        ? "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions"
        : "Class 9 AISSEE 9-Mock Test Series & Step-by-Step Solutions";

    const requestId =
      existingRequestId ||
      `req_${targetClass.replace("-", "")}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const newRequest: AccessRequestRecord = {
      id: requestId,
      classType: targetClass,
      packageTitle,
      amount: 99,
      currency: "INR",
      studentEmail: normalizedEmail,
      studentName,
      studentPicture: picture,
      utr: cleanedUtr,
      submittedAt: new Date().toISOString(),
      status: "pending",
      isDuplicateUtr,
    };

    accessRequestsMap.set(requestId, newRequest);
    saveAccessRequests();

    return res.json({
      success: true,
      message:
        "Your access request has been submitted successfully! Your payment will be verified manually, and you will receive access within one hour. For further queries, contact us on WhatsApp.",
      request: newRequest,
      supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
    });
  } catch (err) {
    console.error("[Submit Request Error]:", err);
    return res.status(500).json({ success: false, message: "Internal error submitting access request." });
  }
});

app.get("/api/student/status", (req: Request, res: Response) => {
  const email = String(req.query.email || "").toLowerCase().trim();
  const classType = req.query.classType as "class-6" | "class-9" | undefined;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email required." });
  }

  const student = studentsMap.get(email) || null;
  const rawPurchases = getAllActivePurchasesForEmail(email);
  const allPurchases = rawPurchases.map((p) => ({
    ...p,
    papers: p.classType === "class-6" ? CLASS_6_MOCK_PAPERS : CLASS_9_MOCK_PAPERS,
  }));
  const classPurchase = classType ? getActivePurchaseForEmail(email, classType) : rawPurchases[0] || null;
  const userRequests = Array.from(accessRequestsMap.values())
    .filter((r) => r.studentEmail.toLowerCase() === email && (!classType || r.classType === classType))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return res.json({
    success: true,
    email,
    student,
    purchases: allPurchases,
    activePurchase: classPurchase,
    hasPurchased: Boolean(classPurchase),
    latestRequest: userRequests[0] || null,
    allRequests: userRequests,
    supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
  });
});

app.get("/api/access-portal", (req: Request, res: Response) => {
  const token = String(req.query.token || "").trim();
  const email = String(req.query.email || "").toLowerCase().trim();
  const requestedClass = (req.query.classType as "class-6" | "class-9") || "class-9";

  if (token) {
    const verified = verifyAccessToken(token);
    if (verified.valid && verified.email) {
      const targetClass = verified.classType || "class-9";
      const purchase = getActivePurchaseForEmail(verified.email, targetClass);
      const student = studentsMap.get(verified.email);
      const papers = targetClass === "class-6" ? CLASS_6_MOCK_PAPERS : CLASS_9_MOCK_PAPERS;
      return res.json({
        success: true,
        student: purchase?.name || student?.name || "Student",
        email: verified.email,
        classType: targetClass,
        accessToken: token,
        papers,
      });
    }
  }

  if (email) {
    const purchase = getActivePurchaseForEmail(email, requestedClass);
    if (purchase) {
      const papers = requestedClass === "class-6" ? CLASS_6_MOCK_PAPERS : CLASS_9_MOCK_PAPERS;
      return res.json({
        success: true,
        student: purchase.name,
        email: purchase.email,
        classType: requestedClass,
        accessToken: purchase.accessToken,
        papers,
      });
    }
  }

  return res.status(403).json({ success: false, message: "No active verified purchase found." });
});

// Public Instant Free Sample Mock Paper #1 (Class 6 - 125 Questions + Answer Key + Solutions)
app.get("/api/sample/class-6-free-mock", (req: Request, res: Response) => {
  const sampleMeta = CLASS_6_PDF_FILES["c6-free-sample"];
  const isDownload = req.query.download === "1" || req.query.download === "true";
  const targetFile = fs.existsSync(sampleMeta.filePath) ? sampleMeta.filePath : sampleMeta.fallbackPath;

  if (!fs.existsSync(targetFile)) {
    return res.status(404).send("Free sample mock paper PDF not found.");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isDownload ? "attachment" : "inline"}; filename="${sampleMeta.downloadName}"`
  );
  return res.sendFile(targetFile);
});

// Public Instant Free Sample Mock Paper (Class 9 - 150 Questions + Master Answer Key + Solutions)
app.get("/api/sample/class-9-free-mock", (req: Request, res: Response) => {
  const sampleMeta = CLASS_9_PDF_FILES["c9-free-sample"];
  const isDownload = req.query.download === "1" || req.query.download === "true";
  const targetFile = fs.existsSync(sampleMeta.filePath) ? sampleMeta.filePath : sampleMeta.fallbackPath;

  if (!fs.existsSync(targetFile)) {
    return res.status(404).send("Class 9 free sample mock paper PDF not found.");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isDownload ? "attachment" : "inline"}; filename="${sampleMeta.downloadName}"`
  );
  return res.sendFile(targetFile);
});

const PDF_PAGES_CACHE_DIR = "/tmp/vcc-pdf-pages-cache";

function ensurePdfPagesRendered(
  paperId: string,
  meta: { filePath: string; fallbackPath: string; pagesDir: string; classType: "class-6" | "class-9" }
): string {
  const fallbackFolder = meta.classType === "class-6" ? "class6-pdf-pages" : "class9-pdf-pages";
  const fallbackPagesDir = path.join(PDF_PAGES_CACHE_DIR, fallbackFolder, paperId);

  if (fs.existsSync(meta.pagesDir) && fs.readdirSync(meta.pagesDir).some((f) => /^page-\d+\.png$/i.test(f))) {
    return meta.pagesDir;
  }
  if (fs.existsSync(fallbackPagesDir) && fs.readdirSync(fallbackPagesDir).some((f) => /^page-\d+\.png$/i.test(f))) {
    return fallbackPagesDir;
  }

  const pdfSource = fs.existsSync(meta.filePath) ? meta.filePath : meta.fallbackPath;
  if (fs.existsSync(pdfSource)) {
    try {
      fs.mkdirSync(fallbackPagesDir, { recursive: true });
      execFileSync("pdftoppm", ["-png", "-r", "130", pdfSource, path.join(fallbackPagesDir, "page")]);
      const generated = fs.readdirSync(fallbackPagesDir).filter((f) => /^page-\d+\.png$/i.test(f));
      for (const file of generated) {
        const m = file.match(/^page-0*(\d+)\.png$/i);
        if (m) {
          const normalized = `page-${parseInt(m[1], 10)}.png`;
          if (normalized !== file) {
            fs.renameSync(path.join(fallbackPagesDir, file), path.join(fallbackPagesDir, normalized));
          }
        }
      }
      return fallbackPagesDir;
    } catch (err) {
      console.error(`Failed to render PDF pages on demand for ${paperId}:`, err);
    }
  }

  return fallbackPagesDir;
}

// In-App PDF Viewer Page List Endpoint (Immune to iframe/new-tab 403 restrictions)
app.get("/api/pdf-pages/:paperId", (req: Request, res: Response) => {
  const rawId = req.params.paperId;
  const typeQuery = String(req.query.type || "question");
  const paperId = resolvePdfPaperKey(rawId, typeQuery);
  const token = String(req.query.token || "").trim();
  const email = String(req.query.email || "").toLowerCase().trim();

  const meta = ALL_PDF_FILES[paperId];
  if (!meta) {
    return res.status(404).json({ success: false, message: "Mock paper not found." });
  }

  if (!isAuthorizedForPaper(paperId, token, email)) {
    return res.status(403).json({
      success: false,
      message: `Please sign in with an approved ${
        meta.classType === "class-6" ? "Class 6" : "Class 9"
      } Super 9 account to view this mock paper.`,
    });
  }

  const activePagesDir = ensurePdfPagesRendered(paperId, meta);

  if (!fs.existsSync(activePagesDir)) {
    return res.status(404).json({ success: false, message: "Paper preview pages not found." });
  }

  const files = fs
    .readdirSync(activePagesDir)
    .filter((f) => /^page-\d+\.png$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D+/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D+/g, ""), 10) || 0;
      return numA - numB;
    });

  const authQuery = new URLSearchParams();
  if (token) authQuery.set("token", token);
  if (email) authQuery.set("email", email);
  const qs = authQuery.toString() ? `?${authQuery.toString()}` : "";

  const pages = files.map((_, idx) => `/api/pdf-page/${encodeURIComponent(paperId)}/${idx + 1}${qs}`);

  return res.json({
    success: true,
    paperId,
    title: meta.title,
    totalPages: pages.length,
    pages,
  });
});

// Serve individual rendered PNG page for In-App PDF Viewer
app.get("/api/pdf-page/:paperId/:pageNum", (req: Request, res: Response) => {
  const rawId = req.params.paperId;
  const typeQuery = String(req.query.type || "question");
  const paperId = resolvePdfPaperKey(rawId, typeQuery);
  const pageNum = parseInt(req.params.pageNum, 10);
  const token = String(req.query.token || "").trim();
  const email = String(req.query.email || "").toLowerCase().trim();

  const meta = ALL_PDF_FILES[paperId];
  if (!meta || isNaN(pageNum) || pageNum < 1) {
    return res.status(404).send("Page not found.");
  }

  if (!isAuthorizedForPaper(paperId, token, email)) {
    return res.status(403).send("Unauthorized to view this page.");
  }

  const activePagesDir = ensurePdfPagesRendered(paperId, meta);
  const targetPage = path.join(activePagesDir, `page-${pageNum}.png`);

  if (!fs.existsSync(targetPage)) {
    return res.status(404).send("Page image not found.");
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.sendFile(targetPage);
});

app.get("/api/download/:paperId", (req: Request, res: Response) => {
  const token = String(req.query.token || "").trim();
  const email = String(req.query.email || "").toLowerCase().trim();
  const type = String(req.query.type || "question");
  const isDownload = req.query.download === "1" || req.query.download === "true";
  const paperId = resolvePdfPaperKey(req.params.paperId, type);

  // Always allow free samples without token
  if (paperId === "c6-free-sample" || paperId === "c9-free-sample") {
    const sampleMeta = ALL_PDF_FILES[paperId];
    const targetFile = fs.existsSync(sampleMeta.filePath) ? sampleMeta.filePath : sampleMeta.fallbackPath;
    if (fs.existsSync(targetFile)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename="${sampleMeta.downloadName}"`
      );
      return res.sendFile(targetFile);
    }
  }

  // Serve real Class 6 and Class 9 Super 9 Full-Length PDFs
  const pdfMeta = ALL_PDF_FILES[paperId];
  if (pdfMeta) {
    if (!isAuthorizedForPaper(paperId, token, email)) {
      return res
        .status(403)
        .send(`Unauthorized: Valid ${pdfMeta.classType.toUpperCase()} access is required to download this mock paper.`);
    }
    const targetFile = fs.existsSync(pdfMeta.filePath) ? pdfMeta.filePath : pdfMeta.fallbackPath;
    if (fs.existsSync(targetFile)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename="${pdfMeta.downloadName}"`
      );
      return res.sendFile(targetFile);
    }
  }

  const verified = verifyAccessToken(token);
  if (!verified.valid || !verified.email) {
    return res.status(403).send("Unauthorized: Valid access token required to view this mock paper.");
  }

  const allPapers = [...CLASS_6_MOCK_PAPERS, ...CLASS_9_MOCK_PAPERS];
  const paper = allPapers.find((p) => p.id === paperId);
  if (!paper) {
    return res.status(404).send("Mock paper not found.");
  }

  const student = studentsMap.get(verified.email);
  const studentName = student?.name || "Verified Cadet";
  const isSolution = type === "solution";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${paper.title} - ${isSolution ? "Step-by-Step Solutions" : "Question Paper"}</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 32px; background: #f8fafc; color: #0f172a; }
    .sheet { max-width: 850px; margin: 0 auto; background: #fff; padding: 40px; border: 2px solid #071328; border-radius: 12px; position: relative; overflow: hidden; }
    .watermark { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 28px; color: rgba(7, 19, 40, 0.08); font-weight: bold; pointer-events: none; white-space: nowrap; z-index: 0; }
    .header { text-align: center; border-bottom: 2px solid #071328; padding-bottom: 16px; margin-bottom: 24px; position: relative; z-index: 1; }
    .badge { display: inline-block; background: #f59e0b; color: #071328; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .print-btn { background: #071328; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
    @media print { .no-print { display: none; } body { background: #fff; padding: 0; } .sheet { border: none; } }
  </style>
</head>
<body>
  <div class="watermark">LICENCED TO ${studentName.toUpperCase()} (${verified.email})</div>
  <div class="sheet">
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <span style="font-size:12px;color:#475569;">Licenced Cadet: <strong>${studentName}</strong> (${verified.email})</span>
      <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
    <div class="header">
      <div class="badge">${isSolution ? "Detailed Answer Key & Step-by-Step Solutions" : "Official Mock Question Paper"}</div>
      <h1 style="margin:12px 0 4px;font-size:24px;">VIVEKANANDHA SAINIK COACHING CENTER</h1>
      <h2 style="margin:0 0 8px;font-size:18px;color:#334155;">${paper.title}</h2>
      <p style="margin:0;font-size:13px;color:#64748b;">Total Marks: ${paper.totalMarks} &middot; Duration: ${paper.duration}</p>
    </div>
    <div style="position:relative;z-index:1;line-height:1.7;">
      <h3>Sections Included:</h3>
      <ul>
        ${paper.sections.map((s) => `<li><strong>${s}</strong></li>`).join("")}
      </ul>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;" />
      <p><strong>Instructions for Cadet ${studentName}:</strong></p>
      <ol>
        <li>Attempt all questions within the stipulated ${paper.duration} time limit.</li>
        <li>Use an OMR sheet with a black or blue ballpoint pen for marking responses.</li>
        <li>No negative marking applies for incorrect answers as per official NTA AISSEE rules.</li>
      </ol>
    </div>
  </div>
</body>
</html>`);
});

// ==========================================
// Admin Authentication & Management Routes
// ==========================================
app.post("/api/admin/login", (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const inputUser = String(username || email || "").trim();
  const inputPass = String(password || "");

  if (inputUser !== ADMIN_USERNAME || inputPass !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Invalid administrator username or password.",
    });
  }

  const token = createAdminToken(ADMIN_USERNAME);
  return res.json({
    success: true,
    message: "Administrator login successful.",
    token,
    admin: {
      username: ADMIN_USERNAME,
      email: ADMIN_USERNAME,
    },
  });
});

app.get("/api/admin/verify-session", requireAdmin, (_req: Request, res: Response) => {
  res.json({
    success: true,
    admin: { username: ADMIN_USERNAME, email: ADMIN_USERNAME },
  });
});

app.get("/api/admin/stats", requireAdmin, (_req: Request, res: Response) => {
  const allPurchases = Array.from(purchasesMap.values());
  const verifiedPurchases = allPurchases.filter((p) => p.status !== "revoked");
  const totalRevenue = verifiedPurchases.reduce((acc, curr) => acc + (curr.amount || 99), 0);
  const allRequests = Array.from(accessRequestsMap.values());
  const pendingRequests = allRequests.filter((r) => r.status === "pending");

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalPurchases: verifiedPurchases.length,
      totalStudents: studentsMap.size,
      recentCount: verifiedPurchases.length,
      pendingRequestsCount: pendingRequests.length,
      totalRequestsCount: allRequests.length,
      class6PurchasesCount: verifiedPurchases.filter((p) => p.classType === "class-6").length,
      class9PurchasesCount: verifiedPurchases.filter((p) => p.classType !== "class-6").length,
      papersCount: 18,
      gateways: {
        paymentMode: PAYMENT_MODE,
        upiId: UPI_ID,
        upiPayeeName: UPI_PAYEE_NAME,
        upiQrImage: UPI_QR_IMAGE,
        supportWhatsApp: SUPPORT_WHATSAPP,
        razorpayDormant: true,
        razorpayConfigured: false,
        razorpayTestMode: false,
        googleAuthEnabled: true,
      },
    },
  });
});

app.get("/api/admin/access-requests", requireAdmin, (_req: Request, res: Response) => {
  const requests = Array.from(accessRequestsMap.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
  res.json({ success: true, requests });
});

app.post("/api/admin/approve-request", requireAdmin, (req: Request, res: Response) => {
  const { requestId, notes } = req.body;
  const reqRecord = accessRequestsMap.get(String(requestId || ""));
  if (!reqRecord) {
    return res.status(404).json({ success: false, message: "Access request not found." });
  }

  const now = new Date().toISOString();
  reqRecord.status = "approved";
  reqRecord.decidedAt = now;
  reqRecord.decidedBy = ADMIN_USERNAME;
  reqRecord.notes = notes || "Verified manual UPI payment";
  accessRequestsMap.set(reqRecord.id, reqRecord);
  saveAccessRequests();

  const paymentId = `UPI_${reqRecord.utr}_${Date.now().toString(36)}`;
  const accessToken = createAccessToken(reqRecord.studentEmail, reqRecord.classType, paymentId);
  const purchase: PurchaseRecord = {
    paymentId,
    orderId: reqRecord.id,
    email: reqRecord.studentEmail,
    name: reqRecord.studentName,
    amount: reqRecord.amount || 99,
    currency: "INR",
    verifiedAt: now,
    expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    status: "verified",
    accessToken,
    method: "manual_upi",
    grantedBy: ADMIN_USERNAME,
    classType: reqRecord.classType,
    packageTitle: reqRecord.packageTitle,
  };

  purchasesMap.set(paymentId, purchase);
  savePurchases();

  return res.json({
    success: true,
    message: `Approved access for ${reqRecord.studentName} (${reqRecord.studentEmail})!`,
    purchase,
  });
});

app.post("/api/admin/reject-request", requireAdmin, (req: Request, res: Response) => {
  const { requestId, notes } = req.body;
  const reqRecord = accessRequestsMap.get(String(requestId || ""));
  if (!reqRecord) {
    return res.status(404).json({ success: false, message: "Access request not found." });
  }

  reqRecord.status = "rejected";
  reqRecord.decidedAt = new Date().toISOString();
  reqRecord.decidedBy = ADMIN_USERNAME;
  reqRecord.notes = notes || "UTR could not be verified";
  reqRecord.reviewNotes = reqRecord.notes;
  accessRequestsMap.set(reqRecord.id, reqRecord);
  saveAccessRequests();

  return res.json({
    success: true,
    message: `Rejected request for ${reqRecord.studentEmail}.`,
  });
});

app.get("/api/admin/purchases", requireAdmin, (_req: Request, res: Response) => {
  const purchases = Array.from(purchasesMap.values()).sort(
    (a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime()
  );
  res.json({ success: true, purchases });
});

app.get("/api/admin/students", requireAdmin, (_req: Request, res: Response) => {
  const list = Array.from(studentsMap.values()).map((s) => {
    const c6 = getActivePurchaseForEmail(s.email, "class-6");
    const c9 = getActivePurchaseForEmail(s.email, "class-9");
    const active = c9 || c6;
    return {
      ...s,
      hasPurchased: Boolean(active),
      class6Purchased: Boolean(c6),
      class9Purchased: Boolean(c9),
      purchaseDate: active?.verifiedAt || null,
      purchaseMethod: active?.method || null,
    };
  });
  res.json({ success: true, students: list });
});

app.post("/api/admin/grant-access", requireAdmin, (req: Request, res: Response) => {
  const { email, name, classType, note } = req.body;
  const normEmail = String(email || "").toLowerCase().trim();
  const studentName = String(name || "Student Cadet").trim();
  const targetClass: "class-6" | "class-9" = classType === "class-6" ? "class-6" : "class-9";

  if (!normEmail || !normEmail.includes("@")) {
    return res.status(400).json({ success: false, message: "Valid student email required." });
  }

  const now = new Date().toISOString();
  const paymentId = `MANUAL_${Date.now().toString(36).toUpperCase()}`;
  const accessToken = createAccessToken(normEmail, targetClass, paymentId);

  const purchase: PurchaseRecord = {
    paymentId,
    orderId: note || "ADMIN_GRANT",
    email: normEmail,
    name: studentName,
    amount: 99,
    currency: "INR",
    verifiedAt: now,
    expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
    status: "manually_granted",
    accessToken,
    method: "manual",
    grantedBy: ADMIN_USERNAME,
    classType: targetClass,
    packageTitle:
      targetClass === "class-6"
        ? "Class 6 AISSEE 9-Mock Test Series & Step-by-Step Solutions"
        : "Class 9 AISSEE 9-Mock Test Series & Step-by-Step Solutions",
  };

  purchasesMap.set(paymentId, purchase);
  savePurchases();

  if (!studentsMap.has(normEmail)) {
    studentsMap.set(normEmail, {
      id: `stu_${Date.now().toString(36)}`,
      email: normEmail,
      name: studentName,
      createdAt: now,
      lastLoginAt: now,
      totalLogins: 1,
    });
    saveStudents();
  }

  return res.json({ success: true, purchase });
});

app.post("/api/admin/revoke-access", requireAdmin, (req: Request, res: Response) => {
  const { accessToken, email } = req.body;
  let found = false;
  for (const [id, rec] of purchasesMap.entries()) {
    if (rec.accessToken === accessToken || (email && rec.email.toLowerCase() === String(email).toLowerCase())) {
      rec.status = "revoked";
      purchasesMap.set(id, rec);
      found = true;
    }
  }
  if (found) savePurchases();
  return res.json({ success: true, message: "Access revoked." });
});

app.get("/api/admin/export", requireAdmin, (_req: Request, res: Response) => {
  const rows = [
    ["PaymentID", "StudentName", "Email", "ClassType", "Amount", "Status", "Method", "VerifiedAt"].join(","),
    ...Array.from(purchasesMap.values()).map((p) =>
      [
        p.paymentId,
        `"${p.name.replace(/"/g, '""')}"`,
        p.email,
        p.classType || "class-9",
        p.amount,
        p.status,
        p.method,
        p.verifiedAt,
      ].join(",")
    ),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="vcc_purchases_export.csv"');
  return res.send(rows);
});

// ==========================================
// Vite Dev Server / Production Static Setup
// ==========================================
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
