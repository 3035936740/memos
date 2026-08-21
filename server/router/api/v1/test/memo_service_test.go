package test

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestCreateMemoAcceptsUUID(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "test-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	const memoID = "21ec98aa-9a8f-458c-a2a3-c7dc69b6f591"
	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "Created with a UUID",
			Visibility: apiv1.Visibility_PRIVATE,
		},
		MemoId: memoID,
	})
	require.NoError(t, err)
	require.Equal(t, "memos/"+memoID, memo.Name)
}

func TestRecordMemoViewCountsEverySuccessfulVisit(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "view-count-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	publicMemo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "count every detail visit", Visibility: apiv1.Visibility_PUBLIC},
	})
	require.NoError(t, err)
	require.Zero(t, publicMemo.ViewCount)

	first, err := ts.Service.RecordMemoView(ctx, &apiv1.RecordMemoViewRequest{Name: publicMemo.Name})
	require.NoError(t, err)
	require.Equal(t, int64(1), first.ViewCount)

	second, err := ts.Service.RecordMemoView(ctx, &apiv1.RecordMemoViewRequest{Name: publicMemo.Name})
	require.NoError(t, err)
	require.Equal(t, int64(2), second.ViewCount)

	fetched, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: publicMemo.Name})
	require.NoError(t, err)
	require.Equal(t, int64(2), fetched.ViewCount)

	privateMemo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "private memo", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	_, err = ts.Service.RecordMemoView(ctx, &apiv1.RecordMemoViewRequest{Name: privateMemo.Name})
	require.Error(t, err)
	privateMemo, err = ts.Service.GetMemo(ownerCtx, &apiv1.GetMemoRequest{Name: privateMemo.Name})
	require.NoError(t, err)
	require.Zero(t, privateMemo.ViewCount)
}

func TestHiddenMemoIsDirectLinkPublicButOmittedFromCollections(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	admin, err := ts.CreateHostUser(ctx, "hidden-admin")
	require.NoError(t, err)
	owner, err := ts.CreateRegularUser(ctx, "hidden-owner")
	require.NoError(t, err)
	visitor, err := ts.CreateRegularUser(ctx, "hidden-visitor")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	visitorCtx := ts.CreateUserContext(ctx, visitor.ID)

	visibleMemo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "visible in public collections", Visibility: apiv1.Visibility_PUBLIC},
	})
	require.NoError(t, err)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "direct link only", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	memo, err = ts.Service.UpdateMemo(adminCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, Hidden: true},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"hidden"}},
	})
	require.NoError(t, err)
	require.True(t, memo.Hidden)
	require.Equal(t, apiv1.Visibility_PUBLIC, memo.Visibility)

	ownerList, err := ts.Service.ListMemos(ownerCtx, &apiv1.ListMemosRequest{PageSize: 10, ShowTotalSize: true})
	require.NoError(t, err)
	require.Len(t, ownerList.Memos, 2)
	require.Equal(t, int32(2), ownerList.TotalSize)

	adminList, err := ts.Service.ListMemos(adminCtx, &apiv1.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, adminList.Memos, 2)

	visitorList, err := ts.Service.ListMemos(visitorCtx, &apiv1.ListMemosRequest{PageSize: 1, ShowTotalSize: true})
	require.NoError(t, err)
	require.Len(t, visitorList.Memos, 1)
	require.Equal(t, visibleMemo.Name, visitorList.Memos[0].Name)
	require.Equal(t, int32(1), visitorList.TotalSize)

	publicList, err := ts.Service.ListMemos(ctx, &apiv1.ListMemosRequest{PageSize: 1, ShowTotalSize: true})
	require.NoError(t, err)
	require.Len(t, publicList.Memos, 1)
	require.Equal(t, visibleMemo.Name, publicList.Memos[0].Name)
	require.Equal(t, int32(1), publicList.TotalSize)

	directMemo, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, memo.Name, directMemo.Name)
	require.True(t, directMemo.Hidden)

	_, err = ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, Hidden: false},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"hidden"}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestAnonymousMemoRedactsCreatorWithoutChangingOwnership(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	admin, err := ts.CreateHostUser(ctx, "anonymous-admin")
	require.NoError(t, err)
	owner, err := ts.CreateRegularUser(ctx, "anonymous-owner")
	require.NoError(t, err)
	visitor, err := ts.CreateRegularUser(ctx, "anonymous-visitor")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	visitorCtx := ts.CreateUserContext(ctx, visitor.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "anonymous public memo",
			Visibility: apiv1.Visibility_PUBLIC,
			Anonymous:  true,
		},
	})
	require.NoError(t, err)
	require.True(t, memo.Anonymous)
	require.Empty(t, memo.Creator)
	require.True(t, memo.CreatorIsViewer)

	publicMemo, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.True(t, publicMemo.Anonymous)
	require.Empty(t, publicMemo.Creator)
	require.False(t, publicMemo.CreatorIsViewer)

	visitorMemo, err := ts.Service.GetMemo(visitorCtx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.True(t, visitorMemo.Anonymous)
	require.Empty(t, visitorMemo.Creator)
	require.False(t, visitorMemo.CreatorIsViewer)

	profileFilter := `creator == "users/` + owner.Username + `"`
	publicFeed, err := ts.Service.ListMemos(ctx, &apiv1.ListMemosRequest{})
	require.NoError(t, err)
	require.Len(t, publicFeed.Memos, 1)
	require.Equal(t, memo.Name, publicFeed.Memos[0].Name)
	require.Empty(t, publicFeed.Memos[0].Creator)

	for name, viewerCtx := range map[string]context.Context{
		"guest":   ctx,
		"visitor": visitorCtx,
		"owner":   ownerCtx,
		"admin":   adminCtx,
	} {
		t.Run("visible on profile to "+name, func(t *testing.T) {
			list, err := ts.Service.ListMemos(viewerCtx, &apiv1.ListMemosRequest{Filter: profileFilter, ShowTotalSize: true})
			require.NoError(t, err)
			if name == "visitor" || name == "guest" {
				require.Empty(t, list.Memos)
				require.Zero(t, list.TotalSize)
				return
			}
			require.Len(t, list.Memos, 1)
			require.Equal(t, int32(1), list.TotalSize)
			require.Equal(t, memo.Name, list.Memos[0].Name)
			if name == "admin" {
				require.Equal(t, "users/"+owner.Username, list.Memos[0].Creator)
			} else {
				require.Empty(t, list.Memos[0].Creator)
			}
		})
	}

	adminMemo, err := ts.Service.GetMemo(adminCtx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, "users/"+owner.Username, adminMemo.Creator)
	require.False(t, adminMemo.CreatorIsViewer)

	updated, err := ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, Content: "owner can still edit"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.NoError(t, err)
	require.True(t, updated.Anonymous)
	require.Empty(t, updated.Creator)
	require.True(t, updated.CreatorIsViewer)

	comment, err := ts.Service.CreateMemoComment(visitorCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:   "ordinary users can still interact with this memo",
			Anonymous: true,
		},
	})
	require.NoError(t, err)
	require.False(t, comment.Anonymous)
	require.Equal(t, "users/"+visitor.Username, comment.Creator)
}

