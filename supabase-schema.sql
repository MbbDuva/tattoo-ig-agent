-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.

create table if not exists slots (
  id bigserial primary key,
  date date not null,
  time text not null,
  is_booked boolean not null default false,
  unique (date, time)
);

create table if not exists bookings (
  id bigserial primary key,
  slot_id bigint not null references slots(id),
  ig_sender_id text not null,
  ig_username text,
  client_name text,
  service_type text,
  notes text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id bigserial primary key,
  ig_sender_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists waitlist (
  id bigserial primary key,
  ig_sender_id text not null,
  ig_username text,
  preferred_notes text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
