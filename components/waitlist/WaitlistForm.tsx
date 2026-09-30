"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2 } from "lucide-react";
import { ShareRow } from "@/components/waitlist/ShareRow";
import { ManageLink } from "@/components/waitlist/ManageLink";
import { TimezoneField } from "@/components/waitlist/TimezoneField";
import {
  TESTER_CAVEAT,
  TESTER_EXPLANATION,
  TESTER_HEADLINE,
  TESTER_LOGIN_REASON,
  TESTER_PREVIEW_BODY,
  TESTER_PREVIEW_HEADLINE,
} from "@/lib/waitlist/copy";
import { SCHEDULE_ZONE } from "@/lib/waitlist/timezone";
import {
  REFERRAL_SOURCES,
  type SignupOption,
  type TimezoneSource,
} from "@/lib/waitlist/constants";
import {
  LANGUAGES,
  OTHER_COUNTRIES,
  PRIORITY_COUNTRIES,
} from "@/lib/waitlist/locales";
import type { WaitlistContext, WaitlistPresentation } from "@/lib/waitlist/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistFormProps {
  context: WaitlistContext;
  /**
   * Every visible string comes from here rather than from this component, so
   * the form on a global page cannot mention a shared interest that a global
   * page does not have.
   */
  presentation: WaitlistPresentation;
  /** Admin preview - renders normally but records nothing. */
  isPreview: boolean;
}

