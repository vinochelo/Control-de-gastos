import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const groqKey = process.env.GROQ_API_KEY;
  const appUrl = process.env.APP_URL;
  
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN", app_url: appUrl });
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();

    const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const whData = await whRes.json();

    return NextResponse.json({
      ok: true,
      bot: meData.ok ? meData.result : null,
      webhook: whData.ok ? whData.result : null,
      bot_token_length: token.length,
      groq_key_set: !!groqKey,
      groq_key_length: groqKey?.length || 0,
      app_url: appUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message, app_url: appUrl });
  }
}
