/**
 * Conservative, dependency-free HTML sanitizer for GM-authored narrative text.
 *
 * GM content is trusted more than arbitrary user input, but imported blocks may
 * come from anywhere, so we still strip anything that could execute script or
 * exfiltrate data. The approach is an allowlist: only a small set of formatting
 * tags survive; everything else — including all attributes, `<script>`,
 * `<style>`, event handlers and `javascript:` URLs — is removed. Line breaks are
 * preserved so multi-line responses keep their shape.
 *
 * This intentionally does not rely on the DOM so it can run under Vitest in Node.
 * At runtime Foundry additionally renders through its own text pipeline, giving a
 * second layer of protection.
 */

/** Formatting tags that are allowed to survive sanitization. */
const ALLOWED_TAGS = new Set([
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "br",
  "p",
  "span",
  "ul",
  "ol",
  "li",
  "blockquote"
]);

/** Remove entire dangerous elements together with their contents. */
const STRIP_ELEMENT_REGEX = /<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi;

/** Remove self-closing / unclosed dangerous element openers as a fallback. */
const STRIP_OPENER_REGEX = /<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi;

/** Matches any HTML tag so we can inspect and rewrite it. */
const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

/**
 * Sanitize a single narrative string.
 * @param input Raw GM-provided text, possibly containing limited HTML.
 * @returns A safe string containing only allowlisted formatting tags.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return "";

  let output = input.replace(STRIP_ELEMENT_REGEX, "");
  output = output.replace(STRIP_OPENER_REGEX, "");

  output = output.replace(TAG_REGEX, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    // Rebuild the tag with no attributes at all, preserving open/close/self-close.
    const isClosing = match.startsWith("</");
    if (isClosing) return `</${name}>`;
    const isSelfClosing = /\/>$/.test(match) || name === "br";
    return isSelfClosing ? `<${name}>` : `<${name}>`;
  });

  return output;
}

/**
 * Determine whether a string still contains an executable-looking payload.
 * Used by validation to flag suspicious imported content.
 * @param input Raw text to inspect.
 * @returns True when a script tag or a `javascript:`/event-handler pattern is present.
 */
export function containsDangerousHtml(input: string): boolean {
  if (!input) return false;
  return (
    /<\s*script\b/i.test(input) ||
    /\bon[a-z]+\s*=/i.test(input) ||
    /javascript\s*:/i.test(input)
  );
}
