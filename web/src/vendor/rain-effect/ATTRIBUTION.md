# RainEffect

Source: https://github.com/codrops/RainEffect

Copyright © Codrops 2015. Original water simulation, normal/alpha textures and refraction shader by Lucas Bebber.

Upstream license: https://tympanus.net/codrops/licensing/

The upstream README permits integrating or building upon the code for personal or commercial projects, and prohibits republishing, redistributing or selling it as-is. This directory is integrated into Memos; it is not a standalone redistribution of the original demos.

Vendored upstream files: `raindrops.js`, `random.js`, `times.js`, `create-canvas.js`, `shaders/simple.vert`, `shaders/water.frag`, `drop-alpha.png`, `drop-color.png`.

Integration changes:

- The React adapter owns animation scheduling, visibility, reduced-motion handling and cleanup.
- Removed an unused image-loader import; made the local random import explicit.
- Fixed the upstream collision radius cap to read `options.maxR`.
- Added an optional bounded pool for small beads: they appear immediately, remain visible for 2.5 seconds,
  fade out over 750 ms, and are removed when swept up by a larger drop. The React
  adapter selects a cap of 150–250 per initialization, so prolonged visits cannot
  accumulate unbounded condensation on the texture.
- The fragment shader emits the water layer with transparency, allowing the live Memos page to remain interactive below it.
- The background refraction texture comes from a cached local document region using the project's existing `html-to-image`; no page data is transmitted.
  Scrolling updates texture coordinates without recapturing the DOM. Regions beyond the cache use the theme background color.
- Water texture storage and uniform locations are reused. The adapter caps total pixel count, debounces resize, and avoids rebuilding on mobile toolbar height changes.
- Normal-map sprites are reused across resizes. Bead removal and collision iteration avoid temporary arrays in the animation loop.
