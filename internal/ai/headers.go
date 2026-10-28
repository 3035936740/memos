package ai

import "net/http"

type headerTransport struct {
	base    http.RoundTripper
	headers map[string]string
}

func (t headerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	for name, value := range t.headers {
		clone.Header.Set(name, value)
	}
	return t.base.RoundTrip(clone)
}

// WithHeaders returns a copy of the client with provider-specific request headers.
func WithHeaders(client *http.Client, headers map[string]string) *http.Client {
	if client == nil {
		client = http.DefaultClient
	}
	if len(headers) == 0 {
		return client
	}
	clone := *client
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	clone.Transport = headerTransport{base: base, headers: headers}
	clone.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) > 0 && (request.URL.Scheme != via[0].URL.Scheme || request.URL.Host != via[0].URL.Host) {
			return http.ErrUseLastResponse
		}
		if client.CheckRedirect != nil {
			return client.CheckRedirect(request, via)
		}
		if len(via) >= 10 {
			return http.ErrUseLastResponse
		}
		return nil
	}
	return &clone
}