func TestMemoAdminScriptIsAdminOnlyToWriteAndVisibleToAllViewers(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	admin, err := ts.CreateHostUser(ctx, "script-admin")
	require.NoError(t, err)
	member, err := ts.CreateRegularUser(ctx, "script-member")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	memberCtx := ts.CreateUserContext(ctx, member.ID)

	_, err = ts.Service.CreateMemo(memberCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:     "forged script",
		Visibility:  apiv1.Visibility_PUBLIC,
		AdminScript: "window.forged = true",
	}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = ts.Service.CreateMemo(memberCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    `<div script="window.forgedLocal = true">click</div>`,
		Visibility: apiv1.Visibility_PUBLIC,
	}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = ts.Service.CreateMemo(memberCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    `<div script=window.forgedUnquoted>click</div>`,
		Visibility: apiv1.Visibility_PUBLIC,
	}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = ts.Service.CreateMemo(memberCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    `<button script=window.forgedSelfClosing />`,
		Visibility: apiv1.Visibility_PUBLIC,
	}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	memo, err := ts.Service.CreateMemo(adminCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:     "admin scripted memo",
		Visibility:  apiv1.Visibility_PUBLIC,
		AdminScript: "window.memoScript = true",
	}})
	require.NoError(t, err)
	require.Equal(t, "window.memoScript = true", memo.AdminScript)
	localMemo, err := ts.Service.CreateMemo(adminCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    `<div script="window.localMemoScript = true">click</div>`,
		Visibility: apiv1.Visibility_PUBLIC,
	}})
	require.NoError(t, err)
	require.Contains(t, localMemo.Content, `script="window.localMemoScript = true"`)

	publicMemo, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, "window.memoScript = true", publicMemo.AdminScript)
	memberMemo, err := ts.Service.GetMemo(memberCtx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, "window.memoScript = true", memberMemo.AdminScript)
	adminMemo, err := ts.Service.GetMemo(adminCtx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, "window.memoScript = true", adminMemo.AdminScript)
	share, err := ts.Service.CreateMemoShare(adminCtx, &apiv1.CreateMemoShareRequest{
		Parent:    memo.Name,
		MemoShare: &apiv1.MemoShare{},
	})
	require.NoError(t, err)
	shareToken := share.Name[strings.LastIndex(share.Name, "/")+1:]
	sharedMemo, err := ts.Service.GetSharedMemo(ctx, &apiv1.GetSharedMemoRequest{ShareToken: shareToken})
	require.NoError(t, err)
	require.Equal(t, "window.memoScript = true", sharedMemo.AdminScript)

	comment, err := ts.Service.CreateMemoComment(adminCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:     "comment script is explicitly cleared",
			AdminScript: "window.commentScript = true",
		},
	})
	require.NoError(t, err)
	require.Equal(t, "window.commentScript = true", comment.AdminScript)

	_, err = ts.Service.CreateMemoComment(memberCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:     "forged comment script",
			AdminScript: "window.forgedComment = true",
		},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestMemoCategoryAccessIsEnforcedByAPI(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	admin, err := ts.CreateHostUser(ctx, "category-admin")
	require.NoError(t, err)
	member, err := ts.CreateRegularUser(ctx, "category-member")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	memberCtx := ts.CreateUserContext(ctx, member.ID)

	_, err = ts.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_GENERAL,
		Value: &storepb.InstanceSetting_GeneralSetting{
			GeneralSetting: &storepb.InstanceGeneralSetting{
				MemoCategoriesJson: `[{"slug":"public","title":"Public","access":"public"},{"slug":"secret","title":"Secret","access":"admin"}]`,
			},
		},
	})
	require.NoError(t, err)

	publicCategory := "public"
	publicMemo, err := ts.Service.CreateMemo(adminCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "public category", Visibility: apiv1.Visibility_PUBLIC, Category: &publicCategory},
	})
	require.NoError(t, err)

	secretCategory := "secret"
	secretMemo, err := ts.Service.CreateMemo(adminCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "admin category", Visibility: apiv1.Visibility_PUBLIC, Category: &secretCategory},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemo(memberCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "category bypass", Visibility: apiv1.Visibility_PUBLIC, Category: &secretCategory},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	for _, visitorCtx := range []context.Context{ctx, memberCtx} {
		listed, err := ts.Service.ListMemos(visitorCtx, &apiv1.ListMemosRequest{PageSize: 10, ShowTotalSize: true})
		require.NoError(t, err)
		require.Equal(t, int32(1), listed.TotalSize)
		require.Len(t, listed.Memos, 1)
		require.Equal(t, publicMemo.Name, listed.Memos[0].Name)

		_, err = ts.Service.GetMemo(visitorCtx, &apiv1.GetMemoRequest{Name: secretMemo.Name})
		require.Equal(t, codes.NotFound, status.Code(err))
	}

	adminList, err := ts.Service.ListMemos(adminCtx, &apiv1.ListMemosRequest{PageSize: 10, ShowTotalSize: true})
	require.NoError(t, err)
	require.Equal(t, int32(2), adminList.TotalSize)
	require.Len(t, adminList.Memos, 2)
}

