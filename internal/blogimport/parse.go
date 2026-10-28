// Package blogimport parses offline exports. It never fetches remote resources.
package blogimport

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/pkg/errors"

	"github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

	"github.com/usememos/memos/internal/safearchive"
)

const MaxPostBytes = 1 << 20

type Post struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Created    time.Time `json:"created"`
	Updated    time.Time `json:"updated"`
	Tags       []string  `json:"tags"`
	Categories []string  `json:"categories"`
	Draft      bool      `json:"draft"`
	Private    bool      `json:"private"`
	Slug       string    `json:"slug,omitempty"`
	SourceURL  string    `json:"sourceUrl,omitempty"`
	Changes    []string  `json:"changes"`
	Error      string    `json:"error,omitempty"`
}

func MarkdownZIP(reader io.ReaderAt, size int64) ([]Post, map[string]*zip.File, error) {
	files, err := safearchive.Read(reader, size, safearchive.Limits{Files: 5000, TotalBytes: 256 << 20, FileBytes: 20 << 20})
	if err != nil {
		return nil, nil, err
	}
	names := make([]string, 0, len(files))
	for n := range files {
		names = append(names, n)
	}
	slices.Sort(names)
	posts := []Post{}
	for _, n := range names {
		if !strings.EqualFold(path.Ext(n), ".md") && !strings.EqualFold(path.Ext(n), ".markdown") {
			continue
		}
		p := Post{ID: n}
		b, e := safearchive.Bytes(files[n], MaxPostBytes)
		if e == nil {
			p, e = Markdown(n, b, files[n].Modified)
		}
		if e != nil {
			p.Error = e.Error()
		}
		posts = append(posts, p)
	}
	if len(posts) == 0 {
		return nil, nil, errors.New("ZIP contains no Markdown articles")
	}
	return posts, files, nil
}

func Markdown(name string, data []byte, modified time.Time) (Post, error) {
	p := Post{ID: name, Changes: []string{}, Tags: []string{}, Categories: []string{}}
	text := strings.ReplaceAll(strings.TrimPrefix(string(data), "\ufeff"), "\r\n", "\n")
	m := map[string]any{}
	for _, delimiter := range []string{"---", "+++"} {
		if !strings.HasPrefix(text, delimiter+"\n") {
			continue
		}
		end := strings.Index("\n"+text[len(delimiter)+1:], "\n"+delimiter+"\n")
		if end < 0 {
			return p, errors.New("unterminated front matter")
		}
		header := text[len(delimiter)+1 : len(delimiter)+1+end]
		var err error
		if delimiter == "---" {
			err = yaml.Unmarshal([]byte(header), &m)
		} else {
			err = toml.Unmarshal([]byte(header), &m)
		}
		if err != nil {
			return p, errors.Wrap(err, "invalid front matter")
		}
		text = text[len(delimiter)+1+end+len(delimiter)+1:]
		break
	}
	p.Title = singleLine(asString(m["title"]))
	p.Slug = asString(m["slug"])
	p.Draft = asBool(m["draft"]) || isFalse(m["published"])
	p.Created = parseDate(m["date"])
	if p.Created.IsZero() {
		base := path.Base(name)
		if len(base) >= 10 {
			p.Created = parseDate(base[:10])
		}
	}
	if p.Created.IsZero() {
		p.Created = modified.UTC()
	}
	if p.Created.IsZero() {
		return p, errors.New("article has no usable date")
	}
	p.Updated = parseDate(m["updated"])
	if p.Updated.IsZero() {
		p.Updated = parseDate(m["lastmod"])
	}
	if p.Updated.IsZero() {
		p.Updated = p.Created
	}
	p.Tags = values(m["tags"])
	p.Categories = values(m["categories"])
	p.Content = strings.TrimSpace(text)
	if err := validateMetadata(p); err != nil {
		return p, err
	}
	return p, nil
}

func (p *Post) Compose(categories map[string]string) (string, string) {
	content := p.Content
	if p.Title != "" {
		content = "# " + p.Title + "\n\n" + content
	}
	tags := []string{}
	category := ""
	for _, c := range p.Categories {
		if found := categories[strings.ToLower(c)]; found != "" && category == "" {
			category = found
		} else {
			tags = append(tags, "分类/"+c)
		}
	}
	tags = append(tags, p.Tags...)
	cleaned := []string{}
	for _, tag := range tags {
		n := NormalizeTag(tag)
		if n != tag {
			p.Changes = append(p.Changes, fmt.Sprintf("tag %q → %q", tag, n))
		}
		if n != "" && !slices.Contains(cleaned, n) {
			cleaned = append(cleaned, n)
		}
	}
	if len(cleaned) > 0 {
		for i := range cleaned {
			cleaned[i] = "#" + cleaned[i]
		}
		content += "\n\n" + strings.Join(cleaned, " ")
	}
	return strings.TrimSpace(content), category
}

