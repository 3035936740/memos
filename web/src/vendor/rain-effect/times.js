// Vendored from codrops/RainEffect (Lucas Bebber). See ATTRIBUTION.md for source and integration changes.
export default function times(n, f) {
  for (let i = 0; i < n; i++) {
    f.call(this, i);
  }
}
