import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	type SomeCompanionConfigField,
	TCPHelper,
	type CompanionVariableValues,
} from '@companion-module/base'

import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'

type LevelId = string
type IoIndex = string

interface IoLabel {
	name: string
	long_name: string
	desc: string
	unknown?: string
}

interface LevelsInfo {
	size: string
	type: string
	desc: string
}

type XMap = Record<LevelId, Record<IoIndex, IoIndex>> // level -> output -> input
type IoMap = Record<LevelId, Record<IoIndex, IoLabel>> // level -> index -> label
type PresenceMap = Record<LevelId, Record<IoIndex, 'p' | 'm' | 'u'>> // p=present, m=missing, u=unknown

interface RouterState {
	x: XMap
	in: IoMap
	out: IoMap
	sspi: PresenceMap
	sspo: PresenceMap
	l: Record<LevelId, LevelsInfo>
}

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	private socket?: TCPHelper
	private pingTimer?: NodeJS.Timeout
	private xptTimer?: NodeJS.Timeout
	private xptIdx = 0

	private delta = ''
	private messageQueue: string[] = []
	private messageCommand = ''
	private rxState: 'idle' | 'receiving' = 'idle'

	public selectedDest: IoIndex = '0'
	public queuedDest: IoIndex = '-1'
	public queuedSource: IoIndex = '-1'
	public queuedCmd = ''

	public data: RouterState = {
		x: {},
		in: {},
		out: {},
		sspi: {},
		sspo: {},
		l: {},
	}

	dynamicVariables: string[] = []
	variableUpdateEnabled = false
	config!: ModuleConfig

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean): Promise<void> {
		this.config = config
		this.dynamicVariables = []

		this.updateStatus(InstanceStatus.Connecting, 'Connecting')
		await this.initConnection()

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
	}

	async destroy(): Promise<void> {
		this.stopPing()
		this.stopXptPoll()

		this.socket?.destroy()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.stopPing()
		this.stopXptPoll()
		this.startXptPoll()
		this.socket?.destroy()
		await this.initConnection()
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}
	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}
	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	private async initConnection(): Promise<void> {
		const { host, port } = this.config
		if (!host || !port) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing host/port')
			return
		}

		this.socket = new TCPHelper(host, Number(port))

		this.socket.on('status_change', (status, message) => this.updateStatus(status, message))

		this.socket.on('error', (err) => {
			this.log('error', `Network error: ${err?.message ?? err}`)
			this.updateStatus(InstanceStatus.UnknownError, err?.message ?? 'Network error')
			this.stopPing()
		})

		this.socket.on('connect', () => {
			this.data = { x: {}, in: {}, out: {}, sspi: {}, sspo: {}, l: {} }
			this.delta = ''
			this.messageQueue = []
			this.messageCommand = ''
			this.rxState = 'idle'

			this.updateStatus(InstanceStatus.Ok, 'Connected')

			this.sendLine('llist')
			this.sendLine('syntax v3')

			this.startPing()
			this.startXptPoll()
		})

		this.socket.on('data', (buf) => this.onData(buf.toString('utf8')))
	}
	private startXptPoll(): void {
		this.stopXptPoll()
		if (!this.config.poll_xpt) return

		const ms = Math.max(2, Number(this.config.xpt_poll_interval || 10)) * 1000
		this.xptTimer = setInterval(() => this.pollCrosspoints(), ms)
	}

	private stopXptPoll(): void {
		if (this.xptTimer) clearInterval(this.xptTimer)
		this.xptTimer = undefined
	}

	private pollCrosspoints(): void {
		const levels = Object.keys(this.data.l)
		if (levels.length === 0) return

		if (this.xptIdx >= levels.length) this.xptIdx = 0
		const level = levels[this.xptIdx++]
		this.log('debug', `Sending out pollCrosspont s for Level ${level}`)

		this.sendLine(`s ${level}`)
	}
	private startPing(): void {
		this.stopPing()
		this.pingTimer = setInterval(() => this.sendLine('ping'), 4000)
	}

	private stopPing(): void {
		if (this.pingTimer) clearInterval(this.pingTimer)
		this.pingTimer = undefined
	}

	public sendLine = (line: string): void => {
		this.socket?.send(`${line}\n\n`)
	}

	private onData(chunk: string): void {
		const ds = this.delta + chunk
		const lines = ds.split('\n')
		this.delta = ds.endsWith('\n') ? '' : (lines.pop() ?? '')

		for (const line of lines) this.messageQueue.push(line)
		this.processQueue()
	}

	private processQueue(): void {
		while (this.messageQueue.length > 0) {
			const line = this.messageQueue.shift() as string

			if (this.rxState === 'receiving') {
				if (line === '') {
					this.processNevionMessage(this.messageCommand.trim())
					this.messageCommand = ''
					this.rxState = 'idle'
				} else {
					this.messageCommand += line + '\n'
				}
				continue
			}

			if (line === '%') {
				this.rxState = 'receiving'
			} else if (line !== '') {
				if (line.startsWith('? "')) {
					this.rxState = 'receiving'
					this.messageCommand = line + '\n'
				} else {
					this.log('debug', `Unknown line: "${line}"`)
				}
			}
		}
	}

	private handleEvent(block: string): void {
		const m = block.match(/^event\s+(\d+)\s+\d+\s+([^\s]+)/)
		if (!m) return

		const code = Number(m[1])
		const arg = m[2]

		if (code === 1100 && arg) {
			this.sendLine(`s ${arg}`)
			return
		}
	}
	private processNevionMessage(cmd: string): void {
		const loginQ = cmd.match(/\? "([a-z]+)/)
		const head = loginQ?.[1] ?? cmd.match(/^([a-z]+)/)?.[1]

		switch (head) {
			case 'ping':
				return

			case 'syntax':
				this.log('debug', 'Syntax v3 acknowledged')
				return

			case 'event':
				this.handleEvent(cmd)
				return

			case 'login':
				this.handleLogin(cmd)
				return
			case 'llist':
				this.handleLevelList(cmd)
				return
			case 'in':
				this.handleIn(cmd)
				return
			case 'out':
				this.handleOut(cmd)
				return
			case 'sspi':
				this.handleSSPI(cmd)
				return
			case 'sspo':
				this.handleSSPO(cmd)
				return
			case 's':
				this.handleS(cmd)
				return
			case 'x':
				this.handleX(cmd)
				return
			case 'inlist':
				this.handleInlist(cmd)
				return
			case 'outlist':
				this.handleOutlist(cmd)
				return
			default:
				this.log('debug', `Unhandled message:\n${cmd}`)
		}
	}

	private handleInlist(block: string): void {
		const lines = block.split('\n')
		lines.shift()
		for (const ln of lines) {
			if (ln.startsWith('in ')) this.handleIn(ln)
		}
	}

	private handleOutlist(block: string): void {
		const lines = block.split('\n')
		lines.shift()
		for (const ln of lines) {
			if (ln.startsWith('out ')) this.handleOut(ln)
		}
	}

	private handleLogin(msg: string): void {
		if (msg === '? "login"') {
			const { user, pass } = this.config
			if (user && pass) this.sendLine(`login ${user} ${pass}`)
			else this.log('debug', 'No user/pass – anonymous')
			return
		}

		if (/login.+failed/i.test(msg)) {
			this.log('debug', 'Login failed')
		} else if (/login.+ok/i.test(msg)) {
			this.log('debug', 'Login OK')

			this.sendLine('llist')
			this.sendLine('syntax v3')
		}
	}

	private handleLevelList(block: string): void {
		const lines = block.split('\n')
		lines.shift()

		for (const ln of lines) {
			if (!ln.trim()) continue
			const parts = ln.split(/\s+/)
			const level = parts.shift() as LevelId
			const size = parts.shift() ?? ''
			const type = parts.shift() ?? ''
			const desc = parts.join(' ')
			this.data.l[level] = { size, type, desc }

			this.sendLine(`inlist ${level}`)
			this.sendLine(`outlist ${level}`)
			this.sendLine(`sspi ${level}`)
			this.sendLine(`sspo ${level}`)
			this.sendLine(`s ${level}`)
		}

		this.exportAll()
	}

	private handleS(block: string): void {
		const lines = block.split('\n')
		lines.shift()
		for (const ln of lines) if (ln.trim()) this.handleX(ln)
	}

	private handleX(line: string): void {
		const p = line.trim().split(/\s+/)
		if (p[0] !== 'x' || p.length < 4) return
		const level = p[1]
		const input = p[2]
		const output = p[3]

		this.data.x[level] ||= {}
		this.data.x[level][output] = input

		const inLabel = this.ioLabel(level, 'in', input)
		this.setVariableValues({
			[`${level}_output_${output}_input`]: inLabel,
			[`${level}_output_${output}_input_index`]: input,
		})

		this.checkFeedbacks()
		this.checkFeedbacks(`${level}_selected_source`)
		this.checkFeedbacks(`${level}_input_bg`)
	}

	private handleIn(line: string): void {
		const m = line.match(/^in ([^ ]+) ([0-9]+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"/)
		if (!m) return
		const [, level, idx, name, long_name, desc, unknown] = m
		this.data.in[level] ||= {}
		this.data.in[level][idx] = { name, long_name, desc, unknown }
		this.exportAll()
	}

	private handleOut(line: string): void {
		const m = line.match(/^out ([^ ]+) ([0-9]+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"/)
		if (!m) return
		const [, level, idx, name, long_name, desc, unknown] = m
		this.data.out[level] ||= {}
		this.data.out[level][idx] = { name, long_name, desc, unknown }
		this.exportAll()
	}

	private handleSSPI(block: string): void {
		const lines = block.split('\n')
		for (const ln of lines) {
			const p = ln.trim().split(/\s+/)
			if (p[0] !== 'sspi' || p.length < 4) continue
			const level = p[1]
			const idx = p[2]
			const st = p[3] as 'p' | 'm' | 'u'

			this.data.sspi[level] ||= {}
			this.data.sspi[level][idx] = st

			this.data.in[level] ||= {}
			this.data.in[level][idx] ||= {
				name: String(Number(idx) + 1),
				long_name: `Input ${Number(idx) + 1}`,
				desc: '',
			}

			this.checkFeedbacks(`${level}_source_missing`)
		}

		this.exportAll()
	}

	private handleSSPO(block: string): void {
		const lines = block.split('\n')
		for (const ln of lines) {
			const p = ln.trim().split(/\s+/)
			if (p[0] !== 'sspo' || p.length < 4) continue
			const level = p[1]
			const idx = p[2]
			const st = p[3] as 'p' | 'm' | 'u'

			this.data.sspo[level] ||= {}
			this.data.sspo[level][idx] = st

			this.data.out[level] ||= {}
			this.data.out[level][idx] ||= {
				name: String(Number(idx) + 1),
				long_name: `Output ${Number(idx) + 1}`,
				desc: '',
			}
		}

		this.exportAll()
	}

	public ioLabel(level: string, kind: 'in' | 'out', idx: string): string {
		const rec = (this.data as any)[kind]?.[level]?.[idx] as { name?: string; long_name?: string } | undefined
		const useLong = this.config.use_long_names === true
		if (!rec) return String(Number(idx) + 1)

		const nm = (rec.name ?? '').trim()
		const ln = (rec.long_name ?? '').trim()

		if (useLong && ln) return ln
		if (nm) return nm
		if (ln) return ln
		return String(Number(idx) + 1)
	}

	public clearQueue = (level: LevelId): void => {
		this.queuedCmd = ''
		this.queuedDest = '-1'
		this.queuedSource = '-1'
		this.bumpFeedbacks(level)
	}

	public bumpFeedbacks = (level: LevelId): void => {
		this.checkFeedbacks(`${level}_take`)
		this.checkFeedbacks(`${level}_take_tally_source`)
		this.checkFeedbacks(`${level}_take_tally_dest`)
		this.checkFeedbacks(`${level}_take_tally_route`)
		this.checkFeedbacks(`${level}_input_bg`)
		this.checkFeedbacks(`${level}_selected_source`)
		this.checkFeedbacks(`${level}_selected_destination`)
	}

	private exportAll(): void {
		const values: CompanionVariableValues = {}
		let hasIO = false

		for (const level of Object.keys(this.data.l)) {
			const ins = this.data.in[level] ?? {}
			const outs = this.data.out[level] ?? {}

			if (Object.keys(ins).length || Object.keys(outs).length) hasIO = true

			for (const i of Object.keys(ins)) {
				values[`${level}_input_${i}`] = this.ioLabel(level, 'in', i)
			}

			for (const o of Object.keys(outs)) {
				values[`${level}_output_${o}`] = this.ioLabel(level, 'out', o)
				const routed = this.data.x[level]?.[o]
				if (routed) {
					values[`${level}_output_${o}_input`] = this.ioLabel(level, 'in', routed)
					values[`${level}_output_${o}_input_index`] = routed // NEU: gerouteter Input-Index
				}
			}

			const firstOut = Object.keys(outs)[0]
			const firstIn = Object.keys(ins)[0]
			if (firstOut) values[`${level}_selected_destination`] = this.ioLabel(level, 'out', firstOut)
			if (firstIn) values[`${level}_selected_source`] = this.ioLabel(level, 'in', firstIn)
		}

		if (Object.keys(values).length) this.setVariableValues(values)

		if (hasIO) {
			this.updateActions()
			this.updateFeedbacks()
			this.updateVariableDefinitions()
		}
	}
}

void runEntrypoint(ModuleInstance, UpgradeScripts)
