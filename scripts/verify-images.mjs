import fs from "fs";
import path from "path";

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      results = results.concat(walk(p));
    } else {
      results.push(p);
    }
  }
  return results;
}

function isValidImageBuffer(buf) {
  if (!buf || buf.length < 16) return false;
  const headStr = buf.subarray(0, 64).toString("utf8").trimStart().toLowerCase();
  if (headStr.startsWith("<!doctype") || headStr.startsWith("<html")) {
    return false;
  }
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
  const isGif = buf.subarray(0, 4).toString("ascii") === "GIF8";
  const isSvg = headStr.includes("<svg") || headStr.startsWith("<?xml");
  const isIco = buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00;

  return isPng || isJpeg || isWebp || isGif || isSvg || isIco;
}

const files = [...walk("src"), "index.html"];
const imagePaths = new Map();

const rx = /["'`]((?:\/lovable-uploads\/|\/assets\/)[^"'`\s{}]+\.(?:png|jpg|jpeg|webp|svg|gif|ico))["'`]/gi;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  let m;
  while ((m = rx.exec(content)) !== null) {
    const s = m[1];
    if (!imagePaths.has(s)) imagePaths.set(s, []);
    if (!imagePaths.get(s).includes(file)) imagePaths.get(s).push(file);
  }
}

let validCount = 0;
const errors = [];

for (const [imgPath, refs] of Array.from(imagePaths.entries()).sort()) {
  const localPath = path.join("public", imgPath);
  if (!fs.existsSync(localPath)) {
    errors.push(`[MISSING] ${imgPath} (referenced in ${refs.join(", ")})`);
    continue;
  }
  const buf = fs.readFileSync(localPath);
  if (!isValidImageBuffer(buf)) {
    errors.push(`[INVALID IMAGE BINARY] ${imgPath} (${buf.length}B, referenced in ${refs.join(", ")})`);
    continue;
  }
  validCount++;
}

if (errors.length > 0) {
  console.error("Image verification failed:");
  for (const err of errors) console.error("  " + err);
  process.exit(1);
}

console.log(`✓ Verified all ${validCount} local image assets across src/ and index.html (0 missing, 0 corrupted).`);
