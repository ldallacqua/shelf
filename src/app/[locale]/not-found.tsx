import { NotFound } from '@/features/shell/not-found'

// Shown when a page that exists finds its content does not, and calls notFound().
// An address with no page at all is handled earlier, in src/proxy.ts.
export default function NotFoundPage() {
  return <NotFound />
}
