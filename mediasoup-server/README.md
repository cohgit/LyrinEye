# Mediasoup SFU Server

WebRTC SFU server using Mediasoup for LyrinEye live streaming.

## Features

- 🎥 WebRTC SFU (Selective Forwarding Unit)
- 📡 Socket.IO signaling server
- 🔄 Multi-worker architecture
- 📹 Support for video/audio streaming
- 🌐 CORS enabled for web clients

## Requirements

- Node.js >= 18.0.0
- Build tools (gcc, python3)
- FFmpeg (for recording)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
- `AZURE_STORAGE_CONNECTION_STRING`: Azure Storage connection string
- `BACKEND_URL`: LyrinEye backend API URL
- `ANNOUNCED_IP`: Public IP address of the server

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Architecture

```
📱 Mobile Device (Producer)
    ↓
🔀 Mediasoup SFU
    ├─→ 👁️ Web Viewers (Consumers)
    └─→ 💾 Recorder Service
```

## API Endpoints

### HTTP

- `GET /health` - Health check and stats

### Socket.IO Events

#### Client → Server

- `join-room` - Join a streaming room
- `create-transport` - Create WebRTC transport
- `connect-transport` - Connect transport with DTLS
- `produce` - Start producing media
- `consume` - Start consuming media
- `resume-consumer` - Resume paused consumer

#### Server → Client

- `new-producer` - Notify about new producer in room

## Deployment

The server is designed to run on Azure VM B2s with:
- Ubuntu 22.04 LTS
- Nginx reverse proxy
- Let's Encrypt SSL
- Systemd service

See `infrastructure/cloud-init-mediasoup.yaml` for automated setup.

## License

MIT
