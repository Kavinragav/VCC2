import { Pool, QueryResult } from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// Data Models
// ==========================================
export interface PurchaseRecord {
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

export interface StudentProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  lastLoginAt: string;
  totalLogins: number;
}

export interface AccessRequestRecord {
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

// ==========================================
// Neon PostgreSQL Connection & Pooling
// ==========================================
const databaseUrl = process.env.DATABASE_URL?.trim();
const usePostgres = Boolean(databaseUrl);

let pool: Pool | null = null;

if (usePostgres) {
  const isNeon = databaseUrl?.includes("neon.tech") || databaseUrl?.includes("sslmode=require");
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on("error", (err) => {
    console.error("[PostgreSQL Pool Error]:", err.message);
  });
}

// ==========================================
// Local JSON File Fallback (Active only when DATABASE_URL is unset)
// ==========================================
const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PURCHASES_FILE = path.join(DATA_DIR, "purchases.json");
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const ACCESS_REQUESTS_FILE = path.join(DATA_DIR, "access_requests.json");

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
    console.error(`Error loading fallback ${filePath}:`, err);
  }
  return new Map<string, T>();
}

function saveJsonMap<T>(filePath: string, map: Map<string, T>) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(Array.from(map.entries()), null, 2), "utf8");
  } catch (err) {
    console.error(`Error saving fallback ${filePath}:`, err);
  }
}

const localPurchasesMap = loadJsonMap<PurchaseRecord>(PURCHASES_FILE);
const localStudentsMap = loadJsonMap<StudentProfile>(STUDENTS_FILE);
const localAccessRequestsMap = loadJsonMap<AccessRequestRecord>(ACCESS_REQUESTS_FILE);

