const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "interest-list.json");
const TMP_DIR = path.join(__dirname, "data", "tmp");
const UPSCALE_SCRIPT = path.join(__dirname, "scripts", "upscale_image.py");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-5-mini";

const TUTOR_RATE_LIMIT = Number(process.env.TUTOR_RATE_LIMIT || 35);
const INTEREST_RATE_LIMIT = Number(process.env.INTEREST_RATE_LIMIT || 20);
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 10_000_000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const rateStore = new Map();

function log(message, meta = {}) {
  const line = {
    ts: new Date().toISOString(),
    level: "info",
    msg: message,
    ...meta,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

function logError(message, error, meta = {}) {
  const line = {
    ts: new Date().toISOString(),
    level: "error",
    msg: message,
    err: String(error?.message || error),
    ...meta,
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

function ensureFiles() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none';");
}

function sendJson(res, statusCode, payload) {
  applySecurityHeaders(res);
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] });
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function rateKey(ip, endpoint) {
  return `${endpoint}:${ip}`;
}

function checkRateLimit(ip, endpoint, max) {
  const now = Date.now();
  const key = rateKey(ip, endpoint);
  const existing = rateStore.get(key);

  if (!existing || now > existing.resetAt) {
    rateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: max - 1, resetAt: now + RATE_WINDOW_MS };
  }

  if (existing.count >= max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
}

function cleanRateStore() {
  const now = Date.now();
  for (const [key, value] of rateStore.entries()) {
    if (now > value.resetAt) {
      rateStore.delete(key);
    }
  }
}

function cleanupTmp() {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(filePath, { force: true });
      }
    }
  } catch (error) {
    logError("tmp-cleanup-failed", error);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return null;
  }

  const parts = dataUrl.split(",", 2);
  if (parts.length !== 2) {
    return null;
  }

  const header = parts[0];
  const base64 = parts[1];
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) {
    return null;
  }

  const mime = mimeMatch[1].toLowerCase();
  if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mime)) {
    return null;
  }

  return {
    mime,
    buffer: Buffer.from(base64, "base64"),
  };
}

function extensionFromMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function fallbackTutor(problem, mode, hadImage) {
  const cleaned = (problem || "").trim();

  if (!cleaned && !hadImage) {
    return "Please enter a math problem or upload a problem photo first.";
  }

  if (mode === "help") {
    return [
      "Hint-first coaching:",
      "1. Rewrite what is being asked in one sentence.",
      "2. Mark known values and unknown values.",
      "3. Pick one method, equation setup, substitution, factoring, or diagram.",
      "4. Do one transformation at a time and check each line.",
      "5. If stuck, reduce to a smaller example and copy the pattern.",
      hadImage ? "6. Photo received. With OPENAI_API_KEY, GPT can also read the image directly." : "6. Add an image for handwritten problems when available.",
    ].join("\n");
  }

  return [
    "Solve structure:",
    "1. Define variables.",
    "2. Build the equation from the prompt.",
    "3. Solve step by step.",
    "4. Verify by substitution/check constraints.",
    "5. Write final answer clearly.",
    "Tip: set OPENAI_API_KEY to enable GPT solving.",
  ].join("\n");
}

function runPythonUpscale(imageBuffer, extension) {
  const id = crypto.randomUUID();
  const inputPath = path.join(TMP_DIR, `${id}${extension}`);
  const outputPath = path.join(TMP_DIR, `${id}-upscaled.jpg`);

  fs.writeFileSync(inputPath, imageBuffer);

  const attempts = [
    ["python", [UPSCALE_SCRIPT, inputPath, outputPath, "2"]],
    ["py", ["-3", UPSCALE_SCRIPT, inputPath, outputPath, "2"]],
  ];

  let lastError = "";
  for (const [cmd, args] of attempts) {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status === 0 && fs.existsSync(outputPath)) {
      const out = fs.readFileSync(outputPath);
      fs.rmSync(inputPath, { force: true });
      fs.rmSync(outputPath, { force: true });
      return { ok: true, buffer: out, warning: null };
    }
    lastError = result.stderr || result.stdout || `${cmd} failed`;
  }

  fs.rmSync(inputPath, { force: true });
  fs.rmSync(outputPath, { force: true });
  return { ok: false, buffer: imageBuffer, warning: `Upscale skipped: ${lastError.trim()}` };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const chunks = [];
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) {
        continue;
      }
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          chunks.push(part.text);
        }
      }
    }
    if (chunks.length) {
      return chunks.join("\n").trim();
    }
  }

  return "";
}

async function callOpenAI(model, problem, mode, imageDataUrl) {
  const instructions = mode === "help"
    ? "You are a math tutor in Help Mode. Give hints, guiding questions, and one next-step check. Do not reveal final numeric answer unless user explicitly asks."
    : "You are a math tutor in Solve Mode. Provide a numbered step-by-step solution and final answer. Keep math notation clean and concise.";

  const userContent = [];
  if (problem && problem.trim()) {
    userContent.push({ type: "input_text", text: `Problem text: ${problem.trim()}` });
  }
  if (imageDataUrl) {
    userContent.push({ type: "input_image", image_url: imageDataUrl, detail: "high" });
  }
  if (!userContent.length) {
    userContent.push({ type: "input_text", text: "No problem text provided." });
  }

  const body = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: instructions }] },
      { role: "user", content: userContent },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }

  const data = await response.json();
  const message = extractOutputText(data);
  return message || "No model text returned.";
}

