# Snip frontend

Angular 19 client for the Snip URL shortener. The backend API runs at
`http://localhost:3000`.

## Run locally

Start the backend in another terminal, then run:

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. Create a short link and see it in the links table.

## Build and test

```bash
npx ng build
npx ng test --watch=false
```

The production browser app is generated at
`dist/snip-frontend/browser/`, which is consumed by the release bundle.
