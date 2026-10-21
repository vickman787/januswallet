export function restoreApiRequestUrl(rawUrl: string | undefined, origin: string) {
  const url = new URL(rawUrl ?? '/', origin)
  const path = url.searchParams.get('__janus_path')
  if (path === null) return rawUrl ?? '/'
  url.searchParams.delete('__janus_path')
  const query = url.searchParams.toString()
  return '/api/' + path.replace(/^\/+/, '') + (query ? '?' + query : '')
}
