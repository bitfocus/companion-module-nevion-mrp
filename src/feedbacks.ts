import { type CompanionFeedbackDefinitions, combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

function choicesFor(map?: Record<string, { name: string }>) {
	return map ? Object.entries(map).map(([id, v]) => ({ id, label: v.name })) : []
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions = {}

	for (const level of Object.keys(self.data.l)) {
		const inChoices = choicesFor(self.data.in[level])
		const outChoices = choicesFor(self.data.out[level])

		feedbacks[`${level}_input_bg`] = {
			type: 'advanced',
			name: `${level} – Background by destination`,
			description: 'If the input is routed to the specified output, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(0, 0, 0) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(255, 255, 0) },
				{ id: 'input', type: 'dropdown', label: 'Input', default: '0', choices: inChoices },
				{ id: 'output', type: 'dropdown', label: 'Output', default: '0', choices: outChoices },
			],
			callback: (fb) => {
				const input = String(fb.options.input ?? '0')
				const output = String(fb.options.output ?? '0')
				const routed = self.data.x[level]?.[output]
				return routed === input ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}
			},
		}

		feedbacks[`${level}_selected_destination`] = {
			type: 'advanced',
			name: `${level} – Selected destination`,
			description: 'If the specified output is selected, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(0, 0, 0) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(255, 255, 0) },
				{ id: 'output', type: 'dropdown', label: 'Output', default: '0', choices: outChoices },
			],
			callback: (fb) => {
				const out = String(fb.options.output ?? '0')
				return out === self.selectedDest ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}
			},
		}

		feedbacks[`${level}_selected_source`] = {
			type: 'advanced',
			name: `${level} – Routed to selected destination`,
			description: 'If the input is routed to the currently selected output, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(0, 0, 0) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(255, 255, 255) },
				{ id: 'input', type: 'dropdown', label: 'Input', default: '0', choices: inChoices },
			],
			callback: (fb) => {
				const inp = String(fb.options.input ?? '0')
				const routed = self.data.x[level]?.[self.selectedDest]
				return routed === inp ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}
			},
		}

		feedbacks[`${level}_take`] = {
			type: 'advanced',
			name: `${level} – Take queued`,
			description: 'If a route is queued for take, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(255, 255, 255) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(0, 51, 204) },
			],
			callback: (fb) => (self.queuedCmd ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}),
		}

		feedbacks[`${level}_take_tally_source`] = {
			type: 'advanced',
			name: `${level} – Take tally (source)`,
			description: 'If the queued source matches and the destination is selected, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(255, 255, 255) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(0, 51, 204) },
				{ id: 'input', type: 'dropdown', label: 'Input', default: '0', choices: inChoices },
			],
			callback: (fb) => {
				const inp = String(fb.options.input ?? '0')
				return inp === self.queuedSource && self.selectedDest === self.queuedDest
					? { color: fb.options.fg as number, bgcolor: fb.options.bg as number }
					: {}
			},
		}

		feedbacks[`${level}_take_tally_dest`] = {
			type: 'advanced',
			name: `${level} – Take tally (destination)`,
			description: 'If the queued destination matches, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(255, 255, 255) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(0, 51, 204) },
				{ id: 'output', type: 'dropdown', label: 'Output', default: '0', choices: outChoices },
			],
			callback: (fb) => {
				const out = String(fb.options.output ?? '0')
				return out === self.queuedDest ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}
			},
		}

		feedbacks[`${level}_source_missing`] = {
			type: 'advanced',
			name: `${level} – Source missing`,
			description: 'If the selected source is missing a valid signal, change colors',
			options: [
				{ id: 'fg', type: 'colorpicker', label: 'Foreground', default: combineRgb(255, 255, 255) },
				{ id: 'bg', type: 'colorpicker', label: 'Background', default: combineRgb(255, 0, 0) },
				{ id: 'input', type: 'dropdown', label: 'Input', default: '0', choices: inChoices },
			],
			callback: (fb) => {
				const inp = String(fb.options.input ?? '0')
				const st = self.data.sspi[level]?.[inp]
				return st === 'm' ? { color: fb.options.fg as number, bgcolor: fb.options.bg as number } : {}
			},
		}
	}

	self.setFeedbackDefinitions(feedbacks)
}
