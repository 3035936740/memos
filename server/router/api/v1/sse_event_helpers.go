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

// buildMemoReactionSSEEvent constructs an event for a reaction on a memo.
func buildMemoReactionSSEEvent(eventType SSEEventType, memoName string, memo *store.Memo, parentMemo *store.Memo) *SSEEvent {
	parent := ""
	if memo != nil && memo.ParentUID != nil {
		parent = buildMemoName(*memo.ParentUID)
	}
	visibility := store.Visibility("")
	if memo != nil {
		visibility = memo.Visibility
	}
	return &SSEEvent{
		Type:       eventType,
		Name:       memoName,
		Parent:     parent,
		Visibility: visibility,
		CreatorID:  resolveSSECreatorID(memo, parentMemo),
	}
}
