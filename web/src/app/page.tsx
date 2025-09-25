"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Globe2,
  History,
  Loader2,
  Network,
  Rocket,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";

import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type RunResult = {
  id: string;
  status: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: {
    appended?: number;
    spreadsheetUrl?: string;
    sheetId?: string;
  };
  error?: { message?: string } | null;
};

type RunStats = {
  runs: { total: number; queued: number; running: number; completed: number; failed: number };
  totals: {
    appended: number;
    targetsDiscovered: number;
    targetsProcessed: number;
    successes: number;
    failures: number;
  };
  firecrawl: { directoryPages: number; targetPages: number; totalPages: number };
  llm: { totalCalls: number; models: Record<string, Record<string, number>> };
  lastFinishedAt?: string | null;
};

const welcomeCopy = `Drop a directory link, set your guardrails, and I&apos;ll crawl, extract, and ship qualified leads straight to your sheet. No scraping drama—just premium output.`;

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content: welcomeCopy
  }
];

const defaultSheetName = () => {
  const now = new Date();
  return `Run_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
};

const defaultFormState = {
  url: "",
  sheetUrl: "",
  directory: true,
  maxBusinesses: 25,
  reuseSheet: true,
  sheetName: defaultSheetName(),
  shareWith: "",
  icp: "",
  keyword: "",
  sheetFolderUrl: ""
};

function parseShareList(value: string) {
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDriveId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const idPattern = /[A-Za-z0-9_-]{20,}/;
  try {
    const url = new URL(trimmed);
    const idFromQuery = url.searchParams.get("id");
    if (idFromQuery) return idFromQuery;
    const segments = url.pathname.split("/").filter(Boolean);
    const foldersIndex = segments.indexOf("folders");
    if (foldersIndex !== -1 && segments[foldersIndex + 1]) {
      return segments[foldersIndex + 1];
    }
    const dIndex = segments.indexOf("d");
    if (dIndex !== -1 && segments[dIndex + 1]) {
      return segments[dIndex + 1];
    }
    const pathMatch = url.pathname.match(idPattern);
    if (pathMatch) return pathMatch[0];
  } catch {
    // ignore URL parse errors
  }
  const rawMatch = trimmed.match(idPattern);
  return rawMatch ? rawMatch[0] : trimmed;
}

function summariseStatus(status: RunResult["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "In progress";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

const roleColours: Record<Message["role"], string> = {
  assistant: "from-emerald-400/25 via-sky-500/25 to-indigo-500/30 border-emerald-400/30 text-emerald-50",
  user: "from-white/[0.9] to-white/[0.95] border-white/80 text-slate-900"
};

function ChatBubble({ message }: { message: Message }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "max-w-[78%] md:max-w-[70%] rounded-3xl border px-6 py-4 shadow-[0_18px_45px_rgba(15,118,110,0.18)] backdrop-blur-md",
        message.role === "assistant" ? "self-start" : "self-end",
        `bg-gradient-to-br ${roleColours[message.role]}`
      )}
    >
      <p className="text-sm md:text-[15px] leading-relaxed whitespace-pre-line">{message.content}</p>
    </motion.div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [form, setForm] = useState(defaultFormState);
  const [isLaunching, setIsLaunching] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const refreshStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      if (!response.ok) return;
      const payload: RunStats = await response.json();
      if (isMountedRef.current) {
        setStats(payload);
      }
    } catch (error) {
      console.error("Stats fetch failed", error);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 7000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshStats]);

  useEffect(() => {
    let cancelled = false;
    async function loadServiceAccount() {
      try {
        const response = await fetch(`${API_BASE}/service-account`);
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setServiceAccountEmail(payload.email || null);
        }
      } catch (error) {
        console.error("Service account lookup failed", error);
      }
    }
    loadServiceAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/runs/${activeRunId}`);
        if (!response.ok) return;
        const run: RunResult = await response.json();
        setRuns((prev) => {
          const others = prev.filter((item) => item.id !== run.id);
          return [run, ...others].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        });
        if (run.status === "completed") {
          setMessages((prev) => [
            ...prev,
            {
              id: `${run.id}-completed`,
              role: "assistant",
              content: run.result?.spreadsheetUrl
                ? `All set. I dropped ${run.result?.appended ?? 0} leads in your sheet → ${run.result.spreadsheetUrl}`
                : `All set. ${run.result?.appended ?? 0} leads ready to ship.`
            }
          ]);
          setActiveRunId(null);
          setIsLaunching(false);
          refreshStats();
        } else if (run.status === "failed") {
          setMessages((prev) => [
            ...prev,
            {
              id: `${run.id}-failed`,
              role: "assistant",
              content: run.error?.message
                ? `Something clipped a wing: ${run.error.message}`
                : "The run failed—check the logs for details."
            }
          ]);
          setActiveRunId(null);
          setIsLaunching(false);
          refreshStats();
        }
      } catch (error) {
        console.error("Polling error", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRunId, refreshStats]);

  const latestStatus = useMemo(() => runs.find((run) => run.id === activeRunId), [runs, activeRunId]);
  const totalTokens = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.llm.models).reduce((sum, usage) => sum + (usage.total_tokens ?? 0), 0);
  }, [stats]);
  const pagesCrawled = useMemo(() => stats?.firecrawl.totalPages ?? 0, [stats]);
  const successRate = useMemo(() => {
    if (!stats) return 0;
    const processed = stats.totals.targetsProcessed || 0;
    if (!processed) return 0;
    return Math.round((stats.totals.successes / processed) * 100);
  }, [stats]);

  function handleSend() {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setInput("");

    const maxMatch = text.match(/(\d+)\s*(business|company|lead)/i);
    const keywordMatch = text.match(/\b(ai|artificial intelligence|marketing|coach|consultant[s]?|agency|software|startup)\b/i);
    const updates: Partial<typeof form> = {};
    if (maxMatch) {
      updates.maxBusinesses = Number(maxMatch[1]);
    }
    if (keywordMatch) {
      const word = keywordMatch[1];
      updates.keyword = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    if (Object.keys(updates).length) {
      setForm((prev) => ({ ...prev, ...updates }));
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Locked in. Drop the directory URL and sheet on the right, hit \"Launch run\", and I&apos;ll take it from there."
      }
    ]);
  }

  async function launchRun() {
    if (!form.url.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I need a directory or website link to deploy. Paste one into the panel first."
        }
      ]);
      return;
    }

    const sheetFolderId = extractDriveId(form.sheetFolderUrl);

    const payload: Record<string, unknown> = {
      url: form.url.trim(),
      directory: form.directory,
      maxBusinesses: form.maxBusinesses,
      icp: form.icp.trim() || undefined,
      sheetName: form.sheetName.trim() || undefined,
      keyword: form.keyword.trim() || undefined,
      shareWith: parseShareList(form.shareWith),
      reuseSheet: form.reuseSheet,
      sheetUrl: form.sheetUrl.trim() || undefined,
      sheetFolderId: sheetFolderId || undefined
    };

    setIsLaunching(true);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Deploying the crawl stack now. You'll see updates as I go."
      }
    ]);

    try {
      const response = await fetch(`${API_BASE}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to start the run");
      }
      const job = await response.json();
      setActiveRunId(job.id);
      setRuns((prev) => [
        {
          id: job.id,
          status: "queued",
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);
    } catch (error) {
      setIsLaunching(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Couldn't launch that run."
        }
      ]);
    }
  }

  return (
    <main className="relative min-h-screen w-full px-6 md:px-12 pt-14 pb-20 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <div className="absolute -left-40 top-10 h-80 w-80 rounded-full bg-emerald-500/20 blur-[120px]" />
          <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-sky-500/20 blur-[140px]" />
          <div className="absolute left-24 bottom-12 h-72 w-72 rounded-full bg-indigo-500/20 blur-[120px]" />
        </motion.div>
      </div>

      <header className="relative z-10 max-w-6xl mx-auto mb-12">
        <div className="flex items-center gap-3 text-sm uppercase tracking-[0.55em] text-white/70">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <span>LeadRunner Studio</span>
        </div>
        <div className="mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-semibold leading-[1.08] text-white">
              Command AI-powered lead hunts like a flagship brand.
            </h1>
            <p className="mt-5 text-slate-200/85 text-base md:text-lg max-w-3xl">
              Give me a directory, a territory, or a single brand. I&apos;ll scout the site, extract the intel, score each lead against your ICP, and sync everything into your Google Sheet without breaking stride.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl text-sm text-emerald-100 shadow-[0_18px_60px_rgba(56,189,248,0.25)]">
            <p className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              <span>Current mode: {process.env.NEXT_PUBLIC_API_BASE_URL ? "Connected" : "Local"}</span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-white/70">
              <Globe2 className="h-4 w-4" />
              <span>API base: {API_BASE}</span>
            </p>
          </div>
        </div>
      </header>

      <section className="relative z-10 max-w-6xl mx-auto flex flex-col xl:flex-row gap-10">
        <div className="flex-1 rounded-[32px] border border-white/10 bg-white/10 backdrop-blur-3xl p-6 md:p-8 shadow-[0_35px_120px_rgba(16,185,129,0.25)]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Assistant feed</h2>
              <p className="text-sm text-white/60">All intents, prompts, and status pulses archive here.</p>
            </div>
            <div
              className={cn(
                "rounded-full px-4 py-1 text-xs font-semibold tracking-wide backdrop-blur border",
                activeRunId
                  ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                  : "border-white/20 bg-white/10 text-white/70"
              )}
            >
              {activeRunId ? "Running" : "Idle"}
            </div>
          </div>

          <div className="h-[460px] md:h-[540px] overflow-y-auto pr-1 flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </AnimatePresence>
            {latestStatus && !["completed", "failed"].includes(latestStatus.status) && (
              <motion.div
                key="run-status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] uppercase tracking-[0.48em] text-white/50 pt-4"
              >
                {summariseStatus(latestStatus.status)}
              </motion.div>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tell me what to find… e.g. 25 AI studios in Chicago"
                className="w-full rounded-2xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80"
              />
              <Sparkles className="-ml-10 h-4 w-4 text-emerald-200" />
            </div>
            <button
              onClick={handleSend}
              className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white text-slate-900 font-semibold px-5 py-3 shadow-[0_15px_45px_rgba(59,130,246,0.28)] hover:shadow-[0_18px_55px_rgba(59,130,246,0.35)] transition"
            >
              <Send className="h-4 w-4" />
              Prompt
            </button>
          </div>
        </div>

        <aside className="w-full xl:w-[360px] rounded-[32px] border border-white/10 bg-white/10 backdrop-blur-2xl p-6 md:p-8 shadow-[0_30px_110px_rgba(99,102,241,0.25)] flex flex-col gap-7">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-400/20 border border-emerald-300/40 p-2">
              <SlidersHorizontal className="h-4 w-4 text-emerald-200" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Run controls</h3>
              <p className="text-sm text-white/60">
                Configure the crawl guardrails. I&apos;ll carry them into every job you launch.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/45 px-4 py-4 text-xs text-white/75 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-white/80">
              <Activity className="h-4 w-4 text-emerald-200" />
              <h4 className="text-sm font-semibold text-white">Share access</h4>
            </div>
            {serviceAccountEmail ? (
              <>
                <p>
                  Share your Google Sheet or Drive folder with
                  <span className="ml-1 font-semibold text-emerald-200">{serviceAccountEmail}</span>
                  (Editor access).
                </p>
                <p className="text-white/55">
                  Reuse an existing sheet by pasting the link below—or share a Drive folder and paste its URL so I can auto-create a fresh sheet for each campaign.
                </p>
              </>
            ) : (
              <p className="text-white/55">Service-account email unavailable. Ensure the API server is reachable.</p>
            )}
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/75 flex items-center gap-2">
              <Network className="h-4 w-4" /> Directory or website URL
            </span>
            <input
              value={form.url}
              onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
              placeholder="https://www.yellowpages.com/search?..."
              className="rounded-2xl bg-slate-900/45 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white placeholder:text-white/40"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/75 flex items-center gap-2">
              <Share2 className="h-4 w-4" /> Google Sheet link
            </span>
            <input
              value={form.sheetUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, sheetUrl: event.target.value, reuseSheet: true }))}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="rounded-2xl bg-slate-900/45 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white placeholder:text-white/40"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/75">Drive folder (optional for auto-create)</span>
            <input
              value={form.sheetFolderUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, sheetFolderUrl: event.target.value }))}
              placeholder="https://drive.google.com/drive/folders/..."
              className="rounded-2xl bg-slate-900/45 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white placeholder:text-white/40"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/75">ICP guidance (optional)</span>
            <textarea
              value={form.icp}
              onChange={(event) => setForm((prev) => ({ ...prev, icp: event.target.value }))}
              rows={3}
              placeholder="e.g. Boutique AI consultancies serving SMB finance teams"
              className="rounded-2xl bg-slate-900/45 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white placeholder:text-white/40"
            />
          </label>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <label className="flex flex-col gap-1 text-white/75">
              <span>Max businesses</span>
              <input
                type="number"
                min={1}
                max={200}
                value={form.maxBusinesses}
                onChange={(event) => setForm((prev) => ({ ...prev, maxBusinesses: Number(event.target.value) }))}
                className="rounded-2xl bg-slate-900/45 border border-white/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-white/75">
              <span>Sheet tab</span>
              <input
                value={form.sheetName}
                onChange={(event) => setForm((prev) => ({ ...prev, sheetName: event.target.value }))}
                className="rounded-2xl bg-slate-900/45 border border-white/10 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/75">Share the output with (comma separated)</span>
            <input
              value={form.shareWith}
              onChange={(event) => setForm((prev) => ({ ...prev, shareWith: event.target.value }))}
              placeholder="you@example.com, ops@example.com"
              className="rounded-2xl bg-slate-900/45 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-300/80 text-white placeholder:text-white/40"
            />
          </label>

          <div className="flex items-center justify-between text-sm text-white/70">
            <div>
              <p className="font-medium">Directory mode</p>
              <p className="text-xs text-white/55">Fan-out to external businesses when crawling listings.</p>
            </div>
            <button
              onClick={() => setForm((prev) => ({ ...prev, directory: !prev.directory }))}
              className={cn(
                "relative inline-flex h-9 w-16 items-center rounded-full border border-white/20 transition",
                form.directory ? "bg-emerald-400/50" : "bg-slate-800/80"
              )}
            >
              <span
                className={cn(
                  "inline-block h-7 w-7 transform rounded-full bg-white shadow-lg transition",
                  form.directory ? "translate-x-8" : "translate-x-1"
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-sm text-white/70">
            <div>
              <p className="font-medium">Append to existing sheet</p>
              <p className="text-xs text-white/55">Keeps the same spreadsheet when rerunning.</p>
            </div>
            <button
              onClick={() => setForm((prev) => ({ ...prev, reuseSheet: !prev.reuseSheet }))}
              className={cn(
                "relative inline-flex h-9 w-16 items-center rounded-full border border-white/20 transition",
                form.reuseSheet ? "bg-sky-400/50" : "bg-slate-800/80"
              )}
            >
              <span
                className={cn(
                  "inline-block h-7 w-7 transform rounded-full bg-white shadow-lg transition",
                  form.reuseSheet ? "translate-x-8" : "translate-x-1"
                )}
              />
            </button>
          </div>

          <button
            onClick={launchRun}
            disabled={isLaunching}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-500 text-slate-900 font-semibold py-3 shadow-[0_24px_85px_rgba(56,189,248,0.35)] hover:shadow-[0_28px_95px_rgba(56,189,248,0.45)] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Launching
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Launch run
              </>
            )}
          </button>

          <div className="rounded-2xl border border-white/10 bg-slate-900/45 px-4 py-4 text-xs text-white/75 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-white/80">
              <Activity className="h-4 w-4 text-emerald-200" />
              <h4 className="text-sm font-semibold text-white">Pipeline metrics</h4>
            </div>
            {stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">Leads synced</p>
                    <p className="text-sm font-semibold text-white">{stats.totals.appended}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">Pages crawled</p>
                    <p className="text-sm font-semibold text-white">{pagesCrawled}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">LLM calls</p>
                    <p className="text-sm font-semibold text-white">{stats.llm.totalCalls}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">Success rate</p>
                    <p className="text-sm font-semibold text-white">{successRate}%</p>
                  </div>
                </div>
                <p className="text-[10px] text-white/45">Tokens ~ {totalTokens.toLocaleString()}</p>
              </>
            ) : (
              <p className="text-xs text-white/55">Metrics will appear after the first run.</p>
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center gap-3 text-white/70">
              <History className="h-4 w-4" />
              <h4 className="text-sm font-semibold text-white">Recent runs</h4>
            </div>
            <div className="mt-4 flex flex-col gap-3 max-h-44 overflow-y-auto pr-1">
              {runs.length === 0 && (
                <p className="text-xs text-white/55">Runs will appear here as soon as you launch the first one.</p>
              )}
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/45 px-4 py-3 text-xs text-white/80 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white/90">{summariseStatus(run.status)}</span>
                    {run.result?.appended !== undefined && (
                      <span className="text-white/60">{run.result.appended} leads</span>
                    )}
                  </div>
                  {run.result?.spreadsheetUrl && (
                    <a
                      href={run.result.spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 hover:text-emerald-200"
                    >
                      Open sheet →
                    </a>
                  )}
                  {run.error?.message && <p className="text-rose-300">{run.error.message}</p>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

