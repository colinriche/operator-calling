import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = {
  title: "Account Deletion",
  description:
    "How to request deletion of your Operator account and associated personal data.",
};

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
    body: "After 30 days, your account becomes eligible for permanent deletion and will be processed as soon as reasonably possible.",
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
          How to request deletion
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
            When your account is permanently deleted, your account and
            associated personal data will be deleted or anonymised.
          </p>
          <p>
            We may retain limited information where necessary for security,
            fraud or abuse prevention, legal or regulatory requirements, or the
            establishment, exercise or defence of legal claims. Any information
            retained for these purposes will no longer form part of an active
            Operator account.
          </p>
          <p>
            If your Operator app and website accounts are linked, the deletion
            request applies to both.
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
