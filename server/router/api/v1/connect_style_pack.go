package v1

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func (s *ConnectServiceHandler) PreviewStylePack(ctx context.Context, req *connect.Request[v1pb.PreviewStylePackRequest]) (*connect.Response[v1pb.PreviewStylePackResponse], error) {
	response, err := s.APIV1Service.PreviewStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(response), nil
}

func (s *ConnectServiceHandler) ValidateStylePack(ctx context.Context, req *connect.Request[v1pb.ValidateStylePackRequest]) (*connect.Response[v1pb.ValidateStylePackResponse], error) {
	response, err := s.APIV1Service.ValidateStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(response), nil
}

func (s *ConnectServiceHandler) ListStylePacks(ctx context.Context, req *connect.Request[v1pb.ListStylePacksRequest]) (*connect.Response[v1pb.ListStylePacksResponse], error) {
	resp, err := s.APIV1Service.ListStylePacks(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(resp), nil
}
func (s *ConnectServiceHandler) InstallStylePack(ctx context.Context, req *connect.Request[v1pb.InstallStylePackRequest]) (*connect.Response[v1pb.StylePack], error) {
	resp, err := s.APIV1Service.InstallStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(resp), nil
}
func (s *ConnectServiceHandler) UpdateStylePack(ctx context.Context, req *connect.Request[v1pb.UpdateStylePackRequest]) (*connect.Response[v1pb.StylePack], error) {
	resp, err := s.APIV1Service.UpdateStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(resp), nil
}
func (s *ConnectServiceHandler) DeleteStylePack(ctx context.Context, req *connect.Request[v1pb.DeleteStylePackRequest]) (*connect.Response[emptypb.Empty], error) {
	resp, err := s.APIV1Service.DeleteStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(resp), nil
}
func (s *ConnectServiceHandler) ExportStylePack(ctx context.Context, req *connect.Request[v1pb.ExportStylePackRequest]) (*connect.Response[v1pb.ExportStylePackResponse], error) {
	resp, err := s.APIV1Service.ExportStylePack(ctx, req.Msg)
	if err != nil {
		return nil, convertGRPCError(err)
	}
	return connect.NewResponse(resp), nil
}
