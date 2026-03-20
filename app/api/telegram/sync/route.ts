import { NextResponse } from "next/server";
import { classifyTransaction, transcribeAudio } from "@/lib/groq_client";
import { getUserIdByTelegramId, linkTelegramToUser, saveTransaction, logWebhookEvent, getAccountBalances } from "@/lib/firebase_service";

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const getApiUrl = () => `https://api.telegram.org/bot${getBotToken()}`;

// Store the last update ID in memory (works for a single instance dev server)
let lastUpdateId = 0;

async function fetchWithTimeout(url: string, options: any = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function sendMessage(chatId: number, text: string) {
  const token = getBotToken();
  if (!token) return;
  const apiUrl = getApiUrl();
  try {
    await fetchWithTimeout(`${apiUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error("Failed to send message:", e);
  }
}

async function getFileUrl(fileId: string): Promise<string> {
  const token = getBotToken();
  const apiUrl = getApiUrl();
  const res = await fetchWithTimeout(`${apiUrl}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) throw new Error("Failed to get file info");
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

export async function POST(req: Request) {
  const token = getBotToken();
  if (!token) {
    return NextResponse.json({ error: "No TELEGRAM_BOT_TOKEN set in environment variables." }, { status: 400 });
  }

  try {
    const { userId } = await req.json();
    const apiUrl = getApiUrl();

    // 1. Delete webhook to ensure getUpdates works
    try {
      await fetchWithTimeout(`${apiUrl}/deleteWebhook`, {}, 5000);
    } catch (e) {
      console.warn("Failed to delete webhook, continuing anyway.");
    }

    // 2. Get updates
    const updatesRes = await fetchWithTimeout(`${apiUrl}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`, {}, 15000);
    const updatesData = await updatesRes.json();

    if (!updatesData.ok || !updatesData.result || updatesData.result.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const updates = updatesData.result;
    let processedCount = 0;

    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      
      const message = update.message;
      if (!message) continue;

      const currentChatId = message.chat?.id;
      if (!currentChatId) continue;

      await logWebhookEvent(currentChatId, update, "telegram-sync");

      const text = message.text;
      const voice = message.voice;

      // Handle /start command
      if (text && text.trim().toLowerCase().startsWith("/start")) {
        const parts = text.trim().split(/\s+/);
        if (parts.length > 1) {
          const linkUserId = parts[1].trim();
          try {
            await linkTelegramToUser(currentChatId, linkUserId);
            await sendMessage(currentChatId, "✅ ¡Cuenta enlazada exitosamente! Ya puedes enviarme tus gastos e ingresos (texto o audio).");
          } catch (linkError: any) {
            await sendMessage(currentChatId, `❌ Error al enlazar cuenta: ${linkError.message}`);
          }
        } else {
          await sendMessage(currentChatId, "👋 ¡Hola! Para enlazar tu cuenta, ve a la aplicación web, copia el comando /start que aparece allí y pégalo aquí.");
        }
        processedCount++;
        continue;
      }

      // Handle /ping command
      if (text && text.trim().toLowerCase() === "/ping") {
        await sendMessage(currentChatId, "🏓 ¡Pong! El bot está activo y funcionando.");
        processedCount++;
        continue;
      }

      // Check if user is linked
      let linkedUserId = await getUserIdByTelegramId(currentChatId);
      if (!linkedUserId) {
        await sendMessage(currentChatId, "No estás enlazado. Por favor ve a la aplicación web y copia el comando /start para enlazar tu cuenta.");
        processedCount++;
        continue;
      }

      let userText = text;

      // Handle Voice
      if (voice) {
        await sendMessage(currentChatId, "Procesando audio...");
        try {
          const fileUrl = await getFileUrl(voice.file_id);
          userText = await transcribeAudio(fileUrl);
          await sendMessage(currentChatId, `Transcripción: "${userText}"`);
        } catch (e) {
          await sendMessage(currentChatId, "❌ Error al procesar el audio.");
          processedCount++;
          continue;
        }
      }

      if (!userText) {
        await sendMessage(currentChatId, "No pude entender el mensaje. Por favor envía texto o audio.");
        processedCount++;
        continue;
      }

      // Classify with Groq
      await sendMessage(currentChatId, "Interpretando mensaje...");
      try {
        const classification = await classifyTransaction(userText);

        if (classification.intent === "summary") {
          const balances = await getAccountBalances(linkedUserId);
          let reply = "💰 Tus saldos actuales:\n\n";
          let total = 0;
          for (const [account, balance] of Object.entries(balances)) {
            reply += `🔹 *${account}*: $${balance.toFixed(2)}\n`;
            total += balance;
          }
          reply += `\n💵 *Total*: $${total.toFixed(2)}`;
          await sendMessage(currentChatId, reply);
          processedCount++;
          continue;
        }

        if (!classification.type || !classification.amount || !classification.account) {
          await sendMessage(currentChatId, "No pude extraer todos los datos necesarios. Asegúrate de mencionar el monto, la cuenta y si es un gasto o ingreso.");
          processedCount++;
          continue;
        }

        // Save to Firebase
        await saveTransaction({
          userId: linkedUserId,
          ...classification,
          date: new Date().toISOString(),
        });

        const reply = `✅ ¡Transacción guardada!\nTipo: ${classification.type}\nMonto: $${classification.amount}\nCuenta: ${classification.account}\n${classification.toAccount ? `Cuenta Destino: ${classification.toAccount}\n` : ""}Categoría: ${classification.category || "N/A"}\nDescripción: ${classification.description || "N/A"}`;
        await sendMessage(currentChatId, reply);
      } catch (e) {
        await sendMessage(currentChatId, "❌ Error al clasificar o guardar la transacción.");
      }
      
      processedCount++;
    }

    return NextResponse.json({ ok: true, count: processedCount });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