func NormalizeTag(s string) string {
	s = strings.TrimLeft(strings.TrimSpace(s), "#")
	r := []rune{}
	for _, c := range s {
		if unicode.IsSpace(c) {
			c = '-'
		}
		if unicode.IsLetter(c) || unicode.IsDigit(c) || strings.ContainsRune("-_/", c) {
			r = append(r, c)
		}
		if len(r) == 64 {
			break
		}
	}
	return strings.Trim(string(r), "-/")
}
func values(v any) []string {
	result := []string{}
	switch x := v.(type) {
	case string:
		if strings.TrimSpace(x) != "" {
			result = append(result, strings.TrimSpace(x))
		}
	case []any:
		for _, a := range x {
			result = append(result, values(a)...)
		}
	case []string:
		result = x
	default:
		return result
	}
	return result
}
func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
func parseBool(v any) (bool, bool) {
	if b, ok := v.(bool); ok {
		return b, true
	}
	if s, ok := v.(string); ok {
		b, err := strconv.ParseBool(strings.TrimSpace(s))
		return b, err == nil
	}
	return false, false
}
func asBool(v any) bool          { b, ok := parseBool(v); return ok && b }
func isFalse(v any) bool         { b, ok := parseBool(v); return ok && !b }
func singleLine(s string) string { return strings.Join(strings.Fields(s), " ") }
func parseDate(v any) time.Time {
	if t, ok := v.(time.Time); ok {
		return t.UTC()
	}
	s := asString(v)
	if formatted, ok := v.(fmt.Stringer); ok {
		s = formatted.String()
	}
	for _, f := range []string{time.RFC3339Nano, "2006-01-02 15:04:05 -0700", "2006-01-02 15:04:05 -07:00", "2006-01-02 15:04:05", "2006-01-02T15:04:05", "2006-01-02"} {
		if t, e := time.Parse(f, s); e == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// WXR rejects declarations (including DTD/entity declarations) explicitly. Go's
// XML decoder does not resolve external entities; no network API is involved.
func WXR(data []byte, modified time.Time) ([]Post, error) {
	d := xml.NewDecoder(bytes.NewReader(data))
	posts := []Post{}
	for {
		tok, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, errors.Wrap(err, "invalid WXR")
		}
		if _, ok := tok.(xml.Directive); ok {
			return nil, errors.New("XML declarations/DTDs are forbidden")
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "item" {
			continue
		}
		var item struct {
			Title      string `xml:"title"`
			Link       string `xml:"link"`
			Content    string `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
			ID         string `xml:"post_id"`
			Type       string `xml:"post_type"`
			Status     string `xml:"status"`
			Date       string `xml:"post_date_gmt"`
			Modified   string `xml:"post_modified_gmt"`
			Slug       string `xml:"post_name"`
			Categories []struct {
				Domain string `xml:"domain,attr"`
				Text   string `xml:",chardata"`
			} `xml:"category"`
		}
		if err := d.DecodeElement(&item, &start); err != nil {
			return nil, errors.Wrap(err, "invalid WXR article")
		}
		if item.Type != "post" && item.Type != "page" {
			continue
		}
		p := Post{ID: item.ID, Title: singleLine(item.Title), SourceURL: item.Link, Slug: item.Slug, Draft: item.Status != "publish" && item.Status != "private", Private: item.Status == "private", Changes: []string{}, Tags: []string{}, Categories: []string{}}
		if p.ID == "" {
			p.ID = item.Link
		}
		if p.ID == "" {
			return nil, errors.New("WXR article missing ID and source URL")
		}
		p.Created = parseDate(item.Date)
		if p.Created.IsZero() {
			p.Created = modified.UTC()
		}
		p.Updated = parseDate(item.Modified)
		if p.Updated.IsZero() {
			p.Updated = p.Created
		}
		if len(item.Content) > MaxPostBytes {
			p.Error = "article exceeds parser size limit"
		} else {
			p.Content = HTMLMarkdown(item.Content)
		}
		if len(p.Content) > MaxPostBytes {
			p.Error = "article exceeds parser size limit"
		}
		for _, c := range item.Categories {
			if c.Domain == "post_tag" {
				p.Tags = append(p.Tags, c.Text)
			} else if c.Domain == "category" {
				p.Categories = append(p.Categories, c.Text)
			}
		}
		if err := validateMetadata(p); err != nil {
			p.Error = err.Error()
		}
		posts = append(posts, p)
		if len(posts) > 5000 {
			return nil, errors.New("WXR exceeds 5000 articles")
		}
	}
	if len(posts) == 0 {
		return nil, errors.New("WXR contains no posts or pages")
	}
	return posts, nil
}

func validateMetadata(p Post) error {
	if len(p.ID) > 2048 || len(p.Title) > 1024 || len(p.Slug) > 256 || len(p.SourceURL) > 2048 || len(p.Tags) > 100 || len(p.Categories) > 100 {
		return errors.New("article metadata exceeds import limits")
	}
	for _, v := range append(slices.Clone(p.Tags), p.Categories...) {
		if len(v) > 512 {
			return errors.New("tag/category exceeds 512 bytes")
		}
	}
	return nil
}

// ResolveImage resolves only archive-local references; external URLs remain untouched.
func ResolveImage(postID, destination string) (string, bool) {
	u, e := url.Parse(destination)
	if e != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(destination, "//") {
		return "", false
	}
	n := path.Clean(path.Join(path.Dir(postID), u.Path))
	if strings.HasPrefix(n, "../") || n == ".." || strings.HasPrefix(u.Path, "/") {
		return "", false
	}
	return n, true
}
