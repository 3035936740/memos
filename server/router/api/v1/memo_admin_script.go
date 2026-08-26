package v1

import (
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const maxMemoAdminScriptLength = 100_000

func validateMemoAdminScript(script string) error {
	if len(script) > maxMemoAdminScriptLength {
		return status.Errorf(codes.InvalidArgument, "memo admin script is too long (max %d characters)", maxMemoAdminScriptLength)
	}
	return nil
}
