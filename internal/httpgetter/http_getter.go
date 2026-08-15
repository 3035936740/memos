package httpgetter

import (
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/pkg/errors"
)

// GetText downloads a bounded public text resource using the same SSRF-safe
// client as link metadata requests. It never follows redirects to private or
// loopback addresses.
func GetText(urlStr string, maxBytes int) ([]byte, error) {
	if maxBytes <= 0 {
		return nil, errors.New("maximum response size must be positive")
	}
	if err := validateURL(urlStr); err != nil {
		return nil, err
	}

	request, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, errors.Wrap(err, "failed to create request")
	}
	request.Header.Set("Accept", "text/plain, text/csv, application/octet-stream;q=0.9, */*;q=0.1")
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, errors.Errorf("remote server returned HTTP %d", response.StatusCode)
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "" {
		mediaType, _, err := mime.ParseMediaType(contentType)
		if err != nil {
			return nil, errors.New("remote server returned an invalid content type")
		}
		if !strings.HasPrefix(mediaType, "text/") && mediaType != "application/octet-stream" && mediaType != "application/json" {
			return nil, errors.Errorf("remote resource is not text (content type %s)", mediaType)
		}
	}

	content, err := io.ReadAll(io.LimitReader(response.Body, int64(maxBytes)+1))
	if err != nil {
		return nil, errors.Wrap(err, "failed to read response")
	}
	if len(content) > maxBytes {
		return nil, errors.Errorf("remote word list exceeds %d bytes", maxBytes)
	}
	return content, nil
}
