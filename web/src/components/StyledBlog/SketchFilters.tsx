const SEEDS = [1, 2, 3];

/**
 * SVG filters the hand-drawn style uses to roughen its outlines (see blog-styles.css): each one displaces a line
 * with a little noise so it wobbles like ink. Three seeds let a hovered outline flick between them and "boil".
 */
const SketchFilters = () => (
  <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute size-0 overflow-hidden">
    <defs>
      {SEEDS.map((seed) => (
        <filter key={seed} id={`sb-sketch-${seed}`} x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
    </defs>
  </svg>
);

export default SketchFilters;