func TestRegularUserCannotCreateHiddenMemo(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "hidden-create-user")
	require.NoError(t, err)
	_, err = ts.Service.CreateMemo(ts.CreateUserContext(ctx, user.ID), &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "not allowed", Visibility: apiv1.Visibility_PUBLIC, Hidden: true},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestRegularUserCannotPinMemo(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "pin-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "not pinnable", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	_, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, Pinned: true},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"pinned"}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestCreateAndUpdateMemoRebuildsTagPayload(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "tag-payload-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "#book/fiction #Work #work #A\u200dB https://example.com/#hidden",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"book", "book/fiction", "Work", "work", "AB"}, memo.Tags)

	memo, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
		Memo: &apiv1.Memo{
			Name:    memo.Name,
			Content: "#next #A\u200dB",
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"next", "AB"}, memo.Tags)

	stored, err := ts.Service.GetMemo(userCtx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Equal(t, []string{"next", "AB"}, stored.Tags)
}

func TestListMemos(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	// Create userOne
	userOne, err := ts.CreateRegularUser(ctx, "test-user-1")
	require.NoError(t, err)
	require.NotNil(t, userOne)

	// Create userOne context
	userOneCtx := ts.CreateUserContext(ctx, userOne.ID)

	// Create userTwo
	userTwo, err := ts.CreateRegularUser(ctx, "test-user-2")
	require.NoError(t, err)
	require.NotNil(t, userTwo)

	// Create userTwo context
	userTwoCtx := ts.CreateUserContext(ctx, userTwo.ID)

	// Create attachmentOne by userOne
	attachmentOne, err := ts.Service.CreateAttachment(userOneCtx, &apiv1.CreateAttachmentRequest{
		Attachment: &apiv1.Attachment{
			Name:     "",
			Filename: "hello.txt",
			Size:     5,
			Type:     "text/plain",
			Content: []byte{
				104, 101, 108, 108, 111,
			},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, attachmentOne)

	// Create attachmentTwo by userOne
	attachmentTwo, err := ts.Service.CreateAttachment(userOneCtx, &apiv1.CreateAttachmentRequest{
		Attachment: &apiv1.Attachment{
			Name:     "",
			Filename: "world.txt",
			Size:     5,
			Type:     "text/plain",
			Content: []byte{
				119, 111, 114, 108, 100,
			},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, attachmentTwo)

	// Create memoOne with two attachments by userOne
	memoOne, err := ts.Service.CreateMemo(userOneCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "Hellooo, any words after this sentence won't be in the snippet. This is the next sentence. And I also have two attachments.",
			Visibility: apiv1.Visibility_PROTECTED,
			Attachments: []*apiv1.Attachment{
				&apiv1.Attachment{
					Name: attachmentOne.Name,
				},
				&apiv1.Attachment{
					Name: attachmentTwo.Name,
				},
			},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, memoOne)

	// Create memoTwo by userTwo referencing memoOne
	memoTwo, err := ts.Service.CreateMemo(userTwoCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This is a memo reminding you to check the attachment attached to memoOne. I have referenced the memo below.⬇️",
			Visibility: apiv1.Visibility_PROTECTED,
			Relations: []*apiv1.MemoRelation{
				&apiv1.MemoRelation{
					RelatedMemo: &apiv1.MemoRelation_Memo{
						Name: memoOne.Name,
					},
				},
			},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, memoTwo)

	// Create memoThree by userOne
	memoThree, err := ts.Service.CreateMemo(userOneCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This is a very popular memo. I have 2 reactions!",
			Visibility: apiv1.Visibility_PROTECTED,
		},
	})

	require.NoError(t, err)
	require.NotNil(t, memoThree)

	// Create reaction from userOne on memoThree
	reactionOne, err := ts.Service.UpsertMemoReaction(userOneCtx, &apiv1.UpsertMemoReactionRequest{
		Name: memoThree.Name,
		Reaction: &apiv1.Reaction{
			ReactionType: "❤️",
		},
	})

	require.NoError(t, err)
	require.NotNil(t, reactionOne)

	// Create reaction from userTwo on memoThree
	reactionTwo, err := ts.Service.UpsertMemoReaction(userTwoCtx, &apiv1.UpsertMemoReactionRequest{
		Name: memoThree.Name,
		Reaction: &apiv1.Reaction{
			ReactionType: "👍",
		},
	})

	require.NoError(t, err)
	require.NotNil(t, reactionTwo)

	memos, err := ts.Service.ListMemos(userOneCtx, &apiv1.ListMemosRequest{PageSize: 10})

	require.NoError(t, err)
	require.NotNil(t, memos)
	require.Equal(t, 3, len(memos.Memos))

	// ///////////////
	// VERIFY MEMO ONE
	// ///////////////
	memoOneResIdx := slices.IndexFunc(memos.Memos, func(m *apiv1.Memo) bool { return m.GetName() == memoOne.GetName() })
	require.NotEqual(t, memoOneResIdx, -1)

	memoOneRes := memos.Memos[memoOneResIdx]
	require.NotNil(t, memoOneRes)

	require.Equal(t, fmt.Sprintf("users/%s", userOne.Username), memoOneRes.GetCreator())
	require.Equal(t, apiv1.Visibility_PROTECTED, memoOneRes.GetVisibility())
	require.Equal(t, memoOne.Content, memoOneRes.GetContent())
	require.Equal(t, memoOne.Content[:64]+"...", memoOneRes.GetSnippet(), "memoOne's content is snipped past the 64 char limit")
	require.Len(t, memoOneRes.Attachments, 2)
	require.Len(t, memoOneRes.Relations, 1)
	require.Empty(t, memoOneRes.Reactions)

	// verify memoOne's attachments
	// attachment one
	attachmentOneResIdx := slices.IndexFunc(memoOneRes.Attachments, func(a *apiv1.Attachment) bool { return a.GetName() == attachmentOne.GetName() })
	require.NotEqual(t, attachmentOneResIdx, -1)

	attachmentOneRes := memoOneRes.Attachments[attachmentOneResIdx]
	require.NotNil(t, attachmentOneRes)

	require.Equal(t, attachmentOne.GetName(), attachmentOneRes.GetName())
	require.Equal(t, attachmentOne.GetContent(), attachmentOneRes.GetContent())

	// attachment two
	attachmentTwoResIdx := slices.IndexFunc(memoOneRes.Attachments, func(a *apiv1.Attachment) bool { return a.GetName() == attachmentTwo.GetName() })
	require.NotEqual(t, attachmentTwoResIdx, -1)

	attachmentTwoRes := memoOneRes.Attachments[attachmentTwoResIdx]
	require.NotNil(t, attachmentTwoRes)
	require.Equal(t, attachmentTwo.GetName(), attachmentTwoRes.GetName())

	require.Equal(t, attachmentTwo.GetName(), attachmentTwoRes.GetName())
	require.Equal(t, attachmentTwo.GetContent(), attachmentTwoRes.GetContent())

	// verify memoOne's relations
	require.Len(t, memoOneRes.Relations, 1)
	memoOneExpectedRelation := &apiv1.MemoRelation{
		Memo:        &apiv1.MemoRelation_Memo{Name: memoTwo.GetName()},
		RelatedMemo: &apiv1.MemoRelation_Memo{Name: memoOne.GetName()},
	}
	require.Equal(t, memoOneExpectedRelation.Memo.GetName(), memoOneRes.Relations[0].Memo.GetName())
	require.Equal(t, memoOneExpectedRelation.RelatedMemo.GetName(), memoOneRes.Relations[0].RelatedMemo.GetName())

	// ///////////////
	// VERIFY MEMO TWO
	// ///////////////
	memoTwoResIdx := slices.IndexFunc(memos.Memos, func(m *apiv1.Memo) bool { return m.GetName() == memoTwo.GetName() })
	require.NotEqual(t, memoTwoResIdx, -1)

	memoTwoRes := memos.Memos[memoTwoResIdx]
	require.NotNil(t, memoTwoRes)

	require.Equal(t, fmt.Sprintf("users/%s", userTwo.Username), memoTwoRes.GetCreator())
	require.Equal(t, apiv1.Visibility_PROTECTED, memoTwoRes.GetVisibility())
	require.Equal(t, memoTwo.Content, memoTwoRes.GetContent())
	require.Empty(t, memoTwoRes.Attachments)
	require.Len(t, memoTwoRes.Relations, 1)
	require.Empty(t, memoTwoRes.Reactions)

	// verify memoTwo's relations
	require.Len(t, memoTwoRes.Relations, 1)
	memoTwoExpectedRelation := &apiv1.MemoRelation{
		Memo:        &apiv1.MemoRelation_Memo{Name: memoTwo.GetName()},
		RelatedMemo: &apiv1.MemoRelation_Memo{Name: memoOne.GetName()},
	}
	require.Equal(t, memoTwoExpectedRelation.Memo.GetName(), memoTwoRes.Relations[0].Memo.GetName())
	require.Equal(t, memoTwoExpectedRelation.RelatedMemo.GetName(), memoTwoRes.Relations[0].RelatedMemo.GetName())

	// ///////////////
	// VERIFY MEMO THREE
	// ///////////////
	memoThreeResIdx := slices.IndexFunc(memos.Memos, func(m *apiv1.Memo) bool { return m.GetName() == memoThree.GetName() })
	require.NotEqual(t, memoThreeResIdx, -1)

	memoThreeRes := memos.Memos[memoThreeResIdx]
	require.NotNil(t, memoThreeRes)

	require.Equal(t, fmt.Sprintf("users/%s", userOne.Username), memoThreeRes.GetCreator())
	require.Equal(t, apiv1.Visibility_PROTECTED, memoThreeRes.GetVisibility())
	require.Equal(t, memoThree.Content, memoThreeRes.GetContent())
	require.Empty(t, memoThreeRes.Attachments)
	require.Empty(t, memoThreeRes.Relations)
	require.Len(t, memoThreeRes.Reactions, 2)

	// verify memoThree's reactions
	require.Len(t, memoThreeRes.Reactions, 2)
	// userOne's reaction
	userOneReactionIdx := slices.IndexFunc(memoThreeRes.Reactions, func(r *apiv1.Reaction) bool { return r.GetCreator() == fmt.Sprintf("users/%s", userOne.Username) })
	require.NotEqual(t, userOneReactionIdx, -1)

	userOneReaction := memoThreeRes.Reactions[userOneReactionIdx]
	require.NotNil(t, userOneReaction)
	require.Equal(t, "❤️", userOneReaction.ReactionType)

	// userTwo's reaction
	userTwoReactionIdx := slices.IndexFunc(memoThreeRes.Reactions, func(r *apiv1.Reaction) bool { return r.GetCreator() == fmt.Sprintf("users/%s", userTwo.Username) })
	require.NotEqual(t, userTwoReactionIdx, -1)

	userTwoReaction := memoThreeRes.Reactions[userTwoReactionIdx]
	require.NotNil(t, userTwoReaction)
	require.Equal(t, "👍", userTwoReaction.ReactionType)
}

func TestListMemosTimeOrderBy(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateHostUser(ctx, "time-order-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	memoEarlyCreateLateUpdate, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "early create late update",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)),
			UpdateTime: timestamppb.New(time.Date(2020, 1, 3, 0, 0, 0, 0, time.UTC)),
		},
	})
	require.NoError(t, err)
	memoMiddleCreateEarlyUpdate, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "middle create early update",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC)),
			UpdateTime: timestamppb.New(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)),
		},
	})
	require.NoError(t, err)
	memoLateCreateMiddleUpdate, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "late create middle update",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(time.Date(2020, 1, 3, 0, 0, 0, 0, time.UTC)),
			UpdateTime: timestamppb.New(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC)),
		},
	})
	require.NoError(t, err)

	tests := []struct {
		name      string
		orderBy   string
		wantNames []string
	}{
		{
			name:    "default create time",
			orderBy: "",
			wantNames: []string{
				memoLateCreateMiddleUpdate.Name,
				memoMiddleCreateEarlyUpdate.Name,
				memoEarlyCreateLateUpdate.Name,
			},
		},
		{
			name:    "explicit create time",
			orderBy: "create_time desc",
			wantNames: []string{
				memoLateCreateMiddleUpdate.Name,
				memoMiddleCreateEarlyUpdate.Name,
				memoEarlyCreateLateUpdate.Name,
			},
		},
		{
			name:    "explicit update time",
			orderBy: "update_time desc",
			wantNames: []string{
				memoEarlyCreateLateUpdate.Name,
				memoLateCreateMiddleUpdate.Name,
				memoMiddleCreateEarlyUpdate.Name,
			},
		},
		{
			name:    "pinned with explicit create time",
			orderBy: "pinned desc, create_time desc",
			wantNames: []string{
				memoLateCreateMiddleUpdate.Name,
				memoMiddleCreateEarlyUpdate.Name,
				memoEarlyCreateLateUpdate.Name,
			},
		},
		{
			name:    "explicit create time ascending",
			orderBy: "create_time asc",
			wantNames: []string{
				memoEarlyCreateLateUpdate.Name,
				memoMiddleCreateEarlyUpdate.Name,
				memoLateCreateMiddleUpdate.Name,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			resp, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
				PageSize: 10,
				OrderBy:  test.orderBy,
			})
			require.NoError(t, err)
			require.Len(t, resp.Memos, len(test.wantNames))

			gotNames := make([]string, 0, len(resp.Memos))
			for _, memo := range resp.Memos {
				gotNames = append(gotNames, memo.Name)
			}
			require.Equal(t, test.wantNames, gotNames)
		})
	}

	_, err = ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
		PageSize: 10,
		OrderBy:  "display_time desc",
	})
	require.Error(t, err)
}

