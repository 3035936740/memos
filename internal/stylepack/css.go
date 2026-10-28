package stylepack

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/pkg/errors"

	"github.com/tdewolff/parse/v2"
	"github.com/tdewolff/parse/v2/css"
)

// cssText decodes CSS escapes before security decisions. Browsers accept escaped
// identifiers such as e\78pression and \75rl; comparing raw tokens is unsafe.
func cssText(s string) string {
	var out strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] != '\\' {
			out.WriteByte(s[i])
			continue
		}
		i++
		if i >= len(s) {
			break
		}
		if s[i] == '\n' || s[i] == '\r' {
			continue
		}
		start := i
		for i < len(s) && i-start < 6 && strings.ContainsRune("0123456789abcdefABCDEF", rune(s[i])) {
			i++
		}
		if i > start {
			n, _ := strconv.ParseInt(s[start:i], 16, 32)
			if n <= 0 || n > utf8.MaxRune {
				out.WriteRune(utf8.RuneError)
			} else {
				out.WriteRune(rune(n))
			}
			if i < len(s) && strings.ContainsRune(" \t\r\n\f", rune(s[i])) {
				i++
			}
			i--
		} else {
			out.WriteByte(s[i])
		}
	}
	return out.String()
}

func tokenText(tokens []css.Token) string {
	var b strings.Builder
	for _, t := range tokens {
		b.Write(t.Data)
	}
	return b.String()
}
func lexerTokens(s string) ([]css.Token, error) {
	l := css.NewLexer(parse.NewInputString(s))
	tokens := []css.Token{}
	for {
		tt, b := l.Next()
		if tt == css.ErrorToken {
			if l.Err() != io.EOF {
				return nil, l.Err()
			}
			break
		}
		if tt == css.BadURLToken || tt == css.BadStringToken {
			return nil, errors.New("invalid CSS token")
		}
		tokens = append(tokens, css.Token{TokenType: tt, Data: append([]byte(nil), b...)})
	}
	return tokens, nil
}

