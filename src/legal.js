// Counts a view of the pricing, privacy, or terms page for the desk's Analytics tab.
import { trackView } from "./track.js";

const page = document.body.dataset.page;
if (page === "privacy" || page === "terms" || page === "pricing") trackView(page);
