import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Google sign-in uses signInWithPopup (components/auth/LoginTabs.tsx,
          // components/shared/AuthForm.tsx). Firebase polls `window.closed` on
          // the popup to notice the user dismissing it; under a stricter COOP
          // the browser severs that handle and logs
          //
          //   Cross-Origin-Opener-Policy policy would block the window.closed call
          //
          // `same-origin-allow-popups` keeps cross-origin pages from grabbing a
          // handle on ours while still letting popups we open keep their opener
          // reference — which is the combination the popup flow needs.
          //
          // This is the documented fix for that warning and nothing more. It has
          // no bearing on phone auth: the reCAPTCHA Enterprise → v2 fallback is
          // a browser-to-Google exchange that never passes through our headers.
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
