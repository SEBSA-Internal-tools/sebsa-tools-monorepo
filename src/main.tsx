import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { AppProviders } from "./app/providers";
import './styles/index.css'

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root was not found in index.html");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
