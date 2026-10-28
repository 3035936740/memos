package store

import (
	"context"
	"database/sql"
	"math/rand/v2"
	"strconv"
	"strings"

	"github.com/pkg/errors"
)

func spaceListWhere(find *FindSpace) (string, []any) {
	clauses := []string{"1=1"}
	args := []any{}
	add := func(query string, values ...any) { clauses = append(clauses, query); args = append(args, values...) }
	if find.ID != nil {
		add("space.id=?", *find.ID)
	}
	if find.MinID != nil {
		add("space.id>=?", *find.MinID)
	}
	if find.MaxID != nil {
		add("space.id<?", *find.MaxID)
	}
	if len(find.IDList) > 0 {
		holders := []string{}
		for _, id := range find.IDList {
			holders = append(holders, "?")
			args = append(args, id)
		}
		clauses = append(clauses, "space.id IN ("+strings.Join(holders, ",")+")")
	}
	if len(find.UIDList) > 0 {
		holders := []string{}
		for _, uid := range find.UIDList {
			holders = append(holders, "?")
			args = append(args, uid)
		}
		first := strings.Join(holders, ",")
		for _, uid := range find.UIDList {
			args = append(args, uid)
		}
		clauses = append(clauses, "(space.uid IN ("+first+") OR space.url_slug IN ("+first+"))")
	}
	if find.UID != nil {
		add("space.uid=?", *find.UID)
	}
	if find.URLSlug != nil {
		add("space.url_slug=?", *find.URLSlug)
	}
	if find.UIDOrURLSlug != nil {
		add("(space.uid=? OR space.url_slug=?)", *find.UIDOrURLSlug, *find.UIDOrURLSlug)
	}
	if len(find.AccessModes) > 0 {
		holders := []string{}
		for _, mode := range find.AccessModes {
			holders = append(holders, "?")
			args = append(args, mode)
		}
		clauses = append(clauses, "space.access_mode IN ("+strings.Join(holders, ",")+")")
	}
	membership := `EXISTS (SELECT 1 FROM space_member sm JOIN ` + "`user`" + ` u ON u.id=sm.user_id WHERE sm.space_id=space.id AND sm.user_id=? AND sm.status='ACTIVE' AND sm.role IN ('ADMIN','USER') AND u.row_status='NORMAL')`
	if find.MemberUserID != nil {
		add(membership, *find.MemberUserID)
	}
	if find.VisibleToUserID != nil {
		add("(space.access_mode IN ('AUTHENTICATED','PUBLIC') OR "+membership+")", *find.VisibleToUserID)
	}
	if find.Search != nil && strings.TrimSpace(*find.Search) != "" {
		// LIKE remains adequate at tens of thousands of spaces. Larger installations
		// can add FTS5 / pg_trgm / FULLTEXT without changing the permission predicate.
		search := "%" + strings.ToLower(strings.TrimSpace(*find.Search)) + "%"
		add("(LOWER(space.uid) LIKE ? OR LOWER(COALESCE(space.url_slug,'')) LIKE ? OR LOWER(space.title) LIKE ? OR LOWER(space.description) LIKE ?)", search, search, search, search)
	}
	return strings.Join(clauses, " AND "), args
}

