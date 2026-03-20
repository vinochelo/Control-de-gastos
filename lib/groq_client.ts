import Groq, { toFile } from "groq-sdk";

let groqClient: Groq | null = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing. Please set it in AI Studio Secrets.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

export async function transcribeAudio(audioFileUrl: string): Promise<string> {
  const groq = getGroqClient();

  const response = await fetch(audioFileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const file = await toFile(arrayBuffer, "audio.ogg");

  const transcription = await groq.audio.transcriptions.create({
    file: file,
    model: "whisper-large-v3",
    response_format: "json",
  });

  return transcription.text;
}

export async function classifyTransaction(text: string) {
  const groq = getGroqClient();
  const prompt = `
You are a financial assistant. Extract the transaction details or the user's intent from their message.
Return ONLY a JSON object with the following structure:
{
  "intent": "transaction" | "summary",
  "type": "expense" | "income" | "transfer" | null,
  "amount": number | null,
  "account": "Efectivo" | "Produbanco" | "Banco de Guayaquil" | "De Una" | "Pichincha" | "American Express" | null,
  "toAccount": "Efectivo" | "Produbanco" | "Banco de Guayaquil" | "De Una" | "Pichincha" | "American Express" | null,
  "category": string | null,
  "description": string | null
}

Rules:
- If the user is asking for their balances, a summary, or "how much money do I have", set intent to "summary".
- If the user is reporting a transaction (expense, income, or transfer), set intent to "transaction".
- For transactions:
  - If it's a transfer, set type to "transfer", account to the source account, and toAccount to the destination account.
  - If the account is not explicitly mentioned, guess based on context or default to "Efectivo".
  - If the category is not clear, use a generic one like "Otros".
- Do not include markdown formatting or backticks in the response, just the raw JSON.

User message: "${text}"
`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const responseText = chatCompletion.choices[0]?.message?.content || "{}";
  console.log("GROQ RESPONSE:", responseText);
  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error("Failed to parse Groq response:", responseText);
    throw new Error("Invalid response from AI");
  }
}
