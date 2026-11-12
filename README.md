# Beacon
## What is Beacon?
A career guidance web application that utilizes generative artificial intelligence to provide users with personalized visual roadmaps towards their viable career option based on their user profile information.
## TechStack
### Frontend
- NextJS
- D3
### Backend
- Django
- OpenAI API
- Langchain
- Netlify Blobs (user profiles and career graphs)
- Auth.js / NextAuth (Google sign-in)
### Deployment
- Vercel
- Github Actions
- GCP Compute Engine

## Local development
User data lives in Netlify Blobs, which only exists inside the Netlify runtime, so run the app through the Netlify CLI instead of `next dev`:

```sh
cp .env.example .env.local   # then fill in the values
npx netlify-cli dev          # serves on http://localhost:8888
```

`npm test` runs the unit tests.

## Environment variables
Set these in `.env.local` locally and under Site configuration > Environment variables on Netlify. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client. Authorized redirect URI: `<site URL>/api/auth/callback/google` |
| `NEXTAUTH_SECRET` | Signs session cookies. Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | The site's public URL, e.g. `https://your-site.netlify.app` |
| `NEXT_PUBLIC_BASE_BACKEND_URL` | Base URL of the career-generation backend |
