import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
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

const GEMINI_PROMPT = `You are a literary analyst and storyteller. Analyze this PDF book and produce a structured JSON response.

Your task:
1. Extract the book's title and author from the content.
2. Identify all chapters or natural divisions in the text.
3. For each chapter, write a narrative summary (2-4 sentences) in a warm, first-person literary style — as if a thoughtful narrator is retelling the story to a friend. Do NOT copy text verbatim.
4. For each chapter, break the content into 2-4 "pages". Each page summary should be a paragraph (3-5 sentences) that narratively retells that portion of the chapter in the same literary style.
5. Select a memorable quote from the book.
6. Assign 2-4 genre/theme tags.

Style guide for summaries:
- Use first-person narration ("I must tell you...", "It is here that we find...")
- Be evocative and literary, not clinical
- Capture the emotional tone of the source material
- Each page summary should be self-contained and readable on its own

Respond with ONLY valid JSON in this exact structure:
{
  "title": "string",
  "author": "string",
  "quote": "string — a memorable quote from the book",
  "tags": ["string", "string"],
  "chapters": [
    {
      "title": "string — a creative chapter title",
      "summary": "string — 2-4 sentence narrative summary",
      "pages": [
        { "summary": "string — 3-5 sentence narrative retelling of this section" }
      ]
    }
  ]
}`;

export async function processPdfWithGemini(fileUri: string): Promise<GeminiBookResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file.');
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
      encoding: FileSystem.EncodingType.Base64,
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

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
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
