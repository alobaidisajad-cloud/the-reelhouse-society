# Supabase Migration Workflow

## Overview

All schema changes should be tracked as numbered SQL files in this directory.
Apply them in order using the Supabase dashboard SQL editor or the Supabase CLI.

## File Naming Convention

```
NNNN_short_description.sql
```

Where `NNNN` is a 4-digit sequential number (0001, 0002, 0003...).

## How to Apply

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → SQL Editor
2. Paste and run the migration file contents
3. Commit the `.sql` file to version control with your code changes

## Files in This Directory

| File | Description |
|------|-------------|
| `0001_baseline_schema.sql` | Core tables: profiles, logs, watchlists, vaults, lists, list_items, interactions, notifications |
| `0002_notifications_table.sql` | Notifications table with RLS policies |
| `0003_cinema_reviews.sql` | cinema_reviews table for the Cinemas page |
| `0004_dispatch_dossiers.sql` | dispatch_dossiers table for Auteur editorial content |
| `0005_programmes.sql` | programmes table for Nightly Programme double features |
| `0006_venues_showtimes.sql` | venues and showtimes tables for venue operators |

## Development vs Production

Currently the app points to a **single Supabase project** for both development and production.

To set up staging:
1. Create a second free Supabase project at supabase.com
2. Copy `.env.local` to `.env.staging` with the new project URL + anon key
3. Add `VITE_SUPABASE_URL_STAGING` and `VITE_SUPABASE_ANON_KEY_STAGING` to Vercel's staging environment
4. Run migrations against the staging project before promoting to production
