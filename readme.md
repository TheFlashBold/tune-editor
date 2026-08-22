# Tune Editor

A feature-complete web-based ECU tuning editor, comparable to WinOLS and TunerPro, just in your browser.
View and modify calibration data in BIN files using JSON, A2L, XDF definitions (experimental OLS support).

**[Live Version - Start now!](https://theflashbold.github.io/tune-editor/)**

![Tune Editor](assets/Tune-Editor.png)
![Tune Editor](assets/Tune-Editor-2.png)

## Usage

1. **Load BIN File**: Open your ECU binary file
2. **Load Definition**: The Editor loads the correct definition, otherwise drop a .json .xdf .a2l
3. **Edit Values**: Modify tables and values
4. **Compare (optional)**: Load an original BIN to see changes highlighted. You can also cross compare bins, parameters
   are matched by name.
5. **Save**: Export the modified BIN file

## Features

- **Auto-Detection**: Automatically matches binary files to definitions via EPK verification
- **Multi-Format Support**: A2L, XDF (TunerPro), and JSON definition formats
- **BIN File Editor**: View and edit scalar values, curves (1D tables), and maps (2D tables)
- **3D Visualization**: Interactive 3D surface graph for MAP parameters (mouse-draggable rotation/tilt) WebGL
  accelerated
- **2D Graphs**: Line charts for CURVE parameters
- **Heatmap Visualization**: Color-coded table cells from green to red
- **Compare Mode**: Load an original BIN file to compare changes side-by-side
- **Cross-Compare Mode**: Load a different BIN file to compare changes over two definitions side-by-side
- **Editable Axes**: Modify X and Y axis breakpoints directly
- **Batch Editing**: Select multiple cells and apply add/multiply/set operations
- **Change Tracking**: Visual indicators for modified values with diff view
- **Category Tree**: Organize parameters by categories with fuzzy search
- **Keyboard Navigation**: Navigate parameters with arrow keys

## Patching

Built-in support for [Switchleg1/BinToolz](https://github.com/Switchleg1/BinToolz) `.btp` patch files. Compatible
patches are automatically detected when a binary is loaded.


## Tech Stack

- [Preact](https://preactjs.com/) - Fast 3kB React alternative
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- TypeScript

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## License

Provided as is, no support or guarantee

GPL-3.0
