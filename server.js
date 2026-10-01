import "dotenv/config";
import express from "express";
import { handleIncomingMessage } from "./claude-agent.js";
import { sendMessage } from "./instagram.js";

const app = express();
app.use(express.json());

// --- Step 1: Meta calls this once, on GET, to verify you own the endpoint ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.IG_VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Step 2: Meta POSTs here every time someone DMs the account ---
app.post("/webhook", async (req, res) => {
  // Ack immediately — Meta retries aggressively if you're slow to respond.
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;
  if (body.object !== "instagram") return;

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      // Skip echoes of the bot's own outgoing messages and non-text events
      // (reactions, read receipts, etc.) to avoid loops.
      if (event.message?.is_echo) continue;
      const text = event.message?.text;
      const senderId = event.sender?.id;
      if (!text || !senderId) continue;

      try {
        const reply = await handleIncomingMessage(senderId, event.sender?.username, text);
        await sendMessage(senderId, reply);
      } catch (err) {
        console.error("Failed to handle message:", err);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tattoo IG agent listening on :${PORT}`));
