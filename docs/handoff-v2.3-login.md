# v2.3 Handoff — Login Screen

**Status:** not started, blocked by v2.2 (responsive cycle).
**Release trigger:** functional login flow shipped + routes gated.

---

## Goal

Add an authentication layer in front of `/plates/*`. Today the
app is open — anyone landing on `/` is redirected straight to
the workspace. v2.3 introduces a `/login` route, a session
mechanism, and a route guard.

## Why this is a separate minor

Auth touches:
- Routing (new route, redirect logic)
- API client (auth header, 401 handling)
- Layout shell (avatar / sign-out UI? — design decision)
- Backend contract (login endpoint, session model)

Doing it inside the responsive cycle would mix two large concerns.

## Open questions to resolve before coding

1. **Backend.** Does `omix_tpd` backend already have an auth
   endpoint, or does this require backend work too?
   - If yes: which scheme? JWT bearer? Session cookie?
   - If no: this becomes a UI-only stub against a static
     credential, with backend hookup as v2.4.
2. **Identity providers.** Local email + password only, or
   OAuth (Google / GitHub / institutional SSO)?
3. **Persistence.** Session in `localStorage` (current `useTheme`
   pattern) or HTTP-only cookie?
4. **Multi-user data.** Does `/plates` data scope to a user, or
   is it shared? Affects whether login is real access control
   or just a gate.

Recommend a 15-minute clarification round with the user
before touching code.

## Component sketch

```
src/
  routes/
    LoginPage.tsx           ← new: email + password form
  components/
    RequireAuth.tsx         ← new: wraps protected routes
    AppShell.tsx            ← add user pill / sign-out (TBD)
  hooks/
    useAuth.ts              ← new: { user, signIn, signOut, isLoading }
  api/
    client.ts               ← add Authorization header injection
                              + 401 -> redirect to /login
  router.tsx                ← wrap /plates/* in RequireAuth,
                              add /login route
```

## Design hints (carry forward from current style)

- Page chrome consistent with workspace: dark surface, brand
  gradient TPD logo, typography from tokens.css.
- Form panel: `panel-card` styling, max-w-md centered.
- Inputs: match the current search/filter input styling on the
  drug summary page (border-line, focus:border-brand-primary).
- Submit button: `btn btn--primary` already defined.
- Failure state: inline error text in `text-status-error`.
- Loading state during sign-in: same `btn` disabled + spinner
  pattern as switch-community mutation.

## Route behavior

- Unauthenticated request to `/plates/*` → redirect `/login?from=...`
- Successful sign-in → redirect to `from` or `/plates`.
- Sign-out → clear session, redirect `/login`.
- Logged-in user hitting `/login` directly → redirect `/plates`.

## Out of scope for v2.3

- Sign-up flow (defer; admins create accounts).
- Password reset / 2FA (later minor).
- Permission tiers (admin vs viewer) (later minor).
- Org / workspace switching UI.

## Release checklist

- [ ] `/login` renders, accepts credentials, validates form.
- [ ] Successful login persists session, lands on `/plates`.
- [ ] All `/plates/*` routes blocked when signed out.
- [ ] 401 from API auto-redirects to `/login`.
- [ ] Sign-out clears session + redirects.
- [ ] Theme persists across sign-in/out (orthogonal to auth).
- [ ] Bump 2.3.0-dev → 2.3.0, annotated tag, push.
