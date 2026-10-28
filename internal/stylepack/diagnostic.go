package stylepack

import (
	"fmt"
	"regexp"
	"strconv"

	"github.com/pkg/errors"
)

// Diagnostic is safe to return to an administrator checking an untrusted archive.
type Diagnostic struct {
	File    string
	Line    int
	Message string
}

func (d *Diagnostic) Error() string { return fmt.Sprintf("%s line %d: %s", d.File, d.Line, d.Message) }

var cssDiagnostic = regexp.MustCompile(`^style\.css line ([0-9]+): (.*)$`)

func diagnose(file string, err error) error {
	var diagnostic *Diagnostic
	if errors.As(err, &diagnostic) {
		return diagnostic
	}
	line := 1
	message := err.Error()
	if match := cssDiagnostic.FindStringSubmatch(message); match != nil {
		file = "style.css"
		line, _ = strconv.Atoi(match[1])
		message = match[2]
	}
	return &Diagnostic{File: file, Line: line, Message: message}
}
