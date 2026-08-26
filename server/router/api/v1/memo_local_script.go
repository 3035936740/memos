package v1

import (
	"strings"

	"golang.org/x/net/html"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const maxMemoLocalScriptLength = 20_000

// validateMemoLocalScripts keeps the local script syntax administrator-only.
// Ordinary memo content remains Markdown, while administrators may opt into
// click-scoped scripts such as <div script="...">Click me</div>.
func validateMemoLocalScripts(content string, administrator bool) error {
	tokenizer := html.NewTokenizer(strings.NewReader(content))
	for {
		tokenType := tokenizer.Next()
		if tokenType == html.ErrorToken {
			return nil
		}
		if tokenType != html.StartTagToken && tokenType != html.SelfClosingTagToken {
			continue
		}
		token := tokenizer.Token()
		if token.Data != "div" && token.Data != "span" && token.Data != "button" {
			continue
		}
		for _, attr := range token.Attr {
			if !strings.EqualFold(attr.Key, "script") {
				continue
			}
			if !administrator {
				return status.Error(codes.PermissionDenied, "only administrators can add local memo scripts")
			}
			if len(attr.Val) > maxMemoLocalScriptLength {
				return status.Errorf(codes.InvalidArgument, "memo local script is too long (max %d characters)", maxMemoLocalScriptLength)
			}
		}
	}
}