func TestListMemosNumberedPagination(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "numbered-pagination-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)

	for i := range 23 {
		_, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{
				Content:    fmt.Sprintf("memo-%02d", i),
				Visibility: apiv1.Visibility_PRIVATE,
			},
		})
		require.NoError(t, err)
	}

	secondPage, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
		PageSize:      10,
		PageOffset:    10,
		ShowTotalSize: true,
	})
	require.NoError(t, err)
	require.Len(t, secondPage.Memos, 10)
	require.Equal(t, int32(23), secondPage.TotalSize)

	lastPage, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
		PageSize:      10,
		PageOffset:    20,
		ShowTotalSize: true,
	})
	require.NoError(t, err)
	require.Len(t, lastPage.Memos, 3)
	require.Equal(t, int32(23), lastPage.TotalSize)
}

func TestListMemosSkipsReactionsWithMissingCreators(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "memo-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	reactor, err := ts.CreateRegularUser(ctx, "memo-reactor")
	require.NoError(t, err)
	reactorCtx := ts.CreateUserContext(ctx, reactor.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with orphan reaction",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.UpsertMemoReaction(reactorCtx, &apiv1.UpsertMemoReactionRequest{
		Name: memo.Name,
		Reaction: &apiv1.Reaction{
			ReactionType: "👍",
		},
	})
	require.NoError(t, err)

	_, err = ts.Store.DeleteUser(ctx, &store.DeleteUser{ID: reactor.ID})
	require.NoError(t, err)

	resp, err := ts.Service.ListMemos(ownerCtx, &apiv1.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, resp.Memos, 1)
	require.Equal(t, memo.Name, resp.Memos[0].Name)
	require.Empty(t, resp.Memos[0].Reactions)
}

