import "./styles/style.css";
import { CalculatorApp } from "./classes/CalculatorApp";
import { InputHandler } from "./classes/InputHandler";
import { CalculatorEngine } from "./calculator/CalculatorEngine";
import { CalculatorUI } from "./ui/CalculatorUI";
import { ThemeManager } from "./themes/ThemeManager";

const root = document.querySelector<HTMLElement>(".app");
if (!root) throw new Error("Calculator root element (.app) not found");

const app = new CalculatorApp(
  new CalculatorEngine(),
  new CalculatorUI(root),
  new ThemeManager(),
  new InputHandler(root),
);

app.start();
