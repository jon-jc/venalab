import { source, type SourceId } from "@/lib/reference/sources";

/** Names the standards a statement is taken from, each linked to the document. */
export function Cite({ ids, className = "" }: { ids: SourceId[]; className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-slate-500 ${className}`}>
      {ids.length > 1 ? "Sources" : "Source"}:{" "}
      {ids.map((id, i) => {
        const s = source(id);
        return (
          <span key={id}>
            {i > 0 && " · "}
            <a href={s.url} target="_blank" rel="noopener noreferrer" title={`${s.org}. ${s.title}. ${s.edition}`} className="tap underline decoration-white/25 underline-offset-2 hover:text-slate-200">
              {s.short}
            </a>
          </span>
        );
      })}
    </p>
  );
}