func TestListMemosSkipsMemosWithMissingCreators(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "memo-visible-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	orphanCreator, err := ts.CreateRegularUser(ctx, "memo-orphan-creator")
	require.NoError(t, err)
	orphanCtx := ts.CreateUserContext(ctx, orphanCreator.ID)

	ownerMemo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "owner memo",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemo(orphanCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "orphan memo",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Store.DeleteUser(ctx, &store.DeleteUser{ID: orphanCreator.ID})
	require.NoError(t, err)

	resp, err := ts.Service.ListMemos(ownerCtx, &apiv1.ListMemosRequest{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, resp.Memos, 1)
	require.Equal(t, ownerMemo.Name, resp.Memos[0].Name)
}

func TestListMemoCommentsSkipsCommentsWithMissingCreators(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "comment-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	commenter, err := ts.CreateRegularUser(ctx, "comment-orphan")
	require.NoError(t, err)
	commenterCtx := ts.CreateUserContext(ctx, commenter.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with comment",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemoComment(commenterCtx, &apiv1.CreateMemoCommentRequest{
		Name: memo.Name,
		Comment: &apiv1.Memo{
			Content:    "comment to orphan",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	_, err = ts.Store.DeleteUser(ctx, &store.DeleteUser{ID: commenter.ID})
	require.NoError(t, err)

	resp, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Empty(t, resp.Memos)
}

func TestListMemoCommentsPaginates(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "comment-page-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "memo with paged comments",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		_, err = ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
			Name: memo.Name,
			Comment: &apiv1.Memo{
				Content:    fmt.Sprintf("comment %d", i),
				Visibility: apiv1.Visibility_PUBLIC,
			},
		})
		require.NoError(t, err)
	}

	firstPage, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: memo.Name, PageSize: 2})
	require.NoError(t, err)
	require.Len(t, firstPage.Memos, 2)
	require.NotEmpty(t, firstPage.NextPageToken)

	secondPage, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: memo.Name, PageToken: firstPage.NextPageToken})
	require.NoError(t, err)
	require.Len(t, secondPage.Memos, 1)
	require.Empty(t, secondPage.NextPageToken)
}

