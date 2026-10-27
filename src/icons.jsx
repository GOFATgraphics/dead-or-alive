// Lucide icons (ISC licence), inlined so they inherit the text colour.
import { PATHS } from "./icon-paths.js";

export function Icon({ name, size = 18, className = "" }) {
  return (
    <svg className={"ic " + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }} />
  );
}
