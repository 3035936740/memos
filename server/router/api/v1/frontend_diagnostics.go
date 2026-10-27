package v1

import (
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/profile"
)

const (
	frontendDiagnosticMaxBytes = 32 << 10
	frontendDiagnosticFileMax  = 5 << 20
	frontendDiagnosticFiles    = 10
)

var (
	frontendDiagnosticIDPattern    = regexp.MustCompile(`^[A-Za-z0-9-]{1,80}$`)
	frontendDiagnosticFilePattern  = regexp.MustCompile(`^frontend-errors-\d{4}-\d{2}-\d{2}(-\d+)?\.log$`)
	frontendDiagnosticURLPattern   = regexp.MustCompile(`https?://[^\s)"<>]+`)
	frontendDiagnosticTokenPattern = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/-]+=*`)
)

type frontendDiagnosticTrace struct {
	At        string `json:"at"`
	Type      string `json:"type"`
	Target    string `json:"target,omitempty"`
	Path      string `json:"path,omitempty"`
	RequestID string `json:"requestId,omitempty"`
	Status    int    `json:"status,omitempty"`
}

type frontendDiagnosticReport struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	SessionID     string `json:"sessionId"`
	ClientTime    string `json:"clientTime"`
	Kind          string `json:"kind"`
	Message       string `json:"message"`
	Stack         string `json:"stack"`
	Cause         string `json:"cause"`
	Context       struct {
		PagePath       string  `json:"pagePath"`
		ReferrerPath   string  `json:"referrerPath"`
		PageAgeMS      float64 `json:"pageAgeMs"`
		Timezone       string  `json:"timezone"`
		Language       string  `json:"language"`
		Visibility     string  `json:"visibility"`
		Online         bool    `json:"online"`
		NavigationType string  `json:"navigationType"`
		FrontendAsset  string  `json:"frontendAsset"`
		Style          string  `json:"style"`
		Theme          string  `json:"theme"`
		ViewportWidth  int     `json:"viewportWidth"`
		ViewportHeight int     `json:"viewportHeight"`
		PixelRatio     float64 `json:"pixelRatio"`
	} `json:"context"`
	Request struct {
		ID          string  `json:"id"`
		Path        string  `json:"path"`
		Method      string  `json:"method"`
		StartedAt   string  `json:"startedAt"`
		CompletedAt string  `json:"completedAt"`
		DurationMS  float64 `json:"durationMs"`
		ContentType string  `json:"contentType"`
		PagePath    string  `json:"pagePath"`
		AuthRetry   bool    `json:"authRetry"`
	} `json:"request"`
	Response struct {
		Status        int    `json:"status"`
		Path          string `json:"path"`
		Origin        string `json:"origin"`
		ContentType   string `json:"contentType"`
		Redirected    bool   `json:"redirected"`
		Server        string `json:"server"`
		RequestID     string `json:"requestId"`
		CacheStatus   string `json:"cacheStatus"`
		CacheControl  string `json:"cacheControl"`
		RetryAfter    string `json:"retryAfter"`
		EdgeRequestID string `json:"edgeRequestId"`
		Via           string `json:"via"`
		Mitigation    string `json:"mitigation"`
		ContentLength string `json:"contentLength"`
	} `json:"response"`
	Trace    []frontendDiagnosticTrace `json:"trace"`
	Delivery struct {
		Attempt         int     `json:"attempt"`
		QueuedForMS     float64 `json:"queuedForMs"`
		PreviousFailure string  `json:"previousFailure"`
		Failures        []struct {
			At      string `json:"at"`
			Attempt int    `json:"attempt"`
			Reason  string `json:"reason"`
		} `json:"failures"`
	} `json:"delivery"`
}

type frontendDiagnosticWriter struct {
	mu         sync.Mutex
	directory  string
	maxBytes   int64
	maxFiles   int
	activeFile string
	seen       map[string]struct{}
	seenOrder  []string
	tokens     float64
	refilled   time.Time
}

func newFrontendDiagnosticWriter(dataDir string) *frontendDiagnosticWriter {
	return &frontendDiagnosticWriter{
		directory: filepath.Join(dataDir, "log"), maxBytes: frontendDiagnosticFileMax, maxFiles: frontendDiagnosticFiles,
		seen: make(map[string]struct{}), tokens: 20, refilled: time.Now(),
	}
}

func registerFrontendDiagnosticRoutes(router *echo.Group, p *profile.Profile) {
	writer := newFrontendDiagnosticWriter(p.Data)
	router.POST(frontendErrorReportPath, func(c *echo.Context) error {
		return writer.handle(c, p)
	})
}

func (w *frontendDiagnosticWriter) handle(c *echo.Context, p *profile.Profile) error {
	r := c.Request()
	setAPIResponseNoStoreHeaders(c.Response().Header())
	if !frontendDiagnosticSameOrigin(r, p.InstanceURL) {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "same-origin report required"})
	}
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		return c.JSON(http.StatusUnsupportedMediaType, map[string]string{"error": "JSON report required"})
	}
	if !w.allow(time.Now()) {
		c.Response().Header().Set("Retry-After", "60")
		return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "diagnostic rate limit reached"})
	}
	decoder := json.NewDecoder(http.MaxBytesReader(c.Response(), r.Body, frontendDiagnosticMaxBytes))
	decoder.DisallowUnknownFields()
	var report frontendDiagnosticReport
	if err := decoder.Decode(&report); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid diagnostic report"})
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF || !validFrontendDiagnosticReport(&report) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid diagnostic report"})
	}
	sanitizeFrontendDiagnosticReport(&report)
	receivedAt := time.Now().UTC()
	entry := struct {
		ReceivedAt time.Time                `json:"receivedAt"`
		Source     string                   `json:"source"`
		Version    string                   `json:"serverVersion"`
		Commit     string                   `json:"serverCommit"`
		UserAgent  string                   `json:"userAgent"`
		RequestID  string                   `json:"reportRequestId,omitempty"`
		Report     frontendDiagnosticReport `json:"report"`
	}{receivedAt, "browser-reported", p.Version, p.Commit, diagnosticText(r.UserAgent(), 512), diagnosticText(r.Header.Get("X-Request-ID"), 128), report}
	data, err := json.Marshal(entry)
	if err == nil {
		err = w.append(report.ID, receivedAt, data)
	}
	if err != nil {
		slog.Error("failed to save frontend diagnostic", "event_id", report.ID, "error", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save diagnostic"})
	}
	return c.JSON(http.StatusOK, map[string]any{"saved": true, "id": report.ID, "receivedAt": receivedAt})
}

func frontendDiagnosticSameOrigin(r *http.Request, instanceURL string) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		return false
	}
	origin, err := url.Parse(r.Header.Get("Origin"))
	if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return false
	}
	if strings.EqualFold(origin.Host, r.Host) {
		return true
	}
	configured, err := url.Parse(instanceURL)
	return err == nil && strings.EqualFold(origin.Host, configured.Host) && origin.Scheme == configured.Scheme
}

func validFrontendDiagnosticReport(r *frontendDiagnosticReport) bool {
	if r.SchemaVersion != 1 || !frontendDiagnosticIDPattern.MatchString(r.ID) || !frontendDiagnosticIDPattern.MatchString(r.SessionID) || len(r.Trace) > 24 || len(r.Delivery.Failures) > 8 {
		return false
	}
	if _, err := time.Parse(time.RFC3339Nano, r.ClientTime); err != nil {
		return false
	}
	switch r.Kind {
	case "unexpected-html", "network-error", "http-error":
	default:
		return false
	}
	return r.Response.Status >= 0 && r.Response.Status <= 599 && r.Request.DurationMS >= 0 &&
		!math.IsInf(r.Request.DurationMS, 0) && !math.IsNaN(r.Request.DurationMS)
}

func diagnosticPath(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
		return ""
	}
	value = parsed.Path
	if strings.HasPrefix(value, "/memos/shares/") {
		value = "/memos/shares/[redacted]"
	}
	return diagnosticText(value, 512)
}

func diagnosticText(value string, limit int) string {
	value = frontendDiagnosticTokenPattern.ReplaceAllString(value, "Bearer [redacted]")
	value = frontendDiagnosticURLPattern.ReplaceAllStringFunc(value, func(raw string) string {
		parsed, err := url.Parse(raw)
		if err != nil {
			return "[URL]"
		}
		return parsed.Scheme + "://" + parsed.Host + diagnosticPath(parsed.Path)
	})
	if len(value) > limit {
		value = string([]rune(value)[:min(len([]rune(value)), limit/4)]) + "…"
	}
	return strings.ToValidUTF8(value, "")
}

func sanitizeFrontendDiagnosticReport(r *frontendDiagnosticReport) {
	r.Message = diagnosticText(r.Message, 256)
	r.Stack = diagnosticText(r.Stack, 4096)
	r.Cause = diagnosticText(r.Cause, 256)
	r.Context.PagePath = diagnosticPath(r.Context.PagePath)
	r.Context.ReferrerPath = diagnosticPath(r.Context.ReferrerPath)
	r.Context.FrontendAsset = diagnosticPath(r.Context.FrontendAsset)
	r.Request.Path = diagnosticPath(r.Request.Path)
	r.Request.PagePath = diagnosticPath(r.Request.PagePath)
	r.Response.Path = diagnosticPath(r.Response.Path)
	r.Response.Origin = diagnosticText(r.Response.Origin, 256)
	r.Delivery.PreviousFailure = diagnosticText(r.Delivery.PreviousFailure, 128)
	for i := range r.Delivery.Failures {
		r.Delivery.Failures[i].Reason = diagnosticText(r.Delivery.Failures[i].Reason, 128)
	}
	for i := range r.Trace {
		r.Trace[i].Path = diagnosticPath(r.Trace[i].Path)
		r.Trace[i].Target = diagnosticText(r.Trace[i].Target, 128)
	}
}

func (w *frontendDiagnosticWriter) allow(now time.Time) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.tokens = math.Min(20, w.tokens+now.Sub(w.refilled).Seconds()) // At most 60 reports/minute, burst 20.
	w.refilled = now
	if w.tokens < 1 {
		return false
	}
	w.tokens--
	return true
}

func (w *frontendDiagnosticWriter) append(id string, now time.Time, data []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if _, ok := w.seen[id]; ok {
		return nil
	}
	if err := os.MkdirAll(w.directory, 0700); err != nil {
		return errors.Wrap(err, "create frontend diagnostic directory")
	}
	if int64(len(data))+1 > w.maxBytes {
		return errors.New("frontend diagnostic entry exceeds file size limit")
	}
	base := "frontend-errors-" + now.UTC().Format(time.DateOnly)
	filename := w.activeFile
	if !strings.HasPrefix(filename, base) {
		filename = base + ".log"
	}
	info, err := os.Stat(filepath.Join(w.directory, filename))
	if err != nil && !os.IsNotExist(err) {
		return errors.Wrap(err, "stat frontend diagnostic file")
	}
	if err == nil && info.Size()+int64(len(data))+1 > w.maxBytes {
		filename = base + "-" + strings.ReplaceAll(now.UTC().Format("150405.000000000"), ".", "") + ".log"
		if _, err := os.Stat(filepath.Join(w.directory, filename)); !os.IsNotExist(err) {
			return errors.New("frontend diagnostic file rotation collision")
		}
	}
	if err := w.prune(filename); err != nil {
		return err
	}
	file, err := os.OpenFile(filepath.Join(w.directory, filename), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return errors.Wrap(err, "open frontend diagnostic log")
	}
	_, writeErr := file.Write(append(data, '\n'))
	if writeErr == nil {
		writeErr = file.Sync() // Acknowledgement means the record reached the log, not merely a queue.
	}
	closeErr := file.Close()
	if writeErr != nil {
		return errors.Wrap(writeErr, "write frontend diagnostic log")
	}
	if closeErr != nil {
		return errors.Wrap(closeErr, "close frontend diagnostic log")
	}
	w.activeFile = filename
	w.seen[id] = struct{}{}
	w.seenOrder = append(w.seenOrder, id)
	if len(w.seenOrder) > 256 {
		delete(w.seen, w.seenOrder[0])
		w.seenOrder = w.seenOrder[1:]
	}
	return nil
}

func (w *frontendDiagnosticWriter) prune(current string) error {
	entries, err := os.ReadDir(w.directory)
	if err != nil {
		return errors.Wrap(err, "list frontend diagnostic logs")
	}
	type logFile struct {
		name string
		time time.Time
	}
	var files []logFile
	for _, entry := range entries {
		if entry.IsDir() || !frontendDiagnosticFilePattern.MatchString(entry.Name()) || entry.Name() == current {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return errors.Wrap(err, "inspect frontend diagnostic log")
		}
		files = append(files, logFile{entry.Name(), info.ModTime()})
	}
	slices.SortFunc(files, func(a, b logFile) int { return b.time.Compare(a.time) })
	for _, file := range files[min(len(files), w.maxFiles-1):] {
		if err := os.Remove(filepath.Join(w.directory, file.name)); err != nil {
			return errors.Wrap(err, "prune old frontend diagnostic log")
		}
	}
	return nil
}
