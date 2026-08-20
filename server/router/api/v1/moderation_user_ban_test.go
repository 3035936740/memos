package v1

import (
	"context"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
	storetest "github.com/usememos/memos/store/test"
)

func TestScaledAutomaticBanDays(t *testing.T) {
	require.Equal(t, int64(30), scaledAutomaticBanDays(30, 1))
	require.Equal(t, int64(60), scaledAutomaticBanDays(30, 2))
	require.Equal(t, int64(120), scaledAutomaticBanDays(30, 3))
	require.Equal(t, maxModerationBanDays, scaledAutomaticBanDays(30, 30))
}

func TestResolveModerationUserReference(t *testing.T) {
	ctx := context.Background()
	testStore := storetest.NewTestingStore(ctx, t)
	defer testStore.Close()
	target, err := testStore.CreateUser(ctx, &store.User{Username: "ban-target", Role: store.RoleUser})
	require.NoError(t, err)
	service := &APIV1Service{Store: testStore}

	for _, reference := range []string{strconv.Itoa(int(target.ID)), target.Username, BuildUserName(target.Username)} {
		resolved, err := service.resolveModerationUserReference(ctx, reference)
		require.NoError(t, err)
		require.NotNil(t, resolved)
		require.Equal(t, target.ID, resolved.ID)
	}

	resolved, err := service.resolveModerationUserReference(ctx, "missing-user")
	require.NoError(t, err)
	require.Nil(t, resolved)
}
