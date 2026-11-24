function webUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function sameOriginRequest(
  request: Request,
  configuredUrl = process.env.RAMU_APP_URL,
) {
  // Keep non-browser callers working, but reject explicit cross-site requests.
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  const source = webUrl(origin);
  if (!source || source.origin !== origin) return false;
  if (source.origin === webUrl(configuredUrl)?.origin) return true;

  const destination = webUrl(request.url);
  if (!destination) return false;
  const host = request.headers.get("host");
  if (host === null) return source.origin === destination.origin;
  if (!host || /[\s,/@\\?#%]/.test(host)) return false;
  // Next can construct request.url with its bind hostname (127.0.0.1).
  // Host carries the address used by the browser, including the active port.
  // Never derive trust from an arbitrary X-Forwarded-Host header.
  const publicUrl = webUrl(`${destination.protocol}//${host}`);
  return (
    !!publicUrl &&
    publicUrl.pathname === "/" &&
    source.origin === publicUrl.origin
  );
}
