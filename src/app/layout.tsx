import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VenaLab — 3D venous anatomy & venipuncture trainer",
  description:
    "Layered 3D atlas of the arm and hand veins, a venipuncture simulator, and photo-based vein mapping for phlebotomy education. An educational tool, not medical advice; every patient in it is synthetic.",
};

const NAV = [
  { href: "/atlas", label: "Practice" },
  { href: "/vein-finder", label: "Vein Finder" },
  { href: "/reference", label: "Reference" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-3 sm:px-4">
            <Link href="/atlas" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 2c3.5 4.6 6 7.9 6 11.2A6 6 0 0 1 6 13.2C6 9.9 8.5 6.6 12 2Z"
                  fill="url(#g)"
                />
                <defs>
                  <linearGradient id="g" x1="6" y1="2" x2="18" y2="20">
                    <stop stopColor="#35e0c2" />
                    <stop offset="1" stopColor="#4f8cff" />
                  </linearGradient>
                </defs>
              </svg>
              <span>VenaLab</span>
            </Link>
            <nav className="flex items-center text-[13px] sm:gap-1 sm:text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-lg px-2 py-1.5 text-slate-300 transition hover:bg-white/5 hover:text-white sm:px-3"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          {/* Shown on every page: what this is, and what it is not. */}
          <p className="flex h-6 items-center justify-center gap-1.5 border-t border-white/10 bg-ink-900/80 px-3 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-200">Educational tool</span>
            <span aria-hidden>·</span>
            <span>not medical advice</span>
            <span aria-hidden>·</span>
            <span>synthetic patients only</span>
            <Link href="/reference#sources" className="ml-1 hidden text-accent hover:underline sm:inline">
              Sources
            </Link>
          </p>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
