package v1

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"google.golang.org/protobuf/proto"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// PublishScheduledMemos promotes due drafts and dispatches the same external
// side effects as an ordinary publication. Visibility checks also understand
// due timestamps, so a short runner delay never makes a due memo inaccessible.
func (s *APIV1Service) PublishScheduledMemos(ctx context.Context) {
	normal := store.Normal
	nowSec := time.Now().Unix()
	memos, err := s.Store.ListMemos(ctx, &store.FindMemo{
		RowStatus:       &normal,
		ExcludeComments: true,
		Filters:         []string{fmt.Sprintf("draft == true && publish_ts > 0 && publish_ts <= %d", nowSec)},
	})
	if err != nil {
		slog.Error("failed to scan scheduled memos", "err", err)
		return
	}
	for _, memo := range memos {
		if memo.Payload == nil || !memo.Payload.Draft || memo.Payload.PublishTs == 0 || memo.Payload.PublishTs > nowSec || memo.Payload.Quarantined {
			continue
		}
		payload := &storepb.MemoPayload{}
		proto.Merge(payload, memo.Payload)
		if err := s.reviewScheduledPublication(ctx, memo); err != nil {
			// Stop the due timestamp from making a rejected draft public. The
			// author retains the draft and can resubmit once review is available.
			payload.PublishTs = 0
			if saveErr := s.Store.UpdateMemo(ctx, &store.UpdateMemo{ID: memo.ID, Payload: payload}); saveErr != nil {
				slog.Error("failed to hold scheduled memo after review failure", "memo", memo.UID, "err", saveErr)
			}
			slog.Warn("scheduled memo held by content review", "memo", memo.UID, "err", err)
			continue
		}
		payload.Draft = false
		if err := s.Store.UpdateMemo(ctx, &store.UpdateMemo{ID: memo.ID, Payload: payload}); err != nil {
			slog.Error("failed to publish scheduled memo", "memo", memo.UID, "err", err)
			continue
		}
		memo.Payload = payload
		_, _, message, err := s.buildUpdatedMemoState(ctx, memo.ID)
		if err != nil {
			slog.Error("failed to build scheduled memo", "memo", memo.UID, "err", err)
			continue
		}
		if err := s.DispatchMemoCreatedWebhook(ctx, message); err != nil {
			slog.Warn("failed to dispatch scheduled memo webhook", "memo", memo.UID, "err", err)
		}
		s.SSEHub.Broadcast(&SSEEvent{Type: SSEEventMemoCreated, Name: message.Name, Visibility: memo.Visibility, CreatorID: memo.CreatorID})
		s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, nil, "")
	}
}

func (s *APIV1Service) reviewScheduledPublication(ctx context.Context, memo *store.Memo) error {
	if err := s.validateTextContent(ctx, memo.Content); err != nil {
		return err
	}
	if poll := memo.Payload.GetPoll(); poll != nil {
		texts := []string{poll.Question}
		for _, option := range poll.Options {
			texts = append(texts, option.Text)
		}
		if err := s.validateTextContent(ctx, texts...); err != nil {
			return err
		}
	}
	enabled, err := s.aiImageReviewEnabled(ctx)
	if err != nil || !enabled {
		return err
	}
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
	if err != nil {
		return err
	}
	return s.reviewMemoImages(ctx, memo, attachments)
}
