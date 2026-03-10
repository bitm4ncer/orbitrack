/**
 * LLM Bridge — Future integration point for prompt-to-melody generation.
 *
 * Currently a stub. When a local LLM is available (e.g. llama.cpp via WebAssembly,
 * or a localhost HTTP API), this module will:
 * 1. Build a system prompt with music theory context
 * 2. Send the user's text description as the user prompt
 * 3. Parse the LLM's JSON response into a GeneratedPattern
 *
 * The contract: LLMs produce the same GeneratedPattern as algorithmic generators.
 */

import type { GeneratedPattern, GeneratedEvent, GenerationContext } from './types';
import { nearestScaleNote } from './scaleUtils';

export interface LLMGenerationRequest {
  prompt: string;                        // User's text description (e.g. "dark techno bassline")
  context: GenerationContext;            // Current scale/timing context
  existingPatterns?: GeneratedPattern[]; // Other instruments' patterns for context-aware generation
}

export interface LLMGenerationResponse {
  pattern: GeneratedPattern;
  confidence: number;    // 0-1
  explanation?: string;  // LLM's reasoning
}

/**
 * Build the system prompt for the LLM.
 * Instructs it to output a JSON array of GeneratedEvent objects.
 */
export function buildPrompt(request: LLMGenerationRequest): string {
  const { context } = request;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rootName = noteNames[context.scaleRoot];

  return `You are a music composition assistant. Generate a MIDI pattern as a JSON array.

CONTEXT:
- Scale: ${rootName} ${context.scaleType}
- Loop length: ${context.loopSize} steps (16th notes)
- Grid resolution: ${context.gridResolution} (snap to multiples of this)
- Instrument type: ${context.instrumentType}
- Note range: MIDI ${context.octaveRange[0]} to ${context.octaveRange[1]}

OUTPUT FORMAT:
Return ONLY a JSON array of objects with these fields:
- step: number (0 to ${context.loopSize - 1}, must be multiple of ${context.gridResolution})
- notes: number[] (MIDI note numbers within the scale)
- length: number (duration in steps, default 1)
- glide: boolean (optional, portamento to next note)

USER REQUEST: ${request.prompt}

Respond with ONLY the JSON array, no other text.`;
}

/**
 * Parse an LLM's raw text response into a validated GeneratedPattern.
 * Clamps notes to scale, steps to valid range.
 */
export function parseLLMResponse(
  raw: string,
  context: GenerationContext,
): GeneratedPattern {
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { events: [] };

    const parsed: unknown[] = JSON.parse(jsonMatch[0]);
    const events: GeneratedEvent[] = [];

    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;

      const step = typeof obj.step === 'number'
        ? Math.max(0, Math.min(context.loopSize - 1, Math.round(obj.step)))
        : 0;

      const rawNotes = Array.isArray(obj.notes) ? obj.notes : [60];
      const notes = rawNotes
        .filter((n): n is number => typeof n === 'number')
        .map((n) => nearestScaleNote(
          Math.max(context.octaveRange[0], Math.min(context.octaveRange[1], n)),
          context.scaleRoot,
          context.scaleType,
        ));

      if (notes.length === 0) continue;

      events.push({
        step,
        notes,
        length: typeof obj.length === 'number' ? Math.max(1, Math.min(context.loopSize, obj.length)) : 1,
        glide: typeof obj.glide === 'boolean' ? obj.glide : false,
      });
    }

    return { events };
  } catch {
    console.warn('[llmBridge] Failed to parse LLM response');
    return { events: [] };
  }
}

/**
 * Placeholder for the actual LLM call.
 * Will be replaced with local model integration.
 */
export async function generateFromPrompt(
  _request: LLMGenerationRequest,
): Promise<LLMGenerationResponse> {
  // Stub — return empty pattern until LLM integration is added
  console.info('[llmBridge] LLM generation not yet configured. Use algorithmic generators.');
  return {
    pattern: { events: [] },
    confidence: 0,
    explanation: 'LLM integration not yet configured.',
  };
}
