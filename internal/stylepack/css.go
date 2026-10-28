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
	input := parse.NewInputString(s)
	l := css.NewLexer(input)
	tokens := []css.Token{}
	for {
		tt, b := l.Next()
		if tt == css.ErrorToken {
			if l.Err() != io.EOF {
				return nil, errors.Errorf("style.css line %d: %s", 1+strings.Count(s[:min(input.Offset(), len(s))], "\n"), l.Err().Error())
			}
			break
		}
		if tt == css.BadURLToken || tt == css.BadStringToken {
			return nil, errors.Errorf("style.css line %d: invalid CSS token", 1+strings.Count(s[:min(input.Offset(), len(s))], "\n"))
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
	parserSource, atNames, err := parserAtRules(source)
	if err != nil {
		return "", err
	}
	// First collect globally named constructs, then rename declarations too.
	names := map[string]string{}
	inFont := false
	parser := css.NewParser(parse.NewInputString(parserSource), false)
	firstPassError := func(reason string) error {
		return errors.Errorf("style.css line %d: %s", 1+strings.Count(source[:min(parser.Offset(), len(source))], "\n"), reason)
	}
	for {
		grammar, _, data := parser.Next()
		if original := atNames[parser.Offset()]; original != "" && (grammar == css.BeginAtRuleGrammar || grammar == css.AtRuleGrammar) {
			data = []byte(original)
		}
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
	p := css.NewParser(parse.NewInputString(parserSource), false)
	out := strings.Builder{}
	stack := []string{}
	descriptors := map[string]string{}
	for {
		grammar, _, data := p.Next()
		if original := atNames[p.Offset()]; original != "" && (grammar == css.BeginAtRuleGrammar || grammar == css.AtRuleGrammar) {
			data = []byte(original)
		}
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
			if len(stack) > 0 && (stack[len(stack)-1] == "@property" || stack[len(stack)-1] == "@font-face") {
				return fail("nested at-rule in descriptor block")
			}
			switch name {
			case "@media", "@supports", "@container", "@layer", "@starting-style":
				if _, err := safeValues("@condition", values, false, id, version, assets, names); err != nil {
					return fail(err.Error())
				}
				out.WriteString(name + " " + tokenText(values) + "{")
			case "@keyframes", "@-webkit-keyframes":
				key := strings.TrimSpace(cssText(tokenText(values)))
				out.WriteString(name + " " + names[key] + "{")
			case "@property":
				key := strings.TrimSpace(cssText(tokenText(values)))
				keyTokens, keyErr := lexerTokens(key)
				if keyErr != nil || !strings.HasPrefix(key, "--"+id+"-") || len(keyTokens) != 1 || (keyTokens[0].TokenType != css.IdentToken && keyTokens[0].TokenType != css.CustomPropertyNameToken) || len(key) <= len(id)+3 {
					return fail("@property name must start with --" + id + "-")
				}
				descriptors = map[string]string{}
				out.WriteString("@property " + key + "{")
			case "@font-face":
				out.WriteString("@font-face{")
			default:
				return fail("unknown or forbidden at-rule " + name)
			}
			stack = append(stack, name)
		case css.BeginRulesetGrammar:
			if len(stack) > 0 && (stack[len(stack)-1] == "@property" || stack[len(stack)-1] == "@font-face") {
				return fail("ruleset in descriptor block")
			}
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
			if stack[len(stack)-1] == "@property" && (descriptors["syntax"] == "" || descriptors["inherits"] == "" || (descriptors["syntax"] != `"*"` && descriptors["syntax"] != `'*'` && descriptors["initial-value"] == "")) {
				return fail("@property requires syntax, inherits and initial-value (except universal syntax)")
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
			if len(stack) > 0 && stack[len(stack)-1] == "@property" {
				if _, duplicate := descriptors[name]; duplicate {
					return fail("duplicate @property descriptor")
				}
				switch name {
				case "syntax":
					if len(values) != 1 || values[0].TokenType != css.StringToken {
						return fail("@property syntax must be a string")
					}
				case "inherits":
					if v != "true" && v != "false" {
						return fail("@property inherits must be true or false")
					}
				case "initial-value":
				default:
					return fail("unknown @property descriptor")
				}
				descriptors[name] = v
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
		brackets, functions := 0, 0
		for i := 0; i < len(g); i++ {
			t := g[i]
			root := t.TokenType == css.ColonToken && i+1 < len(g) && g[i+1].TokenType == css.IdentToken && strings.EqualFold(cssText(string(g[i+1].Data)), "root")
			html := t.TokenType == css.IdentToken && strings.EqualFold(cssText(string(t.Data)), "html") && brackets == 0
			if html && i > 0 && ((g[i-1].TokenType == css.DelimToken && string(g[i-1].Data) == ".") || g[i-1].TokenType == css.ColonToken) {
				html = false
			}
			if root || html {
				if functions > 0 || strings.TrimSpace(b.String()) != "" {
					return "", errors.New(":root / html 只能写在选择器开头 (must appear only at the start of a selector)")
				}
				hasLeadingRoot = true
				b.WriteString(scope)
				if root {
					i++
				}
				continue
			}
			if t.TokenType == css.DelimToken && string(t.Data) == "&" {
				return "", errors.New("CSS nesting is not supported")
			}
			if t.TokenType == css.LeftBracketToken {
				brackets++
			}
			if t.TokenType == css.RightBracketToken {
				brackets--
			}
			if t.TokenType == css.FunctionToken || t.TokenType == css.LeftParenthesisToken {
				functions++
			}
			if t.TokenType == css.RightParenthesisToken {
				functions--
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
			if function == "attr" {
				// Only the legacy, string-producing form can be used. Never accept typed attr().
				if property != "content" || string(t.Data) != "attr(" {
					return "", errors.New("attr() is allowed only as an unescaped content function")
				}
				j := i + 1
				for j < len(tokens) && (tokens[j].TokenType == css.WhitespaceToken || tokens[j].TokenType == css.CommentToken) {
					j++
				}
				if j >= len(tokens) || tokens[j].TokenType != css.IdentToken || !strings.HasPrefix(cssText(string(tokens[j].Data)), "data-sb-") || len(cssText(string(tokens[j].Data))) <= 8 {
					return "", errors.New("attr() requires one data-sb- attribute")
				}
				j++
				for j < len(tokens) && (tokens[j].TokenType == css.WhitespaceToken || tokens[j].TokenType == css.CommentToken) {
					j++
				}
				if j >= len(tokens) || tokens[j].TokenType != css.RightParenthesisToken {
					return "", errors.New("typed attr() and fallback arguments are forbidden")
				}
				b.WriteString(tokenText(tokens[i : j+1]))
				i = j
				continue
			}
			switch function {
			case "expression", "url", "image-set", "-webkit-image-set", "src", "paint", "element", "-moz-element":
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
				if asset.ContentType == "image/svg+xml" && !svgProperty(property) {
					return "", errors.New("SVG is not allowed on this property")
				}
				u = "/style-packs/" + id + "/" + version + "/assets/" + escapeAsset(name)
			} else if strings.HasPrefix(u, "data:") && !font {
				if err := validateImageData(u, property); err != nil {
					return "", err
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

func svgProperty(property string) bool {
	if strings.HasPrefix(property, "--") {
		return true
	}
	switch property {
	case "background", "background-image", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image", "mask-border", "mask-border-source", "-webkit-mask-box-image", "border-image", "border-image-source", "list-style", "list-style-image", "content", "cursor":
		return true
	}
	return false
}

func validateImageData(u, property string) error {
	comma := strings.IndexByte(u, ',')
	if comma < 0 {
		return errors.New("invalid image data URL")
	}
	header := strings.ToLower(u[5:comma])
	encoded := strings.HasSuffix(header, ";base64")
	mime := strings.TrimSuffix(header, ";base64")
	if mime != "image/svg+xml" && mime != "image/png" && mime != "image/jpeg" && mime != "image/gif" && mime != "image/webp" {
		return errors.New("unsupported image data URL")
	}
	if !encoded && mime != "image/svg+xml" {
		return errors.New("raster data URL must be base64")
	}
	var data []byte
	var err error
	if encoded {
		data, err = base64.StdEncoding.DecodeString(u[comma+1:])
	} else {
		var decoded string
		decoded, err = url.PathUnescape(u[comma+1:])
		data = []byte(decoded)
	}
	if err != nil || len(data) > 64<<10 {
		return errors.New("image data URL exceeds 64 KiB or is malformed")
	}
	if mime == "image/svg+xml" {
		if !svgProperty(property) {
			return errors.New("SVG is not allowed on this property")
		}
		return validateSVG(data)
	}
	if http.DetectContentType(data) != mime {
		return errors.New("image data URL does not match its MIME type")
	}
	return nil
}
