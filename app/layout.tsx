import React from 'react';
import './globals.css';
import { DataProvider } from './context/DataContext';

export const metadata = {
  title: 'SEBSA Employee Management Portal',
  description: 'SEBSA employee management portal: CV generation and knowledge assessments.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#fbf9fb] min-h-screen">
        <DataProvider>
          {children}
        </DataProvider>
      </body>
    </html>
  );
}
