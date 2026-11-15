import Link from "next/link";

const FEATURES = [
  {
    href: "/atlas?mode=explore",
    title: "Layered 3D atlas",
    body: "Peel the arm and hand from skin to bone. Every superficial vein, the arteries and nerves that put a draw at risk, and both common antecubital patterns.",
    tag: "Explore",
  },
  {
    href: "/atlas?mode=sim",
    title: "Venipuncture simulator",
    body: "Palpate, apply a tourniquet, pick a site, set your angle and depth, then advance the needle. Get an anatomical debrief on every attempt.",
    tag: "Practise",
  },
  {
    href: "/vein-finder",
    title: "Photo vein finder",
    body: "Upload a photo of an arm or hand. Vessel-enhancement filters map visible veins on-device and rank candidate sites by calibre, straightness and length.",
    tag: "Analyse",
  },
  {
    href: "/reference",
    title: "Bedside reference",
    body: "Order of draw trainer, step-by-step procedure, site-selection rules, and how to recognise and manage complications.",
    tag: "Review",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Phlebotomy education
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          See the veins before you ever hold a needle.
        </h1>
        <p className="mt-5 text-lg text-slate-300">
          VenaLab is an interactive trainer for venous access in the arm and hand: a layered 3D
          anatomical model, a needle-placement simulator with instant feedback, and an on-device
          vein mapper for photographs.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/atlas?mode=sim" className="btn">
            Start practising
          </Link>
          <Link href="/vein-finder" className="btn btn-ghost">
            Try the vein finder
          </Link>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className="panel group p-5 transition hover:border-accent/60 hover:bg-ink-800/80"
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest text-accent">
              {f.tag}
            </span>
            <h2 className="mt-2 text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            <span className="mt-4 inline-block text-sm text-slate-300 group-hover:text-white">
              Open →
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-12 max-w-3xl text-xs leading-relaxed text-slate-500">
        For education and training only. VenaLab is not a medical device, has not been clinically
        validated, and does not replace supervised practice, institutional policy, or palpation and
        clinical judgement at the bedside.
      </p>
    </div>
  );
}
