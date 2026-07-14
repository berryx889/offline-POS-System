// Consistent "this screen arrives in a later phase" panel. Keeps the shell fully
// navigable during Phase 1 without faking features that don't exist yet.

export function Placeholder({ title, phase, children }: { title: string; phase: string; children: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-2xl border border-ink/10 bg-tape p-8 shadow-card">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brass">{phase}</p>
        <h1 className="mb-3 font-sans text-xl font-semibold text-ink">{title}</h1>
        <p className="text-sm leading-relaxed text-ink/60">{children}</p>
      </div>
    </div>
  );
}
