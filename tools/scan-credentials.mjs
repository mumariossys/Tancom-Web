import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

// Reports only filenames and categories, never matched credential values.
const root = path.resolve(process.argv[2] ?? ".");
const skipped = new Set(["node_modules", ".git", ".expo", ".metro-cache", "dist", "build", "coverage"]);
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["clerk-secret", /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ["openai-secret", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["database-password-url", /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s@]+@/],
  ["google-api-key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ["twilio-auth-assignment", /(?:TWILIO_AUTH_TOKEN|twilioAuthToken)\s*[:=]\s*["'][a-f0-9]{32}["']/i],
  ["jwt-token", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ["real-clerk-publishable-key", /\bpk_(?:test|live)_[A-Za-z0-9+/=]{24,}/],
  ["sensitive-assignment", /(?:api[_-]?key|api[_-]?secret|client[_-]?secret|secret[_-]?key|private[_-]?key|auth[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{20,}["']/i],
];
const sensitive = /(^|\/)\.env(?:$|\.)|\.(?:p8|pem|key|p12|pfx|cer|cert|crt|der|csr|p7b|p7c|keystore|jks|mobileprovision|provisionprofile)$|(^|\/)(?:[^/]*credentials[^/]*\.json|secrets(?:\.[^/]+)?\.json|service[-_]?account[^/]*\.json|google-services\.json|GoogleService-Info\.plist|\.netrc|id_rsa[^/]*|id_ed25519[^/]*)$/i;
const findings = [];
let files = 0, archiveMembers = 0, bytes = 0;
function check(name, buffer, depth = 0) {
  files++; bytes += buffer.length;
  if (sensitive.test(name) && !/(^|\/)\.env\.example$/.test(name)) findings.push({ path: name, category: "sensitive-filename" });
  const text = buffer.toString("utf8");
  for (const [category, expression] of patterns) if (expression.test(text)) findings.push({ path: name, category });
  if (!name.endsWith(".zip")) return;
  if (depth > 4) throw new Error("Nested archive depth exceeded: " + name);
  // Read central-directory sizes, so entries with ZIP data descriptors work too.
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Invalid ZIP: " + name);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (count === 65535 || offset === 0xffffffff) throw new Error("ZIP64 requires a separate scanner: " + name);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP directory: " + name);
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20), rawSize = buffer.readUInt32LE(offset + 24);
    const length = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const member = buffer.subarray(offset + 46, offset + 46 + length).toString("utf8");
    offset += 46 + length + extra + comment;
    if (flags & 1 || member.startsWith("/") || member.split(/[\\/]/).includes("..")) throw new Error("Unsafe ZIP member: " + name);
    if (member.endsWith("/")) continue;
    if (rawSize > 128 * 1024 * 1024) throw new Error("ZIP member exceeds scan limit: " + name);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid local ZIP header: " + name);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 128 * 1024 * 1024 }) : null;
    if (!data || data.length !== rawSize) throw new Error("Unsupported or malformed ZIP member: " + name);
    archiveMembers++;
    check(name + "!" + member, data, depth + 1);
  }
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name), name = path.relative(root, full).split(path.sep).join("/");
    if (entry.isSymbolicLink()) { findings.push({ path: name, category: "unexpected-symlink" }); continue; }
    if (entry.isDirectory()) { if (!skipped.has(entry.name)) walk(full); continue; }
    if (entry.isFile()) check(name, fs.readFileSync(full));
  }
}
walk(root);
console.log(JSON.stringify({
  status: findings.length ? "FAIL" : "PASS", filesScannedIncludingArchiveMembers: files,
  archiveMembersScanned: archiveMembers, bytesScanned: bytes, findings,
  excludedDirectories: [...skipped],
  limitation: "Heuristic filename and credential-pattern detection, not a complete security audit. All distributed files, binary assets and nested source ZIP members are inspected; unsupported archives fail closed.",
}, null, 2));
process.exitCode = findings.length ? 1 : 0;
