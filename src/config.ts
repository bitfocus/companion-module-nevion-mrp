// src/config.ts
import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	user: string
	pass: string
	take: boolean
	show_input: boolean
	use_long_names: boolean
	poll_xpt: boolean
	xpt_poll_interval: number
	first_load_timeout?: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{ type: 'textinput', id: 'host', label: 'Target IP / Hostname', width: 6 },
		{ type: 'number', id: 'port', label: 'Target Port', default: 4381, min: 1, max: 65535, width: 3 },
		{ type: 'textinput', id: 'user', label: 'Username (optional)', width: 6 },
		{ type: 'textinput', id: 'pass', label: 'Password (optional)', width: 6 },
		{ type: 'checkbox', id: 'take', label: 'Enable Take mode', default: false, width: 3 },
		{ type: 'checkbox', id: 'show_input', label: 'Show Input on Destination buttons', default: false, width: 6 },
		{ type: 'checkbox', id: 'use_long_names', label: 'Prefer long names for Inputs/Outputs', default: true, width: 6 },
		{
			type: 'checkbox',
			id: 'poll_xpt',
			label: 'Periodically poll crosspoints (sanity check)',
			default: true,
			width: 6,
		},
		{
			type: 'number',
			id: 'xpt_poll_interval',
			label: 'Poll interval (seconds)',
			default: 10,
			min: 2,
			max: 120,
			width: 3,
		},
		{
			type: 'number',
			id: 'first_load_timeout',
			label: 'Initial read timeout (seconds)',
			tooltip:
				'How long to wait for the router to answer every request after connecting. The variable first_load_complete turns true when every answer is in, or when this time is up.',
			default: 30,
			min: 5,
			max: 600,
			width: 3,
		},
	]
}
