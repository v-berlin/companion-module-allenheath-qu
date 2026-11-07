# Allen & Heath QU (Proxy mode)

This module controls an Allen & Heath QU through a standalone proxy server.

## Architecture

- Proxy server connects to QU MIDI-over-TCP (`51325`) as the only mixer client.
- One or more Companion instances connect to the proxy server.
- Proxy distributes state updates to all connected Companion clients.

## Configuration

### Proxy Host
IP address of the proxy server.

### Proxy Port
TCP port of the proxy server (default `51326`).

### Console Type
Must match the proxy server `QU_MODEL`.

## Running the proxy server

From this repository:

```bash
npm run start-proxy
```

Supported environment variables:

- `QU_HOST` (default `192.168.0.6`)
- `QU_MODEL` (default `QU24`)
- `QU_PROXY_HOST` (default `0.0.0.0`)
- `QU_PROXY_PORT` (default `51326`)

## Behavior

- Existing actions, feedbacks, presets, and variables remain available.
- Multiple Companion clients can control the same mixer through one proxy.
- Commands are processed sequentially by the proxy.
