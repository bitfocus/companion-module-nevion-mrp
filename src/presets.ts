import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { type CompanionPresetDefinitions, type CompanionPresetSection, combineRgb } from '@companion-module/base'
import { choicesForSortedFromInstance, prettyLevelLabel } from './util.js'

export function UpdatePresets(self: ModuleInstance): void {
	const structure: CompanionPresetSection<ModuleSchema>[] = []
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	for (const level of Object.keys(self.data.l)) {
		const levelInfo = self.data.l[level]
		const inChoices = choicesForSortedFromInstance(self, level, 'in')
		const outChoices = choicesForSortedFromInstance(self, level, 'out')

		const levelNice = prettyLevelLabel(levelInfo?.desc, levelInfo?.type || level)

		const selectDestPresets: string[] = []
		for (const o of outChoices) {
			const text = self.config.show_input
				? `$(instance:${level}_output_${o.id})\n$(instance:${level}_output_${o.id}_input)`
				: `$(instance:${level}_output_${o.id})`

			const presetId = `${level}_select_dest_${o.id}`
			selectDestPresets.push(presetId)
			presets[presetId] = {
				type: 'simple',
				name: `${levelNice}: Select ${o.label}`,
				style: {
					text,
					alignment: 'center:center',
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

		const routeSrcPresets: string[] = []
		for (const i of inChoices) {
			const presetId = `${level}_route_src_${i.id}`
			routeSrcPresets.push(presetId)
			presets[presetId] = {
				type: 'simple',
				name: `${levelNice}: ${i.label} → selected`,
				style: {
					text: `$(instance:${level}_input_${i.id})`,
					alignment: 'center:center',
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

		structure.push(
			{ id: `${level}_select_dest`, name: `${level} – Select Destination`, definitions: selectDestPresets },
			{ id: `${level}_route_src`, name: `${level} – Source → Selected`, definitions: routeSrcPresets },
		)
	}

	self.setPresetDefinitions(structure, presets)
}