// ==========================================
// Database Initialization & Idempotent Schema Setup
// ==========================================
export async function initDatabase(): Promise<{ isPostgres: boolean; message: string }> {
  if (!pool) {
    console.log("[Database] DATABASE_URL not set. Running in local fallback mode using JSON storage in data/.");
    return {
      isPostgres: false,
      message: "Using local JSON file storage. Set DATABASE_URL to connect to Neon PostgreSQL.",
    };
  }

  try {
    // Test connectivity
    const client = await pool.connect();
    try {
      // 1. Students table
      await client.query(`
        CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(128) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          picture TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          total_logins INTEGER NOT NULL DEFAULT 1
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_students_email ON students(LOWER(email));
      `);

      // 2. Purchases table
      await client.query(`
        CREATE TABLE IF NOT EXISTS purchases (
          payment_id VARCHAR(128) PRIMARY KEY,
          order_id VARCHAR(128) NOT NULL,
          email VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          amount NUMERIC(10, 2) NOT NULL DEFAULT 99.00,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at BIGINT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'verified',
          access_token TEXT NOT NULL,
          method VARCHAR(50) NOT NULL DEFAULT 'manual_upi',
          granted_by VARCHAR(100),
          class_type VARCHAR(20) NOT NULL,
          package_title TEXT NOT NULL
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(LOWER(email));
        CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
        CREATE INDEX IF NOT EXISTS idx_purchases_email_class ON purchases(LOWER(email), class_type);
        CREATE INDEX IF NOT EXISTS idx_purchases_access_token ON purchases(access_token);
      `);

      // 3. Access requests table
      await client.query(`
        CREATE TABLE IF NOT EXISTS access_requests (
          id VARCHAR(128) PRIMARY KEY,
          class_type VARCHAR(20) NOT NULL,
          package_title TEXT NOT NULL,
          amount NUMERIC(10, 2) NOT NULL DEFAULT 99.00,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          student_email VARCHAR(255) NOT NULL,
          student_name VARCHAR(255) NOT NULL,
          student_picture TEXT,
          utr VARCHAR(100) NOT NULL,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          decided_at TIMESTAMPTZ,
          decided_by VARCHAR(100),
          notes TEXT,
          review_notes TEXT,
          is_duplicate_utr BOOLEAN NOT NULL DEFAULT FALSE
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_access_requests_utr ON access_requests(LOWER(utr));
        CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(LOWER(student_email));
        CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
      `);

      console.log("Neon PostgreSQL connected and schema verified successfully.");
      return { isPostgres: true, message: "Neon PostgreSQL connected and schema verified." };
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[Database Init Error]: Failed to initialize Neon PostgreSQL:", err.message);
    throw err;
  }
}

// ==========================================
// Student Operations
// ==========================================
export async function upsertStudent(params: {
  email: string;
  name: string;
  picture?: string;
}): Promise<StudentProfile> {
  const normEmail = params.email.toLowerCase().trim();
  const nowIso = new Date().toISOString();

  if (pool) {
    try {
      const generatedId = `stu_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const result: QueryResult = await pool.query(
        `
        INSERT INTO students (id, email, name, picture, created_at, last_login_at, total_logins)
        VALUES ($1, $2, $3, $4, NOW(), NOW(), 1)
        ON CONFLICT (email) DO UPDATE
        SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), students.name),
          picture = COALESCE(NULLIF(EXCLUDED.picture, ''), students.picture),
          last_login_at = NOW(),
          total_logins = students.total_logins + 1
        RETURNING id, email, name, picture, created_at, last_login_at, total_logins;
      `,
        [generatedId, normEmail, params.name, params.picture || null]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: new Date(row.last_login_at).toISOString(),
        totalLogins: Number(row.total_logins),
      };
    } catch (err: any) {
      console.error("[PostgreSQL Error in upsertStudent]:", err.message);
      throw err;
    }
  }

  // Fallback
  const existing = localStudentsMap.get(normEmail);
  const student: StudentProfile = {
    id: existing?.id || `stu_${Date.now().toString(36)}`,
    email: normEmail,
    name: params.name || existing?.name || normEmail.split("@")[0],
    picture: params.picture || existing?.picture,
    createdAt: existing?.createdAt || nowIso,
    lastLoginAt: nowIso,
    totalLogins: (existing?.totalLogins || 0) + 1,
  };
  localStudentsMap.set(normEmail, student);
  saveJsonMap(STUDENTS_FILE, localStudentsMap);
  return student;
}

export async function getStudentByEmail(email: string): Promise<StudentProfile | null> {
  const normEmail = email.toLowerCase().trim();
  if (!normEmail) return null;

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, email, name, picture, created_at, last_login_at, total_logins FROM students WHERE LOWER(email) = $1 LIMIT 1;`,
        [normEmail]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: new Date(row.last_login_at).toISOString(),
        totalLogins: Number(row.total_logins),
      };
    } catch (err: any) {
      console.error("[PostgreSQL Error in getStudentByEmail]:", err.message);
      return null;
    }
  }

  return localStudentsMap.get(normEmail) || null;
}

