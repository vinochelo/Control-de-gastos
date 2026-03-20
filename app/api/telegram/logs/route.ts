import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export async function GET() {
  try {
    const q = query(
      collection(db, "webhookLogs"),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return NextResponse.json({ ok: true, logs });
  } catch (error: any) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
