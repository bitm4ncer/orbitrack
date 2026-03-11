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
import type { GenSettings } from '../state/store';
import { getLLMApiKey } from './llmKeyStorage';

export interface LLMGenerationRequest {
  prompt: string;                        // User's text description (e.g. "dark techno bassline")
  context: GenerationContext;            // Current scale/timing context
  settings: GenSettings;                 // LLM endpoint configuration
  existingPatterns?: GeneratedPattern[]; // Other instruments' patterns for context-aware generation
  onToken?: (chunk: string) => void;    // Streaming callback
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
- Instrument role: ${context.instrumentRole}
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
 * Retry wrapper with linear backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number = 500,
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) return null;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  return null;
}

/**
 * Generate from Ollama (localhost or custom URL).
 */
async function generateFromOllama(
  request: LLMGenerationRequest,
  ollamaUrl: string,
  model: string,
): Promise<string | null> {
  const systemPrompt = buildPrompt(request);
  const body = {
    model,
    prompt: systemPrompt,
    stream: false,
    format: 'json',
  };

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json() as { response: string };
  return data.response;
}

/**
 * Generate from Claude API.
 */
async function generateFromClaude(
  request: LLMGenerationRequest,
  model: string,
  apiKey: string,
): Promise<string | null> {
  const systemPrompt = buildPrompt(request);
  const body = {
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: systemPrompt }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? null;
}

/**
 * Generate from custom OpenAI-compatible endpoint.
 */
async function generateFromCustom(
  request: LLMGenerationRequest,
  customUrl: string,
): Promise<string | null> {
  const systemPrompt = buildPrompt(request);
  const body = {
    model: 'default',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.8,
  };

  const response = await fetch(customUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Custom endpoint error: ${response.status}`);
  const data = await response.json() as { choices: Array<{ message?: { content: string }; text?: string }> };
  const choice = data.choices[0];
  return choice?.message?.content ?? choice?.text ?? null;
}

/**
 * Main LLM generation entry point.
 */
export async function generateFromPrompt(
  request: LLMGenerationRequest,
): Promise<LLMGenerationResponse> {
  const { context, settings } = request;
  const maxRetries = 2;

  if (settings.endpointType === 'none') {
    return {
      pattern: { events: [] },
      confidence: 0,
      explanation: 'LLM endpoint not configured. Enable Ollama, Claude API, or a custom endpoint.',
    };
  }

  let responseText: string | null = null;

  try {
    if (settings.endpointType === 'ollama') {
      responseText = await withRetry(
        () => generateFromOllama(request, settings.ollamaUrl, settings.ollamaModel),
        maxRetries,
      );
    } else if (settings.endpointType === 'claude') {
      const apiKey = getLLMApiKey();
      if (!apiKey) {
        return {
          pattern: { events: [] },
          confidence: 0,
          explanation: 'Claude API key not configured. Add it in settings.',
        };
      }
      responseText = await withRetry(
        () => generateFromClaude(request, settings.claudeModel, apiKey),
        maxRetries,
      );
    } else if (settings.endpointType === 'custom') {
      responseText = await withRetry(
        () => generateFromCustom(request, settings.customUrl),
        maxRetries,
      );
    }
  } catch (err) {
    console.error('[llmBridge] Generation error:', err);
  }

  if (!responseText) {
    return {
      pattern: { events: [] },
      confidence: 0,
      explanation: `LLM request failed after ${maxRetries} retries.`,
    };
  }

  const pattern = parseLLMResponse(responseText, context);
  return {
    pattern,
    confidence: pattern.events.length > 0 ? 0.7 : 0,
    explanation: `Generated ${pattern.events.length} events from LLM prompt.`,
  };
}
