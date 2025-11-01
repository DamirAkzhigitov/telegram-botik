export const ALLOWED_TEXT_MODELS = [
  'gpt-5-mini-2025-08-07',
  'gpt-4.1-mini',
  'gpt-4.1'
] as const

export type AllowedTextModel = (typeof ALLOWED_TEXT_MODELS)[number]

export const DEFAULT_TEXT_MODEL: AllowedTextModel = ALLOWED_TEXT_MODELS[0]

export function findAllowedModel(
  value: string | undefined
): AllowedTextModel | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  return ALLOWED_TEXT_MODELS.find((model) => model.toLowerCase() === normalized)
}

export function resolveModelChoice(
  value: string | undefined
): AllowedTextModel {
  return findAllowedModel(value) ?? DEFAULT_TEXT_MODEL
}

export function isAllowedModel(
  value: string | undefined
): value is AllowedTextModel {
  return Boolean(findAllowedModel(value))
}
