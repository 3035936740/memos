/** An outlined cat with a separate face, tail and four animated legs, readable at its actual card size. */
const WalkingCat = () => (
  <span data-sb-cat-track="" aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]">
    <span data-sb-cat="" className="absolute bottom-1 start-2">
      <svg data-cat-drawing="" viewBox="0 0 96 64" fill="none" className="size-full" aria-hidden>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path data-cat-tail="" d="M28 33C13 34 15 21 10 12C7 6 3 8 5 12" strokeWidth="5" />
          <g fill="currentColor" opacity="0.55">
            <path data-cat-leg="back-far" d="m36 38 5 12 5 5q1 3-2 3h-6l-8-17Z" />
            <path data-cat-leg="front-far" d="m58 38 6 12 5 5q1 3-2 3h-6l-9-17Z" />
          </g>
          <path fill="currentColor" d="M25 29c7-7 18-5 27-4l12-6 8 15c-2 7-9 10-18 10H35c-11 0-17-7-10-15Z" />
          <path data-cat-leg="back-near" fill="currentColor" d="m28 37 8 2-4 12 1 5q0 3-3 3h-6q-2-1 0-3l2-4Z" />
          <path data-cat-leg="front-near" fill="currentColor" d="m57 36 8 1-3 17 3 2q2 3-1 3h-7q-3 0-2-4Z" />
          <path data-cat-bib="" d="m62 31 9 3-7 10-6-5Z" stroke="none" />
          <g data-cat-head="">
            <path fill="currentColor" d="m58 18-1-12q0-3 3-1l7 7q4-2 8 0l6-7q3-2 3 1l-1 14c4 5 3 11-2 15-6 5-17 4-22-1-4-4-5-10-1-16Z" />
            <path data-cat-ear="" d="m60 10 1 9 5-4Zm20 0-5 6 5 3Z" stroke="none" />
            <path data-cat-muzzle="" d="M63 28q2-5 7-2 5-3 8 2c3 6-2 9-7 9-6 0-11-3-8-9Z" stroke="none" />
            <path data-cat-eyes="" d="M62 23q2-3 4 0m9 0q2-3 4 0" strokeWidth="2.3" />
            <path data-cat-nose="" d="m68 28 6 0-3 3Z" stroke="none" />
            <path d="M71 31v2m-3 0q3 3 6 0M59 28l-8-2m8 5-8 1m32-4 8-2m-8 5 8 1" strokeWidth="1.3" />
          </g>
        </g>
      </svg>
    </span>
  </span>
);

export default WalkingCat;
