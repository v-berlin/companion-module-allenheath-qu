#!/usr/bin/env node

const net = require('net')
const { QuCore, MIDI_PORT } = require('./qu-core')

const PROXY_HOST = process.env.QU_PROXY_HOST || '0.0.0.0'
const PROXY_PORT = parseInt(process.env.QU_PROXY_PORT || '51326', 10)
const QU_HOST = process.env.QU_HOST || '192.168.0.6'
const QU_MODEL = process.env.QU_MODEL || 'QU24'
const RECONNECT_MS = parseInt(process.env.QU_RECONNECT_MS || '2000', 10)
const HEARTBEAT_MS = parseInt(process.env.QU_HEARTBEAT_MS || '1000', 10)

class QuProxyServer {
	constructor() {
		this.core = new QuCore(QU_MODEL)
		this.clients = new Set()
		this.quSocket = undefined
		this.quConnected = false
		this.reconnectTimer = undefined
		this.heartbeatTimer = undefined
		this.quDataBuffer = []
		this.commandQueue = Promise.resolve()
		this.clientCounter = 0

		this.core.on('state', (patch) => {
			this.broadcast({
				type: 'state_update',
				variables: patch.variables,
				fdbState: patch.fdbState,
				feedbacks: patch.feedbacks,
			})
		})
	}

	start() {
		this.startClientServer()
		this.connectToQu()
	}

	startClientServer() {
		this.server = net.createServer((socket) => {
			socket.setEncoding('utf8')
			socket._id = `client-${++this.clientCounter}`
			socket._buffer = ''
			this.clients.add(socket)

			this.send(socket, {
				type: 'welcome',
				server: 'qu-proxy',
				model: this.core.model,
			})
			this.sendStatus(socket)
			this.send(socket, {
				type: 'state_snapshot',
				...this.core.getStateSnapshot(),
			})

			socket.on('data', (chunk) => this.handleClientData(socket, chunk))
			socket.on('error', (err) => {
				this.log(`Client error (${socket._id}): ${err.message}`)
			})
			socket.on('close', () => {
				this.clients.delete(socket)
			})
		})

		this.server.listen(PROXY_PORT, PROXY_HOST, () => {
			this.log(`Proxy listening on ${PROXY_HOST}:${PROXY_PORT}`)
			this.log(`Target QU: ${QU_HOST}:${MIDI_PORT} (${this.core.model})`)
		})
	}

	handleClientData(socket, chunk) {
		socket._buffer += chunk
		let newlineIndex = socket._buffer.indexOf('\n')
		while (newlineIndex >= 0) {
			const line = socket._buffer.slice(0, newlineIndex).trim()
			socket._buffer = socket._buffer.slice(newlineIndex + 1)
			if (line.length > 0) {
				this.handleClientMessage(socket, line)
			}
			newlineIndex = socket._buffer.indexOf('\n')
		}
	}

	handleClientMessage(socket, line) {
		let msg
		try {
			msg = JSON.parse(line)
		} catch (error) {
			this.send(socket, { type: 'error', message: 'Invalid JSON payload' })
			return
		}

		switch (msg.type) {
			case 'hello':
				this.send(socket, { type: 'hello_ack', clientId: socket._id })
				break
			case 'get_state':
				this.send(socket, {
					type: 'state_snapshot',
					...this.core.getStateSnapshot(),
				})
				break
			case 'action':
				if (!msg.action) {
					this.send(socket, { type: 'error', message: 'Missing action name' })
					return
				}
				this.commandQueue = this.commandQueue
					.then(() => this.executeAction(msg.action, msg.options || {}, socket))
					.catch((error) => {
						this.send(socket, { type: 'error', message: error.message })
					})
				break
			default:
				this.send(socket, { type: 'error', message: `Unsupported message type: ${msg.type}` })
		}
	}

	executeAction(action, options, socket) {
		const result = this.core.buildAction(action, options)
		if (!this.quConnected || !this.quSocket) {
			this.send(socket, { type: 'warning', message: 'QU is not connected. Command not sent to mixer.' })
			return
		}

		for (const buffer of result.buffers) {
			this.quSocket.write(buffer)
		}
	}

	connectToQu() {
		if (this.quSocket) {
			this.quSocket.destroy()
			this.quSocket = undefined
		}

		this.quSocket = net.createConnection({ host: QU_HOST, port: MIDI_PORT })

		this.quSocket.on('connect', () => {
			this.quConnected = true
			this.log(`Connected to QU at ${QU_HOST}:${MIDI_PORT}`)
			this.sendStatus()

			for (const buffer of this.core.getStartupBuffers()) {
				this.quSocket.write(buffer)
			}

			this.heartbeatTimer = setInterval(() => {
				if (this.quSocket) this.quSocket.write(Buffer.from([0xfe]))
			}, HEARTBEAT_MS)
		})

		this.quSocket.on('data', (data) => this.handleQuData(data))

		this.quSocket.on('error', (err) => {
			this.log(`QU socket error: ${err.message}`)
			this.markDisconnected()
		})

		this.quSocket.on('close', () => {
			this.log('QU connection closed')
			this.markDisconnected()
		})
	}

	handleQuData(data) {
		const bytes = Array.from(data || [])
		if (bytes.length <= 1) return

		this.quDataBuffer = this.quDataBuffer.concat(bytes)
		const last = this.quDataBuffer[this.quDataBuffer.length - 1]
		if ([247, 254, 0, 7].includes(last)) {
			this.core.parseIncomingData(this.quDataBuffer)
			this.quDataBuffer = []
		}
	}

	markDisconnected() {
		if (!this.quConnected && this.reconnectTimer) return
		this.quConnected = false
		this.sendStatus()

		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer)
			this.heartbeatTimer = undefined
		}

		if (!this.reconnectTimer) {
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = undefined
				this.connectToQu()
			}, RECONNECT_MS)
		}
	}

	send(socket, obj) {
		if (!socket || socket.destroyed) return
		socket.write(`${JSON.stringify(obj)}\n`)
	}

	sendStatus(socket) {
		const payload = {
			type: 'status',
			connected: this.quConnected,
			model: this.core.model,
			quHost: QU_HOST,
			quPort: MIDI_PORT,
		}

		if (socket) {
			this.send(socket, payload)
			return
		}

		this.broadcast(payload)
	}

	broadcast(obj) {
		for (const client of this.clients) {
			this.send(client, obj)
		}
	}

	log(message) {
		process.stdout.write(`[qu-proxy] ${message}\n`)
	}
}

new QuProxyServer().start()
