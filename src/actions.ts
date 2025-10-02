import type { ModuleInstance } from './main.js'
import {
	type CompanionActionDefinitions,
	type CompanionPresetDefinitions,
	type CompanionAlignment,
	combineRgb,
} from '@companion-module/base'

function choicesForSortedFromInstance(self: ModuleInstance, level: string, kind: 'in' | 'out') {
	const map = (self.data as any)[kind]?.[level] as Record<string, { name: string }> | undefined
	if (!map) return []
	return Object.keys(map)
		.sort((a, b) => Number(a) - Number(b))
		.map((id) => ({ id, label: self.ioLabel(level, kind, id) }))
}

function prettyLevelLabel(desc: string | undefined, fallback?: string): string {
	if (!desc) return fallback ?? ''
	const quoted = [...desc.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((s) => s && s.trim() !== '')
	if (quoted.length) return quoted[0]
	return desc.replace(/^"+|"+$/g, '').trim() || (fallback ?? '')
}

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {}
	const presets: CompanionPresetDefinitions = {}

	for (const level of Object.keys(self.data.l)) {
		const levelInfo = self.data.l[level]
		const inChoices = choicesForSortedFromInstance(self, level, 'in')
		const outChoices = choicesForSortedFromInstance(self, level, 'out')

		const levelNice = prettyLevelLabel(levelInfo?.desc, levelInfo?.type || level)
		const sizeStr = levelInfo?.size ? `${levelInfo.size}` : ''
		const actionTitle = sizeStr ? `Route ${level} ${sizeStr} – ${levelNice}` : `Route ${level} – ${levelNice}`

		actions[`route_${level}`] = {
			name: actionTitle,
			options: [
				{ id: 'source', type: 'dropdown', label: 'Source', default: inChoices[0]?.id ?? '0', choices: inChoices },
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					default: outChoices[0]?.id ?? '0',
					choices: outChoices,
				},
			],
			callback: ({ options }) => {
				const source = String(options.source ?? '0')
				const destination = String(options.destination ?? '0')
				self.sendLine(`x ${level} ${source} ${destination}`)
				self.bumpFeedbacks(level)
			},
		}

		actions[`select_destination_${level}`] = {
			name: `Select destination – ${levelNice}`,
			options: [
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					default: outChoices[0]?.id ?? '0',
					choices: outChoices,
				},
			],
			callback: ({ options }) => {
				const dest = String(options.destination ?? '0')
				self.selectedDest = dest
				self.setVariableValues({ [`${level}_selected_destination`]: self.data.out[level]?.[dest]?.name ?? dest })
				self.bumpFeedbacks(level)
			},
		}

		actions[`route_source_${level}`] = {
			name: `Route source → selected (${levelNice})`,
			options: [
				{ id: 'source', type: 'dropdown', label: 'Source', default: inChoices[0]?.id ?? '0', choices: inChoices },
			],
			callback: ({ options }) => {
				const src = String(options.source ?? '0')
				if (self.config.take) {
					self.queuedCmd = `x ${level} ${src} ${self.selectedDest}`
					self.queuedDest = self.selectedDest
					self.queuedSource = src
					self.setVariableValues({
						[`${level}_selected_destination`]: self.data.out[level]?.[self.queuedDest]?.name ?? self.queuedDest,
						[`${level}_selected_source`]: self.data.in[level]?.[self.queuedSource]?.name ?? self.queuedSource,
					})
					self.bumpFeedbacks(level)
				} else {
					self.sendLine(`x ${level} ${src} ${self.selectedDest}`)
					self.bumpFeedbacks(level)
				}
			},
		}

		actions[`take_${level}`] = {
			name: `Take (${levelNice})`,
			options: [],
			callback: () => {
				if (self.queuedCmd) self.sendLine(self.queuedCmd)
				self.clearQueue(level)
			},
		}

		actions[`clear_${level}`] = { name: `Clear (${levelNice})`, options: [], callback: () => self.clearQueue(level) }

		for (const o of outChoices) {
			const text = self.config.show_input
				? `$(instance:${level}_output_${o.id})\n$(instance:${level}_output_${o.id}_input)`
				: `$(instance:${level}_output_${o.id})`

			const presetId = `${level}_select_dest_${o.id}`
			presets[presetId] = {
				type: 'button',
				category: `${level} – Select Destination`,
				name: `${levelNice}: Select ${o.label}`,
				style: {
					text,
					alignment: 'center:middle' as CompanionAlignment,
					size: self.config.show_input ? '14' : '18',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0),
				},
				feedbacks: [
					{
						feedbackId: `${level}_selected_destination`,
						options: { fg: combineRgb(0, 0, 0), bg: combineRgb(255, 255, 0), output: o.id },
					},
					{
						feedbackId: `${level}_take_tally_dest`,
						options: { fg: combineRgb(255, 255, 255), bg: combineRgb(0, 51, 204), output: o.id },
					},
				],
				steps: [{ down: [{ actionId: `select_destination_${level}`, options: { destination: o.id } }], up: [] }],
			}
		}

		for (const i of inChoices) {
			const presetId = `${level}_route_src_${i.id}`
			presets[presetId] = {
				type: 'button',
				category: `${level} – Source → Selected`,
				name: `${levelNice}: ${i.label} → selected`,
				style: {
					text: `$(instance:${level}_input_${i.id})`,
					alignment: 'center:middle' as CompanionAlignment,
					size: '18',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 204, 0),
				},
				feedbacks: [
					{
						feedbackId: `${level}_selected_source`,
						options: { fg: combineRgb(0, 0, 0), bg: combineRgb(255, 255, 255), input: i.id },
					},
					{
						feedbackId: `${level}_take_tally_source`,
						options: { fg: combineRgb(255, 255, 255), bg: combineRgb(0, 51, 204), input: i.id },
					},
					{
						feedbackId: `${level}_source_missing`,
						options: { fg: combineRgb(255, 255, 255), bg: combineRgb(255, 0, 0), input: i.id },
					},
				],
				steps: [{ down: [{ actionId: `route_source_${level}`, options: { source: i.id } }], up: [] }],
			}
		}
	}

	self.setActionDefinitions(actions)
	self.setPresetDefinitions(presets)
}
