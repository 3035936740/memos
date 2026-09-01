package v1

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"

	"github.com/usememos/memos/server/auth"
	"github.com/usememos/memos/store"
)

const (
	blogRecentCommentDefaultLimit = 4
	blogRecentCommentMaxLimit     = 10
	blogRecentCommentScanSize     = 50
)

type blogRecentCommentItem struct {
	Name       string `json:"name"`
	ParentName string `json:"parentName"`
	Content    string `json:"content"`
	Creator    string `json:"creator,omitempty"`
	CreateTime int64  `json:"createTime"`
}

func (s *APIV1Service) authenticateOptionalBlogReader(
	ctx context.Context,
	authorization string,
	authorizer *Authorizer,
) (context.Context, *store.User, error) {
	result := authorizer.Authenticate(ctx, authorization)
	if err := authorizer.CheckAccess(ctx, "/memos.api.v1.MemoService/ListMemos", result); err != nil {
		return ctx, nil, err
	}
	ctx = auth.ApplyToContext(ctx, result)
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return ctx, nil, err
	}
	return ctx, user, nil
}

// RegisterBlogSidebarRoutes exposes a small, read-only projection used by the
// public blog sidebar. Visibility is checked for the comment and its parent on
// every row, so anonymous visitors never receive private, hidden, draft,
// quarantined, or category-restricted content.
func RegisterBlogSidebarRoutes(router *echo.Group, service *APIV1Service, authorizer *Authorizer) {
	router.GET("/api/v1/blog/recent-comments", func(c *echo.Context) error {
		ctx, currentUser, err := service.authenticateOptionalBlogReader(
			c.Request().Context(),
			c.Request().Header.Get("Authorization"),
			authorizer,
		)
		if err != nil {
			return moderationError(c, http.StatusUnauthorized, errors.New("authentication required"))
		}

		limit, _ := strconv.Atoi(c.QueryParam("limit"))
		if limit < 1 {
			limit = blogRecentCommentDefaultLimit
		}
		if limit > blogRecentCommentMaxLimit {
			limit = blogRecentCommentMaxLimit
		}
		filter := c.QueryParam("filter")
		if filter != "" {
			if err := service.validateMemoFilterForUser(ctx, filter, currentUser); err != nil {
				return moderationError(c, http.StatusBadRequest, errors.New("invalid memo filter"))
			}
		}

		normal := store.Normal
		items := make([]blogRecentCommentItem, 0, limit)
		rawOffset := 0
		for len(items) < limit {
			batchLimit := blogRecentCommentScanSize
			batchOffset := rawOffset
			comments, err := service.Store.ListMemos(ctx, &store.FindMemo{
				RowStatus:    &normal,
				OnlyComments: true,
				Limit:        &batchLimit,
				Offset:       &batchOffset,
			})
			if err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to list recent comments"))
			}
			if len(comments) == 0 {
				break
			}

			for _, comment := range comments {
				if comment.ParentUID == nil || !memoVisibleInCollection(comment, currentUser) {
					continue
				}
				parentFind := &store.FindMemo{UID: comment.ParentUID, RowStatus: &normal}
				if filter != "" {
					parentFind.Filters = []string{filter}
				}
				if !isSuperUser(currentUser) && !strings.Contains(filter, `space == "spaces/`) {
					parentFind.ExcludeUnsyncedSpaces = true
				}
				parents, err := service.Store.ListMemos(ctx, parentFind)
				if err != nil || len(parents) == 0 {
					continue
				}
				parent := parents[0]
				if !memoVisibleInCollection(parent, currentUser) {
					continue
				}
				if err := service.checkMemoReadAccessWithParent(ctx, comment, parent); err != nil {
					continue
				}

				creator, _ := service.Store.GetUser(ctx, &store.FindUser{ID: &comment.CreatorID})
				creatorName := ""
				if creator != nil {
					creatorName = creator.Username
				}
				items = append(items, blogRecentCommentItem{
					Name:       MemoNamePrefix + comment.UID,
					ParentName: MemoNamePrefix + parent.UID,
					Content:    comment.Content,
					Creator:    creatorName,
					CreateTime: comment.CreatedTs,
				})
				if len(items) == limit {
					break
				}
			}

			rawOffset += len(comments)
			if len(comments) < blogRecentCommentScanSize {
				break
			}
		}

		return c.JSON(http.StatusOK, map[string]any{"comments": items})
	})
}
