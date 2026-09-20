# Staying signed in

Remember uses Clerk's persistent session. The application does not create a second login cookie, store bearer tokens on disk, or bypass an expired/revoked session.

## One-time Clerk setting

In **Clerk Dashboard → your Remember application → Sessions**:

1. Set **Maximum lifetime** to **90 days**.
2. Leave **Inactivity timeout** disabled, so closing the app does not impose a shorter deadline.
3. Save the settings for the instance you actually deploy (development and production are separate).

Clerk currently requires a paid plan to customize maximum lifetime in production. The default for a new instance is 7 days; custom settings can be tried in development. If your plan does not permit the change, the app cannot override it by changing its cookie. Both lifetime controls cannot be disabled simultaneously. Browser cookie deletion, incognito mode, and session revocation can still require sign-in earlier.

Source: [Clerk session options](https://clerk.com/docs/guides/secure/session-options), checked 20 September 2026.

The dashboard was signed out during this change, so **these account settings have not been applied**. No subscription was changed.

## What the app does automatically

- Waits for Clerk's initial session restoration instead of prematurely showing a signed-out screen.
- Uses Clerk's refreshed token in memory for authenticated requests.
- Retries an unauthorized request once with a freshly requested token; other failures are not replayed.
- Checks the session when the app returns to the foreground or reconnects.
- Opens the capture editor ready to type, supports Ctrl/Cmd+Enter to save, and focuses the editor again after saving.
- Starts the installed PWA at Capture, with an Add a memory app shortcut where supported.

Enable trusted-device storage once on your personal device to keep drafts and queued memories through offline use. This remains an explicit choice because it stores plaintext locally. A browser can still evict local data; server acknowledgement remains the sync guarantee.
