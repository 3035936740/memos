package stylepack

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/version"
)

func TestExpandedSVGUsesAndInlineSanitization(t *testing.T) {
	assets := map[string]Asset{"icon.svg": {ContentType: "image/svg+xml"}}
	for _, property := range []string{"background", "background-image", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "mask-border", "mask-border-source", "-webkit-mask-box-image", "border-image", "border-image-source", "list-style", "list-style-image", "content", "cursor", "--icon"} {
		out, err := Compile("test-pack", "v", ".a{"+property+":url(asset:icon.svg)}", assets)
		require.NoError(t, err, property)
		require.Contains(t, out, "/style-packs/test-pack/v/assets/icon.svg")
	}
	_, err := Compile("test-pack", "v", `.a{color:url(asset:icon.svg)}`, assets)
	require.Error(t, err)
	good := `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10Z"/></svg>`
	for _, svg := range []string{good, `<svg><script/></svg>`, `<svg onload="x()"/>`, `<svg><use href="https://evil.test/a"/></svg>`, `<svg><path fill="url(https://evil.test/a)"/></svg>`, `<svg><foreignObject/></svg>`, `<svg>` + strings.Repeat(" ", 64<<10) + `</svg>`} {
		for _, data := range []string{"data:image/svg+xml," + url.PathEscape(svg), "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))} {
			_, err = Compile("test-pack", "v", `.a{--icon:url("`+data+`")}`, nil)
			if svg == good {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		}
	}
}

func TestSafeContentAttributes(t *testing.T) {
	for _, source := range []string{`.a::after{content:attr(data-sb-pinned)}`, `.a::after{content:"【" attr(data-sb-window-title) "】"}`} {
		out, err := Compile("test-pack", "v", source, nil)
		require.NoError(t, err)
		require.Contains(t, out, "attr(data-sb-")
	}
	for _, source := range []string{`.a{content:attr(href)}`, `.a{background:attr(data-sb-x)}`, `.a{--x:attr(data-sb-x)}`, `.a{content:attr(data-sb-x url)}`, `.a{content:attr(data-sb-x type(<url>), "x")}`, `.a{content:attr(data-sb-x, "x")}`, `.a{content:\61ttr(data-sb-x)}`, `.a{content:attr()}`} {
		_, err := Compile("test-pack", "v", source, nil)
		require.Error(t, err, source)
	}
}

func TestRootSelectorsAndNewAtRules(t *testing.T) {
	out, err := Compile("test-pack", "v", `html[data-theme$="-dark"] .x{color:red} HTML.x{color:blue} html:not(.light){color:black} :root{--x:1} .html,[title="html"]{color:red}`, nil)
	require.NoError(t, err)
	require.Contains(t, out, `html[data-style="test-pack"][data-theme$="-dark"] .x`)
	require.Contains(t, out, `html[data-style="test-pack"].x`)
	require.NotContains(t, out, `html[data-style="test-pack"] html`)
	for _, selector := range []string{`.a html`, `.a :root`, `:is(html) .x`, `:where(:root)`, `:not(html)`, `:is(.x,HTML)`, `.a > HTML`, `:root html`, `:root :root`} {
		_, err = Compile("test-pack", "v", "/* first */\n"+selector+"{color:red}", nil)
		require.ErrorContains(t, err, "只能写在选择器开头", selector)
		require.ErrorContains(t, err, "line 2")
	}
	out, err = Compile("sunset-paper", "v", `@starting-style{.card{opacity:0}} @property --sunset-paper-glow{syntax:"<number>";inherits:false;initial-value:0}`, nil)
	require.NoError(t, err)
	require.Contains(t, out, `@starting-style {html[data-style="sunset-paper"] .card`)
	require.Contains(t, out, `@property --sunset-paper-glow`)
	for _, source := range []string{`@property --sb-radius{syntax:"<number>";inherits:false;initial-value:0}`, `@property --sunset-paper-x{syntax:"<image>";inherits:false;initial-value:url(https://evil.test/a)}`, `@property --sunset-paper-x{bogus:1}`, `@starting-style{.a{background:url(https://evil.test/a)}}`} {
		_, err = Compile("sunset-paper", "v", source, nil)
		require.Error(t, err, source)
	}
}

func fontBytes(n int) []byte { b := make([]byte, n); copy(b, "wOF2"); return b }

func TestSeparateFontQuotas(t *testing.T) {
	source := `@font-face{font-family:Subset;src:url(asset:font.woff2) format("woff2");unicode-range:U+4E00-9FFF;font-display:swap;font-weight:100 900}`
	p, err := Parse(archivePack(t, "font-pack", source, map[string][]byte{"assets/font.woff2": fontBytes(6 << 20)}))
	require.NoError(t, err)
	require.Len(t, p.Assets[0].Content, 6<<20)
	require.Contains(t, p.Compiled, "unicode-range:U+4E00-9FFF")
	for _, assets := range []map[string][]byte{
		{"assets/font.woff2": fontBytes(MaxFontBytes + 1)},
		{"assets/a.woff2": fontBytes(MaxFontBytes), "assets/b.woff2": fontBytes(MaxFontBytes), "assets/c.woff2": fontBytes(48)},
		{"assets/a.png": append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, MaxAssetsBytes)...)},
	} {
		_, err = Parse(archivePack(t, "font-pack", `.a{color:red}`, assets))
		require.Error(t, err)
	}
	for _, count := range []int{128, 129} {
		assets := map[string][]byte{}
		for i := range count {
			assets[fmt.Sprintf("assets/f%d.woff2", i)] = fontBytes(48)
		}
		_, err = Parse(archivePack(t, "font-pack", `.a{color:red}`, assets))
		if count == 128 {
			require.NoError(t, err)
		} else {
			require.Error(t, err)
		}
	}
	_, err = Parse(make([]byte, MaxZIPBytes+1))
	require.Error(t, err)
}

