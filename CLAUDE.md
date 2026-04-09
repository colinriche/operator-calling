# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**The Operator** is a voice-first communication platform — think early Skype without the bloat. The key mechanic: a call only connects when **both** users answer, removing call pressure and missed-timing friction. It supports one-to-one calls with known contacts, privacy-focused calls with unknown people globally, and group-based selective calling.

The full product specification lives in `operator-website-prompt.md`.

## Commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript check
```

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 (uses `@import "tailwindcss"` and `@theme` directive — no tailwind.config.js)
- **Component library:** shadcn/ui
- **Animation:** Framer Motion
- **Backend/Auth:** Firebase Authentication, Firestore, Storage
- **Deployment:** Vercel

## Architecture

### Folder Structure

```
/app
  /(public)/         # Marketing pages (home, how-it-works, features, groups, use-cases, privacy, faq, download)
  /(auth)/           # login, signup
  /dashboard/        # Authenticated user area
  /admin/            # Group admin and super admin dashboards
/components/
  /ui/               # shadcn/ui primitives
  /marketing/        # Homepage sections and public page components
  /dashboard/        # Dashboard-specific components
  /admin/            # Admin dashboard components
  /shared/           # Navbar, Footer, etc.
/lib/                # Firebase config, utilities, helpers
/hooks/              # Custom React hooks
/types/              # TypeScript type definitions
```

### Role System (3 tiers)

1. **Standard User** — profile, call preferences, scheduling, group participation
2. **Group Admin** — manage groups, invite members, control schedules, assign roles
3. **Super Admin** — full platform control, moderation, system configuration

Routes under `/dashboard` and `/admin` are protected via middleware and RBAC-gated.

### Tailwind v4 Notes

Tailwind v4 uses CSS-first config. Custom tokens go in `app/globals.css` under `@theme`. No `tailwind.config.js` or `tailwind.config.ts` file.

### Firestore Collections

`users`, `profiles`, `roles`, `groups`, `memberships`, `invites`, `schedules`, `callbacks`, `settings`, `notifications`, `admin_controls`

### Server vs Client Components

Default to Server Components. Add `"use client"` only for interactivity, Framer Motion animations, or browser API access. Firebase client SDK runs in Client Components only.

## Design System

**Colours:**
- Primary: Warm golden yellow (`#F5A623` or similar)
- Text: Charcoal (`#2D2D2D`)
- Background: Cream/off-white (`#FAFAF7`)
- Accent: Deep blue-grey or muted teal

**Visual style:** Modern minimalist with personality — bold typography, rounded elements, soft shadows, subtle glassmorphism, gradient accents. Dark mode supported.

**Critical:** Must NOT feel like a generic SaaS template, chat app, or video meeting platform. Must feel calling-first and community-focused with a warm, slightly quirky tone.
