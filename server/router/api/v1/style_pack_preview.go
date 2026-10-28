package v1

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/stylepack"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func (s *APIV1Service) stylePreviewToken(id, version string, expires time.Time) string {
	expiry := strconv.FormatInt(expires.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(s.Secret))
	_, _ = mac.Write([]byte("memos-style-preview-v1\n" + id + "\n" + version + "\n" + expiry))
	return expiry + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *APIV1Service) validStylePreview(token, id, version string, now time.Time) bool {
	if s.Secret == "" || len(token) > 96 {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	seconds, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || seconds <= now.Unix() || seconds > now.Add(time.Hour).Unix() {
		return false
	}
	expected := s.stylePreviewToken(id, version, time.Unix(seconds, 0))
	return hmac.Equal([]byte(token), []byte(expected))
}

func (s *APIV1Service) PreviewStylePack(ctx context.Context, r *v1pb.PreviewStylePackRequest) (*v1pb.PreviewStylePackResponse, error) {
	if _, err := s.stylePackAdmin(ctx); err != nil {
		return nil, err
	}
	if s.Secret == "" {
		return nil, status.Error(codes.FailedPrecondition, "instance signing secret unavailable")
	}
	meta, err := s.getStylePackMetadata(ctx, r.Id)
	if err != nil {
		return nil, err
	}
	expires := time.Now().Add(time.Hour).Truncate(time.Second)
	token := s.stylePreviewToken(meta.Id, meta.Version, expires)
	return &v1pb.PreviewStylePackResponse{CssUrl: "/style-packs/preview/" + token + "/" + meta.Id + "/" + meta.Version + ".css", ExpiresAt: timestamppb.New(expires)}, nil
}

func (s *APIV1Service) ValidateStylePack(ctx context.Context, r *v1pb.ValidateStylePackRequest) (*v1pb.ValidateStylePackResponse, error) {
	if _, err := s.stylePackAdmin(ctx); err != nil {
		return nil, err
	}
	pack, err := stylepack.Parse(r.Zip)
	result := &v1pb.ValidateStylePackResponse{Errors: []*v1pb.StylePackValidationError{}}
	if err != nil {
		diagnostic := &stylepack.Diagnostic{File: "archive.zip", Line: 1, Message: err.Error()}
		_ = errors.As(err, &diagnostic)
		result.Errors = append(result.Errors, &v1pb.StylePackValidationError{File: diagnostic.File, Line: int32(diagnostic.Line), Message: diagnostic.Message})
		return result, nil
	}
	raw, _ := json.Marshal(pack.Manifest)
	result.Manifest = stylePackMetadata(&store.StylePack{ID: pack.Manifest.ID, ManifestJSON: string(raw), Version: pack.Version})
	// Validation has not installed anything: it must not advertise live resource URLs.
	result.Manifest.CssUrl = ""
	result.Manifest.PreviewUrl = ""
	result.CompiledSize = int32(len(pack.Compiled))
	return result, nil
}
