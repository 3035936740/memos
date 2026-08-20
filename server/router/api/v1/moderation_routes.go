package v1

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"
	"google.golang.org/protobuf/proto"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/access"
	"github.com/usememos/memos/store"
)

type moderationReportRequest struct {
	TargetType string `json:"targetType"`
	TargetName string `json:"targetName"`
	Reason     string `json:"reason"`
}

type moderationUserBanRequest struct {
	Days *int32 `json:"days"`
}

type moderationReportCountRequest struct {
	Count int32 `json:"count"`
}

type moderationUserBanResponse struct {
	Active      bool   `json:"active"`
	Permanent   bool   `json:"permanent"`
	ExpiresTime int64  `json:"expiresTime"`
	StrikeCount int32  `json:"strikeCount"`
	Source      string `json:"source"`
}

func moderationUserBanToResponse(ban *store.ModerationUserBan) moderationUserBanResponse {
	if ban == nil {
		return moderationUserBanResponse{}
	}
	return moderationUserBanResponse{
		Active:      ban.Active,
		Permanent:   ban.Active && ban.ExpiresTs == 0,
		ExpiresTime: ban.ExpiresTs,
		StrikeCount: ban.StrikeCount,
		Source:      ban.Source,
	}
}

type moderationListItem struct {
	TargetType string `json:"targetType"`
	TargetID   int32  `json:"targetId"`
	TargetName string `json:"targetName"`
	Title      string `json:"title"`
	Creator    string `json:"creator,omitempty"`
	Count      int32  `json:"count"`
	Reason     string `json:"reason,omitempty"`
	CreateTime int64  `json:"createTime"`
}

