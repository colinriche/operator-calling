import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { Shield, EyeOff, Lock, UserX } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy & safety",
  description:
    "How The Operator handles your information: what we collect, why, who helps us run the service, how long we keep it, and how to delete your account.",
};

const LAST_UPDATED = "6 October 2026";
const PRIVACY_EMAIL = "privacy@operatorcalling.com";

const principles = [
  {
    icon: Shield,
    title: "We don't sell your data",
    desc: "We never sell or rent your personal information, and we don't share it with advertisers.",
  },
  {
    icon: EyeOff,
    title: "We don't record your calls",
    desc: "The Operator does not currently record or store the audio of your calls. Audio passes between callers while the call is happening and is not kept.",
  },
  {
    icon: Lock,
    title: "Groups are controlled spaces",
    desc: "Group admins control who joins their group and the calls it runs. Private groups are invitation-only.",
  },
  {
    icon: UserX,
    title: "Flag and report",
    desc: "You can flag a call, and report or block another person. Reports are reviewed by our team, who can warn, suspend or remove accounts that break the rules.",
  },
];

// The policy itself. Plain text and lists only, so it reads as short sections
// rather than a wall of small print.
const sections: {
  id: string;
  title: string;
  body: React.ReactNode;
}[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        The Operator, in the app and on this website, is run by Mainstream
        Movement Ltd, a company registered in England &amp; Wales (no.
        09098347). We decide how and why your information is used. Questions
        about any of this: <EmailLink />.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p>
          In the app, depending on what you use and what you choose to give us:
        </p>
        <ul>
          <li>
            <strong>Your phone number</strong>, which you use to sign in to the
            app.
          </li>
          <li>
            <strong>Your name or username, a photo and other profile details</strong>,
            including your first name, email address, city, country and
            interests, where you choose to supply them. These are optional.
          </li>
          <li>
            <strong>Account and device identifiers</strong>: an internal user
            ID, and the identifiers Firebase and your phone use to deliver
            notifications and incoming calls.
          </li>
          <li>
            <strong>Your contacts</strong>, but only if you give the app contact
            access to invite people. They are read on your phone, and only the
            phone numbers you choose to invite are sent to us. Declining
            contact access does not stop you using the app.
          </li>
          <li>
            <strong>Call history and connection details</strong>: who a call was
            with, when it started and ended, how long it lasted, how it ended,
            and technical measures of call quality such as delay and packet
            loss.
          </li>
          <li>
            <strong>Groups, invitations, preferences and availability</strong>,
            including the time zone you use.
          </li>
          <li>
            <strong>Reports and blocks</strong>: reports you make about other
            people or calls, any details you write in them, and the people you
            block.
          </li>
          <li>
            <strong>Moderation records</strong>: if you are reported, the report
            and any action we take, such as a warning, suspension or ban, with
            the reason and which team member took it.
          </li>
          <li>
            <strong>Crash logs and diagnostics</strong>, such as device model,
            operating system, app version and your IP address, so we can find
            and fix problems.
          </li>
        </ul>
        <p>On this website:</p>
        <ul>
          <li>
            <strong>Waitlist and early-access sign-ups</strong>: your email
            address and country, and, if you give them, your name, first
            language, time zone, how you found us, and whether you would like
            to help organise calls or have the app on iPhone or Android.
          </li>
          <li>
            <strong>Website accounts</strong>, if you sign in with email,
            Apple, Google or a phone number, and the profile and settings you
            save. If you use Apple&apos;s &ldquo;Hide My Email&rdquo;, we receive
            Apple&apos;s private relay address instead of your real one.
          </li>
          <li>
            <strong>Messages you send us</strong> through the contact form: your
            name, email address and message.
          </li>
          <li>
            <strong>Visits to sign-up links we share</strong>, recorded so we
            can tell which links work. We keep a scrambled (hashed) form of
            your IP address for this and for spam protection, not the address
            itself.
          </li>
        </ul>
        <p>
          The website does not currently use advertising or analytics trackers.
          It uses a small cookie to remember that you are signed in.
        </p>
      </>
    ),
  },
  {
    id: "audio",
    title: "Calls and audio",
    body: (
      <>
        <p>
          <strong>
            The Operator does not currently record or store the audio content of
            calls.
          </strong>{" "}
          During a call, audio is sent between the people on it, through
          servers we run to connect them, and is not saved. Call audio is
          encrypted by the standard encryption built into the calling
          technology (WebRTC).
        </p>
        <p>
          We keep a record that a call happened and basic details about it (see
          above), but not what was said.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use your information",
    body: (
      <ul>
        <li>To create and run your account, and sign you in.</li>
        <li>To connect you with other people, including pairing within groups.</li>
        <li>To run groups, invitations and schedules.</li>
        <li>
          To invite people you chose from your contacts, only if you use that
          feature.
        </li>
        <li>
          For safety: blocking, flagging, reports, and acting on accounts that
          break the rules. A person you have blocked or reported cannot call
          you, and you cannot call them.
        </li>
        <li>To run, troubleshoot and improve the service, including crash diagnostics.</li>
        <li>
          To contact you about the service: sign-up confirmations, group and
          account notices, and replies to your messages.
        </li>
      </ul>
    ),
  },
  {
    id: "others",
    title: "What other people see",
    body: (
      <>
        <p>
          When you call someone, or someone calls you, the other person sees the
          name and username on your profile. If you have not set a username,
          they may see your phone number instead, so it is worth setting one.
          Other group members can see what the group makes visible, such as
          member names.
        </p>
        <p>
          If a person you spoke to later deletes their account, the call stays
          in your call history, but their name is replaced with &ldquo;Deleted
          user&rdquo;. The same applies to you in their history if you delete
          yours.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing and service providers",
    body: (
      <>
        <p>
          <strong>
            We do not sell or rent personal information, and we do not share it
            with advertisers.
          </strong>
        </p>
        <p>
          We use service providers to run the service, and they process
          information for us under our instructions:
        </p>
        <ul>
          <li>
            <strong>Google / Firebase</strong>: sign-in, our database, file
            storage (such as profile photos) and push notifications. Google
            reCAPTCHA helps protect phone sign-in from abuse, and Google
            provides public servers that help phones find each other for calls.
          </li>
          <li>
            <strong>Apple</strong>: if you sign in to the website with Apple,
            Apple confirms who you are and may give us a private relay email
            address.
          </li>
          <li>
            <strong>Sentry</strong>: receives crash reports and diagnostics from
            the app.
          </li>
          <li>
            <strong>Hosting and infrastructure providers</strong>: host this
            website (Vercel) and the servers that connect calls.
          </li>
          <li>
            <strong>Email delivery</strong>: when we send service emails, they
            go through an email delivery provider and carry your email address
            and the message.
          </li>
        </ul>
        <p>
          We may also disclose information where the law requires it, or to
          protect people&apos;s safety, or to respond to legal claims.
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "Where information is processed",
    body: (
      <p>
        The Operator is a global service. Your information may be processed in
        countries other than your own, including by the providers above. Where
        the law requires it, we use appropriate safeguards for those transfers.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <ul>
          <li>
            Your account information, call history and group activity are kept
            while your account is open.
          </li>
          <li>
            If you ask us to delete your account, it enters a 30-day recovery
            period during which you can cancel the request. When the 30 days
            end, the account is deleted: automatically for requests made in
            the app, and by our team for requests made on this website or by
            email. What is deleted, and what is kept, is described below.
          </li>
          <li>
            We may keep limited information where necessary for security, fraud
            or abuse prevention, legal or regulatory requirements, dispute
            resolution, or to establish, exercise or defend legal claims. It
            no longer forms part of an active account.
          </li>
          <li>
            Crash reports are held by Sentry, and messages you send us are kept
            while we deal with them. Waitlist details are kept until you ask us
            to delete them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "deletion",
    title: "Deleting your account and data",
    body: (
      <>
        <p>
          You can ask us to delete your account and the personal data that goes
          with it at any time. The steps are on our{" "}
          <Link
            href="/account-deletion"
            className="text-primary underline underline-offset-4"
          >
            Account Deletion page
          </Link>
          , which you can read without signing in. If you cannot sign in, or you
          only joined the waitlist, email <EmailLink />.
        </p>
        <p>
          Deletion applies to the whole account. We do not currently offer a way
          to delete individual kinds of data while keeping your account open;
          you can edit or remove the profile details you added yourself in the
          app and on this website.
        </p>
        <p>
          <strong>While the request is pending</strong> your account is switched
          off: you cannot make or receive calls, and other people see you as
          unavailable. You can cancel at any time before the 30 days end.
        </p>
        <p>
          <strong>When it is deleted</strong>, we remove your profile, photo,
          contacts and invitations, notifications, call-back requests and the
          sign-ins linked to the account. Calls you took part in stay in the
          other person&apos;s history with your name replaced by &ldquo;Deleted
          user&rdquo;.
        </p>
        <p>
          <strong>What we keep</strong>: records of reports, blocks and actions
          taken by our team, because we need them to keep people safe and to
          meet legal obligations. They can include the name and user ID you
          used, are visible only to our team, and are kept for as long as that
          need lasts. If the law or a legal claim requires it, we may also place
          a hold on a deletion until that is resolved.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We take reasonable steps to protect your information. Data sent to
        Firebase, to this website and, in current versions of the app, to the
        servers that set up and connect calls is encrypted in transit with TLS,
        and call audio uses WebRTC encryption. Access to our admin tools is limited to
        authorised staff. No service can promise perfect security, so please
        tell us straight away if you think your account has been misused.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        The Operator is for people aged 18 and over. It is not intended for
        children, and we do not knowingly collect information from anyone under
        18. If you believe a child has given us information, email <EmailLink />{" "}
        and we will delete it.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights and contact",
    body: (
      <>
        <p>
          You can contact us about access to your information, correcting it,
          deleting your account, privacy questions, and any other rights you
          have under the data-protection laws that apply to you. Email{" "}
          <EmailLink />. If you are not happy with our answer, you can also
          complain to your local data-protection authority.
        </p>
      </>
    ),
  },
  {
    id: "updates",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service changes. The date at the top
        shows when it last changed, and we will make clear any significant
        changes.
      </p>
    ),
  },
];

function EmailLink() {
  return (
    <a
      href={`mailto:${PRIVACY_EMAIL}`}
      className="text-primary underline underline-offset-4"
    >
      {PRIVACY_EMAIL}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <AnimatedSection className="text-center mb-20">
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          Privacy-first. Always.
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          The Operator is built on the principle that your conversations are yours.
          We&apos;re here to connect you - not to monetise you.
        </p>
        <p className="text-sm text-muted-foreground mt-6">
          Privacy policy &middot; Last updated {LAST_UPDATED}
        </p>
      </AnimatedSection>

      <div className="grid sm:grid-cols-2 gap-6 mb-16">
        {principles.map((p, i) => (
          <AnimatedSection key={p.title} delay={i * 0.1}>
            <div className="bg-card rounded-2xl p-6 border border-border/60 h-full">
              <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <h2 className="font-heading font-semibold text-lg text-foreground mb-2">{p.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          </AnimatedSection>
        ))}
      </div>

      <AnimatedSection className="mb-16">
        <div className="bg-foreground text-background rounded-3xl p-8 sm:p-10">
          <h2 className="font-heading font-bold text-2xl mb-4">Safety controls</h2>
          <ul className="space-y-3">
            {[
              "Group admins control membership and the calls their group runs",
              "Contact access is your choice - the app works without it",
              "Flag a call or report someone, and our team reviews it",
              "We can suspend or remove accounts that break the rules",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-background/80 text-sm leading-relaxed">
                <span className="text-primary mt-0.5 font-bold">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </AnimatedSection>

      <AnimatedSection className="mb-8">
        <h2 className="font-heading font-bold text-3xl text-foreground mb-3">
          The full policy
        </h2>
        <p className="text-muted-foreground">
          This is the privacy policy for The Operator app and website. In short:
          we collect what we need to run calls, groups and accounts, we don&apos;t
          record calls, and we never sell your information.
        </p>
      </AnimatedSection>

      <div className="space-y-4">
        {sections.map((section) => (
          <AnimatedSection key={section.id}>
            <section
              id={section.id}
              className="bg-card rounded-2xl border border-border/60 p-6 sm:p-8 scroll-mt-24"
            >
              <h3 className="font-heading font-semibold text-xl text-foreground mb-3">
                {section.title}
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_strong]:text-foreground [&_strong]:font-medium">
                {section.body}
              </div>
            </section>
          </AnimatedSection>
        ))}
      </div>
    </div>
  );
}
