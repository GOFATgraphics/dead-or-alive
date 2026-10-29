// The client report's print button. A file, not inline, because the site's CSP is script-src 'self'.
document.querySelector("[data-print]")?.addEventListener("click", () => window.print());
