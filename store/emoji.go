package store

import (
	"context"

	"github.com/pkg/errors"
)

// EmojiGroup groups custom emoji exposed by an instance.
type EmojiGroup struct {
	ID        int32
	CreatedTs int64
	UpdatedTs int64
	Name      string
}

// Emoji is a custom image shortcode and its configured storage reference.
type Emoji struct {
	ID          int32
	GroupID     int32
	CreatedTs   int64
	UpdatedTs   int64
	Name        string
	Filename    string
	Type        string
	Size        int64
	StorageType string
	Reference   string
	StorageID   string
	StorageKey  string
	Blob        []byte
}

type FindEmojiGroup struct {
	ID *int32
}

type FindEmoji struct {
	ID       *int32
	GroupID  *int32
	Filename *string
	GetBlob  bool
}

func (s *Store) CreateEmojiGroup(ctx context.Context, group *EmojiGroup) (*EmojiGroup, error) {
	return s.driver.CreateEmojiGroup(ctx, group)
}

func (s *Store) ListEmojiGroups(ctx context.Context, find *FindEmojiGroup) ([]*EmojiGroup, error) {
	return s.driver.ListEmojiGroups(ctx, find)
}

func (s *Store) GetEmojiGroup(ctx context.Context, find *FindEmojiGroup) (*EmojiGroup, error) {
	groups, err := s.ListEmojiGroups(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return nil, nil
	}
	return groups[0], nil
}

func (s *Store) DeleteEmojiGroup(ctx context.Context, id int32) error {
	return errors.Wrap(s.driver.DeleteEmojiGroup(ctx, id), "failed to delete emoji group")
}

func (s *Store) CreateEmoji(ctx context.Context, emoji *Emoji) (*Emoji, error) {
	return s.driver.CreateEmoji(ctx, emoji)
}

func (s *Store) ListEmojis(ctx context.Context, find *FindEmoji) ([]*Emoji, error) {
	return s.driver.ListEmojis(ctx, find)
}

func (s *Store) GetEmoji(ctx context.Context, find *FindEmoji) (*Emoji, error) {
	emojis, err := s.ListEmojis(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(emojis) == 0 {
		return nil, nil
	}
	return emojis[0], nil
}

func (s *Store) DeleteEmoji(ctx context.Context, id int32) error {
	return errors.Wrap(s.driver.DeleteEmoji(ctx, id), "failed to delete emoji")
}
