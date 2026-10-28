package fileserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/auth"
	"github.com/usememos/memos/store"
)

func TestPlusSpaceAvatarAndTrashAttachmentVisibility(t *testing.T) {
	ctx := context.Background()
	api, files, st, cleanup := newShareAttachmentTestServices(ctx, t)
	defer cleanup()
	owner, err := st.CreateUser(ctx, &store.User{Username: "avatar-owner", Role: store.RoleAdmin})
	require.NoError(t, err)
	ownerCtx := context.WithValue(ctx, auth.UserIDContextKey, owner.ID)
	e := echo.New()
	files.RegisterRoutes(e)
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}
	for _, mode := range []v1pb.Space_AccessMode{v1pb.Space_PUBLIC, v1pb.Space_INVITE_ONLY} {
		space, err := api.CreateSpace(ownerCtx, &v1pb.CreateSpaceRequest{Space: &v1pb.Space{Title: "Avatar", AccessMode: mode, AvatarUrl: makePNGDataURI(t)}})
		require.NoError(t, err)
		path := "/file/spaces/" + strings.TrimPrefix(space.Name, "spaces/") + "/avatar"
		response := get(path)
		if mode == v1pb.Space_PUBLIC {
			require.Equal(t, 200, response.Code)
			require.NotEmpty(t, response.Header().Get("ETag"))
			r := httptest.NewRequest(http.MethodGet, path, nil)
			r.Header.Set("If-None-Match", response.Header().Get("ETag"))
			w := httptest.NewRecorder()
			e.ServeHTTP(w, r)
			require.Equal(t, 304, w.Code)
		} else {
			require.Equal(t, 404, response.Code)
		}
	}
	a, err := api.CreateAttachment(ownerCtx, &v1pb.CreateAttachmentRequest{Attachment: &v1pb.Attachment{Filename: "visible.txt", Content: []byte("visible")}})
	require.NoError(t, err)
	m, err := api.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "attachment", Visibility: v1pb.Visibility_PUBLIC, Attachments: []*v1pb.Attachment{{Name: a.Name}}}})
	require.NoError(t, err)
	path := "/file/" + a.Name + "/visible.txt"
	require.Equal(t, 200, get(path).Code)
	_, err = api.DeleteMemo(ownerCtx, &v1pb.DeleteMemoRequest{Name: m.Name})
	require.NoError(t, err)
	require.Equal(t, 404, get(path).Code)
	_, err = api.RestoreMemo(ownerCtx, &v1pb.RestoreMemoRequest{Name: m.Name})
	require.NoError(t, err)
	require.Equal(t, 200, get(path).Code)
}
