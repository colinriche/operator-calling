import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";

export const metadata: Metadata = {
  title: "Account Deletion",
  description: "How to delete your Operator account, what is removed, and what is kept.",
};

const steps = [
  {
    title: "Sign in and open your profile",
    body: "Go to Dashboard, then Profile, and scroll to the Delete account box at the bottom.",
  },
  {
    title: "Choose how to ask",
    body: "Press Delete my account to request deletion, or Request Permanent Deletion to ask for your data to be permanently erased. Either way you are asked for a reason and to confirm.",
  },
  {
    title: "Your account stays active for 30 days",
    body: "Nothing is removed straight away. For 30 days you can still sign in, and a Restore my account button on the same page cancels the request.",
  },
  {
    title: "After 30 days, it can be permanently deleted",
    body: "Once the 30 days are up, the account becomes eligible for permanent deletion, which our super admin carries out by hand. It is never done automatically.",
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
          You can ask us to delete your Operator account at any time. This page
          explains how, what is removed, and what we may keep.
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
        <p className="text-sm text-muted-foreground leading-relaxed mt-5">
          Cannot sign in? Email{" "}
          <a
            href="mailto:hello@theoperator.app"
            className="text-primary underline underline-offset-4"
          >
            hello@theoperator.app
          </a>{" "}
          from the address on your account and we will help.{" "}
          <Link href="/login" className="text-primary underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </AnimatedSection>

      <AnimatedSection className="mb-12">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          What is deleted
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
          <li>Your sign-in account and your profile.</li>
          <li>
            Your place in other people&apos;s contact, favourite and ignored
            lists, and your group memberships.
          </li>
          <li>Your notification and device tokens.</li>
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed mt-4">
          If your website account is linked to your app account, both are
          deleted together.
        </p>
      </AnimatedSection>

      <AnimatedSection className="mb-12">
        <h2 className="font-heading font-bold text-2xl text-foreground mb-5">
          What may be kept, and for how long
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
          <li>
            A record of your deletion request: the date, your reason, and your
            account identifier, so we can show the request was handled.
          </li>
          <li>
            Certain data may be retained for longer when required by law.
            Anything we are not required to keep is deleted.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed mt-4">
          Questions about a specific piece of data? Email{" "}
          <a
            href="mailto:hello@theoperator.app"
            className="text-primary underline underline-offset-4"
          >
            hello@theoperator.app
          </a>
          .
        </p>
      </AnimatedSection>

      <AnimatedSection>
        <p className="text-sm text-muted-foreground">
          More on how we treat your data:{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-4">
            Privacy &amp; safety
          </Link>
          .
        </p>
      </AnimatedSection>
    </div>
  );
}
