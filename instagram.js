const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v21.0";
const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

// Instagram API with Instagram Login (no Facebook Page involved) serves its
// endpoints from graph.instagram.com, using an Instagram User access token
// rather than a Facebook Page token. `recipientId` is the IGSID from the
// incoming webhook payload (messaging[].sender.id).
//
// Double-check this request shape against Meta's current docs for
// "Instagram API with Instagram Login > Messaging" when you wire this up —
// Meta has shifted endpoint details across login types before.
export async function sendMessage(recipientId, text) {
  const url = `https://graph.instagram.com/${GRAPH_VERSION}/me/messages?access_token=${ACCESS_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Instagram send failed:", res.status, body);
  }
  return res.ok;
}
