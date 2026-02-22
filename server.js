import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // set to your Netlify URL in production
  methods: ["GET", "POST"],
}));

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
const rateLimitMap = new Map(); // ip → { count, resetAt }
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "20");     // requests per window
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW || "3600"); // window in seconds (1 hour)

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW * 1000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup old entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: process.env.DEFAULT_MODEL || "openrouter/auto",
    rateLimit: RATE_LIMIT,
    rateWindow: RATE_WINDOW,
  });
});

// ─── Main proxy endpoint ──────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  // Check API key is configured
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "Server not configured — missing API key." });
  }

  // Rate limit by IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: `Rate limit reached. Max ${RATE_LIMIT} requests per ${RATE_WINDOW / 3600}hr.` });
  }

  // Validate request body
  const { messages, temperature = 0.2 } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request — messages array required." });
  }

  // Use model from env or fallback to auto
  const model = process.env.DEFAULT_MODEL || "openrouter/auto";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "https://masterforge.app",
      },
      body: JSON.stringify({ model, messages, temperature }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`OpenRouter error ${response.status}:`, err);
      return res.status(response.status).json({ error: `AI service error: ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ MasterForge backend running on port ${PORT}`);
  console.log(`   Model: ${process.env.DEFAULT_MODEL || "openrouter/auto"}`);
  console.log(`   Rate limit: ${RATE_LIMIT} req / ${RATE_WINDOW}s`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL || "*"}`);
});
