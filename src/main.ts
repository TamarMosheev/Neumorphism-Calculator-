import "./styles/style.css";
import { CalculatorApp } from "./classes/CalculatorApp";
import { InputHandler } from "./classes/InputHandler";
import { CalculatorEngine } from "./calculator/CalculatorEngine";
import { ProCalculator } from "./calculator/pro/ProCalculator";
import { CalculatorModeSetting } from "./settings/CalculatorModeSetting";
import { UserPreferences } from "./settings/UserPreferences";
import { CalculatorUI } from "./ui/CalculatorUI";
import { ThemeManager } from "./themes/ThemeManager";

const root = document.querySelector<HTMLElement>(".app");
if (!root) throw new Error("Calculator root element (.app) not found");

const preferences = new UserPreferences();

const app = new CalculatorApp(
  new CalculatorEngine(),
  new CalculatorUI(root),
  new ThemeManager(document.body, preferences.savedAppearance()),
  new InputHandler(root),
  new CalculatorModeSetting(preferences.savedCalculatorMode()),
  new ProCalculator(),
  preferences,
);

app.start();