async function openAITutor(problem, mode, imageDataUrl) {
  if (!OPENAI_API_KEY) {
    return {
      message: fallbackTutor(problem, mode, Boolean(imageDataUrl)),
      model: "fallback",
      warning: "OPENAI_API_KEY not set. Using local tutor fallback.",
    };
  }

  try {
    const message = await callOpenAI(OPENAI_MODEL, problem, mode, imageDataUrl);
    return { message, model: OPENAI_MODEL, warning: null };
  } catch (primaryError) {
    if (OPENAI_MODEL !== FALLBACK_MODEL) {
      try {
        const message = await callOpenAI(FALLBACK_MODEL, problem, mode, imageDataUrl);
        return {
          message,
          model: FALLBACK_MODEL,
          warning: `Primary model ${OPENAI_MODEL} failed. Fallback used: ${String(primaryError.message || primaryError)}`,
        };
      } catch (secondaryError) {
        throw new Error(`Model failure. Primary: ${String(primaryError.message || primaryError)} | Fallback: ${String(secondaryError.message || secondaryError)}`);
      }
    }
    throw primaryError;
  }
}

async function handleTutor(req, res) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, "tutor", TUTOR_RATE_LIMIT);
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many tutor requests. Slow down and try again." });
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || "{}");

    const problem = typeof payload.problem === "string" ? payload.problem : "";
    const mode = payload.mode === "solve" ? "solve" : "help";
    const imageDataInput = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";

    let processedDataUrl = "";
    let warning = null;

    if (imageDataInput) {
      const parsed = parseDataUrl(imageDataInput);
      if (!parsed) {
        return sendJson(res, 400, { error: "Unsupported image format. Use PNG, JPG, or WEBP." });
      }

      const upscaled = runPythonUpscale(parsed.buffer, extensionFromMime(parsed.mime));
      processedDataUrl = `data:image/jpeg;base64,${upscaled.buffer.toString("base64")}`;
      warning = upscaled.warning;
    }

    const result = await openAITutor(problem, mode, processedDataUrl);
    sendJson(res, 200, {
      message: result.warning ? `${result.message}\n\n[System note] ${result.warning}` : result.message,
      mode,
      model: result.model,
      warning: warning || result.warning || null,
    });
  } catch (error) {
    logError("tutor-request-failed", error);
    sendJson(res, 500, { error: "Tutor request failed", detail: String(error.message || error) });
  }
}

async function handleInterest(req, res) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, "interest", INTEREST_RATE_LIMIT);
  if (!limit.allowed) {
    return sendJson(res, 429, { error: "Too many submissions. Try again in a minute." });
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || "{}");
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const studentName = typeof payload.studentName === "string" ? payload.studentName.trim() : "";

    if (!email || !email.includes("@")) {
      return sendJson(res, 400, { error: "Valid parent email is required" });
    }

    const list = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    list.push({
      email,
      studentName,
      submittedAt: new Date().toISOString(),
      source: "math-mvp",
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");

    sendJson(res, 200, { ok: true });
  } catch (error) {
    logError("interest-save-failed", error);
    sendJson(res, 500, { error: "Could not save interest", detail: String(error.message || error) });
  }
}

function serveStatic(req, res) {
  const requestPath = req.url.split("?")[0];
  const safeUrl = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safeUrl));
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    applySecurityHeaders(res);
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      applySecurityHeaders(res);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    };

    applySecurityHeaders(res);
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqId = crypto.randomUUID();
  const start = Date.now();

  if (req.method === "POST" && req.url === "/api/tutor") {
    handleTutor(req, res).finally(() => {
      log("request", { reqId, method: req.method, path: req.url, ms: Date.now() - start });
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/interest") {
    handleInterest(req, res).finally(() => {
      log("request", { reqId, method: req.method, path: req.url, ms: Date.now() - start });
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      env: NODE_ENV,
      model: OPENAI_MODEL,
      hasKey: Boolean(OPENAI_API_KEY),
      pythonUpscaleScript: fs.existsSync(UPSCALE_SCRIPT),
    });
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  applySecurityHeaders(res);
  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

ensureFiles();
setInterval(cleanRateStore, 30_000).unref();
setInterval(cleanupTmp, 15 * 60 * 1000).unref();

server.listen(PORT, () => {
  log("server-started", {
    url: `http://localhost:${PORT}`,
    env: NODE_ENV,
    model: OPENAI_MODEL,
    hasOpenAIKey: Boolean(OPENAI_API_KEY),
    pythonScriptFound: fs.existsSync(UPSCALE_SCRIPT),
  });
});