func TestListMemoCommentsOrdersFloorsAcrossPages(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "comment-order-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	parent, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "ordered comments", Visibility: apiv1.Visibility_PUBLIC},
	})
	require.NoError(t, err)

	created := make([]*apiv1.Memo, 0, 3)
	for i := 0; i < 3; i++ {
		comment, err := ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
			Name:    parent.Name,
			Comment: &apiv1.Memo{Content: fmt.Sprintf("floor %d", i+1)},
		})
		require.NoError(t, err)
		created = append(created, comment)
	}

	ascending, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{
		Name: parent.Name, PageSize: 2, OrderBy: "create_time asc",
	})
	require.NoError(t, err)
	require.Equal(t, []string{created[0].Name, created[1].Name}, []string{ascending.Memos[0].Name, ascending.Memos[1].Name})
	require.NotEmpty(t, ascending.NextPageToken)

	nextAscending, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{
		Name: parent.Name, PageToken: ascending.NextPageToken, OrderBy: "create_time asc",
	})
	require.NoError(t, err)
	require.Equal(t, created[2].Name, nextAscending.Memos[0].Name)

	descending, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{
		Name: parent.Name, PageSize: 2, OrderBy: "create_time desc",
	})
	require.NoError(t, err)
	require.Equal(t, []string{created[2].Name, created[1].Name}, []string{descending.Memos[0].Name, descending.Memos[1].Name})

	_, err = ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: parent.Name, OrderBy: "score desc"})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestListMemoCommentsFiltersArchivedBeforePagination(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "comment-archive-page-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	memo, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    "memo with archived comments",
		Visibility: apiv1.Visibility_PUBLIC,
	}})
	require.NoError(t, err)

	comments := make([]*apiv1.Memo, 0, 5)
	for i := 0; i < 5; i++ {
		comment, err := ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
			Name:    memo.Name,
			Comment: &apiv1.Memo{Content: fmt.Sprintf("comment %d", i)},
		})
		require.NoError(t, err)
		comments = append(comments, comment)
	}
	for _, comment := range comments[3:] {
		_, err := ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
			Memo:       &apiv1.Memo{Name: comment.Name, State: apiv1.State_ARCHIVED},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"state"}},
		})
		require.NoError(t, err)
	}

	firstPage, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: memo.Name, PageSize: 2})
	require.NoError(t, err)
	require.Len(t, firstPage.Memos, 2)
	require.NotEmpty(t, firstPage.NextPageToken)
	secondPage, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: memo.Name, PageToken: firstPage.NextPageToken})
	require.NoError(t, err)
	require.Len(t, secondPage.Memos, 1)
	require.Empty(t, secondPage.NextPageToken)
}

