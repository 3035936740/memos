package test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestMemoPublishingCooldownAndAdminExemption(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	security := store.DefaultInstanceModerationSecuritySetting()
	security.PublishCooldownSeconds = 60
	require.NoError(t, ts.Store.UpsertInstanceModerationSecuritySetting(ctx, security))

	user, err := ts.CreateRegularUser(ctx, "rate-limited-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	_, err = ts.Service.CreateMemo(userCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "first", Visibility: v1pb.Visibility_PUBLIC}})
	require.NoError(t, err)
	_, err = ts.Service.CreateMemo(userCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "second", Visibility: v1pb.Visibility_PUBLIC}})
	require.Equal(t, codes.ResourceExhausted, status.Code(err))

	admin, err := ts.CreateHostUser(ctx, "rate-limit-admin")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	_, err = ts.Service.CreateMemo(adminCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "admin first", Visibility: v1pb.Visibility_PUBLIC}})
	require.NoError(t, err)
	_, err = ts.Service.CreateMemo(adminCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "admin second", Visibility: v1pb.Visibility_PUBLIC}})
	require.NoError(t, err)
}

func TestDraftVisibilityAndScheduledPublication(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "draft-owner")
	require.NoError(t, err)
	visitor, err := ts.CreateRegularUser(ctx, "draft-visitor")
	require.NoError(t, err)
	admin, err := ts.CreateHostUser(ctx, "draft-admin")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	visitorCtx := ts.CreateUserContext(ctx, visitor.ID)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)

	draft, err := ts.Service.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "private draft", Visibility: v1pb.Visibility_PUBLIC, Draft: true},
	})
	require.NoError(t, err)
	require.True(t, draft.Draft)
	_, err = ts.Service.GetMemo(ownerCtx, &v1pb.GetMemoRequest{Name: draft.Name})
	require.NoError(t, err)
	_, err = ts.Service.GetMemo(adminCtx, &v1pb.GetMemoRequest{Name: draft.Name})
	require.NoError(t, err)
	_, err = ts.Service.GetMemo(visitorCtx, &v1pb.GetMemoRequest{Name: draft.Name})
	require.Equal(t, codes.NotFound, status.Code(err))

	publicList, err := ts.Service.ListMemos(ctx, &v1pb.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Empty(t, publicList.Memos)
	ownerList, err := ts.Service.ListMemos(ownerCtx, &v1pb.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, ownerList.Memos, 1)

	scheduled, err := ts.Service.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{
			Content:     "scheduled article",
			Visibility:  v1pb.Visibility_PUBLIC,
			PublishTime: timestamppb.New(time.Now().Add(time.Hour)),
		},
	})
	require.NoError(t, err)
	require.True(t, scheduled.Draft)

	uid := strings.TrimPrefix(scheduled.Name, "memos/")
	stored, err := ts.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	require.NoError(t, err)
	require.NotNil(t, stored)
	payload := &storepb.MemoPayload{}
	proto.Merge(payload, stored.Payload)
	payload.PublishTs = time.Now().Add(-time.Second).Unix()
	require.NoError(t, ts.Store.UpdateMemo(ctx, &store.UpdateMemo{ID: stored.ID, Payload: payload}))

	ts.Service.PublishScheduledMemos(ctx)
	published, err := ts.Service.GetMemo(ctx, &v1pb.GetMemoRequest{Name: scheduled.Name})
	require.NoError(t, err)
	require.False(t, published.Draft)
	publicList, err = ts.Service.ListMemos(ctx, &v1pb.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, publicList.Memos, 1)
}

func TestExpiredUserBanIsReleased(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "temporary-ban-user")
	require.NoError(t, err)
	archived := store.Archived
	_, err = ts.Store.UpdateUser(ctx, &store.UpdateUser{ID: user.ID, RowStatus: &archived})
	require.NoError(t, err)
	require.NoError(t, ts.Store.UpsertModerationUserBan(ctx, &store.ModerationUserBan{
		UserID:      user.ID,
		ExpiresTs:   time.Now().Add(-time.Minute).Unix(),
		StrikeCount: 1,
		Source:      "AUTO",
		Active:      true,
	}))
	require.NoError(t, ts.Store.UpsertModerationQuarantine(ctx, &store.ModerationQuarantine{
		TargetType: store.ModerationTargetUser,
		TargetID:   user.ID,
	}))

	ts.Service.ReleaseExpiredUserBans(ctx)
	restored, err := ts.Store.GetUser(ctx, &store.FindUser{ID: &user.ID})
	require.NoError(t, err)
	require.Equal(t, store.Normal, restored.RowStatus)
	ban, err := ts.Store.GetModerationUserBan(ctx, user.ID)
	require.NoError(t, err)
	require.False(t, ban.Active)
}
