export const PANEL_GROUPS = [
  { id: 'customers', label: 'Customers' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'loyalists', label: 'Loyalists' },
  { id: 'skeptics', label: 'Skeptics' },
  { id: 'employees', label: 'Employees' },
  { id: 'dealers', label: 'Dealers/partners' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'investors', label: 'Investors' },
  { id: 'regulators', label: 'Regulators' },
  { id: 'media', label: 'Media' },
  { id: 'influencers', label: 'Influencers' },
] as const

export type PanelGroupId = (typeof PANEL_GROUPS)[number]['id']

export const PANEL_MIN_PARTICIPANTS = 4
export const PANEL_MAX_PARTICIPANTS = 50
export const PANEL_AUDIENCE_MAX = 300

export type Panel = { participants: number; audience?: string; groups: PanelGroupId[]; webResearch: boolean }
