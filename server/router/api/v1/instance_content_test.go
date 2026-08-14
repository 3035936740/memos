package v1

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func TestFilterInstanceContentJSON(t *testing.T) {
	input := `[{"id":"public","access":"public"},{"id":"default"},{"id":"member","access":"authenticated"},{"id":"admin","access":"admin","markdown":"secret"}]`

	var anonymous []map[string]any
	require.NoError(t, json.Unmarshal([]byte(filterInstanceContentJSON(input, false)), &anonymous))
	require.Len(t, anonymous, 2)
	require.Equal(t, "public", anonymous[0]["id"])
	require.Equal(t, "default", anonymous[1]["id"])

	var authenticated []map[string]any
	require.NoError(t, json.Unmarshal([]byte(filterInstanceContentJSON(input, true)), &authenticated))
	require.Len(t, authenticated, 3)
	require.Equal(t, "member", authenticated[2]["id"])

	require.Equal(t, "[]", filterInstanceContentJSON("not-json", true))
}

func TestInstanceContentSettingsRoundTrip(t *testing.T) {
	original := &v1pb.InstanceSetting_GeneralSetting{
		NavigationJson:     `[{"id":"about"}]`,
		CustomPagesJson:    `[{"slug":"about"}]`,
		MemoCategoriesJson: `[{"slug":"design"}]`,
	}

	stored := convertInstanceGeneralSettingToStore(original)
	require.Equal(t, original.NavigationJson, stored.NavigationJson)
	require.Equal(t, original.CustomPagesJson, stored.CustomPagesJson)
	require.Equal(t, original.MemoCategoriesJson, stored.MemoCategoriesJson)

	roundTripped := convertInstanceGeneralSettingFromStore(stored)
	require.Equal(t, original.NavigationJson, roundTripped.NavigationJson)
	require.Equal(t, original.CustomPagesJson, roundTripped.CustomPagesJson)
	require.Equal(t, original.MemoCategoriesJson, roundTripped.MemoCategoriesJson)
}