export async function getAllStudents(): Promise<StudentProfile[]> {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, email, name, picture, created_at, last_login_at, total_logins FROM students ORDER BY last_login_at DESC;`
      );
      return res.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: new Date(row.last_login_at).toISOString(),
        totalLogins: Number(row.total_logins),
      }));
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAllStudents]:", err.message);
      return [];
    }
  }

  return Array.from(localStudentsMap.values());
}

// ==========================================
// Purchases / Entitlements Operations
// ==========================================
export async function getActivePurchaseForEmail(
  email: string,
  classType: "class-6" | "class-9"
): Promise<PurchaseRecord | null> {
  const normEmail = email.toLowerCase().trim();
  if (!normEmail || normEmail === "cadet.student@gmail.com") return null;

  if (pool) {
    try {
      const nowMs = Date.now();
      const res = await pool.query(
        `
        SELECT payment_id, order_id, email, name, amount, currency, verified_at, expires_at, status, access_token, method, granted_by, class_type, package_title
        FROM purchases
        WHERE LOWER(email) = $1
          AND class_type = $2
          AND status != 'revoked'
          AND expires_at > $3
        ORDER BY verified_at DESC
        LIMIT 1;
      `,
        [normEmail, classType, nowMs]
      );

      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        paymentId: row.payment_id,
        orderId: row.order_id,
        email: row.email,
        name: row.name,
        amount: Number(row.amount),
        currency: row.currency,
        verifiedAt: new Date(row.verified_at).toISOString(),
        expiresAt: Number(row.expires_at),
        status: row.status,
        accessToken: row.access_token,
        method: row.method,
        grantedBy: row.granted_by || undefined,
        classType: row.class_type,
        packageTitle: row.package_title,
      };
    } catch (err: any) {
      // Secure Fail-Closed: Never grant access on database failure
      console.error("[PostgreSQL Error in getActivePurchaseForEmail - Failing Closed]:", err.message);
      return null;
    }
  }

  for (const rec of localPurchasesMap.values()) {
    const recClass = rec.classType || "class-9";
    if (rec.email.toLowerCase() === normEmail && recClass === classType && rec.status !== "revoked" && rec.expiresAt > Date.now()) {
      return rec;
    }
  }
  return null;
}

export async function getAllActivePurchasesForEmail(email: string): Promise<PurchaseRecord[]> {
  const normEmail = email.toLowerCase().trim();
  if (!normEmail || normEmail === "cadet.student@gmail.com") return [];

  if (pool) {
    try {
      const nowMs = Date.now();
      const res = await pool.query(
        `
        SELECT payment_id, order_id, email, name, amount, currency, verified_at, expires_at, status, access_token, method, granted_by, class_type, package_title
        FROM purchases
        WHERE LOWER(email) = $1
          AND status != 'revoked'
          AND expires_at > $2
        ORDER BY verified_at DESC;
      `,
        [normEmail, nowMs]
      );

      return res.rows.map((row) => ({
        paymentId: row.payment_id,
        orderId: row.order_id,
        email: row.email,
        name: row.name,
        amount: Number(row.amount),
        currency: row.currency,
        verifiedAt: new Date(row.verified_at).toISOString(),
        expiresAt: Number(row.expires_at),
        status: row.status,
        accessToken: row.access_token,
        method: row.method,
        grantedBy: row.granted_by || undefined,
        classType: row.class_type,
        packageTitle: row.package_title,
      }));
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAllActivePurchasesForEmail - Failing Closed]:", err.message);
      return [];
    }
  }

  const list: PurchaseRecord[] = [];
  for (const rec of localPurchasesMap.values()) {
    if (rec.email.toLowerCase() === normEmail && rec.status !== "revoked" && rec.expiresAt > Date.now()) {
      list.push(rec);
    }
  }
  return list;
}

export async function getPurchaseByPaymentId(paymentId: string): Promise<PurchaseRecord | null> {
  if (!paymentId) return null;

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT payment_id, order_id, email, name, amount, currency, verified_at, expires_at, status, access_token, method, granted_by, class_type, package_title FROM purchases WHERE payment_id = $1 LIMIT 1;`,
        [paymentId]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        paymentId: row.payment_id,
        orderId: row.order_id,
        email: row.email,
        name: row.name,
        amount: Number(row.amount),
        currency: row.currency,
        verifiedAt: new Date(row.verified_at).toISOString(),
        expiresAt: Number(row.expires_at),
        status: row.status,
        accessToken: row.access_token,
        method: row.method,
        grantedBy: row.granted_by || undefined,
        classType: row.class_type,
        packageTitle: row.package_title,
      };
    } catch (err: any) {
      console.error("[PostgreSQL Error in getPurchaseByPaymentId]:", err.message);
      return null;
    }
  }

  return localPurchasesMap.get(paymentId) || null;
}

export async function savePurchase(record: PurchaseRecord): Promise<void> {
  if (pool) {
    try {
      await pool.query(
        `
        INSERT INTO purchases (payment_id, order_id, email, name, amount, currency, verified_at, expires_at, status, access_token, method, granted_by, class_type, package_title)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (payment_id) DO UPDATE
        SET
          order_id = EXCLUDED.order_id,
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          verified_at = EXCLUDED.verified_at,
          expires_at = EXCLUDED.expires_at,
          status = EXCLUDED.status,
          access_token = EXCLUDED.access_token,
          method = EXCLUDED.method,
          granted_by = EXCLUDED.granted_by,
          class_type = EXCLUDED.class_type,
          package_title = EXCLUDED.package_title;
      `,
        [
          record.paymentId,
          record.orderId,
          record.email.toLowerCase().trim(),
          record.name,
          record.amount,
          record.currency || "INR",
          record.verifiedAt || new Date().toISOString(),
          record.expiresAt,
          record.status,
          record.accessToken,
          record.method,
          record.grantedBy || null,
          record.classType,
          record.packageTitle,
        ]
      );
      return;
    } catch (err: any) {
      console.error("[PostgreSQL Error in savePurchase]:", err.message);
      throw err;
    }
  }

  localPurchasesMap.set(record.paymentId, record);
  saveJsonMap(PURCHASES_FILE, localPurchasesMap);
}

