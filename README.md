# companion-module-allenheath-qu

Companion module for Allen & Heath QU using a standalone QU proxy server.

## Why proxy mode?

QU MIDI-over-TCP accepts only one client.  
This project now runs a single standalone proxy server that connects to the mixer, while multiple Companion instances connect to the proxy.

## Components

- `proxy/qu-server.js`  
  Standalone Node.js proxy server (single QU connection, multiple Companion clients).
- `companion/index.js`  
  Companion module that sends actions to the proxy and receives shared state updates.
- `qu-core.js`  
  Shared QU MIDI protocol/state logic used by the proxy server.

## Start the proxy server

```bash
npm run start-proxy
```

Or run it as Docker:

```bash
docker build -f proxy/Dockerfile -t qu-proxy .
docker run --rm -p 51326:51326 \
  -e QU_HOST=192.168.0.6 \
  -e QU_MODEL=QU24 \
  qu-proxy
```

Optional environment variables:

- `QU_HOST` (default `192.168.0.6`)
- `QU_MODEL` (default `QU24`)
- `QU_PROXY_HOST` (default `0.0.0.0`)
- `QU_PROXY_PORT` (default `51326`)
- `QU_RECONNECT_MS` (default `2000`)
- `QU_HEARTBEAT_MS` (default `1000`)

## Configure Companion module

- **Proxy Host**: IP of the proxy server
- **Proxy Port**: port of the proxy server (default `51326`)
- **Console Type**: must match `QU_MODEL` on the proxy

## Notes

- Multiple Companion instances can connect to one proxy server.
- Action execution is serialized on the proxy (last write wins).
- Mixer state (mute, PAFL, levels, names, scene) is shared to all connected clients.
