import { cn } from "@/lib/utils";

/**
 * SolBeat logo lockup. The PulseGlyph is the official BV-rendered S+pulse
 * mark from `/public/favicon.svg`, plus the wordmark to its right. Used
 * in TopNav, the OG image template, and anywhere else we need brand.
 *
 * The mark and the word are sized together so the optical weight stays
 * balanced — bumping `size` scales both proportionally rather than
 * just the icon.
 */
export function Logo({
  className,
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2 select-none", className)}>
      <PulseGlyph size={size} />
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: size * 0.66 }}
      >
        SolBeat
      </span>
    </div>
  );
}

/**
 * Brand mark — the gradient S with the embedded pulse trace. Loaded from
 * /public/favicon.svg so a single asset feeds every surface (browser
 * tab, layout header, OG cards, social previews). A subtle drop-shadow
 * gives it just enough lift against the glass nav background.
 */
export function PulseGlyph({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.svg"
      alt=""
      width={size}
      height={size}
      className={cn("block", className)}
      style={{
        width: size,
        height: size,
        filter: "drop-shadow(0 2px 6px rgba(255, 45, 156, 0.18))",
      }}
      aria-hidden
    />
  );
}