export async function revokePurchases(criteria: { accessToken?: string; email?: string }): Promise<number> {
  const normEmail = criteria.email?.toLowerCase().trim();
  const token = criteria.accessToken?.trim();

  if (pool) {
    try {
      if (token && normEmail) {
        const res = await pool.query(
          `UPDATE purchases SET status = 'revoked' WHERE access_token = $1 OR LOWER(email) = $2;`,
          [token, normEmail]
        );
        return res.rowCount || 0;
      } else if (token) {
        const res = await pool.query(`UPDATE purchases SET status = 'revoked' WHERE access_token = $1;`, [token]);
        return res.rowCount || 0;
      } else if (normEmail) {
        const res = await pool.query(`UPDATE purchases SET status = 'revoked' WHERE LOWER(email) = $1;`, [normEmail]);
        return res.rowCount || 0;
      }
      return 0;
    } catch (err: any) {
      console.error("[PostgreSQL Error in revokePurchases]:", err.message);
      throw err;
    }
  }

  let count = 0;
  for (const [id, rec] of localPurchasesMap.entries()) {
    if (rec.accessToken === token || (normEmail && rec.email.toLowerCase() === normEmail)) {
      rec.status = "revoked";
      localPurchasesMap.set(id, rec);
      count++;
    }
  }
  if (count > 0) saveJsonMap(PURCHASES_FILE, localPurchasesMap);
  return count;
}

export async function getAllPurchases(): Promise<PurchaseRecord[]> {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT payment_id, order_id, email, name, amount, currency, verified_at, expires_at, status, access_token, method, granted_by, class_type, package_title FROM purchases ORDER BY verified_at DESC;`
      );
      return res.rows.map((row) => ({
        paymentId: row.payment_id,
        orderId: row.order_id,
        email: row.email,
        name: row.name,
        amount: Number(row.amount),
        currency: row.currency,
        verifiedAt: new Date(row.verified_at).toISOString(),
        expiresAt: Number(row.expires_at),
        status: row.status,
        accessToken: row.access_token,
        method: row.method,
        grantedBy: row.granted_by || undefined,
        classType: row.class_type,
        packageTitle: row.package_title,
      }));
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAllPurchases]:", err.message);
      return [];
    }
  }

  return Array.from(localPurchasesMap.values()).sort(
    (a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime()
  );
}

// ==========================================
// Access Requests Operations
// ==========================================
export async function saveAccessRequest(reqRecord: AccessRequestRecord): Promise<void> {
  if (pool) {
    try {
      await pool.query(
        `
        INSERT INTO access_requests (id, class_type, package_title, amount, currency, student_email, student_name, student_picture, utr, submitted_at, status, decided_at, decided_by, notes, review_notes, is_duplicate_utr)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE
        SET
          class_type = EXCLUDED.class_type,
          package_title = EXCLUDED.package_title,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          student_email = EXCLUDED.student_email,
          student_name = EXCLUDED.student_name,
          student_picture = EXCLUDED.student_picture,
          utr = EXCLUDED.utr,
          submitted_at = EXCLUDED.submitted_at,
          status = EXCLUDED.status,
          decided_at = EXCLUDED.decided_at,
          decided_by = EXCLUDED.decided_by,
          notes = EXCLUDED.notes,
          review_notes = EXCLUDED.review_notes,
          is_duplicate_utr = EXCLUDED.is_duplicate_utr;
      `,
        [
          reqRecord.id,
          reqRecord.classType,
          reqRecord.packageTitle,
          reqRecord.amount,
          reqRecord.currency || "INR",
          reqRecord.studentEmail.toLowerCase().trim(),
          reqRecord.studentName,
          reqRecord.studentPicture || null,
          reqRecord.utr.trim(),
          reqRecord.submittedAt || new Date().toISOString(),
          reqRecord.status,
          reqRecord.decidedAt || null,
          reqRecord.decidedBy || null,
          reqRecord.notes || null,
          reqRecord.reviewNotes || null,
          Boolean(reqRecord.isDuplicateUtr),
        ]
      );
      return;
    } catch (err: any) {
      console.error("[PostgreSQL Error in saveAccessRequest]:", err.message);
      throw err;
    }
  }

  localAccessRequestsMap.set(reqRecord.id, reqRecord);
  saveJsonMap(ACCESS_REQUESTS_FILE, localAccessRequestsMap);
}

export async function getAccessRequestById(id: string): Promise<AccessRequestRecord | null> {
  if (!id) return null;

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, class_type, package_title, amount, currency, student_email, student_name, student_picture, utr, submitted_at, status, decided_at, decided_by, notes, review_notes, is_duplicate_utr FROM access_requests WHERE id = $1 LIMIT 1;`,
        [id]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        classType: row.class_type,
        packageTitle: row.package_title,
        amount: Number(row.amount),
        currency: row.currency,
        studentEmail: row.student_email,
        studentName: row.student_name,
        studentPicture: row.student_picture || undefined,
        utr: row.utr,
        submittedAt: new Date(row.submitted_at).toISOString(),
        status: row.status,
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : undefined,
        decidedBy: row.decided_by || undefined,
        notes: row.notes || undefined,
        reviewNotes: row.review_notes || undefined,
        isDuplicateUtr: Boolean(row.is_duplicate_utr),
      };
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAccessRequestById]:", err.message);
      return null;
    }
  }

  return localAccessRequestsMap.get(id) || null;
}

