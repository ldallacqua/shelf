import type { useFormatter } from 'next-intl'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

type Format = ReturnType<typeof useFormatter>

/**
 * A size in the unit a person reads it in, with a decimal only where it says something. Under a
 * kilobyte it is bytes: a small save is not "0 kB".
 */
export const sizeOf = (format: Format, bytes: number) => {
  const [value, unit] =
    bytes >= GB
      ? [bytes / GB, 'gigabyte']
      : bytes >= MB
        ? [bytes / MB, 'megabyte']
        : bytes >= KB
          ? [bytes / KB, 'kilobyte']
          : [bytes, 'byte']
  return format.number(value, {
    style: 'unit',
    unit,
    // "11 bytes": the short form says "11 byte".
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: value < 100 ? 1 : 0,
  })
}
