export function hasAuth(key: string) {
  return localStorage.getItem(key) === "true";
}
