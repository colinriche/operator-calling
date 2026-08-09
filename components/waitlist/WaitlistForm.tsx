"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2 } from "lucide-react";
import { ShareRow } from "@/components/waitlist/ShareRow";
import { ManageLink } from "@/components/waitlist/ManageLink";
import { TimezoneField } from "@/components/waitlist/TimezoneField";
import {
  organiserCheckboxLabel,
  TESTER_CAVEAT,
  TESTER_EXPLANATION,
  TESTER_HEADLINE,
  TESTER_LOGIN_REASON,
  TESTER_PREVIEW_BODY,
  TESTER_PREVIEW_HEADLINE,
} from "@/lib/waitlist/copy";
import { SCHEDULE_ZONE } from "@/lib/waitlist/timezone";
import type { TimezoneSource } from "@/lib/waitlist/constants";
import {
  LANGUAGES,
  OTHER_COUNTRIES,
  PRIORITY_COUNTRIES,
} from "@/lib/waitlist/locales";
import type { WaitlistContext } from "@/lib/waitlist/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistFormProps {
  context: WaitlistContext;
  /** Admin preview — renders normally but records nothing. */
  isPreview: boolean;
}

export function WaitlistForm({ context, isPreview }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [englishFirst, setEnglishFirst] = useState(true);
  const [firstLanguage, setFirstLanguage] = useState("");
  const [organising, setOrganising] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [timezone, setTimezone] = useState(SCHEDULE_ZONE);
  const [timezoneSource, setTimezoneSource] =
    useState<TimezoneSource>("detected");

  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
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

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!country) {
      next.country = "Select your country.";
    }
    if (!englishFirst && !firstLanguage) {
      next.firstLanguage = "Select your first language.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    if (isPreview) {
      setFormError("Preview mode — this form does not submit.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          interestedInOrganising: organising,
          country,
          englishFirstLanguage: englishFirst,
          firstLanguage: englishFirst ? null : firstLanguage,
          sourceCode: context.sourceCode,
          shareChannel: context.shareChannel,
          landingPage: window.location.pathname + window.location.search,
          referrer: document.referrer,
          website: honeypot,
          timezone,
          timezoneSource,
        }),
      });

      const data = (await res.json()) as { error?: string; manageToken?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setConfirmedOrganising(organising);
      setManageToken(data.manageToken ?? "");
      // Saved so the manage link survives a closed tab before email exists to
      // deliver it. Best-effort — private browsing may refuse.
      if (data.manageToken) {
        try {
          window.localStorage.setItem("operator_waitlist_token", data.manageToken);
        } catch {
          /* storage unavailable — the link is still on screen */
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
            We&apos;ll keep your interest linked to{" "}
            <strong className="text-foreground">{context.audienceLabel}</strong>. If
            enough people are interested and a calling group is created, we can let
            you know.
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
              Early access sign-up is briefly unavailable — your interest above is
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
              account. Keep it private — anyone with it can change your settings.
            </p>
            <ManageLink token={manageToken} />
          </div>
        )}

        <ShareRow
          sourceCode={context.sourceCode}
          audienceLabel={context.audienceLabel}
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
            Register your interest
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Register your interest in talking with people interested in{" "}
            <strong className="text-foreground">{context.audienceLabel}</strong>.
          </p>
        </div>

        {isPreview && (
          <p className="text-xs bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-foreground">
            Admin preview — visits and registrations are not recorded.
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
            {organiserCheckboxLabel(!!context.groupId)}
          </span>
        </label>

        {/* A heads-up, not a field. Early Access is an optional second step
            after joining — nothing here is part of this submission, which is
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

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full h-12 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Joining…
            </>
          ) : (
            "Join the waitlist"
          )}
        </button>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Joining records your interest. We may email you about this Operator
          calling group. The website or group where you found this link does not
          receive your details. When enough people register, an Operator calling
          group may be created for this interest.
        </p>
      </form>

      <ShareRow
        sourceCode={context.sourceCode}
        audienceLabel={context.audienceLabel}
      />
    </div>
  );
}
