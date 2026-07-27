import { bootstrapDesignSystem, defineLabElements } from "./app/register.js";
import { mountApp } from "./app/shell.js";
import "./styles.css";

bootstrapDesignSystem();
defineLabElements();

const host = document.querySelector("#app");
if (!(host instanceof HTMLElement)) {
  throw new Error("#app root element is missing.");
}

mountApp(host);
