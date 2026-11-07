const EventEmitter = require('events')

const level = require('./level.json')
const quconfig = require('./quconfig.json')

const MIDI_PORT = 51325
const SYSEX_HEADER = [0xf0, 0x00, 0x00, 0x1a, 0x50, 0x11, 0x01, 0x00, 0x00]

class QuCore extends EventEmitter {
	constructor(model = 'QU24') {
		super()
		this.model = model
		this.variables = {}
		this.fdbState = {}
		this.resetState()
	}

	resetState() {
		this.variables = {}
		this.fdbState = {}

		const qu = quconfig.config[this.model]
		if (!qu) return

		for (let i = 0; i < qu.chCount; i++) this.variables[`ch_name_${32 + i}`] = `CH ${i + 1}`
		for (let i = 0; i < qu.chStereo; i++) this.variables[`ch_name_${64 + i}`] = `ST ${i + 1}`
		for (let i = 0; i < qu.mixCount; i++) this.variables[`ch_name_${96 + i}`] = `Mix ${i + 1}`

		let ca = 5
		for (let i = qu.mixCount; i < qu.mixStereo + qu.mixCount; i++) {
			this.variables[`ch_name_${96 + i}`] = `Mix ${ca}/${ca + 1}`
			ca += 2
		}

		if (this.model !== 'QU16') {
			ca = 1
			for (let i = 0; i < qu.grpCount; i++) {
				this.variables[`ch_name_${104 + i}`] = `Group ${ca}/${ca + 1}`
				ca += 2
			}

			ca = 1
			for (let i = 0; i < qu.mtxCount; i++) {
				this.variables[`ch_name_${108 + i}`] = `Matrix ${ca}/${ca + 1}`
				ca += 2
			}
		}

		for (let i = 0; i < qu.fxsCount; i++) this.variables[`ch_name_${i}`] = `FX Snd ${i + 1}`
		for (let i = 0; i < qu.fxrCount; i++) this.variables[`ch_name_${8 + i}`] = `FX Rtn ${i + 1}`
		for (let i = 0; i < qu.dcaCount; i++) this.variables[`ch_name_${16 + i}`] = `DCA ${i + 1}`
		for (let i = 0; i < qu.muteGroup; i++) this.variables[`ch_name_${80 + i}`] = `MuteGrp ${i + 1}`

		this.variables.currentScene = 1
	}

	setModel(model) {
		if (!quconfig.config[model]) return false
		this.model = model
		this.resetState()
		return true
	}

	getStateSnapshot() {
		return {
			model: this.model,
			variables: { ...this.variables },
			fdbState: { ...this.fdbState },
		}
	}

	getMidiPort() {
		return MIDI_PORT
	}

	getStartupBuffers() {
		return [Buffer.from(SYSEX_HEADER.concat([0x10, 1, 0xf7])), ...this.getNamesRequests()]
	}

