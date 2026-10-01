"use client";

import { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import type { ContactErrors } from "@/lib/contact";

const inputClass =
  "w-full px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<ContactErrors>({});
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website: honeypot }),
      });
      const data = (await res.json()) as { error?: string; fields?: ContactErrors };
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        setFormError(data.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setFormError("Could not send your message. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-8 text-center">
        <CheckCircle className="w-10 h-10 text-primary mx-auto mb-3" aria-hidden="true" />
        <h3 className="font-heading font-semibold text-lg text-foreground mb-1">
          Message sent
        </h3>
        <p className="text-sm text-muted-foreground">
          Thanks - we&apos;ll reply to the email address you gave.
        </p>
      </div>
    );
  }

  const errorClass = "text-xs text-destructive mt-1.5";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="bg-card rounded-2xl border border-border/60 p-6 sm:p-8 space-y-5 text-left"
    >
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-foreground mb-1.5">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          className={`${inputClass} h-11`}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-foreground mb-1.5">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          placeholder="you@example.com"
          className={`${inputClass} h-11`}
        />
        {errors.email && <p className={errorClass}>{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-foreground mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={6}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={!!errors.message}
          className={`${inputClass} py-2.5 resize-y`}
        />
        {errors.message && <p className={errorClass}>{errors.message}</p>}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full h-12 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {status === "sending" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          "Send message"
        )}
      </button>
    </form>
  );
}
