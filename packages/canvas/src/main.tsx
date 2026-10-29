import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@xyflow/react/dist/style.css";
import "@/styles/global.css";

import App from "@/app";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