func Compile(id, version, source string, assets map[string]Asset) (string, error) {
	if len(source) > 200<<10 {
		return "", errors.New("CSS exceeds 200 KB")
	}
	scope := `html[data-style="` + id + `"]`
	// First collect globally named constructs, then rename declarations too.
	names := map[string]string{}
	inFont := false
	parser := css.NewParser(parse.NewInputString(source), false)
	firstPassError := func(reason string) error {
		return errors.Errorf("style.css line %d: %s", 1+strings.Count(source[:min(parser.Offset(), len(source))], "\n"), reason)
	}
	for {
		grammar, _, data := parser.Next()
		if grammar == css.ErrorGrammar {
			if parser.Err() != io.EOF {
				return "", firstPassError(parser.Err().Error())
			}
			break
		}
		if grammar == css.BeginAtRuleGrammar {
			inFont = strings.EqualFold(string(data), "@font-face")
		}
		if grammar == css.EndAtRuleGrammar {
			inFont = false
		}
		if inFont && grammar == css.DeclarationGrammar && strings.EqualFold(cssText(string(data)), "font-family") {
			rawFamily := strings.TrimSpace(cssText(tokenText(parser.Values())))
			family := strings.Trim(rawFamily, "\"'")
			if family == "" || strings.ContainsAny(family, ",;{}()") {
				return "", firstPassError("invalid font-family")
			}
			if strings.ContainsAny(family, " \t") && !strings.HasPrefix(rawFamily, `"`) && !strings.HasPrefix(rawFamily, `'`) {
				return "", firstPassError("multiword font families must be quoted")
			}
			names[family] = "memos-pack-" + id + "-" + strings.ReplaceAll(family, " ", "-")
		}
		if grammar == css.BeginAtRuleGrammar && strings.HasSuffix(strings.ToLower(cssText(string(data))), "keyframes") {
			name := strings.TrimSpace(cssText(tokenText(parser.Values())))
			if name == "" || strings.ContainsAny(name, " \t\n\"'(){}") {
				return "", firstPassError("invalid keyframes name")
			}
			names[name] = "memos-pack-" + id + "-" + name
		}
	}
	p := css.NewParser(parse.NewInputString(source), false)
	out := strings.Builder{}
	stack := []string{}
	for {
		grammar, _, data := p.Next()
		fail := func(reason string) (string, error) {
			offset := min(p.Offset(), len(source))
			return "", errors.Errorf("style.css line %d: %s", 1+strings.Count(source[:offset], "\n"), reason)
		}
		if grammar == css.ErrorGrammar {
			if p.Err() != io.EOF {
				return fail(p.Err().Error())
			}
			break
		}
		values := p.Values()
		name := strings.ToLower(cssText(string(data)))
		switch grammar {
		case css.CommentGrammar:
			continue
		case css.AtRuleGrammar:
			if name != "@charset" {
				return fail("forbidden at-rule " + name)
			}
			if strings.ToLower(strings.Trim(strings.TrimSpace(tokenText(values)), `"'`)) != "utf-8" {
				return fail("only UTF-8 charset allowed")
			}
		case css.BeginAtRuleGrammar:
			switch name {
			case "@media", "@supports", "@container", "@layer":
				if _, err := safeValues("@condition", values, false, id, version, assets, names); err != nil {
					return fail(err.Error())
				}
				out.WriteString(name + " " + tokenText(values) + "{")
			case "@keyframes", "@-webkit-keyframes":
				key := strings.TrimSpace(cssText(tokenText(values)))
				out.WriteString(name + " " + names[key] + "{")
			case "@font-face":
				out.WriteString("@font-face{")
			default:
				return fail("unknown or forbidden at-rule " + name)
			}
			stack = append(stack, name)
		case css.BeginRulesetGrammar:
			selector := tokenText(values)
			if len(stack) > 0 && (stack[len(stack)-1] == "@keyframes" || stack[len(stack)-1] == "@-webkit-keyframes") {
				out.WriteString(selector + "{")
			} else {
				scoped, err := scopeSelector(values, scope)
				if err != nil {
					return fail(err.Error())
				}
				out.WriteString(scoped + "{")
			}
			stack = append(stack, "rule")
		case css.EndAtRuleGrammar, css.EndRulesetGrammar:
			if len(stack) == 0 {
				return fail("unbalanced stylesheet")
			}
			stack = stack[:len(stack)-1]
			out.WriteByte('}')
		case css.DeclarationGrammar, css.CustomPropertyGrammar:
			if name == "behavior" || name == "-moz-binding" {
				return fail("forbidden property " + name)
			}
			if grammar == css.CustomPropertyGrammar {
				var err error
				values, err = lexerTokens(tokenText(values))
				if err != nil {
					return fail(err.Error())
				}
			}
			font := len(stack) > 0 && stack[len(stack)-1] == "@font-face"

			v, err := safeValues(name, values, font, id, version, assets, names)
			if err != nil {
				return fail(err.Error())
			}
			out.WriteString(string(data) + ":" + v + ";")
		default:
			return fail("unsupported nested CSS syntax")
		}
	}
	if len(stack) != 0 {
		return "", errors.New("unclosed CSS block")
	}
	return out.String(), nil
}

func scopeSelector(tokens []css.Token, scope string) (string, error) {
	groups := [][]css.Token{{}}
	depth := 0
	for _, t := range tokens {
		if t.TokenType == css.FunctionToken || t.TokenType == css.LeftBracketToken || t.TokenType == css.LeftParenthesisToken {
			depth++
		}
		if t.TokenType == css.RightBracketToken || t.TokenType == css.RightParenthesisToken {
			depth--
		}
		if depth < 0 {
			return "", errors.New("invalid selector")
		}
		if t.TokenType == css.CommaToken && depth == 0 {
			groups = append(groups, []css.Token{})
		} else {
			groups[len(groups)-1] = append(groups[len(groups)-1], t)
		}
	}
	result := []string{}
	for _, g := range groups {
		var b strings.Builder
		hasLeadingRoot := false
		for i := 0; i < len(g); i++ {
			t := g[i]
			if t.TokenType == css.ColonToken && i+1 < len(g) && g[i+1].TokenType == css.IdentToken && strings.EqualFold(cssText(string(g[i+1].Data)), "root") {
				if strings.TrimSpace(b.String()) == "" {
					hasLeadingRoot = true
				}
				b.WriteString(scope)
				i++
				continue
			}
			if t.TokenType == css.DelimToken && string(t.Data) == "&" {
				return "", errors.New("CSS nesting is not supported")
			}
			b.Write(t.Data)
		}
		s := strings.TrimSpace(b.String())
		if s == "" {
			return "", errors.New("empty selector")
		}
		if !hasLeadingRoot {
			s = scope + " " + s
		}
		result = append(result, s)
	}
	return strings.Join(result, ","), nil
}

