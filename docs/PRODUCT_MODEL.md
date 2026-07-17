# ResearchMind local-first product model

## Product decision

ResearchMind Desktop is a personal research workspace. A user's papers, chat history, vectors, settings and local database live on that user's device by default. The application does not upload or share this research data merely because an account exists.

## Account policy

- A local build allows **guest mode**. Users can open and use ResearchMind without creating an account.
- Google or email/password sign-in is optional in local mode. It provides an identity, password recovery and future access to optional hosted services.
- A hosted deployment can require sign-in by setting `VITE_AUTH_REQUIRED=true` and `VITE_BACKEND_AUTH_REQUIRED=true`.
- An account is not a data-sync feature. There is no implied cross-device sync or shared library.

## Data boundaries

| Data | Default location | Shared automatically? |
| --- | --- | --- |
| PDFs, notes, chats, vectors and SQLite | User's local ResearchMind data directory | No |
| Firebase identity profile | Firebase Authentication / Firestore profile document when hosted auth is enabled | No research data |
| User-provided AI keys | Local application configuration | No |

## Future changes require an explicit product decision

Before adding cloud sync, team workspaces, shared libraries or hosted research storage, implement per-user data isolation, encryption, quotas, deletion controls and a privacy policy. Do not silently migrate local research data to a server.
