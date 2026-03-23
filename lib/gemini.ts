import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface GeminiBookResult {
  title: string;
  author: string;
  quote: string;
  tags: string[];
  chapters: {
    title: string;
    summary: string;
    pages: { summary: string }[];
  }[];
}

const GEMINI_PROMPT = `You are a literary analyst and master storyteller who channels any author's voice. You specialize in retelling stories in a way that is impossible to put down — every summary you write makes the reader desperate to know what happens next. Analyze this PDF book and produce a structured JSON response.

Your task:
1. Extract the book's title and author from the content.
2. Identify all chapters or natural divisions in the text.
3. For each chapter, write a narrative summary (4-5 sentences) in the author's literary style — as if the author is retelling the story to a friend. Do NOT copy text verbatim.
4. For each chapter, break the content into "pages" — minimum 6, but use as many as needed to maintain peak engagement. Longer or denser chapters should have more pages. Each page summary should be a paragraph (3-5 sentences) that narratively retells that portion of the chapter in the same literary style. Prefer more, shorter pages over fewer long ones — the swipe-to-next-page dopamine hit is the hook.
5. Select the most gut-punch, goosebump-inducing quote from the book — the kind a reader would screenshot and share.
6. Assign 2-4 genre/theme tags.

Style guide for summaries:
- Write in the author's authentic voice and style — never flatten it into generic prose
- Simplify vocabulary just enough to flow effortlessly, but preserve the author's literary fingerprint
- Be vivid and sensory — make the reader feel textures, hear sounds, sense tension in the room
- Open each page with something that grabs attention: a moment of conflict, a striking image, an unanswered question, or an emotional spike
- End each page on a micro-cliffhanger, unresolved tension, or a line that makes the reader need the next page — never end on resolution
- Lean into emotional stakes: longing, betrayal, wonder, dread, tenderness, defiance — whatever the source material carries, amplify the feeling without distorting the facts
- Keep pacing tight — cut anything that doesn't serve momentum or emotion
- Never fabricate events, details, or character actions not in the original text
- Each page summary must be self-contained and readable on its own, yet leave the reader hungry for more

Respond with ONLY valid JSON in this exact structure:
{
  "title": "string",
  "author": "string",
  "quote": "string — a memorable quote from the book",
  "tags": ["string", "string"],
  "chapters": [
    {
      "title": "string — a creative chapter title",
      "summary": "string — 4-5 sentence narrative summary",
      "pages": [
        { "summary": "string — 3-5 sentence narrative retelling of this section" }
      ]
    }
  ]
}`;

export async function processPdfWithGemini(fileUri: string, apiKey: string): Promise<GeminiBookResult> {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add your API key in Settings.');
  }

  let base64: string;

  if (Platform.OS === 'web') {
    // On web, fetch the blob URI and convert to base64 via FileReader
    const res = await fetch(fileUri);
    const blob = await res.blob();
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:application/pdf;base64," prefix
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64' as const,
    });
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64,
            },
          },
          {
            text: GEMINI_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  };

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Empty response from Gemini');
  }

  console.log('Gemini raw JSON:', textContent);
  const result = JSON.parse(textContent) as GeminiBookResult;

  if (!result.chapters || result.chapters.length === 0) {
    throw new Error('Gemini could not detect any chapters in this PDF.');
  }

  return result;
}

const COVER_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c2d12',
  '#4338ca',
  '#0891b2',
  '#be185d',
  '#57534e',
];

export function pickCoverColor(): string {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}
