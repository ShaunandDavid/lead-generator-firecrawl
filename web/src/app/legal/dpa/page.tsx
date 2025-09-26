import Link from "next/link";

const commitments = [
  {
    title: "Processor Role",
    items: [
      "We process personal data solely on the client’s documented instructions.",
      "Personnel with access to personal data are bound by confidentiality.",
      "Security controls include credential isolation, HTTPS transport, and audit logging."
    ]
  },
  {
    title: "Client Controls",
    items: [
      "Only submit personal data that can be lawfully processed.",
      "Respond to data subject requests received directly by the client.",
      "Request deletion of operational logs via privacy@xenteck.com when required."
    ]
  },
  {
    title: "Sub-processors & Transfers",
    items: [
      "We may use infrastructure sub-processors for hosting, logging, or alerting.",
      "International transfers may occur; safeguards follow the main DPA.",
      "Controller can request the current sub-processor list at any time."
    ]
  }
];

export default function DataProcessingAddendumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Data Processing Addendum</h1>
      <p className="mt-4 text-sm text-slate-300">Last updated: September 25, 2025</p>
      <p className="mt-6 text-base text-slate-200">
        This summary supplements the Terms when personal data is processed. The full DPA is located at
        {" "}
        <Link href="https://github.com/ShaunandDavid/lead-generator-firecrawl/blob/main/docs/legal/data-processing-addendum.md" className="text-emerald-300 hover:text-emerald-200" target="_blank" rel="noreferrer">
          docs/legal/data-processing-addendum.md
        </Link>
        .
      </p>
      <div className="mt-8 space-y-8">
        {commitments.map((commitment) => (
          <section key={commitment.title}>
            <h2 className="text-xl font-semibold text-white">{commitment.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-slate-300">
              {commitment.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-300">
        DPA inquiries: <a href="mailto:privacy@xenteck.com" className="text-emerald-300 hover:text-emerald-200">privacy@xenteck.com</a>.
      </p>
    </main>
  );
}