package v1

import "github.com/usememos/memos/store"

// resolveSSECreatorID scopes private comment events to the parent owner.
func resolveSSECreatorID(memo *store.Memo, parentMemo *store.Memo) int32 {
	if memo == nil {
		return 0
	}
	if parentMemo != nil {
		return parentMemo.CreatorID
	}
	return memo.CreatorID
}
