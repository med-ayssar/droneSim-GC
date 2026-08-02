# Development Environment Setup

This project provides a Docker-based development environment that can be started with Docker Compose and accessed through VNC/Kasm or DevPod.

## Prerequisites

Install:

* Docker
* Docker Compose
* Git
* DevPod (optional, for remote/container-based development)

Verify Docker:

```bash
docker --version
docker compose version
```

---

## 1. Build the Docker Image

Clone the repository:

```bash
git clone <repository-url>
cd <project-directory>
```

Build the containers:

```bash
docker compose build
```

---

## 2. Start the Environment

Start services:

```bash
docker compose up -d
```

Check running containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

Stop the environment:

```bash
docker compose down
```

---

## 3. Access the Desktop Environment (VNC / Kasm)

After starting the containers, open the VNC/Kasm URL:

```
https://<server-ip>:<port>
```

Example:

```
https://localhost:6901
```

Login credentials:

```
Username: <username>
Password: <password>
```

If using a browser-based VNC client, allow the self-signed certificate if prompted.

---

## 4. Install DevPod

Install DevPod:

```bash
curl -L https://devpod.sh/install.sh | bash
```

Verify:

```bash
devpod version
```

Add Docker provider:

```bash
devpod provider add docker
```

Check providers:

```bash
devpod provider ls
```

---

## 5. Create DevPod Workspace

Using the existing Docker image:

```bash
devpod up . \
  --provider docker \
  --image <docker-image>:<tag>
```

Example:

```bash
devpod up . \
  --provider docker \
  --image my-dev-environment:latest
```

---

## 6. Open Development Environment

### VS Code

Open the DevPod workspace:

```bash
devpod code .
```

This uses your local VS Code installation and connects it to the container environment.

### SSH Access

Connect directly:

```bash
devpod ssh .
```

---

## 7. Rebuild Environment

If Docker changes are made:

```bash
docker compose down

docker compose build --no-cache

docker compose up -d
```

Recreate DevPod workspace:

```bash
devpod delete <workspace-name>

devpod up .
```

---

## 8. Useful Commands

List DevPod workspaces:

```bash
devpod list
```

Delete a workspace:

```bash
devpod delete <workspace-name>
```

Enter running container:

```bash
docker exec -it <container-name> bash
```

Show container logs:

```bash
docker compose logs -f <service-name>
```

---

## Development Workflow

Typical workflow:

```bash
git pull

docker compose build

docker compose up -d

devpod up .

devpod code .
```

The environment is now ready for development.

