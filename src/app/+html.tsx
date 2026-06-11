import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Global web document shell. Expo Router renders this only on web (static render
// + dev server). Anything here applies to every screen in the app.
const globalCss = `
/* Hide the blinking caret on static UI only — never block real text fields. */
body :not(input):not(textarea):not([contenteditable="true"]) {
  caret-color: transparent !important;
}

/* Real inputs must stay focusable and typable even with app-wide caret hiding. */
input,
textarea,
[contenteditable="true"] {
  pointer-events: auto !important;
  cursor: text !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  caret-color: transparent !important;
}

/* App chrome shouldn't feel like a selectable web page. */
html, body, #root { height: 100%; background-color: #0C0B10; }
body { overscroll-behavior: none; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
