FROM node:20-alpine

WORKDIR /app

COPY qu-core.js level.json quconfig.json ./
COPY proxy/qu-server.js ./proxy/qu-server.js

EXPOSE 51326

CMD ["node", "proxy/qu-server.js"]
