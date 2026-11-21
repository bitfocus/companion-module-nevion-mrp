import type ModuleInstance from './main.js'
import type { CompanionVariableDefinitions } from '@companion-module/base'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const variables: CompanionVariableDefinitions = {
		first_load_complete: { name: 'Router read completely since the last connect (true/false)' },
	}

	for (const level of Object.keys(self.data.l)) {
		const ins = self.data.in[level] ?? {}
		const outs = self.data.out[level] ?? {}

		for (const i of Object.keys(ins)) {
			variables[`${level}_input_${i}`] = { name: `Label of input ${i} (${level})` }
		}

		for (const o of Object.keys(outs)) {
			variables[`${level}_output_${o}`] = { name: `Label of output ${o} (${level})` }
			variables[`${level}_output_${o}_input`] = { name: `Label of input routed to output ${o} (${level})` }
			variables[`${level}_output_${o}_input_index`] = { name: `Index of input routed to output ${o} (${level})` }
		}

		variables[`${level}_selected_destination`] = { name: `Label of selected destination (${level})` }
		variables[`${level}_selected_source`] = { name: `Label of input routed to selection (${level})` }
	}

	self.setVariableDefinitions(variables)
}
