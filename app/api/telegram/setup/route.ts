import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
  
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN in environment" }, { status: 500 });
  }

  // Verify token with getMe
  const meRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const meData = await meRes.json();
  if (!meData.ok) {
    return NextResponse.json({ error: "Invalid TELEGRAM_BOT_TOKEN", details: meData }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientUrl = searchParams.get("url");

  // Get the base URL
  let baseUrl = clientUrl;
  
  if (!baseUrl) {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const host = forwardedHost || req.headers.get("host");
    const protocol = forwardedProto || "https";
    baseUrl = `${protocol}://${host}`.replace(/\/$/, "");
  }

  // Fallback to APP_URL env var if still not set or if it's localhost but we are in production
  if ((!baseUrl || baseUrl.includes("localhost")) && process.env.APP_URL) {
    baseUrl = process.env.APP_URL.replace(/\/$/, "");
  }
  
  // In AI Studio, the Dev URL is protected by authentication.
  // We MUST use the Shared App URL for the webhook so Telegram can reach it.
  // We will replace 'ais-dev' with 'ais-pre' if it's an AI Studio URL.
  if (baseUrl.includes("ais-dev-")) {
    baseUrl = baseUrl.replace("ais-dev-", "ais-pre-");
  }
  
  // Force HTTPS if it's not localhost
  if (!baseUrl.includes("localhost") && baseUrl.startsWith("http://")) {
    baseUrl = baseUrl.replace("http://", "https://");
  }
  
  const APP_URL = baseUrl;

  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const webhookUrl = `${APP_URL}/api/telegram/webhook`;
  console.log("SETTING WEBHOOK TO:", webhookUrl);
  
  try {
    // First, delete the current webhook to clear any stuck state
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
    
    // Then set the new one
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const res = await fetch(telegramApiUrl);
    const data = await res.json();
    
    return NextResponse.json({
      ...data,
      webhook_url: webhookUrl,
      base_url: APP_URL,
      headers_debug: Object.fromEntries(req.headers.entries())
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, webhook_url: webhookUrl }, { status: 500 });
  }
}