func safeValues(property string, tokens []css.Token, font bool, id, version string, assets map[string]Asset, names map[string]string) (string, error) {
	var b strings.Builder
	fontAsset := false
	for i := 0; i < len(tokens); i++ {
		t := tokens[i]
		decoded := cssText(string(t.Data))
		lower := strings.ToLower(decoded)
		if strings.Contains(lower, "javascript:") || strings.Contains(lower, "vbscript:") {
			return "", errors.New("script URL forbidden")
		}
		if t.TokenType == css.FunctionToken {
			function := strings.TrimSuffix(lower, "(")
			if font && property == "src" && function != "format" && function != "tech" {
				return "", errors.New("font src must use asset URLs")
			}
			switch function {
			case "expression", "url", "image-set", "-webkit-image-set", "src", "paint", "element", "-moz-element", "attr":
				return "", errors.Errorf("forbidden CSS function %s", function)
			}
		}
		if t.TokenType == css.DelimToken && decoded == "!" && !strings.HasPrefix(property, "--") {
			return "", errors.New("!important is allowed only on custom properties")
		}
		if t.TokenType == css.URLToken {
			open := strings.Index(decoded, "(")
			if open < 0 {
				return "", errors.New("invalid CSS URL")
			}
			u := strings.TrimSpace(strings.TrimSuffix(decoded[open+1:], ")"))
			u = strings.Trim(u, `"'`)
			if strings.HasPrefix(u, "asset:") {
				name := strings.TrimPrefix(u, "asset:")
				asset, ok := assets[name]
				if !ok {
					return "", errors.Errorf("missing asset %s", name)
				}
				if font && asset.ContentType != "font/woff2" {
					return "", errors.New("font src must use WOFF2 asset")
				}
				fontAsset = true
				if asset.ContentType == "image/svg+xml" && property != "background" && property != "background-image" {
					return "", errors.New("SVG is permitted only in CSS backgrounds")
				}
				u = "/style-packs/" + id + "/" + version + "/assets/" + escapeAsset(name)
			} else if strings.HasPrefix(u, "data:") && !font {
				comma := strings.IndexByte(u, ',')
				if comma < 0 {
					return "", errors.New("invalid image data URL")
				}
				header := strings.ToLower(u[5:comma])
				if !strings.HasSuffix(header, ";base64") {
					return "", errors.New("data URL must be base64 image")
				}
				mime := strings.TrimSuffix(header, ";base64")
				if mime != "image/png" && mime != "image/jpeg" && mime != "image/gif" && mime != "image/webp" {
					return "", errors.New("unsupported image data URL")
				}
				data, err := base64.StdEncoding.DecodeString(u[comma+1:])
				if err != nil || len(data) > 64<<10 {
					return "", errors.New("image data URL exceeds 64 KB or is malformed")
				}
				if http.DetectContentType(data) != mime {
					return "", errors.New("image data URL does not match its MIME type")
				}
			} else {
				return "", errors.New("external or non-asset URL forbidden")
			}
			b.WriteString("url(" + strconv.Quote(u) + ")")
			continue
		}
		if t.TokenType == css.StringToken {
			if renamed := names[strings.Trim(decoded, "\"'")]; renamed != "" {
				b.WriteString(strconv.Quote(renamed))
				continue
			}
		}
		if t.TokenType == css.IdentToken {
			if renamed := names[decoded]; renamed != "" {
				decoded = renamed
			}
			b.WriteString(decoded)
		} else {
			b.Write(t.Data)
		}
	}
	if font && property == "src" && !fontAsset {
		return "", errors.New("font src requires an asset URL")
	}
	return b.String(), nil
}
func escapeAsset(name string) string {
	parts := strings.Split(name, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}
