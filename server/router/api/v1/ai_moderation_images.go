package v1

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"strings"

	"github.com/disintegration/imaging"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/httpgetter"
	"github.com/usememos/memos/internal/markdown"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

const maxAIReviewImageBytes = 20 << 20

func (s *APIV1Service) reviewImageBytes(ctx context.Context, data []byte) error {
	enabled, err := s.aiImageReviewEnabled(ctx)
	if err != nil || !enabled {
		return err
	}
	if len(data) == 0 || len(data) > maxAIReviewImageBytes {
		return status.Error(codes.InvalidArgument, "image is empty or exceeds the 20 MiB review limit")
	}
	if animatedReviewImage(data) {
		return status.Error(codes.InvalidArgument, "animated images cannot be fully reviewed; upload a static image")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 16_000_000/config.Height {
		return status.Error(codes.InvalidArgument, "image cannot be decoded safely for review")
	}
	release, err := s.acquireImageProcessingSlot(ctx)
	if err != nil {
		return status.Error(codes.ResourceExhausted, "image processing is busy")
	}
	img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		release()
		return status.Error(codes.InvalidArgument, "image cannot be decoded for review")
	}
	thumb := imaging.Fit(img, 1024, 1024, imaging.Lanczos)
	canvas := image.NewRGBA(thumb.Bounds())
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(canvas, canvas.Bounds(), thumb, thumb.Bounds().Min, draw.Over)
	var buffer bytes.Buffer
	err = jpeg.Encode(&buffer, canvas, &jpeg.Options{Quality: 80})
	release()
	if err != nil {
		return status.Error(codes.Internal, "failed to prepare review image")
	}
	return s.reviewAIContent(ctx, nil, &aiImage{Mime: "image/jpeg", Base64: base64.StdEncoding.EncodeToString(buffer.Bytes())})
}

func (s *APIV1Service) reviewImageSource(ctx context.Context, source string) error {
	if source == "" {
		return nil
	}
	enabled, err := s.aiImageReviewEnabled(ctx)
	if err != nil || !enabled {
		return err
	}
	if strings.HasPrefix(source, "data:") {
		_, encoded, err := extractImageInfo(source)
		if err != nil || len(encoded) > ((maxAIReviewImageBytes+2)/3)*4 {
			return status.Error(codes.InvalidArgument, "invalid review image")
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return status.Error(codes.InvalidArgument, "invalid image base64")
		}
		return s.reviewImageBytes(ctx, data)
	}
	img, err := httpgetter.GetBoundedImage(ctx, source, maxAIReviewImageBytes)
	if err != nil {
		return status.Error(codes.InvalidArgument, "image could not be safely loaded for review; upload the image instead")
	}
	return s.reviewImageBytes(ctx, img.Blob)
}

func (s *APIV1Service) reviewAttachmentImage(ctx context.Context, attachment *store.Attachment) error {
	if !strings.HasPrefix(attachment.Type, "image/") {
		return nil
	}
	if attachment.StorageType == storepb.AttachmentStorageType_EXTERNAL {
		return s.reviewImageSource(ctx, attachment.Reference)
	}
	if attachment.Size > maxAIReviewImageBytes {
		return status.Error(codes.InvalidArgument, "image exceeds the 20 MiB review limit")
	}
	reader, err := s.backupAttachmentReader(ctx, attachment, "all")
	if err != nil {
		return status.Error(codes.Unavailable, "image cannot be loaded for review")
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, maxAIReviewImageBytes+1))
	if err != nil {
		return status.Error(codes.Unavailable, "image cannot be read for review")
	}
	return s.reviewImageBytes(ctx, data)
}

func (s *APIV1Service) reviewMemoImages(ctx context.Context, memo *store.Memo, attachments []*store.Attachment) error {
	enabled, err := s.aiImageReviewEnabled(ctx)
	if err != nil || !enabled {
		return err
	}
	if len(attachments) > 64 {
		return status.Error(codes.InvalidArgument, "at most 64 attachments can be reviewed per memo")
	}
	byUID := map[string]*store.Attachment{}
	for _, attachment := range attachments {
		byUID[attachment.UID] = attachment
		if err := s.reviewAttachmentImage(ctx, attachment); err != nil {
			return err
		}
	}
	metadata, err := s.MarkdownService.ExtractAll([]byte(memo.Content))
	if err != nil {
		return status.Error(codes.InvalidArgument, "invalid image content")
	}
	if len(metadata.ImageDestinations) > 64 {
		return status.Error(codes.InvalidArgument, "at most 64 embedded images can be reviewed per memo")
	}
	seen := map[string]bool{}
	for _, source := range metadata.ImageDestinations {
		if seen[source] {
			continue
		}
		seen[source] = true
		if uid, managed, valid := markdown.ParseManagedAttachmentImageURL(source); managed {
			if !valid || byUID[uid] == nil || !strings.HasPrefix(byUID[uid].Type, "image/") {
				return status.Error(codes.InvalidArgument, "review image must be bound to this memo")
			}
			continue
		}
		if err := s.reviewImageSource(ctx, source); err != nil {
			return err
		}
	}
	if poll := memo.Payload.GetPoll(); poll != nil {
		names := []string{poll.ImageName}
		for _, option := range poll.Options {
			names = append(names, option.ImageName)
		}
		for _, name := range names {
			if name != "" {
				uid, err := ExtractAttachmentUIDFromName(name)
				if err != nil || byUID[uid] == nil || !strings.HasPrefix(byUID[uid].Type, "image/") {
					return status.Error(codes.InvalidArgument, "poll review image must be bound to this memo")
				}
			}
		}
	}
	return nil
}

// Detect animation without allocating or decoding every frame of an untrusted image.
func animatedReviewImage(data []byte) bool {
	if len(data) > 12 && string(data[:3]) == "GIF" {
		pos, frames := 13, 0
		if data[10]&0x80 != 0 {
			pos += 3 * (1 << ((data[10] & 7) + 1))
		}
		skipBlocks := func() bool {
			for pos < len(data) {
				n := int(data[pos])
				pos++
				if n == 0 {
					return true
				}
				pos += n
			}
			return false
		}
		for pos < len(data) {
			tag := data[pos]
			pos++
			switch tag {
			case 0x3b:
				return false
			case 0x21:
				pos++
				if !skipBlocks() {
					return true
				}
			case 0x2c:
				frames++
				if frames > 1 || pos+9 > len(data) {
					return true
				}
				packed := data[pos+8]
				pos += 9
				if packed&0x80 != 0 {
					pos += 3 * (1 << ((packed & 7) + 1))
				}
				pos++
				if !skipBlocks() {
					return true
				}
			default:
				return true
			}
		}
	}
	if len(data) > 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		for pos := 12; pos+8 <= len(data); {
			size := int(binary.LittleEndian.Uint32(data[pos+4 : pos+8]))
			if string(data[pos:pos+4]) == "ANIM" {
				return true
			}
			if size > len(data)-pos-8 {
				break
			}
			pos += 8 + size + (size & 1)
		}
	}
	if len(data) > 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) {
		for pos := 8; pos+12 <= len(data); {
			size := int(binary.BigEndian.Uint32(data[pos : pos+4]))
			if string(data[pos+4:pos+8]) == "acTL" {
				return true
			}
			if size > len(data)-pos-12 {
				break
			}
			pos += 12 + size
		}
	}
	return false
}
