package v1

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func (s *APIV1Service) visibleSpaceFind(ctx context.Context) (*store.FindSpace, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to resolve caller")
	}
	find := &store.FindSpace{ShortAvatar: true}
	if user == nil {
		find.AccessModes = []store.SpaceAccessMode{store.SpaceAccessModePublic}
	} else if isSuperUser(user) {
		find.ViewerUserID = &user.ID
	} else {
		find.VisibleToUserID = &user.ID
		find.ViewerUserID = &user.ID
	}
	return find, nil
}

// BatchGetSpaces returns accessible resources only, without distinguishing missing private resources.
func (s *APIV1Service) BatchGetSpaces(ctx context.Context, r *v1pb.BatchGetSpacesRequest) (*v1pb.BatchGetSpacesResponse, error) {
	if len(r.Names) > 100 {
		return nil, status.Error(codes.InvalidArgument, "at most 100 space names per request")
	}
	result := &v1pb.BatchGetSpacesResponse{Spaces: []*v1pb.Space{}}
	if len(r.Names) == 0 {
		return result, nil
	}
	find, err := s.visibleSpaceFind(ctx)
	if err != nil {
		return nil, err
	}
	for _, name := range r.Names {
		uid, err := ExtractSpaceUIDFromName(name)
		if err != nil {
			return nil, status.Error(codes.InvalidArgument, "invalid space name")
		}
		find.UIDList = append(find.UIDList, uid)
	}
	list, err := s.Store.ListSpaces(ctx, find)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to load spaces")
	}
	for _, space := range list {
		result.Spaces = append(result.Spaces, convertSpaceFromStore(space))
	}
	return result, nil
}

// SampleSpaces samples at most twenty visible spaces using indexed id seeks.
func (s *APIV1Service) SampleSpaces(ctx context.Context, r *v1pb.SampleSpacesRequest) (*v1pb.SampleSpacesResponse, error) {
	if r.Count < 0 {
		return nil, status.Error(codes.InvalidArgument, "count cannot be negative")
	}
	count := int(r.Count)
	if count == 0 {
		count = 10
	}
	find, err := s.visibleSpaceFind(ctx)
	if err != nil {
		return nil, err
	}
	list, err := s.Store.SampleSpaces(ctx, find, count)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to sample spaces")
	}
	result := &v1pb.SampleSpacesResponse{Spaces: []*v1pb.Space{}}
	for _, space := range list {
		result.Spaces = append(result.Spaces, convertSpaceFromStore(space))
	}
	return result, nil
}
