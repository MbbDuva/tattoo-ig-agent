import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getOpenSlots(daysAhead = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("slots")
    .select("id, date, time")
    .eq("is_booked", false)
    .gte("date", today)
    .lte("date", future)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) throw error;
  return data;
}

export async function findSlot(date, time) {
  const { data, error } = await supabase
    .from("slots")
    .select("*")
    .eq("date", date)
    .eq("time", time)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function bookSlot({ date, time, igSenderId, igUsername, clientName, serviceType, notes }) {
  const slot = await findSlot(date, time);
  if (!slot) return { ok: false, reason: "no_such_slot" };
  if (slot.is_booked) return { ok: false, reason: "already_booked" };

  // Atomic guard: this UPDATE only succeeds if is_booked is still false at
  // the moment it runs, so two simultaneous bookings can't both win.
  const { data: updated, error: updateErr } = await supabase
    .from("slots")
    .update({ is_booked: true })
    .eq("id", slot.id)
    .eq("is_booked", false)
    .select();
  if (updateErr) throw updateErr;
  if (!updated || updated.length === 0) return { ok: false, reason: "already_booked" };

  const { error: insertErr } = await supabase.from("bookings").insert({
    slot_id: slot.id,
    ig_sender_id: igSenderId,
    ig_username: igUsername ?? null,
    client_name: clientName ?? null,
    service_type: serviceType ?? null,
    notes: notes ?? null,
  });
  if (insertErr) throw insertErr;

  return { ok: true, date, time };
}

export async function cancelBooking({ igSenderId, date, time }) {
  const slot = await findSlot(date, time);
  if (!slot) return { ok: false, reason: "no_such_slot" };

  const { data: booking, error: findErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("slot_id", slot.id)
    .eq("ig_sender_id", igSenderId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (findErr) throw findErr;
  if (!booking) return { ok: false, reason: "no_matching_booking" };

  const { error: cancelErr } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id);
  if (cancelErr) throw cancelErr;

  const { error: freeErr } = await supabase
    .from("slots")
    .update({ is_booked: false })
    .eq("id", slot.id);
  if (freeErr) throw freeErr;

  const { data: waitlisted, error: waitErr } = await supabase
    .from("waitlist")
    .select("*")
    .eq("notified", false)
    .order("created_at", { ascending: true })
    .limit(5);
  if (waitErr) throw waitErr;

  return { ok: true, freedSlot: { date, time }, waitlisted: waitlisted || [] };
}

export async function addToWaitlist({ igSenderId, igUsername, notes }) {
  const { error } = await supabase.from("waitlist").insert({
    ig_sender_id: igSenderId,
    ig_username: igUsername ?? null,
    preferred_notes: notes ?? null,
  });
  if (error) throw error;
  return { ok: true };
}

export async function markWaitlistNotified(ids) {
  const { error } = await supabase.from("waitlist").update({ notified: true }).in("id", ids);
  if (error) throw error;
}

export async function saveMessage(igSenderId, role, content) {
  const { error } = await supabase
    .from("conversations")
    .insert({ ig_sender_id: igSenderId, role, content });
  if (error) throw error;
}

export async function getRecentConversation(igSenderId, limit = 12) {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("ig_sender_id", igSenderId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

// Used by seed-availability.js — bulk-inserts slots, silently skipping any
// (date, time) pair that already exists.
export async function bulkInsertSlots(rows) {
  const { error } = await supabase
    .from("slots")
    .upsert(rows, { onConflict: "date,time", ignoreDuplicates: true });
  if (error) throw error;
}
