package ai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestProviderHeadersDoNotMutateClientOrFollowCrossOriginRedirect(t *testing.T) {
	var leaked atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		leaked.Store(true)
		_, _ = w.Write([]byte("unexpected"))
	}))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "secret", r.Header.Get("X-Private-Key"))
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer origin.Close()
	base := &http.Client{Timeout: 5 * time.Second}
	client := WithHeaders(base, map[string]string{"X-Private-Key": "secret"})
	require.Nil(t, base.Transport)
	require.Nil(t, base.CheckRedirect)
	require.Equal(t, base.Timeout, client.Timeout)
	request, err := http.NewRequest(http.MethodGet, origin.URL, nil)
	require.NoError(t, err)
	response, err := client.Do(request)
	require.NoError(t, err)
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	require.Equal(t, http.StatusFound, response.StatusCode)
	require.False(t, leaked.Load())
	require.Empty(t, request.Header.Get("X-Private-Key"))
}
