# The PathOps UI image: the static build, served by unprivileged nginx. Node is
# the build toolchain only; the runtime has no Node.
FROM docker.io/library/node:22.21.1-alpine3.22@sha256:b2358485e3e33bc3a33114d2b1bdb18cdbe4df01bd2b257198eb51beb1f026c5 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run check

FROM docker.io/nginxinc/nginx-unprivileged:1.29.3-alpine3.22@sha256:5aea7cc516b419e3526f47dd1531be31a56a046cfe44754d94f9383e13e2ee99
ARG RELEASE_VERSION=dev
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.title="pathops-frontend" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.description="The PathOps Application UI (read-only), static files on nginx" \
      org.opencontainers.image.source="https://github.com/PathOps/pathops-frontend" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${RELEASE_VERSION}"
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
