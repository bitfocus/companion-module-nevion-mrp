import type { DropdownChoice, JsonValue } from '@companion-module/base'
import type ModuleInstance from './main.js'

export function choicesForSortedFromInstance(
	self: ModuleInstance,
	level: string,
	kind: 'in' | 'out',
): DropdownChoice<string>[] {
	const map = (self.data as any)[kind]?.[level] as Record<string, { name: string }> | undefined
	if (!map) return []
	return Object.keys(map)
		.sort((a, b) => Number(a) - Number(b))
		.map((id) => ({ id, label: self.ioLabel(level, kind, id) }))
}

export function prettyLevelLabel(desc: string | undefined, fallback?: string): string {
	if (!desc) return fallback ?? ''
	const quoted = [...desc.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((s) => s && s.trim() !== '')
	if (quoted.length) return quoted[0]
	return desc.replace(/^"+|"+$/g, '').trim() || (fallback ?? '')
}

// Dropdown option values are io indexes, but are typed as any JsonValue
export function optionId(value: JsonValue | undefined): string {
	return typeof value === 'object' ? '0' : String(value ?? '0')
}
