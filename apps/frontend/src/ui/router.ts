export type Route = "home" | "player" | "board";

export function getRouteFromHash(): Route {
  const hash: string = window.location.hash || "#/";
  if (hash.startsWith("#/player")) {
    return "player";
  }
  if (hash.startsWith("#/board")) {
    return "board";
  }
  return "home";
}

export function navigate(route: Route): void {
  window.location.hash = route === "home" ? "#/" : `#/${route}`;
}