// ListSpacesSQL applies visibility, sorting and pagination in one database query.
func ListSpacesSQL(ctx context.Context, db *sql.DB, driver string, find *FindSpace) ([]*Space, error) {
	where, args := spaceListWhere(find)
	if find.TotalSize != nil {
		if err := db.QueryRowContext(ctx, BindSQL(driver, "SELECT COUNT(*) FROM space WHERE "+where), args...).Scan(find.TotalSize); err != nil {
			return nil, err
		}
	}
	viewer := find.ViewerUserID
	if viewer == nil {
		viewer = find.MemberUserID
	}
	userID := int32(0)
	if viewer != nil {
		userID = *viewer
	}
	role := `COALESCE((SELECT role FROM space_member WHERE space_id=space.id AND user_id=` + strconv.Itoa(int(userID)) + ` AND status='ACTIVE' AND role IN ('ADMIN','USER')),'')`
	members := `(SELECT COUNT(*) FROM space_member members JOIN ` + "`user`" + ` member_user ON member_user.id=members.user_id WHERE members.space_id=space.id AND members.status='ACTIVE' AND members.role IN ('ADMIN','USER') AND member_user.row_status='NORMAL')`
	if viewer == nil && !find.ShortAvatar && find.OrderBy != "member_count desc" {
		members = "0"
	}
	draft, hidden, quarantined := `COALESCE(json_extract(m.payload,'$.draft'),0)=0`, `COALESCE(json_extract(m.payload,'$.hidden'),0)=0`, `COALESCE(json_extract(m.payload,'$.quarantined'),0)=0`
	activity := "m.updated_ts"
	if driver == "postgres" {
		draft = `COALESCE(m.payload->>'draft','false')='false'`
		hidden = `COALESCE(m.payload->>'hidden','false')='false'`
		quarantined = `COALESCE(m.payload->>'quarantined','false')='false'`
	}
	if driver == "mysql" {
		draft = `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.payload,'$.draft')),'false') IN ('false','0')`
		hidden = `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.payload,'$.hidden')),'false') IN ('false','0')`
		quarantined = `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.payload,'$.quarantined')),'false') IN ('false','0')`
		activity = "UNIX_TIMESTAMP(m.updated_ts)"
	}
	// Directory counts/activity use only publicly listable root memos for every viewer, including administrators.
	publicMemos := ` FROM memo m WHERE m.space_id=space.id AND m.deleted_ts IS NULL AND m.row_status='NORMAL' AND m.visibility='PUBLIC' AND ` + draft + " AND " + hidden + " AND " + quarantined + ` AND NOT EXISTS (SELECT 1 FROM memo_relation cr WHERE cr.memo_id=m.id AND cr.type='COMMENT')`
	avatar := "space.avatar_url"
	if find.ShortAvatar {
		url := `'/file/spaces/' || space.uid || '/avatar'`
		if driver == "mysql" {
			url = `CONCAT('/file/spaces/',space.uid,'/avatar')`
		}
		avatar = `CASE WHEN space.avatar_url LIKE 'data:%' THEN ` + url + ` ELSE space.avatar_url END`
	}
	fields := `space.id,space.uid,COALESCE(space.url_slug,''),space.title,space.description,` + avatar + `,space.access_mode,space.sync_to_main_feed,` + role + `,` + members + ` AS member_count,(SELECT COUNT(*)` + publicMemos + `) AS memo_count,COALESCE((SELECT MAX(` + activity + `)` + publicMemos + `),0) AS last_activity`
	order := "space.id DESC"
	switch find.OrderBy {
	case "", "create_time desc":
	case "member_count desc":
		order = "member_count DESC, space.id DESC"
	case "last_activity_time desc":
		order = "last_activity DESC, space.id DESC"
	case "title":
		order = "LOWER(space.title) ASC, space.id DESC"
	case "_id_asc":
		order = "space.id ASC"
	default:
		return nil, errors.New("unsupported space order")
	}
	query := "SELECT " + fields + " FROM space WHERE " + where + " ORDER BY " + order
	if find.Limit != nil {
		query += " LIMIT ?"
		args = append(args, *find.Limit)
		if find.Offset != nil {
			query += " OFFSET ?"
			args = append(args, *find.Offset)
		}
	}
	rows, err := db.QueryContext(ctx, BindSQL(driver, query), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*Space{}
	for rows.Next() {
		space := &Space{}
		if err := rows.Scan(&space.ID, &space.UID, &space.URLSlug, &space.Title, &space.Description, &space.AvatarURL, &space.AccessMode, &space.SyncToMainFeed, &space.CurrentUserRole, &space.MemberCount, &space.MemoCount, &space.LastActivityTs); err != nil {
			return nil, err
		}
		result = append(result, space)
	}
	return result, rows.Err()
}

// SampleSpaces uses an indexed random id start with wraparound, not a full random sort.
func (s *Store) SampleSpaces(ctx context.Context, find *FindSpace, count int) ([]*Space, error) {
	count = max(1, min(count, 20))
	where, args := spaceListWhere(find)
	var low, high sql.NullInt64
	if err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, "SELECT MIN(space.id),MAX(space.id) FROM space WHERE "+where), args...).Scan(&low, &high); err != nil {
		return nil, err
	}
	if !low.Valid {
		return []*Space{}, nil
	}
	start := int32(low.Int64 + rand.Int64N(high.Int64-low.Int64+1))
	sample := *find
	sample.MinID = &start
	sample.OrderBy = "_id_asc"
	sample.Limit = &count
	sample.Offset = nil
	sample.TotalSize = nil
	result, err := s.driver.ListSpaces(ctx, &sample)
	if err != nil {
		return nil, err
	}
	remaining := count - len(result)
	if remaining > 0 {
		sample.MinID = nil
		sample.MaxID = &start
		sample.Limit = &remaining
		tail, err := s.driver.ListSpaces(ctx, &sample)
		if err != nil {
			return nil, err
		}
		result = append(result, tail...)
	}
	rand.Shuffle(len(result), func(i, j int) { result[i], result[j] = result[j], result[i] })
	return result, nil
}
