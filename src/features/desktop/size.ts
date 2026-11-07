import type { useFormatter } from 'next-intl'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

type Format = ReturnType<typeof useFormatter>

/** A size in the unit a person reads it in, with a decimal only where it says something. */
export const sizeOf = (format: Format, bytes: number) => {
  const [value, unit] =
    bytes >= GB
      ? [bytes / GB, 'gigabyte']
      : bytes >= MB
        ? [bytes / MB, 'megabyte']
        : [bytes / KB, 'kilobyte']
  return format.number(value, {
    style: 'unit',
    unit,
    maximumFractionDigits: value < 100 ? 1 : 0,
  })
}
