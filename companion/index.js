/**
 *
 * Companion instance class for Allen & Heath QU proxy mode.
 * Version 2.0.0
 *
 */

const net = require('net')
let instance_skel = require('../../../instance_skel')
let actions = require('./actions')
let feedbacks = require('./feedbacks')
let variables = require('./variables')
let presets = require('./presets')

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		Object.assign(this, {
			...variables,
			...actions,
			...feedbacks,
			...presets,
		})

		this.fdbState = {}
		this.proxySocket = undefined
		this.proxyBuffer = ''
		this.reconnectTimer = undefined
	}

	actions(system) {
		this.setActions(this.getActions())
	}

	feedbacks(system) {
		this.setFeedbackDefinitions(this.getFeedbacks())
	}

	variables(system) {
		this.setVariableDefinitions(this.getVariables())
	}

	presets(system) {
		this.setPresetDefinitions(this.getPresets())
	}

	action(action) {
		this.sendProxy({
			type: 'action',
			action: action.action,
			options: action.options || {},
		})
	}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module controls a QU proxy server (single QU connection, multi Companion clients).',
			},
			{
				type: 'textinput',
				id: 'proxy_host',
				label: 'Proxy Host',
				width: 6,
				default: '127.0.0.1',
				regex: this.REGEX_IP,
			},
			{
				type: 'number',
				id: 'proxy_port',
				label: 'Proxy Port',
				width: 6,
				default: 51326,
				min: 1,
				max: 65535,
				required: true,
			},
			{
				type: 'dropdown',
				id: 'model',
				label: 'Console Type (must match proxy)',
				width: 6,
				default: 'QU24',
				choices: [
					{ id: 'QU16', label: 'QU 16' },
					{ id: 'QU24', label: 'QU 24' },
					{ id: 'QU32', label: 'QU 32' },
					{ id: 'QUSB', label: 'QU SB' },
					{ id: 'QUPAC', label: 'QU Pac' },
				],
			},
		]
	}

	destroy() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}

		if (this.proxySocket !== undefined) {
			this.proxySocket.destroy()
		}

		this.log('debug', `destroyed ${this.id}`)
	}

	init() {
		this.updateConfig(this.config)
		this.setVariable('currentScene', 0)
	}

	init_proxy() {
		if (this.proxySocket !== undefined) {
			this.proxySocket.destroy()
			this.proxySocket = undefined
		}

		if (!this.config.proxy_host || !this.config.proxy_port) return

		this.status(this.STATUS_UNKNOWN, 'Connecting to QU proxy...')
		this.proxyBuffer = ''
		this.proxySocket = net.createConnection({
			host: this.config.proxy_host,
			port: parseInt(this.config.proxy_port, 10),
		})

		this.proxySocket.setEncoding('utf8')

		this.proxySocket.on('connect', () => {
			this.status(this.STATUS_OK, 'Connected to QU proxy')
			this.sendProxy({ type: 'hello', clientName: this.id })
			this.sendProxy({ type: 'get_state' })
		})

		this.proxySocket.on('error', (err) => {
			this.status(this.STATUS_ERROR, `Proxy error: ${err.message}`)
		})

		this.proxySocket.on('close', () => {
			this.status(this.STATUS_WARNING, 'Disconnected from QU proxy')
			this.scheduleReconnect()
		})

		this.proxySocket.on('data', (chunk) => {
			this.proxyBuffer += chunk
			let newlineIndex = this.proxyBuffer.indexOf('\n')
			while (newlineIndex >= 0) {
				const line = this.proxyBuffer.slice(0, newlineIndex).trim()
				this.proxyBuffer = this.proxyBuffer.slice(newlineIndex + 1)
				if (line.length > 0) {
					this.handleProxyMessage(line)
				}
				newlineIndex = this.proxyBuffer.indexOf('\n')
			}
		})
	}

	scheduleReconnect() {
		if (this.reconnectTimer) return
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined
			this.init_proxy()
		}, 2000)
	}

	handleProxyMessage(line) {
		let payload
		try {
			payload = JSON.parse(line)
		} catch (error) {
			this.log('error', `Proxy invalid JSON: ${line}`)
			return
		}

		if (payload.type === 'status') {
			if (payload.connected) {
				this.status(this.STATUS_OK, 'Proxy connected to QU')
			} else {
				this.status(this.STATUS_WARNING, 'Proxy not connected to QU')
			}
			return
		}

		if (payload.type === 'state_snapshot' || payload.type === 'state_update') {
			if (payload.variables) {
				for (const [name, value] of Object.entries(payload.variables)) {
					this.setVariable(name, value)
				}
			}

			if (payload.fdbState) {
				for (const [name, value] of Object.entries(payload.fdbState)) {
					this.fdbState[name] = value
				}
			}

			if (Array.isArray(payload.feedbacks) && payload.feedbacks.length > 0) {
				for (const feedback of payload.feedbacks) {
					this.checkFeedbacks(feedback)
				}
			} else {
				this.checkFeedbacks()
			}
		}
	}

	sendProxy(payload) {
		if (!this.proxySocket || this.proxySocket.destroyed) return
		this.proxySocket.write(`${JSON.stringify(payload)}\n`)
	}

	updateConfig(config) {
		this.config = config

		this.variables()
		this.actions()
		this.feedbacks()
		this.presets()
		this.init_proxy()
	}
}

exports = module.exports = instance