export function WaitlistForm({
  context,
  presentation,
  isPreview,
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [englishFirst, setEnglishFirst] = useState(true);
  const [firstLanguage, setFirstLanguage] = useState("");
  const [organising, setOrganising] = useState(false);
  const [familyInterest, setFamilyInterest] = useState(false);
  // Only ever asked when there is no tracking code - a visitor who followed a
  // tracked link already has a real answer, so asking them to guess again
  // would just be noise layered over evidence we already have.
  const [referralSource, setReferralSource] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [timezone, setTimezone] = useState(SCHEDULE_ZONE);
  const [timezoneSource, setTimezoneSource] =
    useState<TimezoneSource>("detected");

  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  // Which of the three buttons is in flight, so only that one shows "Joining…".
  const [tryAppOpen, setTryAppOpen] = useState(false);
  const [submittingOption, setSubmittingOption] = useState<SignupOption>("waitlist");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [confirmedOrganising, setConfirmedOrganising] = useState(false);
  const [manageToken, setManageToken] = useState("");

  const visitRecorded = useRef(false);

  // Recorded from the client rather than during the server render, so
  // link-preview crawlers and other non-JS bots stay out of the visit counts.
  useEffect(() => {
    if (isPreview || !context.sourceCode || visitRecorded.current) return;
    visitRecorded.current = true;

    void fetch("/api/waitlist/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceCode: context.sourceCode,
        shareChannel: context.shareChannel,
        landingPage: window.location.pathname + window.location.search,
        referrer: document.referrer,
      }),
    }).catch(() => {});
  }, [context.sourceCode, context.shareChannel, isPreview]);

  /** Sets the error messages; returns the id of the first invalid field, or null. */
  function validate(): string | null {
    const next: Record<string, string> = {};
    let firstInvalid: string | null = null;
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Enter a valid email address.";
      firstInvalid ??= "waitlist-email";
    }
    if (!country) {
      next.country = "Select your country.";
      firstInvalid ??= "waitlist-country";
    }
    if (!englishFirst && !firstLanguage) {
      next.firstLanguage = "Select your first language.";
      firstInvalid ??= "waitlist-language";
    }
    setErrors(next);
    return firstInvalid;
  }

  // Opening the app routes only checks the form; nothing is saved until a
  // platform is chosen. An invalid form stays closed and sends the person to
  // the first field that needs fixing.
  function toggleTryApp() {
    if (tryAppOpen) {
      setTryAppOpen(false);
      return;
    }
    setFormError("");
    const firstInvalid = validate();
    if (firstInvalid) {
      const field = document.getElementById(firstInvalid);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
      return;
    }
    setTryAppOpen(true);
  }

  // Pressing Enter in a field submits via the first button, the plain waitlist.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit("waitlist");
  }

  async function submit(signupOption: SignupOption) {
    setFormError("");
    if (validate() !== null) return;

    if (isPreview) {
      setFormError("Preview mode - this form does not submit.");
      return;
    }

    setSubmittingOption(signupOption);
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          interestedInOrganising: organising,
          familyInterest,
          country,
          englishFirstLanguage: englishFirst,
          firstLanguage: englishFirst ? null : firstLanguage,
          sourceCode: context.sourceCode,
          shareChannel: context.shareChannel,
          referralSource: context.sourceCode ? null : referralSource || null,
          landingPage: window.location.pathname + window.location.search,
          referrer: document.referrer,
          website: honeypot,
          timezone,
          timezoneSource,
          signupOption,
        }),
      });

      const data = (await res.json()) as { error?: string; manageToken?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setConfirmedOrganising(organising);
      setManageToken(data.manageToken ?? "");
      // Saved so the manage link survives a closed tab before email exists to
      // deliver it. Best-effort - private browsing may refuse.
      if (data.manageToken) {
        try {
          window.localStorage.setItem("operator_waitlist_token", data.manageToken);
        } catch {
          /* storage unavailable - the link is still on screen */
        }
      }
      setStatus("success");
    } catch (err) {
      console.error(err);
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again."
      );
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <div className="space-y-8">
        <div className="bg-card rounded-2xl border border-border/60 p-8">
          <CheckCircle className="w-12 h-12 text-primary mb-4" aria-hidden="true" />
          <h2 className="font-heading font-bold text-2xl text-foreground mb-3">
            You&apos;re on the waitlist.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {presentation.successNote}
          </p>
          {confirmedOrganising && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-4 pt-4 border-t border-border/60">
              You also said you may be willing to help organise the calls. This does
              not create an organiser account; the Operator team may contact you
              separately.
            </p>
          )}
        </div>

        {/* Tester offer. Deliberately after the confirmation: registering
            interest is done and saved, so abandoning this costs nothing. */}
        <div className="bg-card rounded-2xl border border-primary/40 p-6 sm:p-8">
          <h2 className="font-heading font-bold text-xl text-foreground mb-2">
            {TESTER_HEADLINE}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            {TESTER_EXPLANATION}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {TESTER_CAVEAT}
          </p>

          {manageToken ? (
            <Link
              href={`/waitlist/tester?t=${encodeURIComponent(manageToken)}`}
              className="inline-flex items-center justify-center h-11 px-5 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Join early access
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              Early access sign-up is briefly unavailable - your interest above is
              recorded either way.
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            {TESTER_LOGIN_REASON}
          </p>
        </div>

        {manageToken && (
          <div className="rounded-2xl border border-border/60 bg-background/60 p-5">
            <p className="text-sm text-foreground font-medium mb-1.5">
              Save this link
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              It lets you pause, leave or change your time zone later, without an
              account. Keep it private - anyone with it can change your settings.
            </p>
            <ManageLink token={manageToken} />
          </div>
        )}

        <ShareRow
          sourceCode={context.sourceCode}
          shareText={presentation.shareText}
          shareSubject={presentation.shareSubject}
          shareSlug={presentation.shareSlug}
        />
      </div>
    );
  }

  const inputClass =
    "w-full h-11 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
  const errorClass = "text-xs text-destructive mt-1.5";

  return (
    <div className="space-y-10">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-card rounded-2xl border border-border/60 p-6 sm:p-8 space-y-5"
      >
        <div>
          <h2 className="font-heading font-semibold text-lg text-foreground">
            {presentation.formHeading}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {presentation.formIntro}
          </p>
        </div>

        {isPreview && (
          <p className="text-xs bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-foreground">
            Admin preview - visits and registrations are not recorded.
          </p>
        )}

        {/* Honeypot: hidden from people, tempting to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="waitlist-email"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Email address <span className="text-primary">*</span>
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "waitlist-email-error" : undefined}
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email && (
            <p id="waitlist-email-error" className={errorClass}>
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="waitlist-name"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Name or username{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="waitlist-name"
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should we call you?"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="waitlist-country"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Country <span className="text-primary">*</span>
          </label>
          <select
            id="waitlist-country"
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? "waitlist-country-error" : undefined}
            className={inputClass}
          >
            <option value="">Select your country…</option>
            {PRIORITY_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
            <option disabled>──────────</option>
            {OTHER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.country && (
            <p id="waitlist-country-error" className={errorClass}>
              {errors.country}
            </p>
          )}
        </div>

        {/* Only asked when we have no tracked-link attribution already -
            asking someone who followed a tracked link to guess again would
            just add noise over evidence we already have. */}
        {!context.sourceCode && (
          <div>
            <label
              htmlFor="waitlist-referral"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Where did you find us?{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              id="waitlist-referral"
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              className={inputClass}
            >
              <option value="">Select one…</option>
              {REFERRAL_SOURCES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={englishFirst}
              onChange={(e) => {
                setEnglishFirst(e.target.checked);
                if (e.target.checked) {
                  setFirstLanguage("");
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.firstLanguage;
                    return next;
                  });
                }
              }}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            <span className="text-sm text-foreground">
              English is my first language
            </span>
          </label>

          {!englishFirst && (
            <div className="mt-4">
              <label
                htmlFor="waitlist-language"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                My first language is <span className="text-primary">*</span>
              </label>
              <select
                id="waitlist-language"
                required
                value={firstLanguage}
                onChange={(e) => setFirstLanguage(e.target.value)}
                aria-invalid={!!errors.firstLanguage}
                aria-describedby={
                  errors.firstLanguage ? "waitlist-language-error" : undefined
                }
                className={inputClass}
              >
                <option value="">Select a language…</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              {errors.firstLanguage && (
                <p id="waitlist-language-error" className={errorClass}>
                  {errors.firstLanguage}
                </p>
              )}
            </div>
          )}
        </div>

        <TimezoneField
          value={timezone}
          source={timezoneSource}
          onChange={(zone, src) => {
            setTimezone(zone);
            setTimezoneSource(src);
          }}
        />

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={organising}
            onChange={(e) => setOrganising(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          <span className="text-sm text-foreground">
            {presentation.organiserLabel}
          </span>
        </label>

        {/* A second, separate interest. Ticking it adds a family to what we
            know they want; it does not reinterpret the group or topic they
            came here for, and leaving it alone costs them nothing. */}
        {presentation.familyPrompt && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={familyInterest}
              onChange={(e) => setFamilyInterest(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            <span className="text-sm text-foreground">
              {presentation.familyPrompt}
            </span>
          </label>
        )}

        {/* A heads-up, not a field. Early Access is an optional second step
            after joining - nothing here is part of this submission, which is
            why there is no checkbox. */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5">
          <p className="font-heading font-semibold text-sm text-foreground mb-1">
            {TESTER_PREVIEW_HEADLINE}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {TESTER_PREVIEW_BODY}
          </p>
        </div>

        {/* Kept directly above the button so an error is next to the action it
            refers to. */}
        {formError && (
          <p
            role="alert"
            className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg"
          >
            {formError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="submit"
            disabled={status === "submitting"}
            className="h-14 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {status === "submitting" && submittingOption === "waitlist" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Joining…
              </>
            ) : (
              "Join the waitlist"
            )}
          </button>
          <button
            type="button"
            onClick={toggleTryApp}
            aria-expanded={tryAppOpen}
            aria-controls="waitlist-try-app"
            className="h-14 rounded-xl border border-border bg-background text-foreground font-heading font-semibold text-base hover:bg-muted/40 transition-colors"
          >
            Try the app now
          </button>
        </div>

        {/* Early-access routes. Each submits the same form as the waitlist
            button and only records which route was chosen. */}
        <div
          id="waitlist-try-app"
          hidden={!tryAppOpen}
          className="grid sm:grid-cols-2 gap-3"
        >
          <button
            type="button"
            onClick={() => void submit("ios")}
            disabled={status === "submitting"}
            className="flex items-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl hover:bg-foreground/90 transition-colors disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 shrink-0" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-70">
                {status === "submitting" && submittingOption === "ios"
                  ? "Joining…"
                  : "Early access on the"}
              </div>
              <div className="font-heading font-semibold text-base leading-tight">App Store</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void submit("android")}
            disabled={status === "submitting"}
            className="flex items-center gap-3 px-5 py-3.5 bg-foreground text-background rounded-2xl hover:bg-foreground/90 transition-colors disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 shrink-0" aria-hidden="true">
              <path d="M3.18 23.76c.3.16.65.18.97.06l12.52-6.45-2.72-2.72-10.77 9.11zm-1.4-20.8A1.5 1.5 0 001.5 4v16c0 .5.26.97.68 1.23l.08.05 8.97-9.26-8.97-9.06-.08.04zM20.46 10.5l-2.62-1.45-3.06 3.06 3.06 3.06 2.64-1.46c.75-.42.75-1.79-.02-2.21zM4.15.24L16.67 6.7l-2.72 2.72L3.18.31c.3-.13.67-.12.97-.07z" />
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-70">
                {status === "submitting" && submittingOption === "android"
                  ? "Joining…"
                  : "Early access on"}
              </div>
              <div className="font-heading font-semibold text-base leading-tight">Google Play</div>
            </div>
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {presentation.formFootnote}
        </p>
      </form>

      <ShareRow
        sourceCode={context.sourceCode}
        shareText={presentation.shareText}
        shareSubject={presentation.shareSubject}
        shareSlug={presentation.shareSlug}
      />
    </div>
  );
}
