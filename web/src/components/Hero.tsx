"use client";

import Link from "next/link";

const highlights = [
  "Crawl high-signal directories and brand sites in minutes",
  "Structured enrichment with OpenAI + deterministic checks",
  "Deduped leads synced live into your Google Sheet"
];

const quickStats = [
  { label: "Avg. leads/run", value: "42" },
  { label: "Time saved", value: "6h+" },
  { label: "ICP fit score", value: "92%" }
];

const gridPattern =
  "data:image/svg+xml," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <g fill="none" stroke="#36d399" stroke-opacity="0.08">
        <path d="M0 .5H600" />
        <path d="M0 60.5H600" />
        <path d="M0 120.5H600" />
        <path d="M0 180.5H600" />
        <path d="M0 240.5H600" />
        <path d="M0 300.5H600" />
        <path d="M0 360.5H600" />
        <path d="M0 420.5H600" />
        <path d="M0 480.5H600" />
        <path d="M0 540.5H600" />
        <path d="M60.5 0V600" />
        <path d="M120.5 0V600" />
        <path d="M180.5 0V600" />
        <path d="M240.5 0V600" />
        <path d="M300.5 0V600" />
        <path d="M360.5 0V600" />
        <path d="M420.5 0V600" />
        <path d="M480.5 0V600" />
        <path d="M540.5 0V600" />
      </g>
    </svg>
  `);

export default function Hero() {
  const handleScroll = () => {
    const target = document.getElementById("run-interface");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="relative overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.18),_rgba(15,23,42,0.95))]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen"
        style={{ backgroundImage: `url(${gridPattern})` }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-24 pt-28 lg:flex-row lg:items-center lg:gap-20">
        <div className="flex-1 text-slate-100">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.32em] text-emerald-200/90">
            Leadrunner Studio
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
              Powered by XenTeck
            </span>
          </div>
          <h1 className="mt-8 text-4xl font-semibold text-white sm:text-5xl lg:text-6xl">
            The premium AI partner for precision lead generation.
          </h1>
          <p className="mt-6 max-w-2xl text-base text-slate-200/85 sm:text-lg">
            Launch intelligent crawls, score every opportunity against your ICP, and deliver polished Google Sheet outputs your team can act on instantly.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button
              onClick={handleScroll}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-teal-500 px-8 py-3 text-sm font-semibold text-slate-900 shadow-[0_20px_80px_rgba(56,189,248,0.35)] transition hover:shadow-[0_24px_100px_rgba(56,189,248,0.45)]"
            >
              Launch a run
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/50 text-[11px] text-white group-hover:translate-x-0.5 transition">
                →
              </span>
            </button>
            <Link
              href="mailto:hello@xenteck.com"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white/85 transition hover:border-emerald-300/80 hover:text-emerald-200"
            >
              Book a walkthrough
            </Link>
          </div>
          <ul className="mt-12 space-y-3 text-sm text-slate-200/85">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-emerald-300/80 shadow-[0_0_12px_rgba(56,189,248,0.6)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="relative flex-1">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/30 via-sky-500/10 to-transparent blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_32px_120px_rgba(12,74,110,0.45)] backdrop-blur">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span className="font-semibold text-white">Live metrics</span>
              <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-emerald-300/90">
                Realtime
              </span>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {quickStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-5 text-center">
                  <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-white/50">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-6 py-5 text-sm text-emerald-100">
              <p className="font-semibold text-emerald-200">“We launched five campaigns in a week without adding headcount.”</p>
              <p className="mt-2 text-xs text-emerald-100/80">— RevOps Lead, Series B SaaS</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.28em] text-white/55">
              <span className="rounded-full border border-white/15 px-3 py-1">Firecrawl</span>
              <span className="rounded-full border border-white/15 px-3 py-1">OpenAI</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Google Sheets</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Governed Access</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