	getNamesRequests() {
		let cmd = []
		for (let i = 0; i <= 3; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 8; i <= 11; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 16; i <= 19; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 32; i <= 63; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 64; i <= 66; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 80; i <= 83; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 96; i <= 102; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 103; i <= 103; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 104; i <= 107; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		for (let i = 108; i <= 109; i++) cmd.push(Buffer.from(SYSEX_HEADER.concat([0x01, i, 0xf7])))
		return cmd
	}

	buildAction(actionId, options = {}) {
		let channel = parseInt(options.channel, 10)
		if (Number.isNaN(channel)) channel = 0

		let CH
		let cmd = []
		let sceneNumber
		let patch = { variables: {}, fdbState: {}, feedbacks: [] }

		switch (actionId) {
			case 'mute_input':
			case 'level_input':
			case 'pan_input_mix':
			case 'pan_input_lr':
			case 'pan_input_group':
			case 'lr_assign_input':
			case 'mix_assign_input':
			case 'fxs_assign_input':
			case 'grp_assign_input':
			case 'mutegrp_assign_input':
			case 'dcagrp_assign_input':
			case 'pafl_input':
			case 'sendlev_input_mix':
			case 'sendlev_input_group':
			case 'preloc_48_input':
				CH = 0x20
				break

			case 'mute_stereo':
			case 'level_stereo':
			case 'pan_stereo_mix':
			case 'pan_stereo_lr':
			case 'pan_stereo_group':
			case 'lr_assign_stereo':
			case 'mix_assign_stereo':
			case 'fxs_assign_stereo':
			case 'grp_assign_stereo':
			case 'mutegrp_assign_stereo':
			case 'dcagrp_assign_stereo':
			case 'pafl_stereo':
			case 'sendlev_stereo_mix':
			case 'sendlev_stereo_group':
				CH = 0x40
				break

			case 'mute_lr':
			case 'level_lr':
			case 'mutegrp_assign_lr':
			case 'dcagrp_assign_lr':
			case 'pafl_lr':
				CH = 0x67
				break

			case 'mute_mix':
			case 'level_mix':
			case 'mutegrp_assign_mix':
			case 'dcagrp_assign_mix':
			case 'pafl_mix':
				CH = 0x60
				break

			case 'mute_group':
			case 'level_group':
			case 'lr_assign_grp':
			case 'fxs_assign_grp':
			case 'mutegrp_assign_grp':
			case 'dcagrp_assign_grp':
			case 'pafl_group':
				CH = 0x68
				break

			case 'mute_matrix':
			case 'level_matrix':
			case 'lr_assign_mtx':
			case 'fxs_assign_mtx':
			case 'pafl_matrix':
				CH = 0x6c
				break

			case 'mute_fx_send':
			case 'level_fx_send':
			case 'mutegrp_assign_fxs':
			case 'dcagrp_assign_fxs':
			case 'pafl_fx_send':
				CH = 0x00
				break

			case 'mute_fx_return':
			case 'level_fx_return':
			case 'pan_fxr_mix':
			case 'pan_fxr_lr':
			case 'pan_fxr_group':
			case 'lr_assign_fxr':
			case 'mix_assign_fxr':
			case 'fxs_assign_fxr':
			case 'grp_assign_fxr':
			case 'mutegrp_assign_fxr':
			case 'dcagrp_assign_fxr':
			case 'pafl_fx_return':
			case 'sendlev_fx_return_mix':
			case 'sendlev_fx_return_group':
			case 'sendlev_fx_return_fxs':
				CH = 0x08
				break

			case 'mute_dca':
			case 'level_dca':
			case 'pafl_dca':
				CH = 0x10
				break

			case 'mute_mutegroup':
				CH = 0x50
				break

			case 'scene_recall':
				cmd = [Buffer.from([0xb0, 0x00, 0x00, 0xc0, parseInt(options.scene, 10)])]
				this.setVariable('currentScene', parseInt(options.scene, 10) + 1, patch)
				break

			case 'scene_step':
				sceneNumber = this.setScene(parseInt(options.scene, 10))
				this.setVariable('currentScene', parseInt(sceneNumber, 10) + 1, patch)
				cmd = [Buffer.from([0xb0, 0x00, 0x00, 0xc0, parseInt(sceneNumber, 10)])]
				break

			case 'mmc':
				cmd = [Buffer.from([0xf0, 0x7f, 0x7f, 0x06, parseInt(options.action, 10), 0xf7])]
				break

			case 'shutdown':
				cmd = [Buffer.from([0xb0, 0x63, 0x00, 0xb0, 0x62, 0x5f, 0xb0, 0x06, 0x00, 0xb0, 0x26, 0x00])]
				break
		}

		if (cmd.length === 0) {
			if (actionId.slice(0, 4) === 'mute') {
				const chNum = CH + channel
				const k = `mute_${chNum}`
				const mute = parseInt(options.mute, 10)
				this.fdbState[k] = mute > 0 ? mute === 1 : !this.fdbState[k]
				this.setFeedback(k, this.fdbState[k], patch, `mute_${this.getChannel(chNum)[0]}`)
				cmd = [Buffer.from([0x90, chNum, this.fdbState[k] ? 0x7f : 0x3f, 0x80, chNum, 0x00])]
			}

			if (actionId.slice(0, 5) === 'level') {
				let lev = parseInt(options.level, 10)
				if (lev >= 998) {
					lev = this.getStepLevel(actionId, CH + channel, lev)
					if (typeof lev !== 'number') lev = 0
				} else {
					this.setVariable(`${actionId}_${CH + channel}`, this.getLevel(lev), patch)
				}
				cmd = [Buffer.from([0xb0, 0x63, CH + channel, 0xb0, 0x62, 0x17, 0xb0, 0x06, lev, 0xb0, 0x26, 0x07])]
			}

			if (actionId.slice(0, 3) === 'pan') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x16,
						0xb0,
						0x06,
						parseInt(options.level, 10),
						0xb0,
						0x26,
						parseInt(options.mix, 10),
					]),
				]
			}

			if (actionId.slice(0, 9) === 'lr_assign') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x18,
						0xb0,
						0x06,
						this.asBool(options.assign) ? 1 : 0,
						0xb0,
						0x26,
						0x07,
					]),
				]
			}

			if (actionId.slice(3, 7) === '_assign') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x55,
						0xb0,
						0x06,
						this.asBool(options.assign) ? 1 : 0,
						0xb0,
						0x26,
						parseInt(options.mix, 10),
					]),
				]
			}

			if (actionId.slice(0, 11) === 'mutegrp_ass') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x5c,
						0xb0,
						0x06,
						(this.asBool(options.assign) ? 0x40 : 0x00) + parseInt(options.mix, 10),
						0xb0,
						0x26,
						0x07,
					]),
				]
			}

			if (actionId.slice(0, 10) === 'dcagrp_ass') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x40,
						0xb0,
						0x06,
						(this.asBool(options.assign) ? 0x40 : 0x00) + parseInt(options.mix, 10),
						0xb0,
						0x26,
						0x07,
					]),
				]
			}

			if (actionId.slice(0, 4) === 'pafl') {
				const chNum = CH + channel
				const k = `pafl_${chNum}`
				const pafl = parseInt(options.pafl, 10)
				this.fdbState[k] = pafl > 0 ? pafl === 1 : !this.fdbState[k]
				this.setFeedback(k, this.fdbState[k], patch, `pafl_${this.getChannel(chNum)[0]}`)
				cmd = [
					Buffer.from([0xb0, 0x63, chNum, 0xb0, 0x62, 0x51, 0xb0, 0x06, this.fdbState[k] ? 1 : 0, 0xb0, 0x26, 0x07]),
				]
			}

			if (actionId.slice(0, 7) === 'sendlev') {
				let lev = parseInt(options.level, 10)
				if (lev >= 998) {
					lev = this.getStepLevel(actionId, CH + channel, lev, parseInt(options.mix, 10))
					if (typeof lev !== 'number') lev = 0
				}
				cmd = [Buffer.from([0xb0, 0x63, CH + channel, 0xb0, 0x62, 0x20, 0xb0, 0x06, lev, 0xb0, 0x26, parseInt(options.mix, 10)])]
			}

			if (actionId.slice(0, 9) === 'preloc_48') {
				cmd = [
					Buffer.from([
						0xb0,
						0x63,
						CH + channel,
						0xb0,
						0x62,
						0x69,
						0xb0,
						0x06,
						this.asBool(options.active) ? 1 : 0,
						0xb0,
						0x26,
						0x07,
					]),
				]
			}
		}

		this.emitPatchIfNeeded(patch)

		return {
			port: MIDI_PORT,
			buffers: cmd,
			patch,
		}
	}

	parseIncomingData(data) {
		let patch = { variables: {}, fdbState: {}, feedbacks: [] }
		let dt

		for (let b = 0; b < data.length; b++) {
			if (data[b] === 240 && JSON.stringify(data.slice(b, b + 9)) === JSON.stringify(SYSEX_HEADER)) {
				let j
				for (j = b; j < data.length; j++) {
					if (data[j] === 247) break
				}

				let vl = data.slice(b, j)
				if (vl[9] === 2) {
					let str = ''
					for (let i = 11; i < vl.length - 1; i++) str += String.fromCharCode(vl[i])
					if (str.charCodeAt(0) !== 0) this.setVariable(`ch_name_${vl[10]}`, str, patch)
				}
			} else if (data[b] === 144) {
				dt = data.slice(b, b + 6)
				if (dt[2] > 0) {
					const key = `mute_${dt[1]}`
					const state = dt[2] >= 64
					this.setFeedback(key, state, patch, `mute_${this.getChannel(dt[1])[0]}`)
				}
			} else if (data[b] === 176) {
				dt = data.slice(b, b + 12)
				if (dt[1] === 99 && dt[5] === 23) {
					let rt = this.getChannel(dt[2])
					this.setVariable(`level_${rt[0]}_${dt[2]}`, this.getLevel(dt[8]), patch)
				}
				if (dt[1] === 99 && dt[5] === 32) {
					let rt = this.getChannel(dt[2])
					let vx = this.getSend(dt[11])
					this.setVariable(`sendlev_${rt[0]}_${vx[0]}_${dt[2]}_${dt[11]}`, this.getLevel(dt[8]), patch)
				}
				if (dt[1] === 99 && dt[5] === 81) {
					const key = `pafl_${dt[2]}`
					this.setFeedback(key, dt[8] === 1, patch, `pafl_${this.getChannel(dt[2])[0]}`)
				}
				if (dt[1] === 0 && dt[2] === 0 && dt[4] === 32 && dt[5] === 0) {
					this.setVariable('currentScene', parseInt(dt[7], 10) + 1, patch)
				}
			} else if (data[b] === 192 && 0 <= data[b + 1] && data[b + 1] <= 99) {
				this.setVariable('currentScene', parseInt(data[b + 1], 10) + 1, patch)
			}
		}

		this.emitPatchIfNeeded(patch)
		return patch
	}

	setScene(delta) {
		const qu = quconfig.config[this.model]
		let scn = parseInt(this.variables.currentScene || 1, 10) - 1 + delta
		if (scn < 0) scn = 0
		if (scn > qu.sceneCount) scn = qu.sceneCount - 1
		return scn
	}

	getStepLevel(act, ch, step, mix = 999) {
		let db
		let dc = 999
		const key = `${act}_${ch}${mix !== 999 ? `_${mix}` : ''}`
		let res = this.variables[key]

		if (res !== undefined) {
			if (res === '-inf') res = -56
			res = parseFloat(res.toString().replace(/^[\+]?/g, '')) + (step === 998 ? -1 : 1)

			if (res > -45 && res < -40) res = step === 998 ? -45 : -40
			if (res > -50 && res < -45) res = step === 998 ? -50 : -45
			if (res > -55 && res < -50) res = step === 998 ? -55 : -50
			if (res < -55) res = step === 998 ? '-inf' : -55

			if (res !== '-inf') {
				let lv = level.level
				for (let i = 0; i < lv.length; i++) {
					let j = i + 1 < lv.length ? i + 1 : 0
					let v1 = parseFloat(lv[i][0].replace(/^[\+]?/g, ''))
					let v2 = parseInt(lv[i][1], 16)

					if ((j === 0 && res < v1) || (j === 1 && res > v1) || res === v1) {
						dc = v1
						db = v2
						break
					} else if (j > 0) {
						let zx = parseFloat(lv[j][0].replace(/^[\+]?/g, ''))
						if (v1 > res && res > zx) {
							if (v1 - res <= res - zx) {
								dc = v1
								db = v2
							} else {
								dc = zx
								db = parseInt(lv[j][1], 16)
							}
							break
						}
					}
				}
			} else {
				dc = res
				db = 0
			}
		}

		if (dc !== 999) this.variables[key] = dc
		return db
	}

	getChannel(ch) {
		let val
		let chr
		ch = parseInt(ch, 10)

		switch (true) {
			case ch <= 0x03:
				val = 'fx_send'
				chr = ch - 0
				break
			case ch <= 0x0b:
				val = 'fx_return'
				chr = ch - 8
				break
			case ch <= 0x13:
				val = 'dca'
				chr = ch - 16
				break
			case ch <= 0x3f:
				val = 'input'
				chr = ch - 32
				break
			case ch <= 0x42:
				val = 'stereo'
				chr = ch - 64
				break
			case ch <= 0x53:
				val = 'mutegroup'
				chr = ch - 80
				break
			case ch <= 0x66:
				val = 'mix'
				chr = ch - 96
				break
			case ch <= 0x67:
				val = 'lr'
				chr = ch - 103
				break
			case ch <= 0x6b:
				val = 'group'
				chr = ch - 104
				break
			case ch <= 0x6d:
				val = 'matrix'
				chr = ch - 108
				break
		}

		return [val, chr]
	}

	getSend(ch) {
		let val
		let chr
		ch = parseInt(ch, 10)

		switch (true) {
			case ch <= 0x06:
				val = 'mix'
				chr = ch - 0
				break
			case ch <= 0x0b:
				val = 'group'
				chr = ch - 8
				break
			case ch <= 0x0d:
				val = 'matrix'
				chr = ch - 12
				break
			case ch <= 0x13:
				val = 'fxs'
				chr = ch - 16
				break
		}

		return [val, chr]
	}

	getLevel(rc) {
		let lv = level.level
		let rt
		let zx

		for (let i = 0; i < lv.length; i++) {
			let j = i + 1 < lv.length ? i + 1 : 0
			let db = lv[i][0]
			let vl = parseInt(lv[i][1], 16)

			if ((j === 0 && rc < vl) || (j === 1 && rc > vl) || rc === vl) {
				rt = db
				break
			} else if (j > 0) {
				zx = parseInt(lv[j][1], 16)
				if (vl > rc && rc > zx) {
					rt = vl - rc <= rc - zx ? db : lv[j][0]
					break
				}
			}
		}

		return rt
	}

	setVariable(name, value, patch) {
		this.variables[name] = value
		if (patch) patch.variables[name] = value
	}

	setFeedback(name, value, patch, feedbackKey) {
		this.fdbState[name] = value
		if (patch) patch.fdbState[name] = value
		if (feedbackKey && patch && !patch.feedbacks.includes(feedbackKey)) patch.feedbacks.push(feedbackKey)
	}

	emitPatchIfNeeded(patch) {
		if (Object.keys(patch.variables).length || Object.keys(patch.fdbState).length || patch.feedbacks.length) {
			this.emit('state', patch)
		}
	}

	asBool(value) {
		return value === true || value === 1 || value === '1' || value === 'true'
	}
}

module.exports = {
	QuCore,
	MIDI_PORT,
	SYSEX_HEADER,
}
