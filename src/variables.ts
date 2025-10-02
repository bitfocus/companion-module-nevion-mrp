import type { ModuleInstance } from './main.js'
import type { CompanionVariableDefinition } from '@companion-module/base'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const variables: CompanionVariableDefinition[] = []

	for (const level of Object.keys(self.data.l)) {
		const ins = self.data.in[level] ?? {}
		const outs = self.data.out[level] ?? {}

		for (const i of Object.keys(ins)) {
			variables.push({
				variableId: `${level}_input_${i}`,
				name: `Label of input ${i} (${level})`,
			})
		}

		for (const o of Object.keys(outs)) {
			variables.push({
				variableId: `${level}_output_${o}`,
				name: `Label of output ${o} (${level})`,
			})
			variables.push({
				variableId: `${level}_output_${o}_input`,
				name: `Label of input routed to output ${o} (${level})`,
			})
		}

		variables.push({
			variableId: `${level}_selected_destination`,
			name: `Label of selected destination (${level})`,
		})
		variables.push({
			variableId: `${level}_selected_source`,
			name: `Label of input routed to selection (${level})`,
		})
	}

	self.setVariableDefinitions(variables)
}
