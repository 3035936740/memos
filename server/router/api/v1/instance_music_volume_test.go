package v1

import (
	"testing"

	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func TestInstanceMusicVolumeValidation(t *testing.T) {
	for _, test := range []struct {
		name  string
		value string
		valid bool
	}{
		{"legacy config without volume", `{}`, true},
		{"silent", `{"defaultVolume":0}`, true},
		{"background volume", `{"defaultVolume":0.3}`, true},
		{"full volume", `{"defaultVolume":1}`, true},
		{"negative", `{"defaultVolume":-0.01}`, false},
		{"too loud", `{"defaultVolume":1.01}`, false},
		{"wrong type", `{"defaultVolume":"30%"}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateInstanceGeneralSetting(&v1pb.InstanceSetting_GeneralSetting{MusicConfigJson: test.value})
			if test.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
