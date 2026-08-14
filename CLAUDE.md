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
npm run type-check   # TypeScript check (tsc --noEmit)
```

## Environment

Copy `.env.local.example` to `.env.local` and fill in the Firebase service-account credentials before running.

The Firebase **project** is chosen by one variable, `NEXT_PUBLIC_FIREBASE_ENV` (`prod` | `dev` | `custom`), defaulting to `prod` (`operator-calling`); `dev` is `webrtc-clone-dc88c`. The client config for both is baked into `lib/firebase-env.ts`, so nothing else is needed to switch. Server credentials are not baked in — set `FIREBASE_CLIENT_EMAIL_{PROD,DEV}` / `FIREBASE_PRIVATE_KEY_{PROD,DEV}`. See `docs/firebase-environments.md`.

**Never** add a second path to the Firebase project id. `lib/firebase.ts` and `lib/firebase-admin.ts` both resolve through `lib/firebase-env.ts`; a client and server pointing at different projects is what produced sign-ins that verified against one project and found nothing in the other.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 (CSS-first — no `tailwind.config.js`; tokens in `app/globals.css` under `@theme`)
- **Component library:** shadcn/ui v4 (uses `@base-ui/react` — no `asChild` prop; use `buttonVariants` + `<Link>` instead)
- **Animation:** Framer Motion
- **Backend/Auth:** Firebase Authentication, Firestore, Storage
- **Proxy/middleware:** `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`, export named `proxy`)
- **Deployment:** Vercel

## Architecture

### Folder Structure

```
/app
  /(public)/         # Marketing pages — Navbar + Footer layout
  /(auth)/           # login, signup — centered auth layout, force-dynamic
  /dashboard/        # User dashboard (7 sub-pages)
  /admin/            # Group admin + /admin/super (super admin)
/components/
  /ui/               # shadcn/ui primitives
  /marketing/        # Homepage sections (HeroSection, FeatureSections, GroupsSection, etc.)
  /dashboard/        # DashboardNav, DashboardOverview, ProfileEditor
  /admin/            # GroupAdminDashboard, SuperAdminDashboard
  /shared/           # Navbar, Footer, AuthForm
/lib/
  firebase.ts        # Firebase app/auth/db/storage exports
  utils.ts           # cn() helper
/hooks/
  useAuth.ts         # onAuthStateChanged → { user, profile, loading }
/types/
  index.ts           # UserProfile, Group, ScheduledCall, Callback, Notification, Invite
/proxy.ts            # Route protection (replaces middleware.ts in Next.js 16)
```

### Role System (3 tiers)

1. **Standard User** — `/dashboard/*`
2. **Group Admin** — `/admin` (GroupAdminDashboard)
3. **Super Admin** — `/admin/super` (SuperAdminDashboard)

### Tailwind v4 Notes

No `tailwind.config.js`. All tokens in `app/globals.css`:
- `@theme inline` block maps CSS vars to Tailwind utilities
- Brand custom utilities: `.gradient-gold`, `.gradient-text-gold`, `.glass`, `.font-heading`
- Fonts: Inter (body, `--font-inter`), Sora (headings, `--font-sora`)

### shadcn/ui v4 Note

This version uses `@base-ui/react/button` — **no `asChild` prop**. Pattern for link-buttons:
```tsx
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

<Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "extra-classes")}>
  Label
</Link>
```

### Firebase

Client SDK only (runs in Client Components). Server Components must not import `lib/firebase.ts` directly. `useAuth` hook handles auth state. Pages that render Firebase-dependent Client Components must be `force-dynamic` to avoid SSG prerender errors.

### Firestore Collections

`users`, `profiles`, `roles`, `groups`, `memberships`, `invites`, `schedules`, `callbacks`, `settings`, `notifications`, `admin_controls`

## Design System

**Colours (oklch):**
- Primary: `oklch(0.72 0.16 75)` — warm golden yellow
- Background: `oklch(0.977 0.007 88)` — cream/off-white
- Foreground: `oklch(0.22 0.01 50)` — charcoal
- Secondary/Accent: `oklch(0.40 0.07 220)` — deep blue-grey/teal

**Brand rule:** Must NOT feel like a generic SaaS template, chat app, or video meeting platform. Voice-first, community-focused, warm and slightly quirky tone.
