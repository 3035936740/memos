package v1

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func (s *ConnectServiceHandler) ListDeletedMemos(ctx context.Context, r *connect.Request[v1pb.ListDeletedMemosRequest]) (*connect.Response[v1pb.ListDeletedMemosResponse], error) {
	result, err := s.APIV1Service.ListDeletedMemos(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) RestoreMemo(ctx context.Context, r *connect.Request[v1pb.RestoreMemoRequest]) (*connect.Response[v1pb.Memo], error) {
	result, err := s.APIV1Service.RestoreMemo(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) PurgeMemo(ctx context.Context, r *connect.Request[v1pb.PurgeMemoRequest]) (*connect.Response[emptypb.Empty], error) {
	result, err := s.APIV1Service.PurgeMemo(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) EmptyTrash(ctx context.Context, r *connect.Request[v1pb.EmptyTrashRequest]) (*connect.Response[emptypb.Empty], error) {
	result, err := s.APIV1Service.EmptyTrash(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) ListMemoRevisions(ctx context.Context, r *connect.Request[v1pb.ListMemoRevisionsRequest]) (*connect.Response[v1pb.ListMemoRevisionsResponse], error) {
	result, err := s.APIV1Service.ListMemoRevisions(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) GetMemoRevision(ctx context.Context, r *connect.Request[v1pb.GetMemoRevisionRequest]) (*connect.Response[v1pb.MemoRevision], error) {
	result, err := s.APIV1Service.GetMemoRevision(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) RestoreMemoRevision(ctx context.Context, r *connect.Request[v1pb.RestoreMemoRevisionRequest]) (*connect.Response[v1pb.Memo], error) {
	result, err := s.APIV1Service.RestoreMemoRevision(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) DeleteMemoRevision(ctx context.Context, r *connect.Request[v1pb.DeleteMemoRevisionRequest]) (*connect.Response[emptypb.Empty], error) {
	result, err := s.APIV1Service.DeleteMemoRevision(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) ClearMemoRevisions(ctx context.Context, r *connect.Request[v1pb.ClearMemoRevisionsRequest]) (*connect.Response[emptypb.Empty], error) {
	result, err := s.APIV1Service.ClearMemoRevisions(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) BatchGetSpaces(ctx context.Context, r *connect.Request[v1pb.BatchGetSpacesRequest]) (*connect.Response[v1pb.BatchGetSpacesResponse], error) {
	result, err := s.APIV1Service.BatchGetSpaces(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
func (s *ConnectServiceHandler) SampleSpaces(ctx context.Context, r *connect.Request[v1pb.SampleSpacesRequest]) (*connect.Response[v1pb.SampleSpacesResponse], error) {
	result, err := s.APIV1Service.SampleSpaces(ctx, r.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(result), nil
}
