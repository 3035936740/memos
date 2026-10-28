package blogimport

import (
	"archive/zip"
	"bytes"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestFrontMatter(t *testing.T) {
	for _, tt := range []struct{ name, content string }{
		{"yaml", "---\ntitle: Hello\ndate: 2020-01-02T12:00:00+08:00\ntags: [hello world, '#tag']\ncategories: music\ndraft: true\n---\nBody"},
		{"toml", "+++\ntitle = 'Hello'\ndate = '2020-01-02T12:00:00+08:00'\ntags = ['hello world', '#tag']\ncategories = 'music'\ndraft = true\n+++\nBody"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			p, err := Markdown("2023-01-01-a.md", []byte(tt.content), time.Now())
			require.NoError(t, err)
			require.Equal(t, "Hello", p.Title)
			require.Equal(t, "Body", p.Content)
			require.Equal(t, 4, p.Created.Hour())
			require.True(t, p.Draft)
			body, cat := p.Compose(map[string]string{"music": "music"})
			require.Equal(t, "music", cat)
			require.Equal(t, "# Hello\n\nBody\n\n#hello-world #tag", body)
			require.Len(t, p.Changes, 2)
		})
	}
}
func TestDateFallbacks(t *testing.T) {
	p, e := Markdown("2023-05-01-hello.md", []byte("hello"), time.Now())
	require.NoError(t, e)
	require.Equal(t, "2023-05-01", p.Created.Format(time.DateOnly))
	p, e = Markdown("hello.md", []byte("hello"), time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC))
	require.NoError(t, e)
	require.Equal(t, 2020, p.Created.Year())
}
func TestWXR(t *testing.T) {
	data := `<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Hello</title><link>https://example.test/post</link><wp:post_id>3</wp:post_id><wp:post_type>post</wp:post_type><wp:status>private</wp:status><wp:post_date_gmt>2020-01-02 12:00:00</wp:post_date_gmt><content:encoded><![CDATA[<p>Hello <strong>world</strong>.</p><img src="https://example.test/a.png"/>]]></content:encoded><category domain="post_tag">tag</category></item></channel></rss>`
	posts, e := WXR([]byte(data), time.Now())
	require.NoError(t, e)
	require.Len(t, posts, 1)
	require.True(t, posts[0].Private)
	require.Contains(t, posts[0].Content, "**world**")
	require.Equal(t, []string{"tag"}, posts[0].Tags)
	_, e = WXR([]byte(`<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>`), time.Now())
	require.Error(t, e)
}
func TestArchiveSafety(t *testing.T) {
	for _, name := range []string{"../evil.md", "/evil.md", "C:\\evil.md", "a/../evil.md"} {
		var b bytes.Buffer
		w := zip.NewWriter(&b)
		f, e := w.Create(name)
		require.NoError(t, e)
		_, e = f.Write([]byte("body"))
		require.NoError(t, e)
		require.NoError(t, w.Close())
		_, _, e = MarkdownZIP(bytes.NewReader(b.Bytes()), int64(b.Len()))
		require.Error(t, e)
	}
}
