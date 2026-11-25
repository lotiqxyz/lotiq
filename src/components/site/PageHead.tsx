/* Title band for app pages: the reference's display-2 headline (cream line + lime line) over a muted lede. */
export function PageHead({ title, accent, children, actions }: { title: string; accent?: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="page-top pb-10">
      <div className="wrap">
        <h1 className="d2 max-w-[980px]" data-reveal="">
          {title}
          {accent ? (
            <>
              <br />
              <span className="lime">{accent}</span>
            </>
          ) : null}
        </h1>
        {children ? (
          <div className="mt-6 max-w-[760px] text-[17px] leading-relaxed text-muted" data-reveal="" style={{ "--delay": "100ms" } as React.CSSProperties}>
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: "Prototype" | "Concept" }) {
  return <span className={status === "Prototype" ? "badge-proto" : "badge-concept"}>{status}</span>;
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return <span className="badge-sample">{label}</span>;
}
export function LiveBadge({ label = "Live from chain" }: { label?: string }) {
  return <span className="badge-live">{label}</span>;
}
