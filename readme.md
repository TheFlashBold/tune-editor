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

| Patch        | Description                                                   |
|--------------|---------------------------------------------------------------|
| SL PATCH     | Multimaps, Rolling Anti-Lag, Launch Control, Traction Control |
| SL HSL       | Highspeed Logging                                             |
| Immo         | Immobilizer                                                   |
| SWG          | Simple Wastegate Control                                      |
| SL CBRICK    | CBOOT Brick Protection                                        |
| FREE SAP     | Secondary Air Pump delete                                     |
| CAT          | Catalyst monitoring delete                                    |
| DQ250 HSL    | DSG Highspeed Logging                                         |
| Torque Limit | DSG DQ250 Torque Limit Increase                               |

Patches with bundled XDF definitions automatically add their parameters to the category tree under "Patch". Custom
`.btp` files can also be loaded via the file picker in the Patches dialog.

## Included definitions

### VAG ECU

| Boxcode    | SW-Version | EPK     | Note           |
|------------|------------|---------|----------------|
| 06K906071C | 8100       | SC8V30  |                |
| 3G0906259G | 0004       | SCGA05  |                |
| 3GD906259B | 0003       | SCG910  |                |
| 5G0906259A | 0004       | SC8H64  |                |
| 5G0906259F | 0001       | SC8O200 |                |
| 5G0906259P | X621       | SC8LB70 |                |
| 5G0906259S | 0002       | SCGA10  |                |
| 5G0906259  | 0010       | SC8F900 |                |
| 8U0906259A | 0003       | SC8H85  |                |
| 8V0906259A | 0004       | SC8H65  |                |
| 8V0906264E | 0003       | SC1CF00 | A3 1.8 Europe  |
| 8V0906264H | 0003       | SC8O30  | A3 1.8 Europe  |
| 8V0906259F | 0002       | SC8O30  | S3 Europe      |
| 3G0906259  | 0003       | SC8O30  | Golf 2.0       |
| 3G0906264  | 0003       | SC8O30  | Superb 1.8     |
| 5G0906259F | 0002       | SC8O30  | Leon 2.0       |
| 5G0906259J | 0002       | SC8O30  | Golf R         |
| 5NG906264  | 0002       | SC8O30  | Tiguan 1.8     |
| 5TD906264  | 0002/0003  | SC8O30  | Tiguan 1.8     |
| 8VD906264A | 0002/0003  | SC8O30  | A5 1.8         |
| 8V0906264K | 0003       | SC8S50  | A3 1.8 US      |
| 5G0906259L | 0002       | SC8S50  | Golf 2.0       |
| 5G0906259H | 0001       | SC8S50  | Leon 2.0 Cupra |
| 5N0906259  | 0003       | SC8S50  | Tiguan 2.0 R   |
| 5N0906259B | 0001       | SC8S50  | Tiguan 2.0     |
| 8S0906259A | 0003       | SC8S50  | TT 2.0         |
| 8S0906259C | 0004       | SC8S50  | TT 2.0         |
| 8S0906259L | 0001       | SC8S50  | TT 2.0         |
| 8V0906259J | 0003       | SC8S50  | Golf / S3 2.0  |
| 8V0906259K | 0003       | SC8S50  | S3 2.0         |
| 8V0906259P | 0001       | SC8S50  | Golf 2.0       |
| 8V0906259T | 0002       | SC8S50  | Golf 2.0       |
| 8V0906264M | 0001       | SC8S50  | Golf 1.8       |

### DSG DQ250

