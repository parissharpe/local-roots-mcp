/**
 * The educational return shape is the brand. Every tool returns the answer, a
 * list of citations (data sources, scoring rules, or API attributions), and a
 * plain-language practical_note so the user understands why a result ranked
 * where it did. The scoring breakdown is the differentiator; do not hide it.
 */
export interface EducationalResponse<TAnswer> {
  answer: TAnswer;
  citations: string[];
  practical_note: string;
  caveats?: string[];
  follow_up_questions?: string[];
}

export interface ToolError {
  error: string;
  hint?: string;
  citations?: string[];
}

/**
 * MCP tool handlers must return a content array. Pretty-printed JSON keeps the
 * response both Claude-readable and human-inspectable when something fails.
 */
export function asToolResult<T>(payload: EducationalResponse<T> | ToolError) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

/**
 * Wraps a tool handler in try/catch. A bug or bad input surfaces as a clean
 * error in the same shape as a successful response. Google Places error
 * messages are scrubbed by the places client before they reach this layer; we
 * still strip anything that looks like an API key as a defense in depth.
 */
export async function runTool<TInput, TOutput>(
  toolName: string,
  input: TInput,
  handler: (input: TInput) => EducationalResponse<TOutput> | Promise<EducationalResponse<TOutput>>,
) {
  try {
    const result = await handler(input);
    return asToolResult(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const scrubbed = scrubSecrets(raw);
    return asToolResult({
      error: `${toolName} failed: ${scrubbed}`,
      hint:
        "If the error references the Google Places API, check that GOOGLE_PLACES_API_KEY is set, that 'Places API (New)' is enabled in your Google Cloud project, and that billing is active. " +
        "Parameter shapes are documented in the README.",
    });
  }
}

/**
 * Best-effort scrub of anything that looks like a Google API key from an error
 * message before we return it to Claude. Google keys are 39-char alnum strings
 * beginning with "AIza". We also redact any 30+ character base64-ish blob just
 * in case the upstream error included a token.
 */
function scrubSecrets(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z_-]{30,}/g, "[REDACTED_KEY]")
    .replace(/[A-Za-z0-9_-]{40,}/g, (match) => (looksLikeUrl(match) ? match : "[REDACTED]"));
}

function looksLikeUrl(s: string): boolean {
  return s.includes("/") || s.includes(".");
}
