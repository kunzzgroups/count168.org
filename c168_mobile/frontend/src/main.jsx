import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import DevPhoneFrame from "./components/dev/DevPhoneFrame.jsx";
import "./styles/tokens.css";
import "./styles/login.css";
import "./index.css";

const routerBasename = import.meta.env.PROD ? "/c168_mobile" : undefined;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <DevPhoneFrame>
        <App />
      </DevPhoneFrame>
    </BrowserRouter>
  </React.StrictMode>,
);