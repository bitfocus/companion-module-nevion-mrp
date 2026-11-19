import type ModuleInstance from './main.js'
import type { CompanionActionDefinitions } from '@companion-module/base'
import { choicesForSortedFromInstance, optionId, prettyLevelLabel } from './util.js'

export function UpdateActions(self: ModuleInstance): void {
	const actions: CompanionActionDefinitions = {}

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
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					default: inChoices[0]?.id ?? '0',
					choices: inChoices,
					// Under the v3 syntax this module asks for, the router takes `d` as the input that disconnects an
					// output. It is not a choice, because Bitfocus Buttons makes a router port of every choice.
					allowCustom: true,
					regex: '/^d$/',
					tooltip: 'Type d to disconnect the output, on levels that support disconnect.',
				},
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					default: outChoices[0]?.id ?? '0',
					choices: outChoices,
				},
			],
			callback: ({ options }) => {
				const source = optionId(options.source)
				const destination = optionId(options.destination)
				self.sendLine(`x ${level} ${source} ${destination}`)
				self.bumpFeedbacks()
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
				const dest = optionId(options.destination)
				self.selectedDest = dest
				self.setVariableValues({ [`${level}_selected_destination`]: self.data.out[level]?.[dest]?.name ?? dest })
				self.bumpFeedbacks()
			},
		}

		actions[`route_source_${level}`] = {
			name: `Route source → selected (${levelNice})`,
			options: [
				{ id: 'source', type: 'dropdown', label: 'Source', default: inChoices[0]?.id ?? '0', choices: inChoices },
			],
			callback: ({ options }) => {
				const src = optionId(options.source)
				if (self.config.take) {
					self.queuedCmd = `x ${level} ${src} ${self.selectedDest}`
					self.queuedDest = self.selectedDest
					self.queuedSource = src
					self.setVariableValues({
						[`${level}_selected_destination`]: self.data.out[level]?.[self.queuedDest]?.name ?? self.queuedDest,
						[`${level}_selected_source`]: self.data.in[level]?.[self.queuedSource]?.name ?? self.queuedSource,
					})
					self.bumpFeedbacks()
				} else {
					self.sendLine(`x ${level} ${src} ${self.selectedDest}`)
					self.bumpFeedbacks()
				}
			},
		}

		actions[`take_${level}`] = {
			name: `Take (${levelNice})`,
			options: [],
			callback: () => {
				if (self.queuedCmd) self.sendLine(self.queuedCmd)
				self.clearQueue()
			},
		}

		actions[`clear_${level}`] = { name: `Clear (${levelNice})`, options: [], callback: () => self.clearQueue() }
	}

	self.setActionDefinitions(actions)
}
