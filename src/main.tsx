import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import App from "./App";
import "./styles.css";
import { applyTheme, readTheme } from "./theme";
applyTheme(readTheme());
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