| Boxcode    | SW-Version | EPK  |
|------------|------------|------|
| 0D9300011M | 4007       | F40M |
| 0D9300040L | 4016       | F40M |
| 0D9300040L | 4025       | F40M |
| 0D9300040J | 4027       | F40M |
| 0D9300040K | 4028       | F40M |
| 0D9300011L | 4029       | F40M |
| 0D9300011M | 4030       | F40M |
| 0D9300020B | 4031       | F40M |
| 0D9300011N | 4033       | F40M |
| 0D9300040P | 4302       | F43M |
| 0D9300040Q | 4302       | F43M |
| 0D9300040N | 4303       | F43M |
| 0D9300040Q | 4303       | F43M |
| 0D9300040Q | 4304       | F43M |
| 0D9300040N | 4305       | F43M |
| 0D9300040R | 4306       | F43M |
| 0D9300020C | 4308       | F43M |
| 0D9300020C | 4309       | F43M |
| 0D9300020D | 4310       | F43M |
| 0D9300040S | 4311       | F43M |
| 0D9300011S | 4312       | F43M |
| 0D9300011S | 4313       | F43M |
| 0D9300040S | 4313       | F43M |
| 0D9300041  | 4314       | F43M |
| 0D9300011Q | 4315       | F43M |
| 0D9300040T | 4316       | F43M |
| 0D9300011P | 4317       | F43M |
| 0D9300011R | 4319       | F43M |
| 0D9300041N | 4503       | F45M |
| 0D9300041N | 4504       | F45M |
| 0D9300041Q | 4504       | F45M |
| 0D9300041S | 4505       | F45M |
| 0D9300041P | 4507       | F45M |
| 0D9300041R | 4508       | F45M |
| 0D9300041P | 4509       | F45M |
| 0D9300041R | 4511       | F45M |
| 0D9300041T | 4511       | F45M |
| 0D9300041N | 4512       | F45M |
| 0D9300041T | 4512       | F45M |
| 0D9300012K | 4513       | F45M |
| 0D9300012J | 4517       | F45M |
| 0D9300012L | 4517       | F45M |
| 0D9300012H | 4518       | F45M |
| 0D9300012L | 4521       | F45M |
| 0D9300020G | 4521       | F45M |
| 0D9300012L | 4522       | F45M |
| 0D9300020H | 4522       | F45M |
| 0D9300012L | 4526       | F45M |
| 0D9300014T | 4527       | F45M |
| 0D9300012  | 4901       | F49M |
| 0D9300013A | 4901       | F49M |
| 0D9300020L | 4901       | F49M |
| 0D9300041H | 4901       | F49M |
| 0D9300013A | 4902       | F49M |
| 0D9300041C | 4902       | F49M |
| 0D9300041H | 4902       | F49M |
| 0D9300041J | 4902       | F49M |
| 0D9300042H | 4902       | F49M |
| 0D9300012  | 4903       | F49M |
| 0D9300013A | 4903       | F49M |
| 0D9300041C | 4903       | F49M |
| 0D9300042F | 4903       | F49M |
| 0D9300013A | 4904       | F49M |
| 0D9300013C | 4904       | F49M |
| 0D9300041J | 4904       | F49M |
| 0D9300013C | 4905       | F49M |
| 0D9300013D | 4905       | F49M |
| 0D9300041H | 4905       | F49M |
| 0D9300041H | 4906       | F49M |
| 0D9300042C | 4907       | F49M |
| 0D9300012  | 4908       | F49M |
| 0D9300012F | 4909       | F49M |
| 0D9300012  | 4911       | F49M |
| 0D9300012  | 4930       | F49M |
| 0D9300012F | 4930       | F49M |
| 0D9300013B | 4930       | F49M |
| 0D9300020J | 4930       | F49M |
| 0D9300020K | 4930       | F49M |
| 0D9300041C | 4930       | F49M |
| 0D9300041K | 4930       | F49M |
| 0D9300012  | 4931       | F49M |
| 0D9300012F | 4931       | F49M |
| 0D9300013B | 4931       | F49M |
| 0D9300012F | 4932       | F49M |
| 0D9300012L | 4932       | F49M |
| 0D9300041C | 4932       | F49M |
| 0D9300012  | 4938       | F49M |
| 0D9300041C | 4938       | F49M |
| 0D9300012  | 4939       | F49M |
| 0D9300012  | 4940       | F49M |
| 0D9300014N | 5002       | F50M |
| 0D9300014P | 5003       | F50M |
| 0D9300020N | 5003       | F50M |
| 0D9300014K | 5004       | F50M |
| 0D9300014R | 5004       | F50M |
| 0D9300020N | 5004       | F50M |
| 0D9300014K | 5005       | F50M |
| 0D9300014M | 5005       | F50M |
| 0D9300042N | 5006       | F50M |
| 0D9300014Q | 5007       | F50M |
| 0D9300014Q | 5008       | F50M |
| 0D9300042S | 5010       | F50M |
| 0D9300042M | 5013       | F50M |
| 0D9300042M | 5016       | F50M |
| 0D9300012  | 5044       | F50M |
| 0D9300012  | 5045       | F50M |
| 0D9300012  | 5046       | F50M |
| 0D9300014S | 5201       | F52M |
| 0D9300014T | 5201       | F52M |
| 0D9300018A | 5201       | F52M |
| 0D9300018B | 5201       | F52M |
| 0D9300018C | 5201       | F52M |
| 0D9300018D | 5201       | F52M |
| 0D9300020Q | 5201       | F52M |
| 0D9300020T | 5201       | F52M |
| 0D9300043E | 5201       | F52M |
| 0D9300014T | 5202       | F52M |
| 0D9300018  | 5202       | F52M |
| 0D9300020S | 5202       | F52M |
| 0D9300043  | 5202       | F52M |
| 0D9300043B | 5202       | F52M |
| 0D9300043C | 5202       | F52M |
| 0D9300043F | 5202       | F52M |
| 0D9300015  | 5203       | F52M |
| 0D9300043B | 5205       | F52M |
| 0D9300043C | 5206       | F52M |
| 0D9300043B | 5209       | F52M |
| 0D9300014T | 5220       | F52M |
| 0D9300041H | 5220       | F52M |
| 0D9300043B | 5220       | F52M |
| 0D9300043C | 5220       | F52M |
| 0D9300014T | 5221       | F52M |
| 0D9300042N | 5221       | F52M |
| 0D9300014T | 5223       | F52M |
| 0D9300013A | 5224       | F52M |
| 0D9300042M | 5226       | F52M |
| 0D9300014T | 5229       | F52M |
| 0D9300013A | 5232       | F52M |
| 0D9300013A | 5233       | F52M |
| 0D9300013A | 5234       | F52M |

