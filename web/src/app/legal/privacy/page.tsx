import Link from "next/link";

const sections = [
  {
    title: "1. Information We Collect",
    content: [
      "Client-provided inputs (URLs, ICP guidance, Google Sheet links).",
      "Integration metadata (sheet IDs, service account email, run options).",
      "Operational telemetry (logs and metrics)."
    ]
  },
  {
    title: "2. How We Use Information",
    content: [
      "Execute requested lead discovery jobs and deliver results.",
      "Monitor, secure, and improve the Service.",
      "Comply with legal obligations and respond to support requests."
    ]
  },
  {
    title: "3. Client Responsibilities",
    content: [
      "Submit only data you are authorized to process.",
      "Share Google assets with the service account using least privilege.",
      "Revoke access when processing completes if continued access is unnecessary."
    ]
  }
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Privacy Policy</h1>
      <p className="mt-4 text-sm text-slate-300">Last updated: September 25, 2025</p>
      <p className="mt-6 text-base text-slate-200">
        This summary is provided for quick reference. The full policy is maintained in the repository at
        {" "}
        <Link href="https://github.com/ShaunandDavid/lead-generator-firecrawl/blob/main/docs/legal/privacy-policy.md" className="text-emerald-300 hover:text-emerald-200" target="_blank" rel="noreferrer">
          docs/legal/privacy-policy.md
        </Link>
        .
      </p>
      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-slate-300">
              {section.content.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-300">
        Questions? Email <a href="mailto:privacy@xenteck.com" className="text-emerald-300 hover:text-emerald-200">privacy@xenteck.com</a>.
      </p>
    </main>
  );
}