# Drone Protocol Buffers Contract Repository

This repository defines the strongly-typed Protocol Buffer v3 message contracts for the PX4 Drone Control Platform.

## Directory Layout

```text
protobuf/
├── proto/
│   └── drone/
│       └── v1/
│           ├── common.proto
│           ├── command.proto
│           ├── telemetry.proto
│           └── state.proto
├── generated/
│   ├── cpp/
│   └── typescript/
├── buf.yaml
├── buf.gen.yaml
├── README.md
└── Dockerfile
```

## Generation & Verification

Using Buf:
```bash
npx @bufbuild/buf lint
npx @bufbuild/buf generate
```

Using protoc:
```bash
protoc --proto_path=proto --cpp_out=generated/cpp proto/drone/v1/*.proto
```
