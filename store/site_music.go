package store

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
)

type publicMusicConfig struct {
	Enabled bool `json:"enabled"`
	Tracks  []struct {
		URL string `json:"url"`
	} `json:"tracks"`
}

// IsAttachmentInPublicMusicConfig reports whether an unlinked attachment is deliberately exposed by the enabled site playlist.
func (s *Store) IsAttachmentInPublicMusicConfig(ctx context.Context, attachmentUID string) (bool, error) {
	setting, err := s.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return false, err
	}
	if setting == nil || strings.TrimSpace(setting.MusicConfigJson) == "" {
		return false, nil
	}

	var config publicMusicConfig
	if err := json.Unmarshal([]byte(setting.MusicConfigJson), &config); err != nil || !config.Enabled {
		return false, nil //nolint:nilerr // Invalid optional playlist JSON must not grant public attachment access.
	}
	for _, track := range config.Tracks {
		parsed, err := url.Parse(track.URL)
		if err != nil {
			continue
		}
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) >= 3 && parts[0] == "file" && parts[1] == "attachments" && parts[2] == attachmentUID {
			return true, nil
		}
	}
	return false, nil
}
