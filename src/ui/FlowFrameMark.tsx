import { FLOWFRAME } from '../render/perf/brand';

/** The FlowFrame mark (see `render/perf/brand.ts`): decorative, drawn in the current text colour. */
export function FlowFrameMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="ff-mark"
      data-testid="flowframe-mark"
      width={size}
      height={size}
      viewBox={FLOWFRAME.mark.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {FLOWFRAME.mark.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
