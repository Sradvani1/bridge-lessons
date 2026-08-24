This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Live Duplicate Scoring

The Mitchell scorer uses Firebase Firestore and anonymous authentication so three tables can enter scores from separate phones.

1. Create a Firebase project and enable Firestore plus Anonymous Authentication.
2. Copy `.env.example` to `.env.local` and add the Firebase web-app values.
3. Deploy `firestore.rules` with the Firebase CLI before using the scorer in a game.
4. Add the same `NEXT_PUBLIC_FIREBASE_*` values to Vercel for production.

Without those values, `/play` shows a setup message and the lesson site continues to work normally.

### Security Rules Tests

Run `npm run test:rules` to start a disposable local Firestore emulator and verify table isolation, write validation, manual-score protection, reveal access, and atomic game-code creation. It uses the `demo-bridge` project ID and does not access a production Firebase project.

Run `npm run test:load` for a non-mutating production smoke test against `https://bridge-lessons.vercel.app`. Override the target with `BASE_URL=https://example.com npm run test:load`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
