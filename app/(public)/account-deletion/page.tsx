import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = {
  title: "Account Deletion",
  description:
    "How to request deletion of your Operator account and associated personal data.",
};

const appSteps = [
  {
    title: "Open Settings in the app",
    body: "Go to Settings → Account → Delete account and confirm.",
  },
  {
    title: "Your account is switched off",
    body: "You cannot make or receive calls and other people see you as unavailable. You have 30 days to change your mind: sign in and choose Cancel deletion.",
  },
  {
    title: "Automatic deletion",
    body: "When the 30 days end your account is deleted automatically. You do not need to do anything else.",
  },
];

const steps = [
  {
    title: "Sign in and open your profile",
    body: "Go to Dashboard → Profile and scroll to Delete account.",
  },
  {
    title: "Request account deletion",
    body: "Select Delete my account and confirm your request.",
  },
  {
    title: "30-day recovery period",
    body: "Your account enters a 30-day deletion-pending period. During this time, you can sign in and select Restore my account to cancel the request.",
  },
  {
    title: "Permanent deletion",
    body: "After 30 days the account is deleted. For requests made in the app this happens automatically; for requests made here or by email our team carries it out as soon as reasonably possible.",
  },
];

export default function AccountDeletionPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="mb-12">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Account Deletion
        </h1>
        <p className="text-xl text-muted-foreground">
          You can request deletion of your Operator account and associated
          personal data at any time.
        </p>
      </AnimatedSection>

      <AnimatedSection className="mb-12">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          How to request deletion in the app
        </h2>
        <ol className="space-y-4 mb-12">
          {appSteps.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-4 bg-card rounded-2xl border border-border/60 p-5"
            >
              <span className="w-8 h-8 shrink-0 rounded-full gradient-gold flex items-center justify-center text-sm font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <h3 className="font-heading font-semibold text-foreground mb-1">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          How to request deletion on this website
        </h2>
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-4 bg-card rounded-2xl border border-border/60 p-5"
            >
              <span className="w-8 h-8 shrink-0 rounded-full gradient-gold flex items-center justify-center text-sm font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <h3 className="font-heading font-semibold text-foreground mb-1">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </AnimatedSection>

      <AnimatedSection className="mb-12">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          What happens to your data
        </h2>
        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            When your account is permanently deleted, we remove your profile,
            photo, contacts and invitations, notifications and call-back
            requests, and the sign-ins linked to the account. Calls you took
            part in stay in the other person&apos;s call history, with your name
            replaced by &ldquo;Deleted user&rdquo;.
          </p>
          <p>
            We keep records of reports, blocks and actions taken by our team
            where we need them to keep people safe and to meet legal
            obligations. They can include the name and user ID you used, are
            visible only to our team, and are kept for as long as that need
            lasts.
          </p>
          <p>
            We may retain limited information where necessary for security,
            fraud or abuse prevention, legal or regulatory requirements, or the
            establishment, exercise or defence of legal claims. Any information
            retained for these purposes will no longer form part of an active
            Operator account.
          </p>
          <p>
            A request made in the app also removes the website sign-in linked to
            it. Waitlist entries and messages you sent through the contact form
            are not part of your account: email{" "}
            <a
              href="mailto:privacy@operatorcalling.com"
              className="text-primary underline underline-offset-4"
            >
              privacy@operatorcalling.com
            </a>{" "}
            and we will delete them.
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection>
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          Can&apos;t sign in?
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Email{" "}
          <a
            href="mailto:privacy@operatorcalling.com"
            className="text-primary underline underline-offset-4"
          >
            privacy@operatorcalling.com
          </a>{" "}
          from the email address associated with your account and we&apos;ll
          help you request deletion.
        </p>
      </AnimatedSection>
    </div>
  );
}
