package blogimport

import htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"

// HTMLMarkdown uses the upstream CommonMark conversion pipeline, without any
// fetcher, browser or external resource resolution.
func HTMLMarkdown(source string) string {
	result, err := htmltomarkdown.ConvertString(source)
	if err != nil {
		return ""
	}
	return result
}
