# Tune Editor

A web-based ECU tuning editor for viewing and modifying calibration data in BIN files using A2L/XDF definitions.

**[Live Demo](https://theflashbold.github.io/tune-editor/)**

![Tune Editor](assets/Tune-Editor.png)
![Tune Editor](assets/Tune-Editor-2.png)

## Features

- **Multi-Format Support**: A2L, XDF (TunerPro), and JSON definition formats
- **Auto-Detection**: Automatically matches binary files to definitions via EPK verification
- **BIN File Editor**: View and edit scalar values, curves (1D tables), and maps (2D tables)
- **3D Visualization**: Interactive 3D surface graph for MAP parameters (mouse-draggable rotation/tilt)
- **2D Graphs**: Line charts for CURVE parameters
- **Heatmap Visualization**: Logarithmic color-coded table cells from green (low) to red (high)
- **Compare Mode**: Load an original BIN file to compare changes side-by-side
- **Editable Axes**: Modify X and Y axis breakpoints directly
- **Batch Editing**: Select multiple cells and apply add/multiply/set operations
- **Change Tracking**: Visual indicators for modified values with diff view
- **Category Tree**: Organize parameters by categories with fuzzy search
- **Keyboard Navigation**: Navigate parameters with arrow keys
- **BLE Datalogger**: Connect to ESP32 datalogger for real-time ECU monitoring

## Usage

1. **Load Definition**: Open a JSON definition file or use the A2L Converter
2. **Load BIN File**: Open your ECU binary file
3. **Edit Values**: Double-click on any value to edit
4. **Compare (optional)**: Load an original BIN to see changes highlighted
5. **Save**: Export the modified BIN file

## Included definitions

### VAG ECU

| Boxcode    | SW-Version | EPK     |
|------------|------------|---------|
| 06K906071C | 8100       | SC8V30  |
| 3G0906259G | 0004       | SCGA05  |
| 3GD906259B | 0003       | SCG910  |
| 5G0906259A | 0004       | SC8H64  |
| 5G0906259F | 0001       | SC8O200 |
| 5G0906259P | X621       | SC8LB70 |
| 5G0906259S | 0002       | SCGA10  |
| 5G0906259  | 0010       | SC8F900 |
| 8U0906259A | 0003       | SC8H85  |
| 8V0906259A | 0004       | SC8H65  |
| 8V0906264E | 0003       | SC1CF00 |
| 8V0906264K | 0003       | SC8S50  |

### VAG DSG TCU

| Boxcode    | SW-Version | EPK  |
|------------|------------|------|
| 0D9300012L | 4517       | F45M |
| 0D9300012  | 4930       | F49M |
| 0D9300014N | 5002       | F50M |
| 0D9300018D | 5201       | F52M |
| 0D9300040J | 4027       | F40M |
| 0D9300040S | 4311       | F43M |

## Patching

Built-in support for [Switchleg1/BinToolz](https://github.com/Switchleg1/BinToolz) `.btp` patch files. Compatible patches are automatically detected when a binary is loaded.

| Patch | Description |
|-------|-------------|
| SL PATCH | Multimaps, Rolling Anti-Lag, Launch Control, Traction Control |
| SL HSL | Highspeed Logging |
| Immo | Immobilizer |
| SWG | Simple Wastegate Control |
| SL CBRICK | CBOOT Brick Protection |
| FREE SAP | Secondary Air Pump delete |
| CAT | Catalyst monitoring delete |

Patches with bundled XDF definitions automatically add their parameters to the category tree under "Patch". Custom `.btp` files can also be loaded via the file picker in the Patches dialog.

## A2L Converter

The built-in converter parses ASAP2 (A2L) files and extracts:

- CHARACTERISTIC definitions (VALUE, CURVE, MAP)
- COMPU_METHOD conversion formulas
- AXIS_PTS breakpoint tables
- RECORD_LAYOUT data types and storage order

Optionally use a CSV file to filter and categorize parameters.

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

MIT
