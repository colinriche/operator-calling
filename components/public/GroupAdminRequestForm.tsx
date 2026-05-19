"use client";

import { useState } from "react";
import { Plus, X, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GroupAdminRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [isGlobal, setIsGlobal] = useState(true);
  const [location, setLocation] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [emailError, setEmailError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function addEmail() {
    const val = memberInput.trim().toLowerCase();
    if (!EMAIL_RE.test(val)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (memberEmails.includes(val)) {
      setEmailError("Already in the list.");
      return;
    }
    setMemberEmails((prev) => [...prev, val]);
    setMemberInput("");
    setEmailError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/group-admin-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName: name.trim(),
          requesterEmail: email.trim().toLowerCase(),
          groupName: groupName.trim(),
          description: description.trim(),
          location: isGlobal ? "global" : location.trim(),
          memberEmails,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("success");
    } catch (err) {
      console.error(err);
      setErrorMsg("Something went wrong. Please try again or email us directly.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-card rounded-2xl border border-border/60 p-10 text-center">
        <CheckCircle className="w-14 h-14 text-primary mx-auto mb-4" />
        <h3 className="font-heading font-bold text-2xl text-foreground mb-2">Request received!</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          We&apos;ll review your application and be in touch at{" "}
          <strong className="text-foreground">{email}</strong> within a few working days.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border/60 p-8 space-y-8">
      {/* Your details */}
      <div>
        <h3 className="font-heading font-semibold text-base text-foreground mb-4">Your details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Full name <span className="text-primary">*</span>
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Email address <span className="text-primary">*</span>
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Group details */}
      <div>
        <h3 className="font-heading font-semibold text-base text-foreground mb-4">Your group</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Group name <span className="text-primary">*</span>
            </label>
            <input
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Friday Runners, Remote Dev Team, Book Circle"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              What is the group for? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Tell us about your group — who's in it and what you'd use The Operator for."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Group reach</label>
            <div className="flex gap-3 mb-3">
              {(["Global / online", "Specific location"] as const).map((opt, i) => {
                const active = i === 0 ? isGlobal : !isGlobal;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setIsGlobal(i === 0)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {!isGlobal && (
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Manchester, UK — or just 'UK'"
                className={inputClass}
              />
            )}
          </div>
        </div>
      </div>

      {/* Member emails */}
      <div>
        <h3 className="font-heading font-semibold text-base text-foreground mb-1">Member emails</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add the email addresses of everyone who&apos;ll be in your group. These are needed to give them access to the beta app before they download it.
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="email"
            value={memberInput}
            onChange={(e) => { setMemberInput(e.target.value); setEmailError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
            placeholder="member@example.com"
            className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={addEmail}
            className="h-10 px-4 rounded-lg gradient-gold border-0 text-primary-foreground font-medium text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}

        {memberEmails.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {memberEmails.map((addr) => (
              <span
                key={addr}
                className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-foreground font-medium"
              >
                {addr}
                <button
                  type="button"
                  onClick={() => setMemberEmails((prev) => prev.filter((e) => e !== addr))}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors"
                  aria-label={`Remove ${addr}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {memberEmails.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {memberEmails.length} member{memberEmails.length !== 1 ? "s" : ""} added
          </p>
        )}
      </div>

      {status === "error" && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full h-12 rounded-xl gradient-gold border-0 text-primary-foreground font-heading font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending request…
          </>
        ) : (
          "Submit group request"
        )}
      </button>

      <p className="text-xs text-center text-muted-foreground">
        We&apos;ll review your application and respond within a few working days.
      </p>
    </form>
  );
}
