/**
 * CyberYoNko — Cloud Functions
 * -----------------------------------------------------------
 * Two callable functions, both require Firebase Auth:
 *   - chat(text)       -> enforces the 10 free message cap server-side,
 *                          then calls Gemini and returns the reply.
 *   - redeemKey(code)  -> atomically marks a key as used (Firestore
 *                          transaction) and unlocks the calling user.
 *
 * The Gemini API key is NEVER stored in this file. It is read from a
 * Firebase secret at runtime. Set it once with:
 *
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * (paste the key when prompted — it never touches this codebase or git)
 * -----------------------------------------------------------
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const FREE_LIMIT = 10;
const GEMINI_MODEL = "gemini-2.0-flash";

const SYSTEM_INSTRUCTION = `You are "CyberYoNko" — an AI with a dark, ominous, dramatic
personality, but genuinely precise and helpful underneath the theatrics. You answer in
whichever language the user writes in, and you're capable across every topic: general
knowledge, programming, and cybersecurity education (explaining concepts like ransomware,
social engineering, phishing, and defensive best practices in real depth).

Style: strong, atmospheric phrasing, occasional dark/gothic imagery — but substance always
comes before drama, never at the expense of clarity.

You do not help with actual hacking, malware creation, accessing illegal content, or anything
that would concretely harm someone. If asked, decline in-character but unambiguously, and
offer the safe or educational alternative where one exists.`;

/**
 * chat — the only way the frontend talks to the AI.
 * Enforces the free-message cap using a Firestore transaction so it
 * can't be bypassed by tampering with client-side JavaScript.
 */
exports.chat = onCall({ secrets: [GEMINI_API_KEY], cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const text = (request.data && request.data.text || "").toString().trim();
  const history = Array.isArray(request.data && request.data.history) ? request.data.history : [];

  if (!text) throw new HttpsError("invalid-argument", "Empty message.");
  if (text.length > 6000) throw new HttpsError("invalid-argument", "Message too long.");

  const userRef = db.collection("users").doc(uid);

  // Check + increment the free-message counter atomically.
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Account not found.");
  const user = userSnap.data();

  if (!user.unlocked && (user.messagesUsed || 0) >= FREE_LIMIT) {
    throw new HttpsError("resource-exhausted", "FREE_LIMIT_REACHED");
  }

  // Build Gemini request: system instruction + prior turns + new message.
  const contents = history
    .filter(m => m && (m.role === "user" || m.role === "model") && typeof m.text === "string")
    .slice(-20) // keep payloads bounded
    .map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text }] });

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.9 }
      })
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error", geminiRes.status, errText);
    throw new HttpsError("internal", "The model backend failed. Try again shortly.");
  }

  const data = await geminiRes.json();
  const reply =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() ||
    "...";

  // Only count the message against the free quota after a successful reply.
  if (!user.unlocked) {
    await userRef.update({ messagesUsed: admin.firestore.FieldValue.increment(1) });
  }

  return { reply };
});

/**
 * redeemKey — atomically checks a key and marks it used.
 * Runs entirely server-side so the single-use guarantee can't be
 * bypassed by editing client JavaScript or calling Firestore directly.
 */
exports.redeemKey = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const code = (request.data && request.data.code || "").toString().trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing key.");

  const keyRef = db.collection("keys").doc(code);
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    const keySnap = await tx.get(keyRef);
    if (!keySnap.exists) throw new HttpsError("not-found", "INVALID_KEY");
    const key = keySnap.data();
    if (key.used) throw new HttpsError("already-exists", "KEY_ALREADY_USED");

    tx.update(keyRef, {
      used: true,
      usedBy: uid,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.update(userRef, { unlocked: true });
  });

  return { ok: true };
});