### DSG DQ381

| Boxcode    | SW-Version | EPK  |
|------------|------------|------|
| 0GC300012  | 1401       | 14XX |
| 0GC300012B | 1404       | 14XX |
| 0GC300012B | 1405       | 14XX |
| 0GC300012B | 1406       | 14XX |
| 0GC300012D | 1401       | 14XX |
| 0GC300012G | 1405       | 14XX |
| 0GC300020A | 1401       | 14XX |
| 0GC300020C | 1401       | 14XX |
| 0GC300040P | 1401       | 14XX |
| 0GC300042G | 1405       | 14XX |
| 0GC300042H | 1402       | 14XX |
| 0GC300042H | 1403       | 14XX |
| 0GC300042H | 1404       | 14XX |
| 0GC300011G | 1402       | 14XX |
| 0GC300012  | 1403       | 14XX |
| 0GC300011G | 1420       | 14XX |
| 0GC300011G | 1421       | 14XX |
| 0GC300011G | 1422       | 14XX |
| 0GC300011G | 1423       | 14XX |
| 0GC300011L | 1420       | 14XX |
| 0GC300011L | 1421       | 14XX |
| 0GC300012  | 1420       | 14XX |
| 0GC300012  | 1421       | 14XX |
| 0GC300012  | 1422       | 14XX |
| 0GC300012  | 1424       | 14XX |
| 0GC300012  | 1425       | 14XX |
| 0GC300012A | 1420       | 14XX |
| 0GC300012A | 1421       | 14XX |
| 0GC300012A | 1422       | 14XX |
| 0GC300012A | 1423       | 14XX |
| 0GC300012A | 1424       | 14XX |
| 0GC300012A | 1425       | 14XX |
| 0GC300012B | 1420       | 14XX |
| 0GC300012B | 1421       | 14XX |
| 0GC300012B | 1422       | 14XX |
| 0GC300012B | 1426       | 14XX |
| 0GC300012B | 1427       | 14XX |
| 0GC300012B | 1428       | 14XX |
| 0GC300012B | 1429       | 14XX |
| 0GC300012B | 1434       | 14XX |
| 0GC300012B | 1435       | 14XX |
| 0GC300012B | 1436       | 14XX |
| 0GC300012C | 1421       | 14XX |
| 0GC300012D | 1420       | 14XX |
| 0GC300012D | 1421       | 14XX |
| 0GC300020A | 1420       | 14XX |
| 0GC300020A | 1421       | 14XX |
| 0GC300020C | 1420       | 14XX |
| 0GC300020C | 1421       | 14XX |
| 0GC300040P | 1420       | 14XX |
| 0GC300040P | 1421       | 14XX |
| 0GC300042G | 1420       | 14XX |
| 0GC300042G | 1421       | 14XX |
| 0GC300042G | 1425       | 14XX |
| 0GC300042G | 1426       | 14XX |
| 0GC300042G | 1427       | 14XX |
| 0GC300042G | 1431       | 14XX |
| 0GC300042G | 1432       | 14XX |
| 0GC300042H | 1420       | 14XX |
| 0GC300042H | 1421       | 14XX |
| 0GC300042H | 1422       | 14XX |
| 0GC300042H | 1423       | 14XX |
| 0GC300042H | 1426       | 14XX |
| 0GC300042H | 1427       | 14XX |
| 0GC300042J | 1422       | 14XX |
| 0GC300042J | 1423       | 14XX |
| 0GC300011K | 2301       | 23XX |
| 0GC300012E | 2301       | 23XX |
| 0GC300012L | 2303       | 23XX |
| 0GC300012L | 2305       | 23XX |
| 0GC300012M | 2301       | 23XX |
| 0GC300012M | 2305       | 23XX |
| 0GC300012M | 2306       | 23XX |
| 0GC300012M | 2307       | 23XX |
| 0GC300012M | 2309       | 23XX |
| 0GC300012N | 2301       | 23XX |
| 0GC300012N | 2302       | 23XX |
| 0GC300012N | 2311       | 23XX |
| 0GC300012N | 2312       | 23XX |
| 0GC300012N | 2313       | 23XX |
| 0GC300012N | 2314       | 23XX |
| 0GC300012Q | 2301       | 23XX |
| 0GC300012Q | 2304       | 23XX |
| 0GC300012S | 2301       | 23XX |
| 0GC300012S | 2305       | 23XX |
| 0GC300012S | 2307       | 23XX |
| 0GC300012T | 2301       | 23XX |
| 0GC300013  | 2301       | 23XX |
| 0GC300013  | 2303       | 23XX |
| 0GC300013  | 2304       | 23XX |
| 0GC300013A | 2302       | 23XX |
| 0GC300013A | 2305       | 23XX |
| 0GC300013C | 2301       | 23XX |
| 0GC300020B | 2301       | 23XX |
| 0GC300020B | 2303       | 23XX |
| 0GC300020F | 2301       | 23XX |
| 0GC300042R | 2301       | 23XX |
| 0GC300042T | 2301       | 23XX |
| 0GC300042T | 2302       | 23XX |
| 0GC300042T | 2308       | 23XX |
| 0GC300042T | 2309       | 23XX |
| 0GC300042T | 2310       | 23XX |
| 0GC300043  | 2301       | 23XX |
| 0GC300043  | 2303       | 23XX |
| 0GC300043  | 2308       | 23XX |
| 0GC300043  | 2309       | 23XX |
| 0GC300043  | 2310       | 23XX |
| 0GC300043A | 2304       | 23XX |
| 0GC300043B | 2301       | 23XX |
| 0GC300043J | 2304       | 23XX |
| 0GC300043J | 2305       | 23XX |
| 0GC300043K | 2301       | 23XX |
| 0GC300045A | 2301       | 23XX |
| 0GC300045M | 2301       | 23XX |
| 0GC300045M | 2303       | 23XX |
| 0GC300013K | 2403       | 24XX |
| 0GC300013K | 2404       | 24XX |
| 0GC300013K | 2405       | 24XX |
| 0GC300013L | 2401       | 24XX |
| 0GC300013N | 2401       | 24XX |
| 0GC300013N | 2405       | 24XX |
| 0GC300013P | 2401       | 24XX |
| 0GC300013P | 2403       | 24XX |
| 0GC300013Q | 2401       | 24XX |
| 0GC300013Q | 2402       | 24XX |
| 0GC300013Q | 2403       | 24XX |
| 0GC300014B | 2401       | 24XX |
| 0GC300014B | 2403       | 24XX |
| 0GC300014B | 2405       | 24XX |
| 0GC300014C | 2401       | 24XX |
| 0GC300014D | 2401       | 24XX |
| 0GC300014E | 2401       | 24XX |
| 0GC300014E | 2402       | 24XX |
| 0GC300014E | 2405       | 24XX |
| 0GC300014E | 2407       | 24XX |
| 0GC300014F | 2401       | 24XX |
| 0GC300014F | 2402       | 24XX |
| 0GC300020G | 2401       | 24XX |
| 0GC300020G | 2402       | 24XX |
| 0GC300020G | 2403       | 24XX |
| 0GC300020L | 2401       | 24XX |
| 0GC300043N | 2406       | 24XX |
| 0GC300044E | 2401       | 24XX |
| 0GC300044E | 2402       | 24XX |
| 0GC300044E | 2403       | 24XX |
| 0GC300044E | 2404       | 24XX |
| 0GC300044E | 2405       | 24XX |
| 0GC300044F | 2401       | 24XX |
| 0GC300044F | 2402       | 24XX |
| 0GC300044F | 2403       | 24XX |
| 0GC300044F | 2404       | 24XX |
| 0GC300044F | 2406       | 24XX |
| 0GC300044F | 2407       | 24XX |
| 0GC300044F | 2408       | 24XX |
| 0GC300044G | 2401       | 24XX |
| 0GC300044H | 2403       | 24XX |
| 0GC300044J | 2401       | 24XX |
| 0GC300044J | 2404       | 24XX |
| 0GC300044J | 2406       | 24XX |
| 0GC300044T | 2403       | 24XX |
| 0GC300044T | 2409       | 24XX |
| 0GC300046  | 2401       | 24XX |
| 0GC300046  | 2402       | 24XX |
| 0GC300046A | 2401       | 24XX |
| 0GC300046A | 2403       | 24XX |
| 0GC300046D | 2402       | 24XX |

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
