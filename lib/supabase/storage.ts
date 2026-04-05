// lib/supabase/storage.ts
// Shared Supabase Storage helpers used across API routes.

/**
 * Extracts the storage path from a Supabase public/private URL and returns
 * a 1-hour signed URL. If the URL is not a campaign-assets path, returns it unchanged.
 */
export async function signStorageUrl(
  client: { storage: { from: (bucket: string) => { createSignedUrl: (path: string, seconds: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  url: string
): Promise<string> {
  const marker = '/campaign-assets/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  const { data } = await client.storage.from('campaign-assets').createSignedUrl(path, 3600)
  return data?.signedUrl ?? url
}