func TestCreateMemoCommentInheritsParentVisibility(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "private-comment-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	parent, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "private parent",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	comment, err := ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
		Name: parent.Name,
		Comment: &apiv1.Memo{
			Content:    "client requested public comment",
			Visibility: apiv1.Visibility_PUBLIC,
		},
	})
	require.NoError(t, err)
	require.Equal(t, apiv1.Visibility_PRIVATE, comment.Visibility)

	updatedComment, err := ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
		Memo: &apiv1.Memo{
			Name:       comment.Name,
			Visibility: apiv1.Visibility_PUBLIC,
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"visibility"}},
	})
	require.NoError(t, err)
	require.Equal(t, apiv1.Visibility_PRIVATE, updatedComment.Visibility)

	_, err = ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: comment.Name})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
}

func TestCreateMemoCommentDoesNotRevealArchivedPrivateMemo(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "archived-comment-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	other, err := ts.CreateRegularUser(ctx, "archived-comment-other")
	require.NoError(t, err)
	otherCtx := ts.CreateUserContext(ctx, other.ID)
	parent, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    "archived private parent",
		Visibility: apiv1.Visibility_PRIVATE,
	}})
	require.NoError(t, err)
	_, err = ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: parent.Name, State: apiv1.State_ARCHIVED},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"state"}},
	})
	require.NoError(t, err)

	_, err = ts.Service.CreateMemoComment(otherCtx, &apiv1.CreateMemoCommentRequest{
		Name:    parent.Name,
		Comment: &apiv1.Memo{Content: "should not reveal parent state"},
	})
	require.Equal(t, codes.NotFound, status.Code(err))

	_, err = ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
		Name:    parent.Name,
		Comment: &apiv1.Memo{Content: "owner still cannot comment"},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
}

func TestGetMemoCommentRequiresParentReadAccess(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "legacy-comment-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)

	other, err := ts.CreateRegularUser(ctx, "legacy-comment-other")
	require.NoError(t, err)
	otherCtx := ts.CreateUserContext(ctx, other.ID)

	parent, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "private parent for legacy comment",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)

	legacyComment, err := ts.Store.CreateMemo(ctx, &store.Memo{
		UID:        "legacy-public-comment",
		CreatorID:  owner.ID,
		Content:    "legacy public comment under private parent",
		Visibility: store.Public,
	})
	require.NoError(t, err)

	parentUID := parent.Name[len("memos/"):]
	parentMemo, err := ts.Store.GetMemo(ctx, &store.FindMemo{UID: &parentUID})
	require.NoError(t, err)
	require.NotNil(t, parentMemo)

	_, err = ts.Store.UpsertMemoRelation(ctx, &store.MemoRelation{
		MemoID:        legacyComment.ID,
		RelatedMemoID: parentMemo.ID,
		Type:          store.MemoRelationComment,
	})
	require.NoError(t, err)

	commentName := "memos/" + legacyComment.UID
	_, err = ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: commentName})
	require.Equal(t, codes.Unauthenticated, status.Code(err))

	_, err = ts.Service.GetMemo(otherCtx, &apiv1.GetMemoRequest{Name: commentName})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	comment, err := ts.Service.GetMemo(ownerCtx, &apiv1.GetMemoRequest{Name: commentName})
	require.NoError(t, err)
	require.Equal(t, parent.Name, comment.GetParent())

	_, err = ts.Service.ListMemoComments(ctx, &apiv1.ListMemoCommentsRequest{Name: parent.Name})
	require.Equal(t, codes.Unauthenticated, status.Code(err))

	_, err = ts.Service.ListMemoComments(otherCtx, &apiv1.ListMemoCommentsRequest{Name: parent.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	comments, err := ts.Service.ListMemoComments(ownerCtx, &apiv1.ListMemoCommentsRequest{Name: parent.Name})
	require.NoError(t, err)
	require.Len(t, comments.Memos, 1)
	require.Equal(t, commentName, comments.Memos[0].Name)
}

func TestMemoCommentUsesCurrentParentVisibility(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "dynamic-comment-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	parent, err := ts.Service.CreateMemo(ownerCtx, &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{
		Content:    "initially private",
		Visibility: apiv1.Visibility_PRIVATE,
	}})
	require.NoError(t, err)
	comment, err := ts.Service.CreateMemoComment(ownerCtx, &apiv1.CreateMemoCommentRequest{
		Name:    parent.Name,
		Comment: &apiv1.Memo{Content: "inherits private"},
	})
	require.NoError(t, err)
	require.Equal(t, apiv1.Visibility_PRIVATE, comment.Visibility)

	_, err = ts.Service.UpdateMemo(ownerCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: parent.Name, Visibility: apiv1.Visibility_PUBLIC},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"visibility"}},
	})
	require.NoError(t, err)

	visibleComment, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: comment.Name})
	require.NoError(t, err)
	require.Equal(t, comment.Name, visibleComment.Name)
	comments, err := ts.Service.ListMemoComments(ctx, &apiv1.ListMemoCommentsRequest{Name: parent.Name})
	require.NoError(t, err)
	require.Len(t, comments.Memos, 1)
	require.Equal(t, comment.Name, comments.Memos[0].Name)
}

