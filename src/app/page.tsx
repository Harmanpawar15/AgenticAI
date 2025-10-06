import ClaimForm from "../components/ClaimForm";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* HERO / INTRO */}
      <section className="mb-8 rounded-2xl bg-blue-50 p-6">
        <h1 className="text-3xl font-bold">Meet Your AI Claims Assistant 🤖</h1>
        <p className="mt-2 text-gray-700">
          This demo shows how an <strong>AI employee</strong> can read a healthcare claim,
          check it for missing information, correct procedure codes, and predict denial risk —
          just like a billing specialist, but in seconds.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Synthetic data only · No real patient info stored · HIPAA-safe simulation
        </p>
      </section>

      <ClaimForm />

      {/* Outcome summary is now inside the component, shown after a run */}
      <footer className="mt-10 text-xs text-gray-500">
        Built with Next.js + Gemini. For demo purposes only.
      </footer>
    </main>
  );
}