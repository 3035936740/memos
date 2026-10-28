package stylepack

import (
	"strings"

	"github.com/tdewolff/parse/v2/css"
)

// The parser predates these at-rules. Give it equivalent block grammars while
// retaining original names for policy checks/output and byte offsets for errors.
// Rewriting lexer tokens (not strings/regex) cannot alter quoted content or URLs.
func parserAtRules(source string) (string, map[int]string, error) {
	tokens, err := lexerTokens(source)
	if err != nil {
		return "", nil, err
	}
	ends := make([]int, len(tokens))
	offset := 0
	for i, t := range tokens {
		offset += len(t.Data)
		ends[i] = offset
	}
	names := map[int]string{}
	var out strings.Builder
	for i, t := range tokens {
		name := strings.ToLower(cssText(string(t.Data)))
		replacement := ""
		if t.TokenType == css.AtKeywordToken {
			switch name {
			case "@starting-style", "@container":
				replacement = "@media"
			case "@property":
				replacement = "@page"
			default:
			}
		}
		if replacement == "" {
			out.Write(t.Data)
			continue
		}
		depth := 0
		for j := i + 1; j < len(tokens); j++ {
			tt := tokens[j].TokenType
			if depth == 0 && (tt == css.LeftBraceToken || tt == css.SemicolonToken || tt == css.RightBraceToken) {
				names[ends[j]] = name
				break
			}
			if tt == css.FunctionToken || tt == css.LeftParenthesisToken || tt == css.LeftBracketToken {
				depth++
			}
			if tt == css.RightParenthesisToken || tt == css.RightBracketToken {
				depth--
			}
		}
		out.WriteString(replacement)
		for _, c := range string(t.Data)[len(replacement):] {
			if c == '\n' || c == '\r' {
				out.WriteRune(c)
			} else {
				out.WriteByte(' ')
			}
		}
	}
	return out.String(), names, nil
}
