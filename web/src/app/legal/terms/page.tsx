import Link from "next/link";

const clauses = [
  {
    title: "Key Commitments",
    points: [
      "Only submit data sources you are authorized to process.",
      "Comply with all applicable laws, website terms, and anti-spam rules.",
      "Manage access to any client-owned outputs (Google Sheets, exports)."
    ]
  },
  {
    title: "Service Scope",
    points: [
      "Service is provided \"as is\" without warranties.",
      "We may modify or suspend portions of the Service without notice.",
      "Liability is limited to direct damages up to fees paid in the prior 12 months."
    ]
  },
  {
    title: "When in Doubt",
    points: [
      "Consult legal counsel before using data subject to regulatory regimes.",
      "Contact legal@xenteck.com for questions about permitted use.",
      "Terminate access immediately if these Terms are breached."
    ]
  }
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Terms of Service</h1>
      <p className="mt-4 text-sm text-slate-300">Last updated: September 25, 2025</p>
      <p className="mt-6 text-base text-slate-200">
        This page highlights major obligations. Review the full Terms in the repository at
        {" "}
        <Link href="https://github.com/ShaunandDavid/lead-generator-firecrawl/blob/main/docs/legal/terms-of-service.md" className="text-emerald-300 hover:text-emerald-200" target="_blank" rel="noreferrer">
          docs/legal/terms-of-service.md
        </Link>
        .
      </p>
      <div className="mt-8 space-y-8">
        {clauses.map((clause) => (
          <section key={clause.title}>
            <h2 className="text-xl font-semibold text-white">{clause.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-slate-300">
              {clause.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-300">
        Legal questions? Email <a href="mailto:legal@xenteck.com" className="text-emerald-300 hover:text-emerald-200">legal@xenteck.com</a>.
      </p>
    </main>
  );
}