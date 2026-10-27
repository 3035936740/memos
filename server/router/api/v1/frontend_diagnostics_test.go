package v1

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
)

func frontendDiagnosticFixture() frontendDiagnosticReport {
	r := frontendDiagnosticReport{
		SchemaVersion: 1, ID: "event-1", SessionID: "session-1", ClientTime: "2026-10-27T02:03:04.123Z",
		Kind: "unexpected-html", Message: "API returned HTML instead of an RPC response",
		Stack: "Error at https://memos.example/assets/index.js?token=secret:1:2",
	}
	r.Context.PagePath = "/memos/abc?password=secret#private"
	r.Context.ReferrerPath = "/memos/shares/private-share-token"
	r.Request.ID = "request-1"
	r.Request.Path = "/memos.api.v1.MemoService/GetMemo?access_token=secret"
	r.Request.Method = "POST"
	r.Request.StartedAt = "2026-10-27T02:03:04.000Z"
	r.Request.CompletedAt = r.ClientTime
	r.Request.DurationMS = 123
	r.Response.Status = 502
	r.Response.ContentType = "text/html"
	r.Response.Server = "openresty"
	r.Trace = []frontendDiagnosticTrace{{At: r.ClientTime, Type: "navigation-loading", Path: "/memos/abc?token=secret"}}
	r.Delivery.Attempt = 2
	r.Delivery.PreviousFailure = "Bearer secret-token"
	return r
}

func TestFrontendDiagnosticSavesDetailedReport(t *testing.T) {
	t.Parallel()
	p := &profile.Profile{Data: t.TempDir(), Version: "test-version", Commit: "test-commit"}
	e := echo.New()
	registerFrontendDiagnosticRoutes(e.Group(""), p)
	data, err := json.Marshal(frontendDiagnosticFixture())
	require.NoError(t, err)
	send := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "http://memos.example"+frontendErrorReportPath, bytes.NewReader(data))
		req.Header.Set("Origin", "http://memos.example")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "test-browser")
		req.Header.Set("X-Request-ID", "proxy-report-id")
		res := httptest.NewRecorder()
		e.ServeHTTP(res, req)
		return res
	}
	res := send()
	require.Equal(t, http.StatusOK, res.Code)
	require.Contains(t, res.Body.String(), `"saved":true`)
	require.Contains(t, res.Header().Get("Cache-Control"), "no-store")
	require.Equal(t, http.StatusOK, send().Code) // A retried acknowledgement does not append twice.
	files, err := filepath.Glob(filepath.Join(p.Data, "log", "*.log"))
	require.NoError(t, err)
	require.Len(t, files, 1)
	log, err := os.ReadFile(files[0])
	require.NoError(t, err)
	require.Equal(t, 1, bytes.Count(log, []byte("\n")))
	for _, detail := range []string{"receivedAt", "browser-reported", "test-version", "test-commit", "test-browser", "proxy-report-id", "unexpected-html", "request-1", "text/html", "openresty", "navigation-loading", `"attempt":2`, `"durationMs":123`} {
		require.Contains(t, string(log), detail)
	}
	require.NotContains(t, string(log), "secret")
	require.NotContains(t, string(log), "private-share-token")
	require.Contains(t, string(log), "[redacted]")
}

func TestFrontendDiagnosticRejectsInvalidReports(t *testing.T) {
	t.Parallel()
	valid, err := json.Marshal(frontendDiagnosticFixture())
	require.NoError(t, err)
	for _, tc := range []struct {
		name, body, origin, site, contentType string
		status                                int
	}{
		{"cross origin", string(valid), "https://evil.example", "cross-site", "application/json", http.StatusForbidden},
		{"no origin", string(valid), "", "", "application/json", http.StatusForbidden},
		{"non JSON", string(valid), "http://memos.example", "same-origin", "text/plain", http.StatusUnsupportedMediaType},
		{"oversized", `{"extra":"` + strings.Repeat("x", frontendDiagnosticMaxBytes) + `"}`, "http://memos.example", "same-origin", "application/json", http.StatusBadRequest},
		{"unknown fields", strings.TrimSuffix(string(valid), "}") + `,"token":"should-not-log"}`, "http://memos.example", "same-origin", "application/json", http.StatusBadRequest},
		{"trailing JSON", string(valid) + `{}`, "http://memos.example", "same-origin", "application/json", http.StatusBadRequest},
		{"invalid schema", `{}`, "http://memos.example", "same-origin", "application/json", http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := &profile.Profile{Data: t.TempDir()}
			e := echo.New()
			registerFrontendDiagnosticRoutes(e.Group(""), p)
			req := httptest.NewRequest(http.MethodPost, "http://memos.example"+frontendErrorReportPath, strings.NewReader(tc.body))
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			req.Header.Set("Content-Type", tc.contentType)
			res := httptest.NewRecorder()
			e.ServeHTTP(res, req)
			require.Equal(t, tc.status, res.Code)
			_, err := os.Stat(filepath.Join(p.Data, "log"))
			require.True(t, os.IsNotExist(err))
		})
	}
}

func TestFrontendDiagnosticProxyOriginAndRateLimit(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPost, "http://backend:5230"+frontendErrorReportPath, nil)
	req.Header.Set("Origin", "https://blog.example")
	require.True(t, frontendDiagnosticSameOrigin(req, "https://blog.example"))
	require.False(t, frontendDiagnosticSameOrigin(req, "https://other.example"))
	w := newFrontendDiagnosticWriter(t.TempDir())
	now := time.Now()
	for range 20 {
		require.True(t, w.allow(now))
	}
	require.False(t, w.allow(now))
	require.True(t, w.allow(now.Add(time.Second)))
}

func TestFrontendDiagnosticRotationAndConcurrentWrites(t *testing.T) {
	t.Parallel()
	w := newFrontendDiagnosticWriter(t.TempDir())
	w.maxBytes, w.maxFiles = 100, 3
	now := time.Now().UTC()
	require.NoError(t, os.MkdirAll(w.directory, 0700))
	unrelated := filepath.Join(w.directory, "other.log")
	require.NoError(t, os.WriteFile(unrelated, []byte("preserve"), 0600))
	for i := range 12 {
		require.NoError(t, w.append(fmt.Sprintf("event-%d", i), now.Add(time.Duration(i)*time.Second), bytes.Repeat([]byte("x"), 45)))
	}
	files, err := os.ReadDir(w.directory)
	require.NoError(t, err)
	count := 0
	for _, f := range files {
		if frontendDiagnosticFilePattern.MatchString(f.Name()) {
			count++
			info, err := f.Info()
			require.NoError(t, err)
			require.LessOrEqual(t, info.Size(), w.maxBytes)
		}
	}
	require.Equal(t, 3, count)
	_, err = os.Stat(unrelated)
	require.NoError(t, err)
	w = newFrontendDiagnosticWriter(t.TempDir())
	var wg sync.WaitGroup
	for range 12 {
		wg.Go(func() { require.NoError(t, w.append("same-event", now, []byte(`{"id":"same-event"}`))) })
	}
	wg.Wait()
	log, err := os.ReadFile(filepath.Join(w.directory, "frontend-errors-"+now.Format(time.DateOnly)+".log"))
	require.NoError(t, err)
	require.Equal(t, 1, bytes.Count(log, []byte("\n")))
}
