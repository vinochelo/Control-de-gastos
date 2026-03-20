import { linkTelegramToUser } from "./lib/firebase_service";

async function run() {
  console.log("Starting test...");
  try {
    await linkTelegramToUser(123456789, "testUserId");
    console.log("Success!");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

run();