export async function getAllAccessRequests(): Promise<AccessRequestRecord[]> {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, class_type, package_title, amount, currency, student_email, student_name, student_picture, utr, submitted_at, status, decided_at, decided_by, notes, review_notes, is_duplicate_utr FROM access_requests ORDER BY submitted_at DESC;`
      );
      return res.rows.map((row) => ({
        id: row.id,
        classType: row.class_type,
        packageTitle: row.package_title,
        amount: Number(row.amount),
        currency: row.currency,
        studentEmail: row.student_email,
        studentName: row.student_name,
        studentPicture: row.student_picture || undefined,
        utr: row.utr,
        submittedAt: new Date(row.submitted_at).toISOString(),
        status: row.status,
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : undefined,
        decidedBy: row.decided_by || undefined,
        notes: row.notes || undefined,
        reviewNotes: row.review_notes || undefined,
        isDuplicateUtr: Boolean(row.is_duplicate_utr),
      }));
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAllAccessRequests]:", err.message);
      return [];
    }
  }

  return Array.from(localAccessRequestsMap.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

export async function getAccessRequestsForStudent(
  email: string,
  classType?: "class-6" | "class-9"
): Promise<AccessRequestRecord[]> {
  const normEmail = email.toLowerCase().trim();
  if (!normEmail) return [];

  if (pool) {
    try {
      let query = `
        SELECT id, class_type, package_title, amount, currency, student_email, student_name, student_picture, utr, submitted_at, status, decided_at, decided_by, notes, review_notes, is_duplicate_utr
        FROM access_requests
        WHERE LOWER(student_email) = $1
      `;
      const params: any[] = [normEmail];
      if (classType) {
        query += ` AND class_type = $2`;
        params.push(classType);
      }
      query += ` ORDER BY submitted_at DESC;`;

      const res = await pool.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        classType: row.class_type,
        packageTitle: row.package_title,
        amount: Number(row.amount),
        currency: row.currency,
        studentEmail: row.student_email,
        studentName: row.student_name,
        studentPicture: row.student_picture || undefined,
        utr: row.utr,
        submittedAt: new Date(row.submitted_at).toISOString(),
        status: row.status,
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : undefined,
        decidedBy: row.decided_by || undefined,
        notes: row.notes || undefined,
        reviewNotes: row.review_notes || undefined,
        isDuplicateUtr: Boolean(row.is_duplicate_utr),
      }));
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAccessRequestsForStudent]:", err.message);
      return [];
    }
  }

  return Array.from(localAccessRequestsMap.values())
    .filter((r) => r.studentEmail.toLowerCase() === normEmail && (!classType || r.classType === classType))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export async function checkDuplicateUtr(
  utr: string,
  currentEmail: string,
  currentClass: "class-6" | "class-9"
): Promise<{ isDuplicate: boolean; existingRequestId?: string }> {
  const cleanedUtr = utr.trim().toLowerCase();
  const normEmail = currentEmail.toLowerCase().trim();

  if (pool) {
    try {
      const res = await pool.query(
        `
        SELECT id, student_email, class_type FROM access_requests
        WHERE LOWER(utr) = $1
        LIMIT 5;
      `,
        [cleanedUtr]
      );

      let isDuplicate = false;
      let existingRequestId: string | undefined = undefined;

      for (const row of res.rows) {
        if (row.student_email.toLowerCase() !== normEmail || row.class_type !== currentClass) {
          isDuplicate = true;
        }
        if (row.student_email.toLowerCase() === normEmail && row.class_type === currentClass) {
          existingRequestId = row.id;
        }
      }

      return { isDuplicate, existingRequestId };
    } catch (err: any) {
      console.error("[PostgreSQL Error in checkDuplicateUtr]:", err.message);
      return { isDuplicate: false };
    }
  }

  let isDuplicate = false;
  let existingRequestId: string | undefined = undefined;
  for (const [id, reqRecord] of localAccessRequestsMap.entries()) {
    if (
      reqRecord.utr.toLowerCase() === cleanedUtr &&
      (reqRecord.studentEmail.toLowerCase() !== normEmail || reqRecord.classType !== currentClass)
    ) {
      isDuplicate = true;
    }
    if (reqRecord.studentEmail.toLowerCase() === normEmail && reqRecord.classType === currentClass) {
      existingRequestId = id;
    }
  }

  return { isDuplicate, existingRequestId };
}

// ==========================================
// Admin Statistics Aggregation
// ==========================================
export async function getAdminStatsData(): Promise<{
  totalRevenue: number;
  totalPurchases: number;
  totalStudents: number;
  pendingRequestsCount: number;
  totalRequestsCount: number;
  class6PurchasesCount: number;
  class9PurchasesCount: number;
}> {
  if (pool) {
    try {
      const [purchasesRes, studentsCountRes, requestsRes] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status != 'revoked') as verified_count,
            COALESCE(SUM(amount) FILTER (WHERE status != 'revoked'), 0) as total_rev,
            COUNT(*) FILTER (WHERE status != 'revoked' AND class_type = 'class-6') as c6_count,
            COUNT(*) FILTER (WHERE status != 'revoked' AND class_type = 'class-9') as c9_count
          FROM purchases;
        `),
        pool.query(`SELECT COUNT(*) as count FROM students;`),
        pool.query(`
          SELECT
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_count
          FROM access_requests;
        `),
      ]);

      const pRow = purchasesRes.rows[0];
      const sRow = studentsCountRes.rows[0];
      const rRow = requestsRes.rows[0];

      return {
        totalRevenue: Number(pRow.total_rev) || 0,
        totalPurchases: Number(pRow.verified_count) || 0,
        totalStudents: Number(sRow.count) || 0,
        pendingRequestsCount: Number(rRow.pending_count) || 0,
        totalRequestsCount: Number(rRow.total_count) || 0,
        class6PurchasesCount: Number(pRow.c6_count) || 0,
        class9PurchasesCount: Number(pRow.c9_count) || 0,
      };
    } catch (err: any) {
      console.error("[PostgreSQL Error in getAdminStatsData]:", err.message);
      // Fallback
    }
  }

  const allPurchases = Array.from(localPurchasesMap.values());
  const verifiedPurchases = allPurchases.filter((p) => p.status !== "revoked");
  const totalRevenue = verifiedPurchases.reduce((acc, curr) => acc + (curr.amount || 99), 0);
  const allRequests = Array.from(localAccessRequestsMap.values());
  const pendingRequests = allRequests.filter((r) => r.status === "pending");

  return {
    totalRevenue,
    totalPurchases: verifiedPurchases.length,
    totalStudents: localStudentsMap.size,
    pendingRequestsCount: pendingRequests.length,
    totalRequestsCount: allRequests.length,
    class6PurchasesCount: verifiedPurchases.filter((p) => p.classType === "class-6").length,
    class9PurchasesCount: verifiedPurchases.filter((p) => p.classType !== "class-6").length,
  };
}
