# Neumorphism Calculator

A calculator with a soft **neumorphic** interface, built with TypeScript, HTML and CSS. It has a light **NORMAL MODE** and a dark **PRO MODE** theme, and its calculation logic is kept separate from the user interface and covered by automated tests.

## Features

**Interface**
- Neumorphic design: raised round keys, a recessed display and soft shadows.
- Light theme (NORMAL MODE) and dark theme (PRO MODE), switched with a toggle above the calculator, with smooth transitions between them.
- The display shrinks its font automatically so long values stay fully visible, and refits when the window is resized.
- Responsive layout; the keypad fits viewports about 272&nbsp;px wide and up.

**Calculation**
- Digit entry (0-9) and a decimal point. Each number is limited to 15 digits, and trailing zeros are kept while typing (`2.00`).
- Addition, subtraction, multiplication and division.
- Operations are evaluated **left to right**, without operator precedence: `2 + 3 × 4 = 20`.
- `=` shows the result. Pressing an operator afterwards continues from that result, and typing a digit starts a new calculation.
- `AC` resets everything. `+/-` changes the sign of the current number.
- `%` works on the number being entered:

  | Keys | Result |
  |---|---|
  | `50 %` | `0.5` |
  | `200 + 10 % =` | `220` |
  | `200 - 10 % =` | `180` |
  | `200 × 10 % =` | `20` |
  | `200 ÷ 10 % =` | `2000` |

- Division by zero (or overflow) shows `Error`; the next digit or `AC` recovers.
- Numeric precision: values are kept at full precision internally and rounded only for display (15 significant digits), so `0.1 + 0.2 = 0.3` and `1 ÷ 3 × 3 = 1`. Integers are shown exactly up to 2^53; larger results use exponent notation (for example `9.999999998e+19`) instead of looking exact.

## Technologies

- **TypeScript** with strict type checking, including unused-code checks
- **HTML** and **CSS** (CSS custom properties drive both themes)
- **Vite** for development and builds
- **Vitest** with **jsdom** for automated tests

## Architecture

The project follows object-oriented design with small, single-purpose classes. Calculation code never touches the DOM, and dependencies are passed in through constructors.

| Class / module | Responsibility |
|---|---|
| `CalculatorApp` | Composition root: wires input, engine, UI and theme together, and owns the start/dispose lifecycle. |
| `CalculatorEngine` | The calculator rules, expressed as transitions between states. No DOM access. |
| `CalculatorState` | A typed state model (`entering`, `awaitingOperand`, `result`, `error`) and helpers for it. |
| `Operator` | The operator table, `calculate()` and percentage rules. |
| `NumberFormatter` | Turns numbers into display text. Never alters stored values. |
| `InputHandler` | Converts click events inside one root element into typed callbacks. All listeners can be removed with `dispose()`. |
| `CalculatorUI` | Renders the display and the mode label into one root element. |
| `DisplayFitter` | Shrinks the display font only when the text would overflow. |
| `ThemeManager` | Holds the current mode and toggles the theme class. |

```
src/
├── main.ts                 # entry point
├── calculator/             # CalculatorEngine, CalculatorState, Operator, NumberFormatter
├── classes/                # CalculatorApp, InputHandler
├── ui/                     # CalculatorUI, DisplayFitter
├── themes/                 # ThemeManager
└── styles/style.css        # layout and both themes
```

Tests live next to the code they cover, in `*.test.ts` files.

## Getting started

**Requirements:** Node.js 22.12 or newer and npm.

```bash
git clone https://github.com/TamarMosheev/Neumorphism-Calculator-.git
cd Neumorphism-Calculator-
npm install
npm run dev
```

Vite prints the local address (by default <http://localhost:5173/>); open it in your browser.

Other commands:

```bash
npm run build     # type-check with tsc, then build to dist/
npm run preview   # serve the production build locally
```

## Testing

```bash
npm test
```

This runs the whole suite once with Vitest. It includes:
- unit tests for the engine, state model, operators and number formatting (arithmetic, decimals, percentages, sign changes, AC, division by zero, precision limits);
- DOM tests, run in jsdom against the real `index.html`, that click the actual buttons and check the display;
- tests for listener registration and cleanup, display fitting, theme switching, and that both themes define the same CSS variables.

At the time of writing there are 311 tests in 11 files, and they all pass.

## Current status

Version 0.1.0. The standard calculator is working in both themes.

- **PRO MODE currently only switches to the dark theme.** Scientific calculator functions are **not implemented yet**.
- Keyboard input is not supported yet; the calculator is operated with the on-screen keys.
- There is no deployed demo and no screenshots yet.
- No license has been specified yet.
