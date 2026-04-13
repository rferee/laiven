import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider, createTheme, type MantineColorsTuple } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './theme.css';

// ── Brand color scales (10 shades, lightest → darkest) ─────────────
// Index 6 is the "filled" default in Mantine dark mode.

const sunset: MantineColorsTuple = [
  '#fef4ee', '#fce3d1', '#f9c9a5', '#f5ae79',
  '#E89768', '#d48455', '#b06f46', '#8c5937',
  '#684328', '#442d1a',
];

const atlantis: MantineColorsTuple = [
  '#f0effe', '#dcd9fd', '#bbb4fb', '#9a8ff9',
  '#8880F0', '#7068d0', '#5b54ad', '#47418a',
  '#332f67', '#1f1d44',
];

const elven: MantineColorsTuple = [
  '#f2fbed', '#dff5d4', '#c4eba9', '#a9e17e',
  '#97d47d', '#7db866', '#659c50', '#4e7f3a',
  '#376224', '#20450e',
];

const dragon: MantineColorsTuple = [
  '#fef0f0', '#fcd5d5', '#f9abab', '#f58181',
  '#e56767', '#cc5252', '#a64040', '#802f2f',
  '#5a1f1f', '#340f0f',
];

const theme = createTheme({
  primaryColor: 'sunset',
  primaryShade: 4,

  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontFamilyMonospace: '"JetBrains Mono", ui-monospace, monospace',
  headings: {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  },

  defaultRadius: 0,

  colors: {
    // Brand palette
    sunset,
    atlantis,
    elven,
    dragon,

    // Override Mantine built-ins so existing color="red" / "green" / "blue"
    // / "orange" props automatically use the brand shades.
    red: dragon,
    green: elven,
    blue: atlantis,
    orange: sunset,

    // Dark background ramp (0 = lightest text → 9 = darkest bg)
    dark: [
      '#F1F1F1',  // 0  titles, bright text
      '#D3D3D3',  // 1  body text
      '#4f4f4f',  // 2  subtle borders
      '#3d4043',  // 3  button active / strong borders
      '#26282c',  // 4  button hover
      '#191c20',  // 5  button idle / input bg
      '#12161c',  // 6  card / sidebar bg
      '#0D1014',  // 7  body bg
      '#0a0c0f',  // 8  deepest
      '#070809',  // 9
    ],
  },

  // Force dark mode — this brand has no light variant.
  // (defaultColorScheme is set on MantineProvider, not here.)
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds — short enough to feel fresh
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always',
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <ModalsProvider>
          <Notifications position="top-right" />
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
