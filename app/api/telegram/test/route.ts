import { NextResponse } from "next/server";
import { getTelegramIdByUserId, logWebhookEvent } from "@/lib/firebase_service";

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    
    if (!token) {
      return NextResponse.json({ success: false, message: "Falta el TELEGRAM_BOT_TOKEN" });
    }

    // 1. Check bot info
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return NextResponse.json({ success: false, message: "Token de Telegram inválido", details: meData });
    }

    // 2. Check webhook info
    const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const whData = await whRes.json();
    console.log("CURRENT WEBHOOK INFO:", JSON.stringify(whData));

    // 3. Check if user is linked
    const chatId = await getTelegramIdByUserId(userId);
    
    let messageSent = false;
    let sendError = null;

    if (chatId) {
      const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "✅ ¡Hola! Esta es una prueba de conexión desde la aplicación web. ¡El bot está funcionando correctamente!" }),
      });
      const sendData = await sendRes.json();
      messageSent = sendData.ok;
      if (!sendData.ok) sendError = sendData;
    }

    // 4. Test Firestore Write (webhookLogs)
    let firestoreOk = false;
    try {
      await logWebhookEvent(999, { test: "diagnostic", timestamp: new Date().toISOString() });
      firestoreOk = true;
    } catch (e) {
      console.error("Firestore diagnostic failed:", e);
    }

    return NextResponse.json({
      success: true,
      botInfo: meData.result,
      webhookInfo: whData.result,
      registeredWebhookUrl: whData.result.url,
      isLinked: !!chatId,
      messageSent,
      sendError,
      firestoreOk,
      tokenLength: token.length
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
