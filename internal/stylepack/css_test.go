package stylepack

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestScopeAndAssets(t *testing.T) {
	out, err := Compile("test-pack", "abc", `:root{--color:red!important} .card,:is(.a,.b):where(.c){color:var(--color)} @media (min-width: 10px){.card{background:url("asset:paper.png")}} @keyframes bob{from{opacity:0}to{opacity:1}} .a{animation:bob 1s}`, map[string]Asset{"paper.png": {ContentType: "image/png"}})
	require.NoError(t, err)
	require.Contains(t, out, `html[data-style="test-pack"]{`)
	require.Contains(t, out, `html[data-style="test-pack"] :is(.a,.b):where(.c)`)
	require.Contains(t, out, `/style-packs/test-pack/abc/assets/paper.png`)
	require.Contains(t, out, `animation:memos-pack-test-pack-bob`)
}
func TestCSSRejectsSecurityBypasses(t *testing.T) {
	for _, input := range []string{
		`@import "https://evil.test/a.css";`, `@namespace url(https://evil.test);`, `@unknown{.a{color:red}}`, `.a{background:url(https://evil.test)}`, `.a{background:url(//evil.test)}`, `.a{background:url(/other)}`, `.a{background:url(javascript:alert(1))}`, `.a{color:expression(alert(1))}`, `.a{color:e\78pression(alert(1))}`, `.a{behavior:url(asset:a)}`, `.a{-moz-binding:none}`, `.a{color:red!important}`, `.a{--image:url(https://evil.test)}`, `.a{background:image-set("https://evil.test/a.png" 1x)}`, `.a{background:url(data:image/svg+xml;base64,PHN2Zz4=)}`, `.a{background:url(asset:missing.png)}`, strings.Repeat("a", (200<<10)+1),
	} {
		t.Run(input[:min(len(input), 50)], func(t *testing.T) { _, err := Compile("test-pack", "v", input, nil); require.Error(t, err) })
	}
}
func TestSVGRestrictions(t *testing.T) {
	for _, svg := range []string{`<svg><script>alert(1)</script></svg>`, `<svg onload="x()"/>`, `<!DOCTYPE svg><svg/>`, `<svg><use href="https://evil.test/a.svg"/></svg>`, `<svg><foreignObject/></svg>`} {
		require.Error(t, validateSVG([]byte(svg)))
	}
	require.NoError(t, validateSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10Z"/></svg>`)))
}

func TestFontsAndSVGMustUseOwnedResources(t *testing.T) {
	assets := map[string]Asset{"font.woff2": {ContentType: "font/woff2"}, "art.svg": {ContentType: "image/svg+xml"}}
	out, err := Compile("test-pack", "v", `@font-face{font-family:"Pack Font";src:url(asset:font.woff2) format("woff2")} .a{font-family:"Pack Font";background:url(asset:art.svg)}`, assets)
	require.NoError(t, err)
	require.Contains(t, out, `"memos-pack-test-pack-Pack-Font"`)
	for _, source := range []string{`@font-face{font-family:X;src:local(Arial)}`, `@font-face{font-family:X;src:url(data:font/woff2;base64,AAAA)}`, `.a{cursor:url(asset:art.svg),auto}`, `.a{--image:url(asset:art.svg)}`} {
		_, err = Compile("test-pack", "v", source, assets)
		require.Error(t, err)
	}
	require.Error(t, validateSVG([]byte(`<svg><path fill="url(#safe) url(https://evil.test/image)"/></svg>`)))
}
