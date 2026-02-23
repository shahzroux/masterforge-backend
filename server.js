import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS — open untuk semua origin ──────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "20");
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW || "3600");

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const hasKey = !!process.env.OPENROUTER_API_KEY;
  res.json({
    status: hasKey ? "ok" : "misconfigured",
    apiKey: hasKey ? process.env.OPENROUTER_API_KEY.slice(0, 10) + "..." : "NOT SET",
    model: process.env.DEFAULT_MODEL || "openrouter/auto",
    rateLimit: RATE_LIMIT,
  });
});

// ─── Debug — test OpenRouter connection terus ─────────────────────────────────
app.get("/debug", async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not set" });
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEFAULT_MODEL || "openrouter/auto",
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: "OpenRouter rejected", detail: data });
    }
    res.json({ status: "ok", model_used: data.model, reply: data.choices?.[0]?.message?.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Main proxy ───────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "Server not configured — missing API key." });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: `Rate limit reached. Max ${RATE_LIMIT} req/hr.` });
  }

  const { messages, temperature = 0.2 } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request — messages array required." });
  }

  const model = process.env.DEFAULT_MODEL || "openrouter/auto";

  try {
    console.log(`[analyze] model=${model} ip=${ip}`);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "https://masterforge.app",
        "X-Title": "MasterForge",
      },
      body: JSON.stringify({ model, messages, temperature }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[analyze] OpenRouter ${response.status}:`, JSON.stringify(data));
      return res.status(response.status).json({
        error: `AI error ${response.status}: ${data?.error?.message || JSON.stringify(data)}`
      });
    }

    console.log(`[analyze] OK — model: ${data.model}`);
    res.json(data);

  } catch (err) {
    console.error("[analyze] Error:", err.message);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ MasterForge backend on port ${PORT}`);
  console.log(`   API Key: ${process.env.OPENROUTER_API_KEY ? "SET ✓" : "MISSING ✗"}`);
  console.log(`   Model: ${process.env.DEFAULT_MODEL || "openrouter/auto"}`);
  console.log(`   Test connection: GET /debug\n`);
});