func manifestZIP(t *testing.T, m map[string]any, assets map[string][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	files := map[string][]byte{"style.css": []byte(`.a{color:red}`)}
	var err error
	files["style.json"], err = json.Marshal(m)
	require.NoError(t, err)
	for name, data := range assets {
		files["assets/"+name] = data
	}
	for name, data := range files {
		f, err := w.Create(name)
		require.NoError(t, err)
		_, err = f.Write(data)
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())
	return b.Bytes()
}

func TestManifestMetadataAndCompatibility(t *testing.T) {
	original := version.PlusVersion
	version.PlusVersion = "1.2.3"
	t.Cleanup(func() { version.PlusVersion = original })
	manifest := func() map[string]any {
		return map[string]any{"kind": "memos-plus.style", "version": 1, "id": "meta-pack", "name": map[string]string{"en": "Test"}, "description": map[string]string{"zh-Hans": "简介", "en": "Description"}, "preview": "preview.svg", "minVersion": "1.2.0"}
	}
	assets := map[string][]byte{"preview.svg": []byte(`<svg/>`), "font.woff2": fontBytes(48)}
	p, err := Parse(manifestZIP(t, manifest(), assets))
	require.NoError(t, err)
	require.Equal(t, "简介", p.Manifest.Description["zh-Hans"])
	for _, change := range []map[string]any{{"preview": "missing.png"}, {"preview": "font.woff2"}, {"minVersion": "9.0.0"}, {"minVersion": "1.2"}, {"minVersion": "invalid"}, {"typo": true}, {"description": map[string]string{"en": strings.Repeat("字", 501)}}} {
		m := manifest()
		for k, v := range change {
			m[k] = v
		}
		_, err = Parse(manifestZIP(t, m, assets))
		require.Error(t, err, change)
	}
	desc := map[string]string{}
	for i := range 33 {
		desc[fmt.Sprint(i)] = strings.Repeat("字", 500)
	}
	m := manifest()
	m["description"] = desc
	_, err = Parse(manifestZIP(t, m, assets))
	require.Error(t, err)
	delete(desc, "32")
	_, err = Parse(manifestZIP(t, m, assets))
	require.NoError(t, err)
	version.PlusVersion = "1.2.0-dev"
	_, err = Parse(manifestZIP(t, manifest(), assets))
	require.ErrorContains(t, err, "requires Memos Plus 1.2.0")
}
