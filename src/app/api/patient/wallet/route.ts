import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { verifyBearer } from "@/lib/auth";
import { encryptPrivateKey, decryptPrivateKey } from "@/lib/encryption";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const db = getDb();
    const rows = await db
      .select({
        walletAddress: users.walletAddress,
        encryptedPrivateKey: users.encryptedPrivateKey,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // If no wallet exists, return empty response (wallet will be created on demand)
    if (!row.walletAddress) {
      return NextResponse.json({
        walletAddress: null,
        privateKey: null,
        walletType: "auto",
      });
    }

    let privateKey: string | null = null;
    if (row.encryptedPrivateKey) {
      try {
        privateKey = decryptPrivateKey(row.encryptedPrivateKey);
      } catch (e) {
        console.error("[patient/wallet GET] Decryption failed:", e);
        // Return the address but null private key - it will be regenerated if needed
        console.warn("[patient/wallet GET] Could not decrypt key for user", auth.sub);
        return NextResponse.json({
          walletAddress: row.walletAddress,
          privateKey: null,
          walletType: "auto",
        });
      }
    }

    return NextResponse.json({
      walletAddress: row.walletAddress,
      privateKey,
      walletType: "auto",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = verifyBearer(request.headers.get("authorization"));
    if (auth.role !== "patient") {
      return NextResponse.json({ error: "Patient access required." }, { status: 403 });
    }

    const body = (await request.json()) as {
      walletAddress?: string;
      privateKey?: string;
    };
    const walletAddress = String(body.walletAddress || "").trim();
    const privateKey = String(body.privateKey || "").trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }

    if (privateKey && !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
      return NextResponse.json({ error: "Invalid private key format." }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select({
        walletAddress: users.walletAddress,
        encryptedPrivateKey: users.encryptedPrivateKey,
      })
      .from(users)
      .where(eq(users.id, auth.sub))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const existing = row.walletAddress?.trim() || "";
    if (existing) {
      if (existing.toLowerCase() === walletAddress.toLowerCase()) {
        return NextResponse.json({ walletAddress: existing });
      }
      // Allow replacement only if the old wallet has no private key (broken wallet)
      if (row.encryptedPrivateKey) {
        return NextResponse.json(
          { error: "A wallet address is already linked to this account." },
          { status: 409 }
        );
      }
      // If we reach here, we're replacing a broken wallet (has address but no key)
      console.log("[patient/wallet PATCH] Replacing broken wallet for user", auth.sub);
    }

    let encryptedPrivateKey: string | null = null;
    if (privateKey) {
      try {
        encryptedPrivateKey = encryptPrivateKey(privateKey);
      } catch (e) {
        console.error("[patient/wallet PATCH] Encryption failed:", e);
        return NextResponse.json(
          { error: "Failed to encrypt wallet key." },
          { status: 500 }
        );
      }
    }

    const wasReplaced = existing && !row.encryptedPrivateKey;

    await db
      .update(users)
      .set({
        walletAddress,
        encryptedPrivateKey,
      })
      .where(eq(users.id, auth.sub));

    return NextResponse.json({ walletAddress, replaced: wasReplaced });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save wallet.";
    const status = msg.includes("authorization") || msg.includes("jwt") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
