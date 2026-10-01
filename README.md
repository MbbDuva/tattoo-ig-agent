# Tattoo Shop Instagram Agent

Auto-replies to Instagram DMs, qualifies leads, checks real availability,
books appointments, and handles cancellations for a Reno/Sparks, NV shop.
Node/Express webhook + Claude for the conversation + Supabase (Postgres) for
the calendar, so the app itself is stateless and safe to run on a free host.

## What it does

- **Auto-reply** — answers pricing/style/hours questions from the shop info
  in `.env`, without inventing anything not listed there.
- **Books appointments** — checks real open slots and books directly in the
  DM thread once the client picks a time.
- **Fills the schedule** — cancellations free the slot immediately; anyone
  who couldn't find a fit gets added to a waitlist table.
- **"Finds clients"** — not automated here on purpose. See below.

## About the "finds clients" part

An IG bot that auto-DMs strangers or scrapes accounts to cold-message them
violates Meta's platform policies and risks the account getting restricted —
which would take the other three features down with it. What actually works
and feeds straight into this bot: geo-tagged posts/reels with local hashtags,
a small IG ad budget geo-targeted to Reno/Sparks with "Send message" as the
CTA, and turning on Instagram's own "Message us" button / Ice Breakers so a
cold visitor has a one-tap way into the conversation this agent handles.

## The two things that need her, not you

Nothing here can be done on her behalf — both require logging into accounts
she owns:

1. **Authorizing the Meta app against her Instagram login** (step 1 below) —
   note that creating the app itself still means signing into
   developers.facebook.com with *some* Facebook account (that's just where
   Meta's dev dashboard lives), but that account never gets linked to her
   Instagram or needs a Page.
2. **Owning the hosting account** the app runs on (step 3 below) — someone's
   name/card has to be on whatever host you pick, even the free tier.

Everything else in this repo is done. Below is the exact, minimum path
through those two things.

## Setup checklist

**1. Instagram + Meta (Instagram Login path — no Facebook Page)**
   - Confirm her Instagram is a Professional (Business/Creator) account. If
     not: Settings → Account type → switch to Professional.
   - developers.facebook.com → sign in with any Facebook account → Create
     App → type "Business."
   - In the app's Products list, set up **Instagram** → choose **API setup
     with Instagram Login** (NOT "API setup with Facebook Login" — that's
     the Page-linked one).
   - Under that panel, click **Add an Instagram Account**, log in with her
     Instagram Business/Creator credentials, approve the connection.
   - Still in that same panel, click **Generate Token** — this is the value
     that goes in `IG_ACCESS_TOKEN`. It's a long-lived token tied directly
     to her Instagram account.
   - Request/confirm the `instagram_business_basic` and
     `instagram_business_manage_messages` permissions for the app.
   - In the App Dashboard's Webhooks config, subscribe to the `messages`
     field under the Instagram object.
   - Note: production access beyond a handful of test users needs Meta App
     Review — takes a few days, do this step early. Also double-check this
     flow against Meta's current docs when you get there; they've reshuffled
     exact screen names across login types before.

**2. Supabase (can be your account or hers — free tier)**
   - New project at supabase.com.
   - SQL Editor → paste `supabase-schema.sql` → Run.
   - Project Settings → API → copy the Project URL and the `service_role`
     key into `.env`.

**3. Fill in `.env`**
   - Copy `.env.example` → `.env`.
   - Drop in the Meta token/verify token, Supabase URL/key, your
     `ANTHROPIC_API_KEY`, and her real shop details (name, hours, styles,
     pricing, deposit) — these feed the assistant's replies directly, so get
     them right.

**4. Seed the calendar**
   - `npm install`
   - Edit `OPEN_HOURS` / `CLOSED_WEEKDAYS` in `seed-availability.js` to match
     her real schedule.
   - `npm run seed`

**5. Deploy (someone's account, e.g. Render free tier)**
   - Push this folder to a GitHub repo.
   - Render → New → Web Service → connect the repo → it picks up the
     `Dockerfile` automatically.
   - Paste every var from `.env` into Render's environment settings.
   - Deploy → copy the public URL Render gives you.
   - Note: Render's free tier spins down after inactivity, so the first DM
     after a quiet stretch replies a few seconds slower. Fine for a small
     shop; upgrade the instance later if it's ever annoying.

**6. Finish the Meta webhook**
   - Back in the App Dashboard's Webhooks config, set the callback URL to
     `<your Render URL>/webhook` and the verify token to whatever you put in
     `IG_VERIFY_TOKEN`.
   - Meta will hit it once to verify — the server handles that automatically.

**7. Test**
   - DM the shop's Instagram from a personal account, watch it reply, book a
     slot, and check the `bookings` table in Supabase.

## Known corners cut

- Waitlist notifications on a cancellation aren't auto-sent — `cancelBooking`
  returns the waitlisted contacts so a small addition to `server.js` can
  decide when to message them, rather than firing outbound DMs on its own.
- No admin UI — bookings/slots live in Supabase's own table view; say the
  word and I'll build a simple dashboard on top of it.
