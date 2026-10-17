# MinIO server + mc client in one image, built from official sources.
#
# MinIO upstream is archived: quay.io/minio/minio and docker.io/minio/* no longer
# allow anonymous pulls, and dl.min.io returns 410. The server is therefore built
# from source at the newest release tag (which ships a security fix,
# GHSA-jjjj-jwhf-8rgr) and the client is the newest official signed release
# binary, sha256-verified against the official .sha256sum.
#
# Conventions follow upstream's own Dockerfile.release at the same tag, because
# the MinIO helm chart runs:
#   /bin/sh -ce "/usr/bin/docker-entrypoint.sh minio server ... "
# so /usr/bin/docker-entrypoint.sh, /licenses/LICENSE and MC_CONFIG_DIR must
# exist exactly as upstream ships them.
#
# Build with infra/images/build-push.sh (it runs the post-build checks).

ARG GO_IMAGE=golang@sha256:273d4e65baa782dbe293c9192d600b72b17d415c1429e16bed99efcc5e61efb8
ARG RUNTIME_IMAGE=alpine@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

ARG MINIO_REPO=https://github.com/minio/minio
ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
# MINIO_COMMIT is verified in the build stage against the tag's own commit.
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
ARG MC_SHA256=01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891

# ---------------------------------------------------------------- build stage
FROM ${GO_IMAGE} AS build

ARG MINIO_REPO
ARG MINIO_TAG
ARG MINIO_COMMIT
ARG MC_VERSION
ARG MC_SHA256

# git is needed to clone the tag and to compute the commit id that upstream's
# gen-ldflags.go embeds; curl for the mc download. The golang image is Debian
# based (golang:1.24.8, not the -alpine variant).
RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Clone the release tag and prove the checkout really is that tag's commit.
RUN git clone --depth 1 --branch "${MINIO_TAG}" "${MINIO_REPO}" . && \
    actual="$(git rev-parse HEAD)" && \
    if [ "$actual" != "${MINIO_COMMIT}" ]; then \
      echo "FATAL: tag ${MINIO_TAG} resolves to $actual, expected ${MINIO_COMMIT}" >&2; \
      exit 1; \
    fi && \
    echo "verified ${MINIO_TAG} == ${actual}"

# Build exactly the way upstream's Makefile 'hotfix' target does, so that
# `minio --version` reports the release tag and the commit id:
#   MINIO_RELEASE=RELEASE MINIO_HOTFIX=hotfix.<short sha> \
#     go run buildscripts/gen-ldflags.go <release timestamp with colons>
# The timestamp is the tag with the time separators rewritten as colons, which is
# what the Makefile's sed does.
RUN set -eux; \
    stamp="$(echo "${MINIO_TAG}" | sed -e 's#RELEASE\.\([0-9]\+\)-\([0-9]\+\)-\([0-9]\+\)T\([0-9]\+\)-\([0-9]\+\)-\([0-9]\+\)Z#\1-\2-\3T\4:\5:\6Z#')"; \
    export MINIO_RELEASE=RELEASE; \
    export MINIO_HOTFIX="hotfix.$(git rev-parse --short HEAD)"; \
    ldflags="$(go run buildscripts/gen-ldflags.go "$stamp")"; \
    echo "ldflags: $ldflags"; \
    mkdir -p /out; \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
      go build -tags kqueue -trimpath --ldflags "$ldflags" -o /out/minio

# mc: download the official binary and its .sha256sum, then verify. The build
# fails on a mismatch (and on a size/content problem), so a bad download or a
# swapped binary can never end up in the image.
RUN set -eux; \
    base="https://github.com/minio/mc/releases/download/${MC_VERSION}"; \
    curl -sSL --retry 5 --fail -o /out/mc "${base}/mc.linux-amd64.${MC_VERSION}"; \
    curl -sSL --retry 5 --fail -o /out/mc.sha256sum "${base}/mc.linux-amd64.${MC_VERSION}.sha256sum"; \
    mv /out/mc "/out/mc.${MC_VERSION}"; \
    cd /out; \
    grep "mc.${MC_VERSION}\$" mc.sha256sum > mc.sha256sum.trimmed || \
      { echo "FATAL: official sha256sum does not mention mc.${MC_VERSION}" >&2; exit 1; }; \
    mv mc.sha256sum.trimmed mc.sha256sum; \
    echo "official: $(cat mc.sha256sum)"; \
    actual="$(sha256sum "mc.${MC_VERSION}" | cut -d' ' -f1)"; \
    want="$(cut -d' ' -f1 mc.sha256sum)"; \
    if [ "$actual" != "$want" ]; then \
      echo "FATAL: mc sha256 mismatch: got $actual, official $want" >&2; exit 1; \
    fi; \
    if [ "$want" != "${MC_SHA256}" ]; then \
      echo "FATAL: mc sha256 does not match the value pinned in this Dockerfile" >&2; exit 1; \
    fi; \
    mv "mc.${MC_VERSION}" /out/mc; \
    chmod +x /out/mc; \
    rm -f /out/mc.sha256sum; \
    "/out/mc" --version

# ---------------------------------------------------------------- runtime stage
FROM ${RUNTIME_IMAGE} AS runtime

ARG MINIO_COMMIT
ARG MINIO_TAG
ARG MC_VERSION

LABEL org.opencontainers.image.title="minio" \
      org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="${MINIO_COMMIT}" \
      org.opencontainers.image.version="${MINIO_TAG}" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.description="MinIO object storage built from official source at ${MINIO_TAG}, bundled with the official mc client ${MC_VERSION} from https://github.com/minio/mc/releases/download/${MC_VERSION}"

ENV MINIO_ROOT_USER_FILE=access_key \
    MINIO_ROOT_PASSWORD_FILE=secret_key \
    MINIO_CONFIG_ENV_FILE=config.env \
    MC_CONFIG_DIR=/tmp/.mc

# ca-certificates for TLS (mc and MinIO), curl for container healthchecks.
RUN apk add --no-cache ca-certificates curl

COPY --from=build /out/minio /usr/bin/minio
COPY --from=build /out/mc /usr/bin/mc
COPY --from=build /src/dockerscripts/docker-entrypoint.sh /usr/bin/docker-entrypoint.sh
COPY --from=build /src/LICENSE /licenses/LICENSE
COPY --from=build /src/CREDITS /licenses/CREDITS

# The chart runs the container as uid/gid 1000, so the three files we copy must
# be executable by "other". 0755 on exactly those files is enough; upstream's
# `chmod -R 777 /usr/bin` is not, and would leave every binary in the image
# world-writable.
RUN chmod 0755 /usr/bin/minio /usr/bin/mc /usr/bin/docker-entrypoint.sh

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/docker-entrypoint.sh"]
CMD ["minio"]