func (s *APIV1Service) authenticateModerationUser(c *echo.Context, authorizer *Authorizer) (*store.User, int, error) {
	ctx := c.Request().Context()
	result := authorizer.Authenticate(ctx, c.Request().Header.Get("Authorization"))
	if result == nil {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	var userID int32
	if result.User != nil {
		userID = result.User.ID
	} else if result.Claims != nil {
		userID = result.Claims.UserID
	}
	if userID == 0 {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to load user")
	}
	if user == nil || user.RowStatus == store.Archived {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	return user, 0, nil
}

func parseModerationTargetType(raw string) (store.ModerationTargetType, bool) {
	targetType := store.ModerationTargetType(strings.ToUpper(strings.TrimSpace(raw)))
	switch targetType {
	case store.ModerationTargetArticle, store.ModerationTargetComment, store.ModerationTargetUser:
		return targetType, true
	default:
		return "", false
	}
}

func moderationMemoReadable(memo, parent *store.Memo, user *store.User) bool {
	if memo == nil {
		return false
	}
	if isSuperUser(user) {
		return true
	}
	for _, candidate := range []*store.Memo{parent, memo} {
		if candidate == nil || candidate.Payload == nil {
			continue
		}
		if candidate.Payload.Quarantined {
			return false
		}
		if candidate.Payload.Draft && (candidate.Payload.PublishTs == 0 || candidate.Payload.PublishTs > time.Now().Unix()) && (user == nil || candidate.CreatorID != user.ID) {
			return false
		}
	}
	return access.CheckMemoRead(memo, parent, user, false, nil).Denial == access.MemoReadDenialNone
}

func (s *APIV1Service) resolveModerationTarget(c *echo.Context, targetType store.ModerationTargetType, name string) (int32, *store.Memo, *store.User, error) {
	ctx := c.Request().Context()
	if targetType == store.ModerationTargetUser {
		user, err := ResolveUserByName(ctx, s.Store, strings.TrimSpace(name))
		if err != nil || user == nil {
			return 0, nil, nil, errors.New("user not found")
		}
		return user.ID, nil, user, nil
	}
	uid, err := ExtractMemoUIDFromName(strings.TrimSpace(name))
	if err != nil {
		return 0, nil, nil, errors.New("memo not found")
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	if err != nil || memo == nil {
		return 0, nil, nil, errors.New("memo not found")
	}
	actualType := store.ModerationTargetArticle
	if memo.ParentUID != nil {
		actualType = store.ModerationTargetComment
	}
	if actualType != targetType {
		return 0, nil, nil, errors.New("target type does not match content")
	}
	creator, err := s.Store.GetUser(ctx, &store.FindUser{ID: &memo.CreatorID})
	if err != nil {
		return 0, nil, nil, errors.New("failed to load creator")
	}
	return memo.ID, memo, creator, nil
}

func (s *APIV1Service) applyAutomaticModeration(c *echo.Context, targetType store.ModerationTargetType, targetID int32, memo *store.Memo, targetUser *store.User, count int32, reason string) error {
	setting, err := s.Store.GetInstanceModerationSecuritySetting(c.Request().Context())
	if err != nil {
		return err
	}
	threshold := setting.ArticleReportThreshold
	if targetType == store.ModerationTargetComment {
		threshold = setting.CommentReportThreshold
	}
	if targetType == store.ModerationTargetUser {
		threshold = setting.UserReportThreshold
	}
	if count < threshold || (targetUser != nil && targetUser.Role == store.RoleAdmin) {
		return nil
	}
	if memo != nil {
		payload := &storepb.MemoPayload{}
		if memo.Payload != nil {
			proto.Merge(payload, memo.Payload)
		}
		payload.Quarantined = true
		if err := s.Store.UpdateMemo(c.Request().Context(), &store.UpdateMemo{ID: memo.ID, Payload: payload}); err != nil {
			return err
		}
	} else if targetUser != nil {
		initialDays := setting.UserAutoBanInitialDays
		_, err := s.banModerationUser(c.Request().Context(), targetUser, &initialDays, "AUTO", count, reason)
		return err
	}
	return s.Store.UpsertModerationQuarantine(c.Request().Context(), &store.ModerationQuarantine{TargetType: targetType, TargetID: targetID, ReportCount: count, Reason: reason})
}

func (s *APIV1Service) moderationItem(ctx *echo.Context, targetType store.ModerationTargetType, targetID int32, count int32, reason string, createdTs int64) moderationListItem {
	item := moderationListItem{TargetType: string(targetType), TargetID: targetID, Count: count, Reason: reason, CreateTime: createdTs}
	if targetType == store.ModerationTargetUser {
		user, _ := s.Store.GetUser(ctx.Request().Context(), &store.FindUser{ID: &targetID})
		if user != nil {
			item.TargetName = BuildUserName(user.Username)
			item.Title = user.Nickname
			item.Creator = user.Username
		}
		return item
	}
	memo, _ := s.Store.GetMemo(ctx.Request().Context(), &store.FindMemo{ID: &targetID})
	if memo == nil {
		return item
	}
	item.TargetName = MemoNamePrefix + memo.UID
	item.Title = strings.TrimSpace(memo.Content)
	if memo.Payload != nil && memo.Payload.Property != nil && memo.Payload.Property.Title != "" {
		item.Title = memo.Payload.Property.Title
	}
	if len([]rune(item.Title)) > 120 {
		item.Title = string([]rune(item.Title)[:120]) + "…"
	}
	creator, _ := s.Store.GetUser(ctx.Request().Context(), &store.FindUser{ID: &memo.CreatorID})
	if creator != nil {
		item.Creator = creator.Username
	}
	return item
}

func moderationPage(c *echo.Context) (int, int) {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}

func RegisterModerationRoutes(router *echo.Group, service *APIV1Service, authorizer *Authorizer) {
	router.POST("/api/v1/moderation/reports", func(c *echo.Context) error {
		user, code, err := service.authenticateModerationUser(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		request := &moderationReportRequest{}
		if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 4096)).Decode(request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		targetType, ok := parseModerationTargetType(request.TargetType)
		if !ok {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid target type"))
		}
		targetID, memo, targetUser, err := service.resolveModerationTarget(c, targetType, request.TargetName)
		if err != nil {
			return moderationError(c, http.StatusNotFound, err)
		}
		if memo != nil {
			var parent *store.Memo
			if memo.ParentUID != nil {
				parent, _ = service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: memo.ParentUID})
			}
			if !moderationMemoReadable(memo, parent, user) {
				return moderationError(c, http.StatusNotFound, errors.New("target not found"))
			}
			if memo.CreatorID == user.ID {
				return moderationError(c, http.StatusBadRequest, errors.New("cannot report your own content"))
			}
		}
		if targetType == store.ModerationTargetUser && targetID == user.ID {
			return moderationError(c, http.StatusBadRequest, errors.New("cannot report yourself"))
		}
		reason := strings.TrimSpace(request.Reason)
		if len([]rune(reason)) > 500 {
			return moderationError(c, http.StatusBadRequest, errors.New("reason is too long"))
		}
		if _, err := service.Store.CreateModerationReport(c.Request().Context(), &store.ModerationReport{CreatorID: user.ID, TargetType: targetType, TargetID: targetID, Reason: reason}); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				return moderationError(c, http.StatusConflict, errors.New("you have already reported this target"))
			}
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to create report"))
		}
		count, err := service.Store.CountModerationReports(c.Request().Context(), targetType, targetID)
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to count reports"))
		}
		if err := service.applyAutomaticModeration(c, targetType, targetID, memo, targetUser, count, reason); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to apply moderation"))
		}
		return c.JSON(http.StatusCreated, map[string]any{"count": count})
	})

	router.GET("/api/v1/admin/moderation/reports", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		page, size := moderationPage(c)
		var targetType *store.ModerationTargetType
		if raw := c.QueryParam("targetType"); raw != "" {
			parsed, ok := parseModerationTargetType(raw)
			if !ok {
				return moderationError(c, http.StatusBadRequest, errors.New("invalid target type"))
			}
			targetType = &parsed
		}
		rows, total, err := service.Store.ListModerationReportSummaries(c.Request().Context(), &store.FindModerationReportSummary{TargetType: targetType, Limit: size, Offset: (page - 1) * size})
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to list reports"))
		}
		items := make([]moderationListItem, 0, len(rows))
		for _, row := range rows {
			items = append(items, service.moderationItem(c, row.TargetType, row.TargetID, row.Count, row.Reason, row.LastTs))
		}
		return c.JSON(http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "pageSize": size})
	})

	router.PUT("/api/v1/admin/moderation/reports/:type/:id/count", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		targetType, ok := parseModerationTargetType(c.Param("type"))
		if !ok {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid target type"))
		}
		targetID64, err := strconv.ParseInt(c.Param("id"), 10, 32)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid target id"))
		}
		request := &moderationReportCountRequest{}
		if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 1024)).Decode(request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		if request.Count < 0 || request.Count > 10000 {
			return moderationError(c, http.StatusBadRequest, errors.New("report count must be between 0 and 10000"))
		}
		if err := service.Store.SetModerationReportCount(c.Request().Context(), targetType, int32(targetID64), request.Count); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to update report count"))
		}
		return c.JSON(http.StatusOK, map[string]int32{"count": request.Count})
	})

	router.GET("/api/v1/admin/moderation/quarantine", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		page, size := moderationPage(c)
		var targetType *store.ModerationTargetType
		if raw := c.QueryParam("targetType"); raw != "" {
			parsed, ok := parseModerationTargetType(raw)
			if !ok {
				return moderationError(c, http.StatusBadRequest, errors.New("invalid target type"))
			}
			targetType = &parsed
		}
		rows, total, err := service.Store.ListModerationQuarantines(c.Request().Context(), &store.FindModerationQuarantine{TargetType: targetType, Limit: size, Offset: (page - 1) * size})
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to list quarantine"))
		}
		items := make([]moderationListItem, 0, len(rows))
		for _, row := range rows {
			items = append(items, service.moderationItem(c, row.TargetType, row.TargetID, row.ReportCount, row.Reason, row.CreatedTs))
		}
		return c.JSON(http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "pageSize": size})
	})

	router.POST("/api/v1/admin/moderation/quarantine/:type/:id/restore", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		targetType, ok := parseModerationTargetType(c.Param("type"))
		if !ok {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid target type"))
		}
		targetID64, err := strconv.ParseInt(c.Param("id"), 10, 32)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid target id"))
		}
		targetID := int32(targetID64)
		if targetType == store.ModerationTargetUser {
			if err := service.restoreModerationUser(c.Request().Context(), targetID); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to restore user"))
			}
		} else {
			memo, err := service.Store.GetMemo(c.Request().Context(), &store.FindMemo{ID: &targetID})
			if err != nil || memo == nil {
				return moderationError(c, http.StatusNotFound, errors.New("memo not found"))
			}
			payload := &storepb.MemoPayload{}
			if memo.Payload != nil {
				proto.Merge(payload, memo.Payload)
			}
			payload.Quarantined = false
			if err := service.Store.UpdateMemo(c.Request().Context(), &store.UpdateMemo{ID: memo.ID, Payload: payload}); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to restore memo"))
			}
		}
		if targetType != store.ModerationTargetUser {
			if err := service.Store.RestoreModerationTarget(c.Request().Context(), targetType, targetID); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to clear moderation state"))
			}
		}
		return c.NoContent(http.StatusNoContent)
	})

	router.GET("/api/v1/admin/users/:id/ban", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		target, err := service.resolveModerationUserReference(c.Request().Context(), c.Param("id"))
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid user reference"))
		}
		if target == nil {
			return moderationError(c, http.StatusNotFound, errors.New("user not found"))
		}
		ban, err := service.Store.GetModerationUserBan(c.Request().Context(), target.ID)
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load user ban"))
		}
		return c.JSON(http.StatusOK, moderationUserBanToResponse(ban))
	})

	router.POST("/api/v1/admin/users/:id/ban", func(c *echo.Context) error {
		admin, code, err := service.authenticateModerationAdmin(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		target, err := service.resolveModerationUserReference(c.Request().Context(), c.Param("id"))
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid user reference"))
		}
		if target == nil {
			return moderationError(c, http.StatusNotFound, errors.New("user not found"))
		}
		if target.ID == admin.ID {
			return moderationError(c, http.StatusBadRequest, errors.New("cannot ban yourself"))
		}
		request := &moderationUserBanRequest{}
		if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 1024)).Decode(request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		if request.Days != nil && (*request.Days < 1 || *request.Days > int32(maxModerationBanDays)) {
			return moderationError(c, http.StatusBadRequest, errors.New("ban days must be between 1 and 36500"))
		}
		ban, err := service.banModerationUser(c.Request().Context(), target, request.Days, "MANUAL", 0, "管理员手动封禁")
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to ban user"))
		}
		return c.JSON(http.StatusOK, moderationUserBanToResponse(ban))
	})

	router.POST("/api/v1/admin/users/:id/unban", func(c *echo.Context) error {
		admin, code, err := service.authenticateModerationAdmin(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		target, err := service.resolveModerationUserReference(c.Request().Context(), c.Param("id"))
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid user reference"))
		}
		if target == nil {
			return moderationError(c, http.StatusNotFound, errors.New("user not found"))
		}
		if target.ID == admin.ID {
			return moderationError(c, http.StatusBadRequest, errors.New("cannot unban yourself"))
		}
		if err := service.restoreModerationUser(c.Request().Context(), target.ID); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to unban user"))
		}
		return c.NoContent(http.StatusNoContent)
	})

	router.GET("/api/v1/admin/moderation/security", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		setting, err := service.Store.GetInstanceModerationSecuritySetting(c.Request().Context())
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load security setting"))
		}
		return c.JSON(http.StatusOK, setting)
	})
	router.PUT("/api/v1/admin/moderation/security", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		setting := store.DefaultInstanceModerationSecuritySetting()
		if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 4096)).Decode(setting); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		if setting.CommentReportThreshold < 1 || setting.CommentReportThreshold > 10000 || setting.ArticleReportThreshold < 1 || setting.ArticleReportThreshold > 10000 || setting.UserReportThreshold < 1 || setting.UserReportThreshold > 10000 || setting.UserAutoBanInitialDays < 1 || setting.UserAutoBanInitialDays > int32(maxModerationBanDays) || setting.PublishCooldownSeconds < 0 || setting.PublishCooldownSeconds > 86400 {
			return moderationError(c, http.StatusBadRequest, errors.New("setting is outside the allowed range"))
		}
		if err := service.Store.UpsertInstanceModerationSecuritySetting(c.Request().Context(), setting); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to save security setting"))
		}
		return c.JSON(http.StatusOK, setting)
	})

	router.GET("/api/v1/bookmarks", func(c *echo.Context) error {
		user, code, err := service.authenticateModerationUser(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		page, size := moderationPage(c)
		ids, total, err := service.Store.ListMemoBookmarkIDs(c.Request().Context(), user.ID, size, (page-1)*size)
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to list bookmarks"))
		}
		items := []moderationListItem{}
		for _, id := range ids {
			memo, _ := service.Store.GetMemo(c.Request().Context(), &store.FindMemo{ID: &id})
			var parent *store.Memo
			if memo != nil && memo.ParentUID != nil {
				parent, _ = service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: memo.ParentUID})
			}
			if memo == nil || memo.ParentUID != nil || !moderationMemoReadable(memo, parent, user) || !memoVisibleInCollection(memo, user) {
				continue
			}
			items = append(items, service.moderationItem(c, store.ModerationTargetArticle, id, 0, "", time.Now().Unix()))
		}
		return c.JSON(http.StatusOK, map[string]any{"items": items, "total": total, "page": page, "pageSize": size})
	})
	router.GET("/api/v1/bookmarks/:uid", func(c *echo.Context) error {
		user, code, err := service.authenticateModerationUser(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		uid := c.Param("uid")
		memo, err := service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: &uid})
		if err != nil || memo == nil {
			return moderationError(c, http.StatusNotFound, errors.New("memo not found"))
		}
		var parent *store.Memo
		if memo.ParentUID != nil {
			parent, _ = service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: memo.ParentUID})
		}
		if memo.ParentUID != nil || !moderationMemoReadable(memo, parent, user) {
			return moderationError(c, http.StatusNotFound, errors.New("memo not found"))
		}
		saved, err := service.Store.HasMemoBookmark(c.Request().Context(), user.ID, memo.ID)
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load bookmark"))
		}
		return c.JSON(http.StatusOK, map[string]bool{"saved": saved})
	})
	router.PUT("/api/v1/bookmarks/:uid", func(c *echo.Context) error {
		user, code, err := service.authenticateModerationUser(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		uid := c.Param("uid")
		memo, err := service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: &uid})
		if err != nil || memo == nil {
			return moderationError(c, http.StatusNotFound, errors.New("memo not found"))
		}
		var parent *store.Memo
		if memo.ParentUID != nil {
			parent, _ = service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: memo.ParentUID})
		}
		if memo.ParentUID != nil || !moderationMemoReadable(memo, parent, user) {
			return moderationError(c, http.StatusForbidden, errors.New("permission denied"))
		}
		if err := service.Store.UpsertMemoBookmark(c.Request().Context(), user.ID, memo.ID); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to save bookmark"))
		}
		return c.NoContent(http.StatusNoContent)
	})
	router.DELETE("/api/v1/bookmarks/:uid", func(c *echo.Context) error {
		user, code, err := service.authenticateModerationUser(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		uid := c.Param("uid")
		memo, err := service.Store.GetMemo(c.Request().Context(), &store.FindMemo{UID: &uid})
		if err != nil || memo == nil {
			return moderationError(c, http.StatusNotFound, errors.New("memo not found"))
		}
		if err := service.Store.DeleteMemoBookmark(c.Request().Context(), user.ID, memo.ID); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to delete bookmark"))
		}
		return c.NoContent(http.StatusNoContent)
	})
}
