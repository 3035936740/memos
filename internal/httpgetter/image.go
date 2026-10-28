package httpgetter

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// GetBoundedImage fetches a public image with the SSRF-safe metadata client.
func GetBoundedImage(ctx context.Context, source string, maxBytes int64) (*Image, error) {
	if err := validateURL(source); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("image download failed")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxBytes {
		return nil, errors.New("image exceeds review size limit")
	}
	mediaType := http.DetectContentType(body)
	if !strings.HasPrefix(mediaType, "image/") {
		return nil, errors.New("remote resource is not an image")
	}
	return &Image{Blob: body, Mediatype: mediaType}, nil
}

type Image struct {
	Blob      []byte
	Mediatype string
}

func GetImage(urlStr string) (*Image, error) {
	if _, err := url.Parse(urlStr); err != nil {
		return nil, err
	}

	response, err := http.Get(urlStr)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	mediatype, err := getMediatype(response)
	if err != nil {
		return nil, err
	}
	if !strings.HasPrefix(mediatype, "image/") {
		return nil, errors.New("wrong image mediatype")
	}

	bodyBytes, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, err
	}

	image := &Image{
		Blob:      bodyBytes,
		Mediatype: mediatype,
	}
	return image, nil
}
