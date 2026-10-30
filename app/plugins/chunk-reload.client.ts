// Catch stale chunk errors after a new deployment and reload the page.
// When the app redeploys, old JS chunk URLs become 404s. Rather than showing
// A cryptic "Failed to fetch dynamically imported module" error, reload once.
export default defineNuxtPlugin(() => {
  window.addEventListener("vite:preloadError", () => {
    window.location.reload();
  });
});
