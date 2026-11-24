export function loginDestination(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 600 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return undefined;
  const url = new URL(value, "https://ramu.invalid");
  if (
    url.origin !== "https://ramu.invalid" ||
    !/^\/(?:dashboard|target-bisnis|asisten|sumber-data)(?:\/[a-z\d-]+)*\/?$/.test(
      url.pathname,
    )
  )
    return undefined;
  return url.pathname + url.search + url.hash;
}
