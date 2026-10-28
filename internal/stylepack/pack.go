// Package stylepack validates community CSS packs before they reach a browser.
package stylepack

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"slices"
	"strings"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/safearchive"
)

const MaxZIPBytes = 3 << 20

var Builtins = []string{"default", "glass", "neumorphism", "aero", "y2k", "vaporwave", "pixel", "handdrawn", "terminal", "golden"}

type Manifest struct {
	Kind        string            `json:"kind"`
	Version     int               `json:"version"`
	ID          string            `json:"id"`
	Name        map[string]string `json:"name"`
	Author      string            `json:"author"`
	Homepage    string            `json:"homepage"`
	License     string            `json:"license"`
	ReactsLike  string            `json:"reactsLike,omitempty"`
	ColorScheme string            `json:"colorScheme,omitempty"`
}
type Asset struct {
	Name, ContentType string
	Content           []byte
}
type Pack struct {
	Manifest                    Manifest
	Original, Compiled, Version string
	ZIP                         []byte
	Assets                      []Asset
}

func IsBuiltin(id string) bool { return slices.Contains(Builtins, id) }
func validID(id string) bool {
	if len(id) < 3 || len(id) > 32 || strings.HasPrefix(id, "memos-") || IsBuiltin(id) {
		return false
	}
	for _, c := range id {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '-' {
			return false
		}
	}
	return true
}

func Parse(data []byte) (*Pack, error) {
	if len(data) > MaxZIPBytes {
		return nil, errors.New("style ZIP exceeds 3 MB")
	}
	files, err := safearchive.Read(bytes.NewReader(data), int64(len(data)), safearchive.Limits{Files: 64, TotalBytes: (2 << 20) + (200 << 10) + (16 << 10), FileBytes: 2 << 20})
	if err != nil {
		return nil, err
	}
	manifestFile, cssFile := files["style.json"], files["style.css"]
	if manifestFile == nil || cssFile == nil {
		return nil, errors.New("style.json and style.css required at ZIP root")
	}
	b, err := safearchive.Bytes(manifestFile, 16<<10)
	if err != nil {
		return nil, err
	}
	p := &Pack{ZIP: data, Assets: []Asset{}}
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err = d.Decode(&p.Manifest); err != nil {
		return nil, errors.Wrap(err, "invalid style.json")
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return nil, errors.New("trailing manifest JSON")
	}
	m := p.Manifest
	if m.Kind != "memos-plus.style" || m.Version != 1 || !validID(m.ID) {
		return nil, errors.New("invalid style kind, version or ID")
	}
	if len(m.Name) == 0 || len(m.Name) > 32 {
		return nil, errors.New("localized style name required")
	}
	for lang, n := range m.Name {
		if lang == "" || len(lang) > 32 || strings.TrimSpace(n) == "" || len(n) > 256 {
			return nil, errors.New("invalid localized name")
		}
	}
	if len(m.Author) > 256 || len(m.License) > 128 || len(m.Homepage) > 2048 {
		return nil, errors.New("manifest metadata too long")
	}
	if m.Homepage != "" {
		u, e := url.Parse(m.Homepage)
		if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, errors.New("invalid homepage URL")
		}
	}
	if m.ReactsLike != "" && !IsBuiltin(m.ReactsLike) {
		return nil, errors.New("reactsLike must name a builtin style")
	}
	if m.ColorScheme != "" && m.ColorScheme != "light" && m.ColorScheme != "dark" {
		return nil, errors.New("invalid colorScheme")
	}
	b, err = safearchive.Bytes(cssFile, 200<<10)
	if err != nil {
		return nil, err
	}
	p.Original = string(b)
	resources := map[string]Asset{}
	var total int
	names := make([]string, 0, len(files))
	for n := range files {
		names = append(names, n)
	}
	slices.Sort(names)
	for _, name := range names {
		f := files[name]
		if name == "style.json" || name == "style.css" {
			continue
		}
		if !strings.HasPrefix(name, "assets/") {
			return nil, errors.Errorf("unexpected ZIP entry %q", name)
		}
		if len(p.Assets) >= 20 {
			return nil, errors.New("at most 20 assets allowed")
		}
		blob, e := safearchive.Bytes(f, 2<<20)
		if e != nil {
			return nil, e
		}
		total += len(blob)
		if total > 2<<20 {
			return nil, errors.New("assets exceed 2 MB")
		}
		contentType, e := assetType(name, blob)
		if e != nil {
			return nil, e
		}
		a := Asset{Name: strings.TrimPrefix(name, "assets/"), ContentType: contentType, Content: blob}
		resources[a.Name] = a
		p.Assets = append(p.Assets, a)
	}
	// Hash the compiled representation as well: a compiler upgrade must not
	// change the bytes behind an already cached immutable version URL.
	template, err := Compile(m.ID, "__pack_version__", p.Original, resources)
	if err != nil {
		return nil, err
	}
	hash := sha256.New()
	_, _ = hash.Write(data)
	_, _ = hash.Write([]byte(template))
	p.Version = fmt.Sprintf("%x", hash.Sum(nil))
	p.Compiled, err = Compile(m.ID, p.Version, p.Original, resources)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func assetType(name string, b []byte) (string, error) {
	ext := strings.ToLower(path.Ext(name))
	expected := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2"}[ext]
	if expected == "" {
		return "", errors.Errorf("unsupported asset %q", name)
	}
	if ext == ".svg" {
		if err := validateSVG(b); err != nil {
			return "", errors.Wrapf(err, "invalid SVG %s", name)
		}
	} else if ext == ".woff2" {
		if len(b) < 48 || string(b[:4]) != "wOF2" {
			return "", errors.Errorf("invalid WOFF2 %q", name)
		}
	} else if detected := http.DetectContentType(b); detected != expected {
		return "", errors.Errorf("asset %q does not match its extension", name)
	}
	return expected, nil
}

