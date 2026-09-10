-- Postgres/Supabase schema for the Capstone System (originally converted from
-- a MySQL schema, which has since been removed now that this is the source of truth).
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query) before importing data.

create type gender_type as enum ('male', 'female');

create table if not exists users (
  id bigint generated always as identity primary key,
  full_name varchar(120) not null,
  username varchar(60) not null unique,
  email varchar(190) not null unique,
  password_hash varchar(255),
  gender gender_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamp
);

create index if not exists idx_users_created_at on users (created_at);

create table if not exists admins (
  id bigint generated always as identity primary key,
  full_name varchar(120) not null,
  username varchar(60) not null unique,
  email varchar(190) not null unique,
  password_hash varchar(255) not null,
  created_at timestamptz not null default now(),
  updated_at timestamp
);