// TestCreateMemoWithCustomTimestamps tests that administrators can set custom timestamps when creating memos and comments.
// This addresses issue #5483: https://github.com/usememos/memos/issues/5483
func TestCreateMemoWithCustomTimestamps(t *testing.T) {
	ctx := context.Background()

	ts := NewTestService(t)
	defer ts.Cleanup()

	// Timestamp overrides are restricted to administrators.
	user, err := ts.CreateHostUser(ctx, "test-admin-timestamps")
	require.NoError(t, err)
	require.NotNil(t, user)

	userCtx := ts.CreateUserContext(ctx, user.ID)

	// Define custom timestamps (January 1, 2020)
	customCreateTime := time.Date(2020, 1, 1, 12, 0, 0, 0, time.UTC)
	customUpdateTime := time.Date(2020, 1, 2, 12, 0, 0, 0, time.UTC)

	// Test 1: Create a memo with custom create_time
	memoWithCreateTime, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This memo has a custom creation time",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(customCreateTime),
		},
	})
	require.NoError(t, err)
	require.NotNil(t, memoWithCreateTime)
	require.Equal(t, customCreateTime.Unix(), memoWithCreateTime.CreateTime.AsTime().Unix(), "create_time should match the custom timestamp")

	// Test 2: Create a memo with custom update_time
	memoWithUpdateTime, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This memo has a custom update time",
			Visibility: apiv1.Visibility_PRIVATE,
			UpdateTime: timestamppb.New(customUpdateTime),
		},
	})
	require.NoError(t, err)
	require.NotNil(t, memoWithUpdateTime)
	require.Equal(t, customUpdateTime.Unix(), memoWithUpdateTime.UpdateTime.AsTime().Unix(), "update_time should match the custom timestamp")

	// Test 3: Create a memo with all custom timestamps
	memoWithAllTimestamps, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This memo has all custom timestamps",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(customCreateTime),
			UpdateTime: timestamppb.New(customUpdateTime),
		},
	})
	require.NoError(t, err)
	require.NotNil(t, memoWithAllTimestamps)
	require.Equal(t, customCreateTime.Unix(), memoWithAllTimestamps.CreateTime.AsTime().Unix(), "create_time should match the custom timestamp")
	require.Equal(t, customUpdateTime.Unix(), memoWithAllTimestamps.UpdateTime.AsTime().Unix(), "update_time should match the custom timestamp")

	// Test 4: Create a comment (memo relation) with custom timestamps
	parentMemo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This is the parent memo",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)
	require.NotNil(t, parentMemo)

	customCommentCreateTime := time.Date(2021, 6, 15, 10, 30, 0, 0, time.UTC)
	comment, err := ts.Service.CreateMemoComment(userCtx, &apiv1.CreateMemoCommentRequest{
		Name: parentMemo.Name,
		Comment: &apiv1.Memo{
			Content:    "This is a comment with custom create time",
			Visibility: apiv1.Visibility_PRIVATE,
			CreateTime: timestamppb.New(customCommentCreateTime),
		},
	})
	require.NoError(t, err)
	require.NotNil(t, comment)
	require.Equal(t, customCommentCreateTime.Unix(), comment.CreateTime.AsTime().Unix(), "comment create_time should match the custom timestamp")

	// Test 5: Verify that memos without custom timestamps still get auto-generated ones
	memoWithoutTimestamps, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{
			Content:    "This memo has auto-generated timestamps",
			Visibility: apiv1.Visibility_PRIVATE,
		},
	})
	require.NoError(t, err)
	require.NotNil(t, memoWithoutTimestamps)
	require.NotNil(t, memoWithoutTimestamps.CreateTime, "create_time should be auto-generated")
	require.NotNil(t, memoWithoutTimestamps.UpdateTime, "update_time should be auto-generated")
	require.True(t, time.Now().Unix()-memoWithoutTimestamps.CreateTime.AsTime().Unix() < 5, "create_time should be recent (within 5 seconds)")
}

func TestRegularUserCannotCustomizeMemoTimestamps(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "test-user-no-timestamp-overrides")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	customTime := timestamppb.New(time.Date(2020, 1, 1, 12, 0, 0, 0, time.UTC))

	_, err = ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "forbidden timestamp", Visibility: apiv1.Visibility_PRIVATE, CreateTime: customTime},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "ordinary memo", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	_, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, CreateTime: customTime},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"create_time"}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	_, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, UpdateTime: customTime},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"update_time"}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	// The automatic update timestamp used by ordinary content edits remains valid.
	_, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
		Memo:       &apiv1.Memo{Name: memo.Name, Content: "ordinary edit"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content", "update_time"}},
	})
	require.NoError(t, err)
}
