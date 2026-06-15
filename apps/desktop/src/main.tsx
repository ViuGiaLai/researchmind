import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/daily-reader.css";
import "./styles/cite-panel.css";
import "./styles/debate.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
