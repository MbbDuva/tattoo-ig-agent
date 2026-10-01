import Anthropic from "@anthropic-ai/sdk";
import {
  getOpenSlots,
  bookSlot,
  cancelBooking,
  addToWaitlist,
  saveMessage,
  getRecentConversation,
} from "./db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

function systemPrompt() {
  return `You are the Instagram DM assistant for ${process.env.SHOP_NAME}, a tattoo shop serving ${process.env.SHOP_CITY}.

Shop facts (only state what's below — don't invent pricing, artists, or policies):
- Hours: ${process.env.SHOP_HOURS}
- Styles: ${process.env.SHOP_STYLES}
- Pricing: ${process.env.SHOP_PRICING}
- Deposit policy: ${process.env.SHOP_DEPOSIT}

Your job, in order:
1. Answer questions warmly and briefly — this is an Instagram DM, not an email. 1-3 short sentences per reply.
2. Qualify the lead: get a rough idea of placement, size, style, and whether they have reference images before quoting anything specific — never give an exact price for a piece you haven't seen; give the shop minimum/range instead and say the artist will confirm a final quote.
3. When they want to move forward, use check_availability to find real open slots and offer 2-3 options.
4. Use book_appointment once they confirm a specific date and time.
5. If someone wants to cancel or reschedule, use cancel_appointment, then offer new options from check_availability.
6. If nothing is open in their preferred window, offer join_waitlist.

Tone: confident, friendly, on-brand for a tattoo shop — not corporate, not overly formal. Never make up availability, prices, or artist names. If you don't know something, say the artist will follow up.`;
}

const tools = [
  {
    name: "check_availability",
    description: "Look up real open appointment slots in the shop's booking calendar for the next N days.",
    input_schema: {
      type: "object",
      properties: {
        days_ahead: { type: "integer", description: "How many days out to search. Default 14." },
      },
    },
  },
  {
    name: "book_appointment",
    description: "Reserve a specific open slot for this Instagram user.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD, must be a date returned by check_availability" },
        time: { type: "string", description: "HH:MM 24h, must be a time returned by check_availability" },
        client_name: { type: "string" },
        service_type: { type: "string", description: "e.g. consultation, small piece, full sleeve session" },
        notes: { type: "string", description: "Placement, size, style, reference notes" },
      },
      required: ["date", "time"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel this Instagram user's existing booking for a given date/time and free the slot.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string" },
        time: { type: "string" },
      },
      required: ["date", "time"],
    },
  },
  {
    name: "join_waitlist",
    description: "Add this user to the waitlist when no slot fits, so they can be pinged if one opens up.",
    input_schema: {
      type: "object",
      properties: {
        notes: { type: "string", description: "What they're waiting for — date range, style, etc." },
      },
    },
  },
];

async function runTool(name, input, ctx) {
  switch (name) {
    case "check_availability": {
      const slots = await getOpenSlots(input.days_ahead || 14);
      return { open_slots: slots.slice(0, 10) };
    }
    case "book_appointment": {
      return await bookSlot({
        date: input.date,
        time: input.time,
        igSenderId: ctx.igSenderId,
        igUsername: ctx.igUsername,
        clientName: input.client_name,
        serviceType: input.service_type,
        notes: input.notes,
      });
    }
    case "cancel_appointment": {
      // NOTE: notifying waitlisted contacts about the freed slot is left as a
      // deliberate follow-up step (see README) rather than fired
      // automatically here, since it sends messages to *other* users.
      return await cancelBooking({ igSenderId: ctx.igSenderId, date: input.date, time: input.time });
    }
    case "join_waitlist": {
      return await addToWaitlist({ igSenderId: ctx.igSenderId, igUsername: ctx.igUsername, notes: input.notes });
    }
    default:
      return { error: "unknown_tool" };
  }
}

// Handles one incoming DM end-to-end: loads history, runs the Claude +
// tool-use loop, persists the turn, and returns the text to send back.
export async function handleIncomingMessage(igSenderId, igUsername, userText) {
  await saveMessage(igSenderId, "user", userText);

  const history = (await getRecentConversation(igSenderId, 12)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let messages = [...history, { role: "user", content: userText }];
  const ctx = { igSenderId, igUsername };

  for (let turn = 0; turn < 4; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt(),
      tools,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text").map((b) => b.text);

    if (toolUses.length === 0) {
      const finalText = textBlocks.join("\n").trim() || "Got it — let me have the artist follow up on that.";
      await saveMessage(igSenderId, "assistant", finalText);
      return finalText;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(await runTool(tu.name, tu.input, ctx)),
      }))
    );

    messages.push({ role: "user", content: toolResults });
  }

  const fallback = "Let me get the artist to jump in on this one — they'll follow up shortly.";
  await saveMessage(igSenderId, "assistant", fallback);
  return fallback;
}
