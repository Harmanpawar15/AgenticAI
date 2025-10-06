// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Accept either env name
const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GOOGLE_API_KEY (or GEMINI_API_KEY). Set it in .env.local");
}

const genAI = new GoogleGenerativeAI(apiKey);

export const geminiPro = () =>
  genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function askGeminiJSON(prompt: string) {
  const model = geminiPro();

  // ✅ Pass a plain string (avoids the 'role' typing issue)
  const res = await model.generateContent(prompt);
  const text = res.response.text().trim();

  // Try to parse JSON from codefence or plain body
  const jsonLike = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  try {
    return JSON.parse(jsonLike);
  } catch {
    const start = jsonLike.indexOf("{");
    const end = jsonLike.lastIndexOf("}");
    if (start !== -1 && end !== -1) return JSON.parse(jsonLike.slice(start, end + 1));
    throw new Error("Gemini did not return valid JSON");
  }
}