func validateSVG(b []byte) error {
	d := xml.NewDecoder(bytes.NewReader(b))
	root := false
	depth := 0
	allowed := strings.Fields("svg g path circle ellipse rect line polyline polygon defs symbol use linearGradient radialGradient stop clipPath mask title desc filter feGaussianBlur feOffset feBlend feColorMatrix feComposite feMerge feMergeNode")
	for {
		t, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		switch n := t.(type) {
		case xml.Directive:
			return errors.New("SVG declarations are forbidden")
		case xml.ProcInst:
			if n.Target != "xml" {
				return errors.New("SVG processing instructions are forbidden")
			}
		case xml.StartElement:
			if root && depth == 0 {
				return errors.New("multiple SVG roots")
			}
			depth++
			if depth > 64 {
				return errors.New("SVG nesting too deep")
			}
			if !slices.Contains(allowed, n.Name.Local) {
				return errors.Errorf("SVG element %s forbidden", n.Name.Local)
			}
			if !root {
				if n.Name.Local != "svg" {
					return errors.New("SVG root required")
				}
				root = true
			}
			for _, a := range n.Attr {
				key := strings.ToLower(a.Name.Local)
				v := strings.ToLower(strings.TrimSpace(a.Value))
				if strings.HasPrefix(key, "on") || key == "style" {
					return errors.New("SVG event/style attributes forbidden")
				}
				if key == "href" && !strings.HasPrefix(v, "#") {
					return errors.New("external SVG references forbidden")
				}
				if err := validateSVGAttribute(a.Value); err != nil {
					return err
				}
			}
		case xml.EndElement:
			depth--
		default:
		}
	}
	if !root || depth != 0 {
		return errors.New("invalid SVG structure")
	}
	return nil
}

func validateSVGAttribute(value string) error {
	tokens, err := lexerTokens(value)
	if err != nil {
		return err
	}
	for _, token := range tokens {
		decoded := strings.ToLower(cssText(string(token.Data)))
		if token.TokenType.String() == "Function" && strings.TrimSuffix(decoded, "(") == "url" {
			return errors.New("escaped SVG URL forbidden")
		}
		if token.TokenType.String() == "URL" {
			start := strings.IndexByte(decoded, '(')
			destination := strings.Trim(strings.TrimSpace(strings.TrimSuffix(decoded[start+1:], ")")), `"'`)
			if !strings.HasPrefix(destination, "#") {
				return errors.New("external SVG URLs forbidden")
			}
		}
	}
	return nil
}
