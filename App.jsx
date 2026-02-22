import { useState, useRef, useEffect, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const MODELS = [
  { id: "openrouter/auto", name: "Auto (Best Free)", color: "#00ff88" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", color: "#4db8ff" },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash", color: "#ff6b6b" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", color: "#ffb347" },
];

const GENRES = ["Auto Detect", "Pop", "Hip Hop", "EDM", "Rock", "Jazz", "Lo-Fi", "Classical", "Metal", "R&B"];

// ─── Waveform + Seekable Player ──────────────────────────────────────────────
function WaveformPlayer({ audioBuffer, color = "#00ff88", isProcessing = false, label = "" }) {
  const canvasRef = useRef();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const sourceRef = useRef(null);
  const audioCtxRef = useRef(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const rafRef = useRef(null);
  const duration = audioBuffer ? audioBuffer.duration : 0;

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!audioBuffer) {
      ctx.strokeStyle = color + "22";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      return;
    }
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const amp = H / 2;
    const playedX = Math.floor(progress * W);
    for (let i = 0; i < W; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const d = data[i * step + j] || 0;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      ctx.strokeStyle = i < playedX ? color : color + "33";
      ctx.lineWidth = i < playedX ? 1.5 : 1;
      ctx.shadowBlur = i < playedX ? 4 : 0;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(i, amp + min * amp * 0.88);
      ctx.lineTo(i, amp + max * amp * 0.88);
      ctx.stroke();
    }
    if (progress > 0) {
      ctx.strokeStyle = "#ffffffcc";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 6;
      ctx.shadowColor = "#fff";
      ctx.beginPath();
      ctx.moveTo(playedX, 0);
      ctx.lineTo(playedX, H);
      ctx.stroke();
    }
  }, [audioBuffer, color, progress]);

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startTimeRef.current;
    const offset = startOffsetRef.current + elapsed;
    const dur = audioBuffer ? audioBuffer.duration : 1;
    const prog = Math.min(1, offset / dur);
    setProgress(prog);
    setCurrentTime(offset);
    if (prog < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      startOffsetRef.current = 0;
    }
  }, [audioBuffer]);

  const play = (offsetSeconds = null) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch {} }
    cancelAnimationFrame(rafRef.current);
    const startAt = offsetSeconds !== null ? offsetSeconds : startOffsetRef.current;
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.start(0, startAt);
    sourceRef.current = src;
    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = startAt;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch {} }
    cancelAnimationFrame(rafRef.current);
    const ctx = audioCtxRef.current;
    if (ctx) {
      const elapsed = ctx.currentTime - startTimeRef.current;
      startOffsetRef.current = startOffsetRef.current + elapsed;
    }
    setIsPlaying(false);
  };

  const stop = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch {} }
    cancelAnimationFrame(rafRef.current);
    startOffsetRef.current = 0;
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const seekTo = (ratio) => {
    const s = ratio * (audioBuffer ? audioBuffer.duration : 0);
    startOffsetRef.current = s;
    setProgress(ratio);
    setCurrentTime(s);
    if (isPlaying) play(s);
  };

  const handleCanvasClick = (e) => {
    if (!audioBuffer) return;
    const rect = canvasRef.current.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const handleSeekBarClick = (e) => {
    if (!audioBuffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {label && <div style={{ color, fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>{label}</div>}
      <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", background: "#0a0a18", cursor: audioBuffer ? "crosshair" : "default" }}
        onClick={handleCanvasClick}>
        <canvas ref={canvasRef} width={560} height={72} style={{ width: "100%", height: "72px", display: "block" }} />
        {isProcessing && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,255,136,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "#00ff88", fontFamily: "'DM Mono', monospace", fontSize: "10px", letterSpacing: "2px", animation: "blink 1s ease-in-out infinite" }}>PROCESSING...</div>
          </div>
        )}
      </div>
      {audioBuffer && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button className="btn-play" onClick={() => isPlaying ? pause() : play()} style={{ minWidth: "34px", padding: "5px 9px", fontSize: "13px" }}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="btn-play" onClick={stop} style={{ minWidth: "34px", padding: "5px 9px", fontSize: "13px", opacity: (isPlaying || progress > 0) ? 1 : 0.3 }}>
            ⏹
          </button>
          <div style={{ flex: 1, position: "relative", height: "4px", background: "#1a1a2e", borderRadius: "2px", cursor: "pointer" }}
            onClick={handleSeekBarClick}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: color, borderRadius: "2px", boxShadow: `0 0 6px ${color}66` }} />
            <div style={{ position: "absolute", top: "50%", left: `${progress * 100}%`, transform: "translate(-50%, -50%)", width: "11px", height: "11px", borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, border: "2px solid #080810" }} />
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#555577", minWidth: "72px", textAlign: "right" }}>
            {fmt(currentTime)} / {fmt(duration)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Meter Bar ────────────────────────────────────────────────────────────────
function MeterBar({ label, value, color = "#00ff88", unit = "%" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "9px", color: "#555577", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
        <span style={{ fontSize: "9px", color, fontFamily: "'DM Mono', monospace" }}>{typeof value === "number" ? value.toFixed(1) : value}{unit}</span>
      </div>
      <div style={{ height: "4px", background: "#1a1a2e", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: "2px",
          transition: "width 0.6s ease",
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}

// ─── Knob ─────────────────────────────────────────────────────────────────────
function Knob({ label, value, onChange, min = 0, max = 100, step = 1, unit = "" }) {
  const angle = ((value - min) / (max - min)) * 270 - 135;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
      <div style={{
        width: "48px", height: "48px", borderRadius: "50%",
        background: "linear-gradient(145deg, #1a1a2e, #0d0d1a)",
        border: "2px solid #2a2a4a", position: "relative", cursor: "pointer",
        boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          width: "18px", height: "2px", background: "#00ff88",
          transformOrigin: "0 50%",
          transform: `translate(0, -50%) rotate(${angle}deg)`,
          borderRadius: "2px", boxShadow: "0 0 8px #00ff88",
        }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "#00ff88", fontFamily: "'DM Mono', monospace" }}>{value}{unit}</div>
        <div style={{ fontSize: "9px", color: "#444466", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// ─── Spectrum Analyzer ───────────────────────────────────────────────────────
function SpectrumAnalyzer({ audioBuffer, color = "#00ff88", active = false }) {
  const canvasRef = useRef();
  const rafRef = useRef();
  const analyserRef = useRef();
  const sourceRef = useRef();
  const ctxRef = useRef();

  useEffect(() => {
    if (!audioBuffer || !active) {
      cancelAnimationFrame(rafRef.current);
      // Draw static spectrum from buffer
      const canvas = canvasRef.current;
      if (!canvas || !audioBuffer) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const data = audioBuffer.getChannelData(0);
      const fftSize = 2048;
      const bins = fftSize / 2;
      // Rough static FFT approximation using sample chunks
      const barW = W / 80;
      for (let i = 0; i < 80; i++) {
        const start = Math.floor((i / 80) * data.length * 0.5);
        let sum = 0;
        for (let j = 0; j < 256; j++) sum += Math.abs(data[start + j] || 0);
        const avg = sum / 256;
        const h = Math.min(H - 4, avg * H * 8);
        const alpha = 0.3 + (i / 80) * 0.3;
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.fillRect(i * (W / 80), H - h, barW - 1, h);
      }
      return;
    }

    // Live mode
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const audioCtx = ctxRef.current;
    if (audioCtx.state === "suspended") audioCtx.resume();

    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); sourceRef.current.stop(); } catch {}
    }

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.loop = true;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    src.start(0);
    sourceRef.current = src;

    const dataArr = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArr);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const bars = 80;
      const barW = W / bars;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * dataArr.length * 0.7);
        const v = dataArr[idx] / 255;
        const h = v * (H - 4);
        const hue = 140 - v * 100;
        ctx.fillStyle = `hsla(${hue}, 100%, 55%, ${0.4 + v * 0.6})`;
        ctx.fillRect(i * barW, H - h, barW - 1.5, h);
        // Peak dot
        ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.9)`;
        ctx.fillRect(i * barW, H - h - 2, barW - 1.5, 2);
      }
      // Frequency labels
      ctx.fillStyle = "#333355";
      ctx.font = "8px DM Mono, monospace";
      const freqLabels = ["100", "1k", "10k"];
      const freqPos = [0.08, 0.4, 0.85];
      freqLabels.forEach((lbl, i) => ctx.fillText(lbl, freqPos[i] * W, H - 2));
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { src.stop(); src.disconnect(); } catch {}
      try { analyser.disconnect(); } catch {}
    };
  }, [audioBuffer, active, color]);

  return (
    <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", background: "#060610" }}>
      <canvas ref={canvasRef} width={560} height={100} style={{ width: "100%", height: "100px", display: "block" }} />
      {!audioBuffer && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#1a1a3a", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "2px" }}>NO SIGNAL</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // State
  const [backendUrl, setBackendUrl] = useState(
    () => localStorage.getItem("mf_backend_url") || import.meta.env.VITE_BACKEND_URL || ""
  );
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [backendStatus, setBackendStatus] = useState("unknown"); // "ok" | "error" | "unknown"
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [selectedGenre, setSelectedGenre] = useState("Auto Detect");
  const [activeTab, setActiveTab] = useState("main");

  const [audioFile, setAudioFile] = useState(null);
  const [refFile, setRefFile] = useState(null);
  const [refBuffer, setRefBuffer] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [masteredBuffer, setMasteredBuffer] = useState(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState("");

  // Processing params (AI will set these, user can override)
  const [intensity, setIntensity] = useState(70);
  const [eqLow, setEqLow] = useState(0);       // dB, -12 to +12
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(2);
  const [compThreshold, setCompThreshold] = useState(-18); // dB
  const [compRatio, setCompRatio] = useState(4);
  const [compAttack, setCompAttack] = useState(10);  // ms
  const [compRelease, setCompRelease] = useState(150); // ms
  const [limiterCeiling, setLimiterCeiling] = useState(-1); // dBTP
  const [stereoWidth, setStereoWidth] = useState(100); // %

  // Multiband compression state
  const [mbLowThresh, setMbLowThresh] = useState(-24);
  const [mbLowRatio, setMbLowRatio] = useState(3);
  const [mbMidThresh, setMbMidThresh] = useState(-20);
  const [mbMidRatio, setMbMidRatio] = useState(4);
  const [mbHighThresh, setMbHighThresh] = useState(-18);
  const [mbHighRatio, setMbHighRatio] = useState(5);
  const [multibandEnabled, setMultibandEnabled] = useState(false);

  // A/B state
  const [abMode, setAbMode] = useState("mastered"); // "original" | "mastered"

  // Platform LUFS targets
  const [targetPlatform, setTargetPlatform] = useState("spotify");

  // Presets
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mf_presets") || "[]"); } catch { return []; }
  });
  const [presetName, setPresetName] = useState("");
  const [showPresetSave, setShowPresetSave] = useState(false);

  // Refs
  const fileInputRef = useRef();
  const refInputRef = useRef();
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // ─── Load Audio File ───────────────────────────────────────────────────────
  const loadAudioFile = async (file, isRef = false) => {
    try {
      const ctx = getAudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      if (isRef) {
        setRefFile(file);
        setRefBuffer(decoded);
      } else {
        setAudioFile(file);
        setAudioBuffer(decoded);
        setMasteredBuffer(null);
        setAnalysis(null);
      }
    } catch (e) {
      setStatus("Error loading audio file.");
    }
  };

  const handleUpload = (e, isRef = false) => {
    const file = e.target.files[0];
    if (file) loadAudioFile(file, isRef);
  };

  // ─── Analyse Audio (real data) ─────────────────────────────────────────────
  const getRealAudioStats = (buffer) => {
    const data = buffer.getChannelData(0);
    let rms = 0, peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      rms += data[i] * data[i];
      if (abs > peak) peak = abs;
    }
    rms = Math.sqrt(rms / data.length);
    const lufs = 20 * Math.log10(rms) - 0.691; // approximate
    const peakDb = 20 * Math.log10(peak);
    const dynamicRange = peakDb - (20 * Math.log10(rms));
    return {
      lufs: Math.round(lufs * 10) / 10,
      peak: Math.round(peakDb * 10) / 10,
      dynamicRange: Math.round(dynamicRange * 10) / 10,
      duration: Math.round(buffer.duration),
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
  };

  // ─── AI Analysis ──────────────────────────────────────────────────────────
  const analyzeWithAI = async () => {
    if (!audioBuffer || !backendUrl) return;
    setIsAnalyzing(true);
    setStatus("Analyzing with AI...");

    const stats = getRealAudioStats(audioBuffer);
    const genre = selectedGenre === "Auto Detect" ? "unknown" : selectedGenre;

    const prompt = `You are a professional mastering engineer AI. Analyze this audio and provide exact processing parameters.

Audio stats:
- Filename: ${audioFile.name}
- LUFS: ${stats.lufs} dB
- Peak: ${stats.peak} dBFS  
- Dynamic Range: ${stats.dynamicRange} dB
- Duration: ${stats.duration}s
- Sample Rate: ${stats.sampleRate}Hz
- Channels: ${stats.channels}
- Genre: ${genre}
${refFile ? `- Reference track: ${refFile.name}` : ""}

Respond ONLY with valid JSON, no markdown:
{
  "genre": "detected genre",
  "summary": "2 sentence professional assessment",
  "issues": ["issue 1", "issue 2"],
  "params": {
    "intensity": 70,
    "eqLow": 1.5,
    "eqMid": -0.5,
    "eqHigh": 2.0,
    "compThreshold": -18,
    "compRatio": 4,
    "compAttack": 10,
    "compRelease": 150,
    "limiterCeiling": -1,
    "stereoWidth": 110
  },
  "meters": {
    "lufs": ${Math.min(100, Math.max(0, (stats.lufs + 30) * 3.33))},
    "dynamic": ${Math.min(100, stats.dynamicRange * 4)},
    "stereo": 72,
    "clarity": 65
  },
  "recommendations": {
    "eq": "specific EQ advice",
    "compression": "specific compression advice",
    "limiting": "specific limiting advice"
  }
}`;

    try {
      if (!backendUrl) throw new Error("Backend URL not set — click '+ Backend URL' to configure");

      const res = await fetch(`${backendUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Backend error:", res.status, errText);
        throw new Error(`Backend error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      console.log("OpenRouter raw response:", JSON.stringify(data, null, 2));

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from model");

      console.log("Model text output:", text);

      // Try multiple parse strategies
      let parsed = null;

      // Strategy 1: Direct JSON parse
      try { parsed = JSON.parse(text.trim()); } catch {}

      // Strategy 2: Strip markdown fences
      if (!parsed) {
        try {
          const clean = text.replace(/^```[\w]*\n?/m, "").replace(/```$/m, "").trim();
          parsed = JSON.parse(clean);
        } catch {}
      }

      // Strategy 3: Extract first { ... } block
      if (!parsed) {
        try {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch {}
      }

      if (!parsed) throw new Error("Could not parse JSON from model response");

      setAnalysis(parsed);

      // Apply AI-suggested params
      if (parsed.params) {
        const p = parsed.params;
        if (p.intensity !== undefined) setIntensity(p.intensity);
        if (p.eqLow !== undefined) setEqLow(p.eqLow);
        if (p.eqMid !== undefined) setEqMid(p.eqMid);
        if (p.eqHigh !== undefined) setEqHigh(p.eqHigh);
        if (p.compThreshold !== undefined) setCompThreshold(p.compThreshold);
        if (p.compRatio !== undefined) setCompRatio(p.compRatio);
        if (p.compAttack !== undefined) setCompAttack(p.compAttack);
        if (p.compRelease !== undefined) setCompRelease(p.compRelease);
        if (p.limiterCeiling !== undefined) setLimiterCeiling(p.limiterCeiling);
        if (p.stereoWidth !== undefined) setStereoWidth(p.stereoWidth);
      }

      setStatus("Analysis complete! Ready to master.");
      setActiveTab("analysis");
    } catch (err) {
      // Fallback with real stats
      console.error("Analysis error:", err);
      const realStats = getRealAudioStats(audioBuffer);
      setAnalysis({
        genre: genre === "unknown" ? "Pop" : genre,
        summary: `Track: LUFS ${realStats.lufs}dB, Peak ${realStats.peak}dBFS. Error: ${err.message}. Using default settings.`,
        issues: ["Error: " + err.message, "Check F12 Console for details"],
        params: { intensity: 70, eqLow: 1, eqMid: 0, eqHigh: 2, compThreshold: -18, compRatio: 4, compAttack: 10, compRelease: 150, limiterCeiling: -1, stereoWidth: 100 },
        meters: {
          lufs: Math.min(100, Math.max(0, (realStats.lufs + 30) * 3.33)),
          dynamic: Math.min(100, realStats.dynamicRange * 4),
          stereo: 72, clarity: 65,
        },
        recommendations: {
          eq: "Gentle low shelf at 80Hz, high shelf boost at 12kHz",
          compression: `${compRatio}:1 ratio, ${compAttack}ms attack, ${compRelease}ms release`,
          limiting: `Ceiling at ${limiterCeiling}dBTP for streaming compliance`,
        }
      });
      setStatus("Error: " + err.message.slice(0, 60) + " — check F12 console");
    }
    setIsAnalyzing(false);
  };

  // ─── Real Audio Processing ─────────────────────────────────────────────────
  const processMastering = useCallback(async () => {
    if (!audioBuffer) return;
    setIsProcessing(true);
    setStatus("Processing audio...");
    await new Promise(r => setTimeout(r, 100));

    try {
      const ctx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // ── EQ ──
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf"; lowShelf.frequency.value = 80;
      lowShelf.gain.value = eqLow * (intensity / 100);

      const midPeak = ctx.createBiquadFilter();
      midPeak.type = "peaking"; midPeak.frequency.value = 1000; midPeak.Q.value = 1;
      midPeak.gain.value = eqMid * (intensity / 100);

      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf"; highShelf.frequency.value = 8000;
      highShelf.gain.value = eqHigh * (intensity / 100);

      let lastNode;

      if (multibandEnabled) {
        // ── Multiband Compression ──
        // Split into 3 bands using crossover filters
        const XLOW = 200, XHIGH = 5000;

        // Low band: lowpass
        const lpLow = ctx.createBiquadFilter(); lpLow.type = "lowpass"; lpLow.frequency.value = XLOW; lpLow.Q.value = 0.7;
        const lpLow2 = ctx.createBiquadFilter(); lpLow2.type = "lowpass"; lpLow2.frequency.value = XLOW; lpLow2.Q.value = 0.7;
        // Mid band: bandpass via HP+LP
        const hpMid = ctx.createBiquadFilter(); hpMid.type = "highpass"; hpMid.frequency.value = XLOW; hpMid.Q.value = 0.7;
        const lpMid = ctx.createBiquadFilter(); lpMid.type = "lowpass"; lpMid.frequency.value = XHIGH; lpMid.Q.value = 0.7;
        // High band: highpass
        const hpHigh = ctx.createBiquadFilter(); hpHigh.type = "highpass"; hpHigh.frequency.value = XHIGH; hpHigh.Q.value = 0.7;
        const hpHigh2 = ctx.createBiquadFilter(); hpHigh2.type = "highpass"; hpHigh2.frequency.value = XHIGH; hpHigh2.Q.value = 0.7;

        // Compressors per band
        const compLow = ctx.createDynamicsCompressor();
        compLow.threshold.value = mbLowThresh; compLow.ratio.value = mbLowRatio;
        compLow.attack.value = 0.02; compLow.release.value = 0.2; compLow.knee.value = 6;

        const compMid = ctx.createDynamicsCompressor();
        compMid.threshold.value = mbMidThresh; compMid.ratio.value = mbMidRatio;
        compMid.attack.value = 0.01; compMid.release.value = 0.15; compMid.knee.value = 6;

        const compHigh = ctx.createDynamicsCompressor();
        compHigh.threshold.value = mbHighThresh; compHigh.ratio.value = mbHighRatio;
        compHigh.attack.value = 0.005; compHigh.release.value = 0.1; compHigh.knee.value = 6;

        // Merger
        const merger = ctx.createGain();

        // EQ chain → split
        source.connect(lowShelf); lowShelf.connect(midPeak); midPeak.connect(highShelf);

        // Low path
        highShelf.connect(lpLow); lpLow.connect(lpLow2); lpLow2.connect(compLow); compLow.connect(merger);
        // Mid path
        highShelf.connect(hpMid); hpMid.connect(lpMid); lpMid.connect(compMid); compMid.connect(merger);
        // High path
        highShelf.connect(hpHigh); hpHigh.connect(hpHigh2); hpHigh2.connect(compHigh); compHigh.connect(merger);

        lastNode = merger;
      } else {
        // ── Standard single-band compressor ──
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = compThreshold;
        compressor.ratio.value = compRatio;
        compressor.attack.value = compAttack / 1000;
        compressor.release.value = compRelease / 1000;
        compressor.knee.value = 6;

        source.connect(lowShelf); lowShelf.connect(midPeak); midPeak.connect(highShelf);
        highShelf.connect(compressor);
        lastNode = compressor;
      }

      // ── Makeup Gain ──
      const gainNode = ctx.createGain();
      const makeupGain = Math.abs(compThreshold) * (1 - 1 / compRatio) * 0.5 * (intensity / 100);
      gainNode.gain.value = Math.pow(10, makeupGain / 20);
      lastNode.connect(gainNode);

      // ── Limiter ──
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = limiterCeiling;
      limiter.ratio.value = 20; limiter.attack.value = 0.001;
      limiter.release.value = 0.05; limiter.knee.value = 0;
      gainNode.connect(limiter);
      limiter.connect(ctx.destination);

      source.start(0);
      const rendered = await ctx.startRendering();
      setMasteredBuffer(rendered);
      setAbMode("mastered");
      setStatus("Mastering complete! Press play to preview.");
    } catch (e) {
      setStatus("Processing error: " + e.message);
    }
    setIsProcessing(false);
  }, [audioBuffer, intensity, eqLow, eqMid, eqHigh, compThreshold, compRatio, compAttack, compRelease, limiterCeiling, multibandEnabled, mbLowThresh, mbLowRatio, mbMidThresh, mbMidRatio, mbHighThresh, mbHighRatio]);

  // ─── Playback ──────────────────────────────────────────────────────────────


  // ─── Export State ─────────────────────────────────────────────────────────
  const [exportFormat, setExportFormat] = useState("wav24");
  const [exportSampleRate, setExportSampleRate] = useState(44100);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // ─── Load lamejs for MP3 encoding ─────────────────────────────────────────
  useEffect(() => {
    if (window.lamejs) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // ─── Check backend health ──────────────────────────────────────────────────
  const checkBackend = async (url = backendUrl) => {
    if (!url) return;
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) { setBackendStatus("ok"); }
      else { setBackendStatus("error"); }
    } catch { setBackendStatus("error"); }
  };

  useEffect(() => { if (backendUrl) checkBackend(); }, []);

  // ─── Resample Buffer ───────────────────────────────────────────────────────
  const resampleBuffer = async (buffer, targetSR) => {
    if (buffer.sampleRate === targetSR) return buffer;
    const offCtx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * targetSR), targetSR);
    const src = offCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(offCtx.destination);
    src.start(0);
    return await offCtx.startRendering();
  };

  // ─── Build WAV ─────────────────────────────────────────────────────────────
  const buildWAV = (buffer, bitDepth = 16) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = bitDepth / 8;
    const length = buffer.length * numChannels * bytesPerSample;
    const ab = new ArrayBuffer(44 + length);
    const view = new DataView(ab);
    const ws = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    ws(0, "RIFF"); view.setUint32(4, 36 + length, true); ws(8, "WAVE");
    ws(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // IEEE float for 32-bit
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitDepth, true);
    ws(36, "data"); view.setUint32(40, length, true);
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        if (bitDepth === 16) { view.setInt16(offset, s * 0x7fff, true); offset += 2; }
        else if (bitDepth === 24) {
          const v = Math.max(-8388608, Math.min(8388607, Math.round(s * 8388607)));
          view.setUint8(offset, v & 0xff);
          view.setUint8(offset + 1, (v >> 8) & 0xff);
          view.setUint8(offset + 2, (v >> 16) & 0xff);
          offset += 3;
        }
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  };

  // ─── Encode MP3 via lamejs ─────────────────────────────────────────────────
  const buildMP3 = async (buffer, kbps = 320) => {
    return new Promise((resolve, reject) => {
      if (!window.lamejs) { reject(new Error("lamejs not loaded")); return; }
      const numChannels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const mp3enc = new window.lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
      const blockSize = 1152;
      const mp3Data = [];
      const left = new Int16Array(buffer.length);
      const right = numChannels > 1 ? new Int16Array(buffer.length) : null;
      const lchan = buffer.getChannelData(0);
      const rchan = numChannels > 1 ? buffer.getChannelData(1) : null;
      for (let i = 0; i < buffer.length; i++) {
        left[i] = Math.max(-32768, Math.min(32767, Math.round(lchan[i] * 32767)));
        if (right) right[i] = Math.max(-32768, Math.min(32767, Math.round(rchan[i] * 32767)));
      }
      for (let i = 0; i < buffer.length; i += blockSize) {
        const lChunk = left.subarray(i, i + blockSize);
        const mp3buf = right
          ? mp3enc.encodeBuffer(lChunk, right.subarray(i, i + blockSize))
          : mp3enc.encodeBuffer(lChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
      }
      const final = mp3enc.flush();
      if (final.length > 0) mp3Data.push(final);
      resolve(new Blob(mp3Data, { type: "audio/mp3" }));
    });
  };

  // ─── Master Export ─────────────────────────────────────────────────────────
  const exportAudio = async () => {
    const buffer = masteredBuffer || audioBuffer;
    if (!buffer) return;
    setIsExporting(true);
    setExportProgress(10);
    const baseName = audioFile?.name?.replace(/\.[^.]+$/, "") || "track";
    try {
      setExportProgress(30);
      const resampled = await resampleBuffer(buffer, exportSampleRate);
      setExportProgress(60);
      let blob, filename;
      if (exportFormat === "wav24") {
        blob = buildWAV(resampled, 24);
        filename = `${baseName}_mastered_24bit_${exportSampleRate / 1000}k.wav`;
      } else if (exportFormat === "wav16") {
        blob = buildWAV(resampled, 16);
        filename = `${baseName}_mastered_16bit_${exportSampleRate / 1000}k.wav`;
      } else if (exportFormat === "mp3") {
        setExportProgress(65);
        blob = await buildMP3(resampled, 320);
        filename = `${baseName}_mastered_320kbps.mp3`;
      }
      setExportProgress(90);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setExportProgress(100);
      setTimeout(() => { setIsExporting(false); setExportProgress(0); }, 800);
    } catch (e) {
      setStatus("Export error: " + e.message);
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Keep old exportWAV for mastered waveform inline button
  const exportWAV = () => exportAudio();

  // ─── Platform LUFS Targets ─────────────────────────────────────────────────
  const PLATFORMS = [
    { id: "spotify",     label: "Spotify",      lufs: -14, color: "#1db954" },
    { id: "youtube",     label: "YouTube",      lufs: -14, color: "#ff0000" },
    { id: "apple",       label: "Apple Music",  lufs: -16, color: "#fc3c44" },
    { id: "soundcloud",  label: "SoundCloud",   lufs: -10, color: "#ff5500" },
    { id: "tidal",       label: "Tidal",        lufs: -14, color: "#00ffff" },
    { id: "cd",          label: "CD Master",    lufs: -9,  color: "#ffffff" },
  ];

  const applyPlatformTarget = (platformId) => {
    setTargetPlatform(platformId);
    const p = PLATFORMS.find(x => x.id === platformId);
    if (!p) return;
    // Adjust limiter ceiling based on target LUFS
    if (p.lufs >= -10) { setLimiterCeiling(-0.3); setIntensity(85); }
    else if (p.lufs >= -14) { setLimiterCeiling(-1); setIntensity(70); }
    else { setLimiterCeiling(-1.5); setIntensity(60); }
    setStatus(`Platform set to ${p.label} · Target ${p.lufs} LUFS`);
  };

  // ─── Presets ───────────────────────────────────────────────────────────────
  const getAllSettings = () => ({
    intensity, eqLow, eqMid, eqHigh,
    compThreshold, compRatio, compAttack, compRelease, limiterCeiling, stereoWidth,
    multibandEnabled, mbLowThresh, mbLowRatio, mbMidThresh, mbMidRatio, mbHighThresh, mbHighRatio,
    targetPlatform,
  });

  const savePreset = () => {
    if (!presetName.trim()) return;
    const newPreset = { name: presetName.trim(), settings: getAllSettings(), date: Date.now() };
    const updated = [...presets.filter(p => p.name !== presetName.trim()), newPreset];
    setPresets(updated);
    localStorage.setItem("mf_presets", JSON.stringify(updated));
    setPresetName("");
    setShowPresetSave(false);
    setStatus(`Preset "${newPreset.name}" saved!`);
  };

  const loadPreset = (preset) => {
    const s = preset.settings;
    setIntensity(s.intensity ?? 70);
    setEqLow(s.eqLow ?? 0); setEqMid(s.eqMid ?? 0); setEqHigh(s.eqHigh ?? 2);
    setCompThreshold(s.compThreshold ?? -18); setCompRatio(s.compRatio ?? 4);
    setCompAttack(s.compAttack ?? 10); setCompRelease(s.compRelease ?? 150);
    setLimiterCeiling(s.limiterCeiling ?? -1); setStereoWidth(s.stereoWidth ?? 100);
    setMultibandEnabled(s.multibandEnabled ?? false);
    setMbLowThresh(s.mbLowThresh ?? -24); setMbLowRatio(s.mbLowRatio ?? 3);
    setMbMidThresh(s.mbMidThresh ?? -20); setMbMidRatio(s.mbMidRatio ?? 4);
    setMbHighThresh(s.mbHighThresh ?? -18); setMbHighRatio(s.mbHighRatio ?? 5);
    setTargetPlatform(s.targetPlatform ?? "spotify");
    setStatus(`Preset "${preset.name}" loaded!`);
  };

  const deletePreset = (name) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    localStorage.setItem("mf_presets", JSON.stringify(updated));
  };

  const meters = analysis?.meters || { lufs: 0, dynamic: 0, stereo: 0, clarity: 0 };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080810; font-family: 'Syne', sans-serif; }

        .upload-zone { border: 1px dashed #2a2a4a; border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; }
        .upload-zone:hover { border-color: #00ff8860; background: rgba(0,255,136,0.02); }

        .btn-primary { background: linear-gradient(135deg, #00ff88, #00cc6a); color: #080810; border: none; padding: 12px 24px; border-radius: 10px; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(0,255,136,0.3); }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 25px rgba(0,255,136,0.4); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }

        .btn-ghost { background: transparent; color: #555577; border: 1px solid #2a2a4a; padding: 9px 16px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .btn-ghost:hover { color: #00ff88; border-color: #00ff8840; }
        .btn-ghost:disabled { opacity: 0.3; cursor: not-allowed; }

        .btn-play { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid #00ff8840; padding: 8px 16px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; }
        .btn-play:hover { background: rgba(0,255,136,0.2); }
        .btn-play:disabled { opacity: 0.3; cursor: not-allowed; }

        .glass { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; }
        .tab-btn { background: transparent; border: none; padding: 7px 14px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
        .model-chip { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid #2a2a4a; cursor: pointer; transition: all 0.2s; background: transparent; width: 100%; }
        .model-chip:hover { border-color: #00ff8840; }
        .model-chip.active { border-color: #00ff88; background: rgba(0,255,136,0.05); }
        .genre-chip { padding: 5px 11px; border-radius: 20px; border: 1px solid #2a2a4a; background: transparent; color: #444466; font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; }
        .genre-chip:hover { border-color: #4db8ff40; color: #4db8ff; }
        .genre-chip.active { border-color: #4db8ff; color: #4db8ff; background: rgba(77,184,255,0.08); }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080810", backgroundImage: "radial-gradient(ellipse at 15% 15%, rgba(0,255,136,0.04) 0%, transparent 50%), radial-gradient(ellipse at 85% 85%, rgba(77,184,255,0.03) 0%, transparent 50%)", padding: "24px" }}>
        <div style={{ maxWidth: "920px", margin: "0 auto" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 10px #00ff88", animation: "blink 2.5s ease-in-out infinite" }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#00ff88", letterSpacing: "3px", textTransform: "uppercase" }}>AI Mastering Studio</span>
              </div>
              <h1 style={{ fontSize: "30px", fontWeight: "800", color: "#fff", letterSpacing: "-1px" }}>MASTERFORGE</h1>
              <p style={{ color: "#333355", fontSize: "10px", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>powered by openrouter · web audio api</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
              {showUrlInput ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="https://your-backend.railway.app"
                    value={backendUrl}
                    onChange={e => setBackendUrl(e.target.value)}
                    style={{ background: "#0d0d1a", border: "1px solid #2a2a4a", borderRadius: "8px", padding: "8px 12px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: "11px", width: "260px", outline: "none" }}
                  />
                  <button className="btn-ghost" onClick={() => {
                    localStorage.setItem("mf_backend_url", backendUrl);
                    setShowUrlInput(false);
                    checkBackend(backendUrl);
                  }}>Save</button>
                </div>
              ) : (
                <button className="btn-ghost" onClick={() => setShowUrlInput(true)}
                  style={{ color: backendStatus === "ok" ? "#00ff88" : backendStatus === "error" ? "#ff6b6b" : undefined,
                           borderColor: backendStatus === "ok" ? "#00ff8840" : backendStatus === "error" ? "#ff6b6b40" : undefined }}>
                  {backendStatus === "ok" ? "✓ Backend Connected" : backendStatus === "error" ? "✗ Backend Error" : backendUrl ? "↺ Check Backend" : "+ Backend URL"}
                </button>
              )}
              {status && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#444466", maxWidth: "280px", textAlign: "right" }}>{status}</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "14px" }}>

            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Main Card */}
              <div className="glass" style={{ padding: "22px" }}>
                <div style={{ display: "flex", gap: "4px", marginBottom: "18px" }}>
                  {["main", "controls", "analysis"].map(t => (
                    <button key={t} className="tab-btn" onClick={() => setActiveTab(t)}
                      style={{ color: activeTab === t ? "#00ff88" : "#333355", background: activeTab === t ? "rgba(0,255,136,0.08)" : "transparent" }}>
                      {t}
                    </button>
                  ))}
                </div>

                {/* ── TAB: MAIN ── */}
                {activeTab === "main" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                    {/* Upload Main — supports drag & drop */}
                    <div
                      className="upload-zone"
                      onClick={() => !audioBuffer && fileInputRef.current.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#00ff88"; e.currentTarget.style.background = "rgba(0,255,136,0.04)"; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.background = "";
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith("audio/")) loadAudioFile(file);
                      }}
                      style={{ cursor: audioBuffer ? "default" : "pointer" }}
                    >
                      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={e => handleUpload(e)} />
                      {audioBuffer ? (
                        <div>
                          <WaveformPlayer audioBuffer={audioBuffer} color="#00ff88" isProcessing={isProcessing} />
                          <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600" }}>{audioFile?.name}</div>
                              <div style={{ color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "9px", marginTop: "2px" }}>
                                {(audioFile?.size / 1024 / 1024).toFixed(2)} MB · {Math.round(audioBuffer.duration)}s · {audioBuffer.sampleRate}Hz
                              </div>
                            </div>
                            <button className="btn-ghost" style={{ fontSize: "9px" }} onClick={e => { e.stopPropagation(); setAudioFile(null); setAudioBuffer(null); setMasteredBuffer(null); setAnalysis(null); }}>✕ Remove</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: "26px", marginBottom: "8px", opacity: 0.3 }}>🎵</div>
                          <div style={{ color: "#fff", fontSize: "13px", fontWeight: "600", marginBottom: "3px" }}>Drop your track here or click</div>
                          <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>WAV · MP3 · FLAC · AIFF</div>
                        </div>
                      )}
                    </div>

                    {/* Mastered Waveform */}
                    {masteredBuffer && (
                      <div className="fade-in" style={{ padding: "16px", background: "rgba(77,184,255,0.03)", borderRadius: "12px", border: "1px solid rgba(77,184,255,0.1)" }}>
                        <WaveformPlayer audioBuffer={masteredBuffer} color="#4db8ff" label="Mastered Output" />
                        <div style={{ marginTop: "10px" }}>
                          <button className="btn-ghost" onClick={exportWAV} style={{ width: "100%", color: "#4db8ff", borderColor: "#4db8ff40" }}>↓ Export WAV</button>
                        </div>
                      </div>
                    )}

                    {/* Reference — supports drag & drop */}
                    {/* Reference Track */}
                    <div style={{ border: "1px solid #1a1a3a", borderRadius: "12px", overflow: "hidden" }}>
                      {/* Header */}
                      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: refBuffer ? "1px solid #1a1a3a" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", opacity: 0.4 }}>📌</span>
                          <span style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Reference Track</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {refBuffer && (
                            <button className="btn-ghost" style={{ fontSize: "9px", padding: "4px 10px", color: "#ff6b6b", borderColor: "#ff6b6b30" }}
                              onClick={() => { setRefFile(null); setRefBuffer(null); }}>
                              ✕ Remove
                            </button>
                          )}
                          <button className="btn-ghost" style={{ fontSize: "9px", padding: "4px 10px" }}
                            onClick={() => refInputRef.current.click()}>
                            {refBuffer ? "↺ Replace" : "+ Add"}
                          </button>
                        </div>
                      </div>
                      <input ref={refInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={e => handleUpload(e, true)} />

                      {refBuffer ? (
                        /* Player */
                        <div style={{ padding: "12px 14px" }}>
                          <WaveformPlayer audioBuffer={refBuffer} color="#4db8ff" />
                          <div style={{ marginTop: "6px", color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px" }}>{refFile?.name}</div>
                        </div>
                      ) : (
                        /* Drop zone */
                        <div
                          className="upload-zone"
                          style={{ border: "none", borderRadius: "0", margin: "0", padding: "18px" }}
                          onClick={() => refInputRef.current.click()}
                          onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(77,184,255,0.04)"; }}
                          onDragLeave={e => { e.currentTarget.style.background = ""; }}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.style.background = "";
                            const file = e.dataTransfer.files[0];
                            if (file && file.type.startsWith("audio/")) loadAudioFile(file, true);
                          }}
                        >
                          <div style={{ color: "#222244", fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>Drop or click to add reference · AI will match this sound</div>
                        </div>
                      )}
                    </div>

                    {/* Genre */}
                    <div>
                      <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>Genre</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {GENRES.map(g => (
                          <button key={g} className={`genre-chip ${selectedGenre === g ? "active" : ""}`} onClick={() => setSelectedGenre(g)}>{g}</button>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn-primary" onClick={analyzeWithAI} disabled={!audioBuffer || !backendUrl || isAnalyzing || isProcessing} style={{ flex: 1 }}>
                        {isAnalyzing ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", border: "2px solid #080810", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Analyzing...</span> : "① Analyze with AI"}
                      </button>
                      <button className="btn-primary" onClick={processMastering} disabled={!audioBuffer || isProcessing || isAnalyzing}
                        style={{ flex: 1, background: analysis ? "linear-gradient(135deg, #4db8ff, #0088cc)" : undefined, boxShadow: analysis ? "0 4px 20px rgba(77,184,255,0.3)" : undefined }}>
                        {isProcessing ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", border: "2px solid #080810", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Processing...</span> : "② Master Track"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB: CONTROLS ── */}
                {activeTab === "controls" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

                    {/* Intensity */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div style={{ color: "#fff", fontSize: "12px", fontWeight: "600" }}>Mastering Intensity</div>
                        <div style={{ color: "#00ff88", fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>{intensity}%</div>
                      </div>
                      <input type="range" min="0" max="100" value={intensity} onChange={e => setIntensity(Number(e.target.value))} style={{ width: "100%", accentColor: "#00ff88" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#222244" }}>SUBTLE</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", color: "#222244" }}>AGGRESSIVE</span>
                      </div>
                    </div>

                    {/* EQ */}
                    <div style={{ padding: "14px", background: "rgba(255,255,255,0.015)", borderRadius: "10px" }}>
                      <div style={{ color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "14px" }}>EQ · SHELVES</div>
                      <div style={{ display: "flex", justifyContent: "space-around" }}>
                        <Knob label="Low 80Hz" value={eqLow} onChange={setEqLow} min={-12} max={12} step={0.5} unit="dB" />
                        <Knob label="Mid 1kHz" value={eqMid} onChange={setEqMid} min={-12} max={12} step={0.5} unit="dB" />
                        <Knob label="High 8kHz" value={eqHigh} onChange={setEqHigh} min={-12} max={12} step={0.5} unit="dB" />
                      </div>
                    </div>

                    {/* Compressor toggle */}
                    <div style={{ padding: "14px", background: "rgba(255,255,255,0.015)", borderRadius: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <div style={{ color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px" }}>
                          {multibandEnabled ? "MULTIBAND COMPRESSION" : "COMPRESSOR"}
                        </div>
                        <button
                          onClick={() => setMultibandEnabled(v => !v)}
                          style={{ padding: "3px 10px", borderRadius: "20px", border: `1px solid ${multibandEnabled ? "#ffb347" : "#2a2a4a"}`, background: multibandEnabled ? "rgba(255,179,71,0.1)" : "transparent", color: multibandEnabled ? "#ffb347" : "#444466", fontFamily: "'DM Mono', monospace", fontSize: "8px", letterSpacing: "1px", cursor: "pointer", transition: "all 0.2s" }}>
                          {multibandEnabled ? "MULTIBAND ON" : "MULTIBAND OFF"}
                        </button>
                      </div>

                      {!multibandEnabled ? (
                        <div style={{ display: "flex", justifyContent: "space-around" }}>
                          <Knob label="Threshold" value={Math.abs(compThreshold)} onChange={v => setCompThreshold(-v)} min={0} max={40} unit="dB" />
                          <Knob label="Ratio" value={compRatio} onChange={setCompRatio} min={1} max={20} unit=":1" />
                          <Knob label="Attack" value={compAttack} onChange={setCompAttack} min={1} max={100} unit="ms" />
                          <Knob label="Release" value={compRelease} onChange={setCompRelease} min={50} max={500} step={10} unit="ms" />
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          {[
                            { label: "LOW <200Hz", thresh: mbLowThresh, setThresh: setMbLowThresh, ratio: mbLowRatio, setRatio: setMbLowRatio, color: "#4db8ff" },
                            { label: "MID 200-5kHz", thresh: mbMidThresh, setThresh: setMbMidThresh, ratio: mbMidRatio, setRatio: setMbMidRatio, color: "#00ff88" },
                            { label: "HIGH >5kHz", thresh: mbHighThresh, setThresh: setMbHighThresh, ratio: mbHighRatio, setRatio: setMbHighRatio, color: "#ffb347" },
                          ].map(band => (
                            <div key={band.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ width: "80px", fontFamily: "'DM Mono', monospace", fontSize: "8px", color: band.color, letterSpacing: "0.5px" }}>{band.label}</div>
                              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "8px", color: "#333355", width: "16px" }}>T</span>
                                  <input type="range" min={-40} max={0} value={band.thresh} onChange={e => band.setThresh(Number(e.target.value))} style={{ flex: 1, accentColor: band.color, height: "3px" }} />
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "8px", color: band.color, width: "34px", textAlign: "right" }}>{band.thresh}dB</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "8px", color: "#333355", width: "16px" }}>R</span>
                                  <input type="range" min={1} max={20} value={band.ratio} onChange={e => band.setRatio(Number(e.target.value))} style={{ flex: 1, accentColor: band.color, height: "3px" }} />
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "8px", color: band.color, width: "34px", textAlign: "right" }}>{band.ratio}:1</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Limiter */}
                    <div style={{ padding: "14px", background: "rgba(255,255,255,0.015)", borderRadius: "10px" }}>
                      <div style={{ color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "10px" }}>LIMITER · CEILING</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input type="range" min={-6} max={0} step={0.1} value={limiterCeiling} onChange={e => setLimiterCeiling(Number(e.target.value))} style={{ flex: 1, accentColor: "#ff6b6b" }} />
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#ff6b6b", minWidth: "54px" }}>{limiterCeiling} dBTP</div>
                      </div>
                    </div>

                    <button className="btn-primary" onClick={processMastering} disabled={!audioBuffer || isProcessing} style={{ width: "100%" }}>
                      {isProcessing ? "Processing..." : "Apply & Master"}
                    </button>
                  </div>
                )}

                {/* ── TAB: ANALYSIS ── */}
                {activeTab === "analysis" && (
                  <div>
                    {analysis ? (
                      <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div style={{ padding: "14px", background: "rgba(0,255,136,0.03)", borderRadius: "10px", border: "1px solid rgba(0,255,136,0.08)" }}>
                          <div style={{ color: "#00ff88", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "6px" }}>AI ASSESSMENT</div>
                          <div style={{ color: "#aaaacc", fontSize: "12px", lineHeight: "1.6", fontFamily: "'DM Mono', monospace" }}>{analysis.summary}</div>
                        </div>
                        {analysis.recommendations && Object.entries(analysis.recommendations).map(([k, v]) => (
                          <div key={k} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.015)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ color: "#4db8ff", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>{k}</div>
                            <div style={{ color: "#888899", fontSize: "11px" }}>{v}</div>
                          </div>
                        ))}
                        {analysis.issues?.length > 0 && (
                          <div>
                            <div style={{ color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", marginBottom: "8px" }}>DETECTED ISSUES</div>
                            {analysis.issues.map((issue, i) => (
                              <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "flex-start" }}>
                                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#ff6b6b", marginTop: "5px", flexShrink: 0 }} />
                                <div style={{ color: "#666688", fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>{issue}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "50px 20px", color: "#222244" }}>
                        <div style={{ fontSize: "28px", marginBottom: "12px", opacity: 0.2 }}>📊</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>Upload a track and click "Analyze with AI" to get recommendations.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Spectrum Analyzer */}
              <div className="glass" style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Spectrum</div>
                  {masteredBuffer && (
                    <div style={{ display: "flex", gap: "4px" }}>
                      {["original", "mastered"].map(m => (
                        <button key={m} onClick={() => setAbMode(m)} style={{
                          padding: "3px 9px", borderRadius: "20px", cursor: "pointer", fontSize: "8px",
                          fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase",
                          border: `1px solid ${abMode === m ? (m === "original" ? "#ffb347" : "#00ff88") : "#1a1a3a"}`,
                          background: abMode === m ? (m === "original" ? "rgba(255,179,71,0.1)" : "rgba(0,255,136,0.08)") : "transparent",
                          color: abMode === m ? (m === "original" ? "#ffb347" : "#00ff88") : "#333355",
                          transition: "all 0.15s",
                        }}>{m}</button>
                      ))}
                    </div>
                  )}
                </div>
                <SpectrumAnalyzer
                  audioBuffer={abMode === "mastered" && masteredBuffer ? masteredBuffer : audioBuffer}
                  color={abMode === "mastered" ? "#00ff88" : "#ffb347"}
                />
                {masteredBuffer && (
                  <div style={{ marginTop: "6px", textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: "8px", color: "#222244" }}>
                    Showing: <span style={{ color: abMode === "mastered" ? "#00ff88" : "#ffb347" }}>{abMode.toUpperCase()}</span>
                  </div>
                )}
              </div>

              {/* Model Selector */}
              <div className="glass" style={{ padding: "16px" }}>
                <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>AI Model</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {MODELS.map(m => (
                    <button key={m.id} className={`model-chip ${selectedModel.id === m.id ? "active" : ""}`} onClick={() => setSelectedModel(m)}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                      <div style={{ color: selectedModel.id === m.id ? "#fff" : "#555577", fontSize: "10px", fontFamily: "'DM Mono', monospace", flex: 1 }}>{m.name}</div>
                      <div style={{ padding: "1px 5px", borderRadius: "3px", background: `${m.color}15`, color: m.color, fontSize: "8px", fontFamily: "'DM Mono', monospace" }}>FREE</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform LUFS Target */}
              <div className="glass" style={{ padding: "16px" }}>
                <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>Platform Target</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                  {PLATFORMS.map(p => (
                    <button key={p.id} onClick={() => applyPlatformTarget(p.id)} style={{
                      padding: "7px 8px", borderRadius: "8px", cursor: "pointer",
                      border: `1px solid ${targetPlatform === p.id ? p.color : "#1a1a3a"}`,
                      background: targetPlatform === p.id ? `${p.color}10` : "transparent",
                      transition: "all 0.15s", textAlign: "left",
                    }}>
                      <div style={{ color: targetPlatform === p.id ? p.color : "#555577", fontFamily: "'DM Mono', monospace", fontSize: "9px" }}>{p.label}</div>
                      <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "8px", marginTop: "1px" }}>{p.lufs} LUFS</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Meters + Stats */}
              {audioBuffer && (
                <div className="glass fade-in" style={{ padding: "16px" }}>
                  <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "12px" }}>Meters</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
                    <MeterBar label="LUFS" value={meters.lufs} color="#00ff88" unit="%" />
                    <MeterBar label="Dynamic" value={meters.dynamic} color="#4db8ff" unit="%" />
                    <MeterBar label="Stereo" value={meters.stereo} color="#ffb347" unit="%" />
                    <MeterBar label="Clarity" value={meters.clarity} color="#ff6b6b" unit="%" />
                  </div>
                  {(() => {
                    const s = getRealAudioStats(audioBuffer);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "10px", borderTop: "1px solid #1a1a3a" }}>
                        {[["LUFS", `${s.lufs} dB`], ["Peak", `${s.peak} dBFS`], ["Dynamic", `${s.dynamicRange} dB`], ["Duration", `${s.duration}s`]].map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>{k}</span>
                            <span style={{ color: "#666688", fontFamily: "'DM Mono', monospace", fontSize: "8px" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Presets */}
              <div className="glass" style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>Presets</div>
                  <button onClick={() => setShowPresetSave(v => !v)} style={{ padding: "3px 9px", borderRadius: "6px", border: "1px solid #2a2a4a", background: "transparent", color: "#444466", fontFamily: "'DM Mono', monospace", fontSize: "8px", cursor: "pointer" }}>
                    {showPresetSave ? "Cancel" : "+ Save"}
                  </button>
                </div>
                {showPresetSave && (
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                    <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name..."
                      onKeyDown={e => e.key === "Enter" && savePreset()}
                      style={{ flex: 1, background: "#0d0d1a", border: "1px solid #2a2a4a", borderRadius: "6px", padding: "6px 9px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: "10px", outline: "none" }} />
                    <button onClick={savePreset} style={{ padding: "6px 10px", borderRadius: "6px", background: "#00ff8820", border: "1px solid #00ff8840", color: "#00ff88", fontFamily: "'DM Mono', monospace", fontSize: "9px", cursor: "pointer" }}>✓</button>
                  </div>
                )}
                {presets.length === 0 ? (
                  <div style={{ color: "#1a1a3a", fontFamily: "'DM Mono', monospace", fontSize: "9px", textAlign: "center", padding: "10px 0" }}>No presets saved yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {presets.map(p => (
                      <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 8px", borderRadius: "7px", background: "rgba(255,255,255,0.015)", border: "1px solid #1a1a3a" }}>
                        <button onClick={() => loadPreset(p)} style={{ flex: 1, background: "transparent", border: "none", color: "#888899", fontFamily: "'DM Mono', monospace", fontSize: "9px", cursor: "pointer", textAlign: "left", padding: 0 }}>
                          {p.name}
                        </button>
                        <button onClick={() => deletePreset(p.name)} style={{ background: "transparent", border: "none", color: "#ff6b6b44", cursor: "pointer", fontSize: "10px", padding: "0 2px" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Export Panel */}
              {(masteredBuffer || audioBuffer) && (
                <div className="glass fade-in" style={{ padding: "18px" }}>
                  <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "14px" }}>Export</div>

                  {/* Format selector */}
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1px", marginBottom: "7px" }}>FORMAT</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {[
                        { id: "wav24", label: "WAV 24-bit", sub: "Studio quality", color: "#00ff88" },
                        { id: "wav16", label: "WAV 16-bit", sub: "CD quality", color: "#4db8ff" },
                        { id: "mp3",   label: "MP3 320kbps", sub: "Streaming ready", color: "#ffb347" },
                      ].map(fmt => (
                        <button key={fmt.id}
                          onClick={() => setExportFormat(fmt.id)}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 11px", borderRadius: "8px", cursor: "pointer",
                            border: `1px solid ${exportFormat === fmt.id ? fmt.color : "#1a1a3a"}`,
                            background: exportFormat === fmt.id ? `${fmt.color}08` : "transparent",
                            transition: "all 0.15s",
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: exportFormat === fmt.id ? fmt.color : "#2a2a4a" }} />
                            <span style={{ color: exportFormat === fmt.id ? "#fff" : "#555577", fontFamily: "'DM Mono', monospace", fontSize: "10px" }}>{fmt.label}</span>
                          </div>
                          <span style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "8px" }}>{fmt.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sample rate */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "1px", marginBottom: "7px" }}>SAMPLE RATE</div>
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                      {[44100, 48000, 88200, 96000].map(sr => (
                        <button key={sr}
                          onClick={() => setExportSampleRate(sr)}
                          style={{
                            flex: 1, padding: "6px 4px", borderRadius: "7px", cursor: "pointer",
                            border: `1px solid ${exportSampleRate === sr ? "#00ff88" : "#1a1a3a"}`,
                            background: exportSampleRate === sr ? "rgba(0,255,136,0.08)" : "transparent",
                            color: exportSampleRate === sr ? "#00ff88" : "#444466",
                            fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "0.5px",
                            transition: "all 0.15s",
                          }}>
                          {sr >= 1000 ? `${sr/1000}k` : sr}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File info */}
                  {(masteredBuffer || audioBuffer) && (() => {
                    const buf = masteredBuffer || audioBuffer;
                    const bps = exportFormat === "wav24" ? 3 : exportFormat === "wav16" ? 2 : 0.04;
                    const estMB = ((buf.length * buf.numberOfChannels * bps * (exportSampleRate / buf.sampleRate)) / 1024 / 1024).toFixed(1);
                    return (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginBottom: "12px", borderTop: "1px solid #1a1a3a", borderBottom: "1px solid #1a1a3a" }}>
                        <span style={{ color: "#333355", fontFamily: "'DM Mono', monospace", fontSize: "9px" }}>EST. SIZE</span>
                        <span style={{ color: "#555577", fontFamily: "'DM Mono', monospace", fontSize: "9px" }}>~{estMB} MB</span>
                      </div>
                    );
                  })()}

                  {/* Export button */}
                  <button
                    onClick={exportAudio}
                    disabled={isExporting}
                    style={{
                      width: "100%", padding: "11px", borderRadius: "9px", border: "none", cursor: isExporting ? "not-allowed" : "pointer",
                      background: isExporting ? "#1a1a2e" : "linear-gradient(135deg, #00ff88, #00cc6a)",
                      color: isExporting ? "#444466" : "#080810",
                      fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "11px", letterSpacing: "1px",
                      transition: "all 0.2s", position: "relative", overflow: "hidden",
                    }}>
                    {isExporting ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                        <span style={{ width: "10px", height: "10px", border: "2px solid #444466", borderTopColor: "#00ff88", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                        {exportProgress < 100 ? `Exporting... ${exportProgress}%` : "Done!"}
                      </span>
                    ) : `↓ Download ${exportFormat === "wav24" ? "WAV 24-bit" : exportFormat === "wav16" ? "WAV 16-bit" : "MP3 320k"}`}
                    {isExporting && (
                      <div style={{ position: "absolute", bottom: 0, left: 0, height: "2px", width: `${exportProgress}%`, background: "#00ff88", transition: "width 0.3s ease" }} />
                    )}
                  </button>

                  {/* MP3 warning */}
                  {exportFormat === "mp3" && (
                    <div style={{ marginTop: "8px", color: "#444455", fontFamily: "'DM Mono', monospace", fontSize: "8px", textAlign: "center", lineHeight: 1.5 }}>
                      MP3 encoding uses lamejs · may take a moment for long tracks
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: "28px", color: "#1a1a33", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "2px" }}>
            MASTERFORGE · WEB AUDIO API · OPENROUTER
          </div>
        </div>
      </div>
    </>
  );
}
