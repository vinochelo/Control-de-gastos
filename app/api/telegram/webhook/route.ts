import { NextResponse } from "next/server";
import { classifyTransaction, transcribeAudio } from "@/lib/groq_client";
import { getUserIdByTelegramId, linkTelegramToUser, saveTransaction, logWebhookEvent, getAccountBalances } from "@/lib/firebase_service";

const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const getApiUrl = () => `https://api.telegram.org/bot${getBotToken()}`;

async function sendMessage(chatId: number, text: string) {
  const token = getBotToken();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is missing in sendMessage");
    return;
  }
  if (chatId === 123456789) {
    console.log("MOCK TELEGRAM MESSAGE:", text);
    return;
  }
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error("Failed to send Telegram message:", await res.text());
  }
}

async function getFileUrl(fileId: string): Promise<string> {
  const token = getBotToken();
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) throw new Error("Failed to get file info");
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

export async function GET() {
  const token = getBotToken();
  const groqKey = process.env.GROQ_API_KEY;
  return NextResponse.json({
    status: "active",
    message: "Telegram Webhook is ready to receive POST requests.",
    bot_token_set: !!token,
    bot_token_length: token?.length || 0,
    groq_key_set: !!groqKey,
    groq_key_length: groqKey?.length || 0,
    app_url: process.env.APP_URL,
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: Request) {
  const token = getBotToken();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set");
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await req.json();
    console.log("INCOMING WEBHOOK:", JSON.stringify(body));
    
    const message = body.message;
    const currentChatId = message?.chat?.id;

    console.log(`Processing message from chatId: ${currentChatId}`);

    // Log the event for debugging
    if (currentChatId) {
      await logWebhookEvent(currentChatId, body);
    }

    if (!message) {
      console.log("No message object in body");
      return NextResponse.json({ ok: true });
    }

    const text = message.text;
    const voice = message.voice;
    const testUserId = body.testUserId;

    console.log(`Message content - Text: ${text ? "yes" : "no"}, Voice: ${voice ? "yes" : "no"}`);

    // Handle /start command
    if (text && text.trim().toLowerCase().startsWith("/start")) {
      const parts = text.trim().split(/\s+/);
      if (parts.length > 1) {
        const userId = parts[1].trim();
        console.log(`Linking Telegram ID ${currentChatId} to User ID ${userId}`);
        try {
          await linkTelegramToUser(currentChatId, userId);
          console.log("Link successful, sending confirmation...");
          await sendMessage(currentChatId, "✅ ¡Cuenta enlazada exitosamente! Ya puedes enviarme tus gastos e ingresos (texto o audio).");
        } catch (linkError: any) {
          console.error("Error linking account:", linkError);
          await sendMessage(currentChatId, `❌ Error al enlazar cuenta: ${linkError.message}`);
        }
      } else {
        await sendMessage(currentChatId, "👋 ¡Hola! Para enlazar tu cuenta, ve a la aplicación web, copia el comando /start que aparece allí y pégalo aquí.");
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /ping command
    if (text && text.trim().toLowerCase() === "/ping") {
      console.log(`Ping received from ${currentChatId}`);
      await sendMessage(currentChatId, "🏓 ¡Pong! El bot está activo y funcionando.");
      return NextResponse.json({ ok: true });
    }

    // Handle /saldos command
    if (text && text.trim().toLowerCase() === "/saldos") {
      let userId = testUserId || await getUserIdByTelegramId(currentChatId);
      if (!userId) {
        await sendMessage(currentChatId, "No estás enlazado. Por favor ve a la aplicación web y copia el comando /start para enlazar tu cuenta.");
        return NextResponse.json({ ok: true });
      }
      const balances = await getAccountBalances(userId);
      let reply = "💰 Tus saldos:\n";
      for (const [account, balance] of Object.entries(balances)) {
        reply += `${account}: $${balance.toFixed(2)}\n`;
      }
      await sendMessage(currentChatId, reply);
      return NextResponse.json({ ok: true });
    }

    // Check if user is linked
    let userId = testUserId || await getUserIdByTelegramId(currentChatId);
    if (!userId) {
      console.log(`User not linked for chatId: ${currentChatId}`);
      await sendMessage(currentChatId, "No estás enlazado. Por favor ve a la aplicación web y copia el comando /start para enlazar tu cuenta.");
      return NextResponse.json({ ok: true });
    }

    console.log(`User identified: ${userId}`);

    let userText = text;

    // Handle Voice
    if (voice) {
      await sendMessage(currentChatId, "Procesando audio...");
      const fileUrl = await getFileUrl(voice.file_id);
      userText = await transcribeAudio(fileUrl);
      await sendMessage(currentChatId, `Transcripción: "${userText}"`);
    }

    if (!userText) {
      await sendMessage(currentChatId, "No pude entender el mensaje. Por favor envía texto o audio.");
      return NextResponse.json({ ok: true });
    }

    // Classify with Groq
    await sendMessage(currentChatId, "Interpretando mensaje...");
    const classification = await classifyTransaction(userText);

    if (classification.intent === "summary") {
      const balances = await getAccountBalances(userId);
      let reply = "💰 Tus saldos actuales:\n\n";
      let total = 0;
      for (const [account, balance] of Object.entries(balances)) {
        reply += `🔹 *${account}*: $${balance.toFixed(2)}\n`;
        total += balance;
      }
      reply += `\n💵 *Total*: $${total.toFixed(2)}`;
      await sendMessage(currentChatId, reply);
      return NextResponse.json({ ok: true });
    }

    if (!classification.type || !classification.amount || !classification.account) {
      await sendMessage(currentChatId, "No pude extraer todos los datos necesarios. Asegúrate de mencionar el monto, la cuenta y si es un gasto o ingreso.");
      return NextResponse.json({ ok: true });
    }

    // Save to Firebase
    await saveTransaction({
      userId,
      ...classification,
      date: new Date().toISOString(),
    });

    const reply = `✅ ¡Transacción guardada!
Tipo: ${classification.type}
Monto: $${classification.amount}
Cuenta: ${classification.account}
${classification.toAccount ? `Cuenta Destino: ${classification.toAccount}\n` : ""}Categoría: ${classification.category || "N/A"}
Descripción: ${classification.description || "N/A"}`;

    await sendMessage(currentChatId, reply);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    try {
      const message = body?.message;
      const chatId = message?.chat?.id;
      if (chatId) {
        await sendMessage(chatId, `❌ Ocurrió un error al procesar tu mensaje: ${error.message}`);
      }
    } catch (e) {
      // Ignore
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
