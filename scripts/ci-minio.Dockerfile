# Ephemeral CI service only. Never copied into or published with Memos Plus.
FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY minio /usr/bin/minio
COPY LICENSE /usr/share/licenses/minio/LICENSE
ENTRYPOINT ["/usr/bin/minio"]
