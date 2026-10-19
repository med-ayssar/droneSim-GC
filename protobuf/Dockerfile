FROM bufbuild/buf:latest AS builder
WORKDIR /workspace
COPY . .
RUN buf lint
RUN buf generate
