import { useState, useRef, useEffect } from 'preact/hooks';
import type { VehicleSettings } from '../app';
import { Modal } from './Modal';

const BLE_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
const BLE_DATA_TX_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
const BLE_DATA_RX_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";

const DEFAULT_LOGGING_RATE = 20; // hz

const DEFAULT_MTU_SIZE = 23;
const BLE_HEADER_ID = 0xF1;
const BLE_HEADER_PT = 0xF2;
const BLE_HEADER_RX = 0x7E8;
const BLE_HEADER_TX = 0x7E0;

enum BLECommandFlags {
    PER_ENABLE = 1,
    PER_CLEAR = 2,
    PER_ADD = 4,
    SPLIT_PK = 8,
    SET_GET = 64,
    SETTINGS = 128
}

enum BLESettings {
    ISOTP_STMIN = 1,
    LED_COLOR = 2,
    PERSIST_DELAY = 3,
    PERSIST_Q_DELAY = 4,
    BLE_SEND_DELAY = 5,
    BLE_MULTI_DELAY = 6,
    PASSWORD = 7,
    GAP = 8
}

const UDS_RESPONSE = {
    READ_IDENTIFIER_ACCEPTED: 0x62,
};

const ECU_INFO_FIELDS: Record<string, number[]> = {
    VIN: [0xf1, 0x90],
    ODX_IDENTIFIER: [0xf1, 0x9e],
    ODX_VERSION: [0xf1, 0xa2],
    CAL_NUMBER: [0xf8, 0x06],
    PART_NUMBER: [0xf1, 0x87],
    ASW_VERSION: [0xf1, 0x89],
    HW_NUMBER: [0xf1, 0x91],
    HW_VERSION: [0xf1, 0xa3],
    ENGINE_CODE: [0xf1, 0xad],
};

interface IPid {
    address: number;
    name: string;
    length: number;
    signed: boolean;
    equation: string;
    fractional: number;
    unit: string;
}

const PIDs: Map<number, IPid> = new Map([
    [0xf40c, { address: 0xf40c, name: "Engine Speed", length: 2, signed: false, equation: "x / 4", fractional: 0, unit: "rpm" }],
    [0x2033, { address: 0x2033, name: "Vehicle Speed", length: 2, signed: false, equation: "x / 100", fractional: 1, unit: "km/h" }],
    [0x210f, { address: 0x210f, name: "Gear", length: 2, signed: false, equation: "x + 1", fractional: 0, unit: "" }],
    [0x2032, { address: 0x2032, name: "Airflow", length: 2, signed: false, equation: "x", fractional: 0, unit: "kg/h" }],
    [0x13ca, { address: 0x13ca, name: "Ambient Pressure", length: 2, signed: false, equation: "x / 12060.176665439", fractional: 2, unit: "bar" }],
    [0x1004, { address: 0x1004, name: "Ambient Temp", length: 2, signed: true, equation: "x / 128", fractional: 1, unit: "C" }],
    [0x39c0, { address: 0x39c0, name: "MAP", length: 2, signed: false, equation: "x / 1000", fractional: 3, unit: "bar" }],
    [0x39c1, { address: 0x39c1, name: "MAP SP", length: 2, signed: false, equation: "x / 1000", fractional: 3, unit: "bar" }],
    [0x202a, { address: 0x202a, name: "PUT", length: 2, signed: false, equation: "x / 1000", fractional: 3, unit: "bar" }],
    [0x2029, { address: 0x2029, name: "PUT SP", length: 2, signed: false, equation: "x / 1000", fractional: 3, unit: "bar" }],
    [0x11cd, { address: 0x11cd, name: "Coolant Temp", length: 1, signed: false, equation: "x - 40", fractional: 0, unit: "C" }],
    [0x437C, { address: 0x437C, name: "Torque", length: 2, signed: true, equation: "x / 10", fractional: 1, unit: "Nm" }],
    [0x4380, { address: 0x4380, name: "Torque Req", length: 2, signed: true, equation: "x / 10", fractional: 1, unit: "Nm" }],
    [0x2904, { address: 0x2904, name: "Misfires", length: 2, signed: false, equation: "x", fractional: 0, unit: "" }],
    [0x10c0, { address: 0x10c0, name: "Lambda", length: 2, signed: false, equation: "x / 1024", fractional: 3, unit: "" }],
    [0xf444, { address: 0xf444, name: "Lambda SP", length: 2, signed: false, equation: "x / 32768", fractional: 3, unit: "" }],
    [0x1001, { address: 0x1001, name: "IAT", length: 1, signed: false, equation: "x * 0.75 - 48", fractional: 1, unit: "C" }],
    [0x200a, { address: 0x200a, name: "Knock Cyl 1", length: 2, signed: true, equation: "x / 100", fractional: 2, unit: "deg" }],
    [0x200b, { address: 0x200b, name: "Knock Cyl 2", length: 2, signed: true, equation: "x / 100", fractional: 2, unit: "deg" }],
    [0x200c, { address: 0x200c, name: "Knock Cyl 3", length: 2, signed: true, equation: "x / 100", fractional: 2, unit: "deg" }],
    [0x200d, { address: 0x200d, name: "Knock Cyl 4", length: 2, signed: true, equation: "x / 100", fractional: 2, unit: "deg" }],
]);

function NumberToArrayBuffer2(n: number): ArrayBuffer {
    const buffer = new ArrayBuffer(2);
    const view = new Uint8Array(buffer);
    view[0] = (n >> 8) & 0xff;
    view[1] = n & 0xff;
    return buffer;
}

function NumberToArrayBuffer(n: number): ArrayBuffer {
    const buffer = new ArrayBuffer(1);
    const view = new Uint8Array(buffer);
    view[0] = n & 0xff;
    return buffer;
}

function ConcatArrayBuffer(...values: (ArrayBuffer | Uint8Array | number)[]): ArrayBuffer {
    const totalLength = values.reduce<number>((total, value) => {
        if (value instanceof ArrayBuffer) return total + value.byteLength;
        if (value instanceof Uint8Array) return total + value.byteLength;
        if (typeof value === "number") return total + 1;
        return total;
    }, 0);

    const result = new ArrayBuffer(totalLength);
    const view = new Uint8Array(result);

    let offset = 0;
    for (const value of values) {
        if (value instanceof ArrayBuffer) {
            view.set(new Uint8Array(value), offset);
            offset += value.byteLength;
        } else if (value instanceof Uint8Array) {
            view.set(value, offset);
            offset += value.byteLength;
        } else if (typeof value === "number") {
            view[offset] = value & 0xFF;
            offset += 1;
        }
    }

    return result;
}

class BLEHeader {
    hdID: number = BLE_HEADER_ID;
    cmdFlags: number = 0;
    rxID: number = BLE_HEADER_RX;
    txID: number = BLE_HEADER_TX;
    cmdSize: number = 0;
    tickCount: number = 0; // Millisecond timestamp from bridge (in persist mode responses)

    toArrayBuffer(): ArrayBuffer {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view[0] = this.hdID & 0xFF;
        view[1] = this.cmdFlags & 0xFF;
        view[2] = this.rxID & 0xFF;
        view[3] = (this.rxID & 0xFF00) >> 8;
        view[4] = this.txID & 0xFF;
        view[5] = (this.txID & 0xFF00) >> 8;
        view[6] = this.cmdSize & 0xFF;
        view[7] = (this.cmdSize & 0xFF00) >> 8;
        return buffer;
    }

    static fromDataView(data: DataView): BLEHeader {
        const header = new BLEHeader();
        header.hdID = data.getUint8(0);
        header.cmdFlags = data.getUint8(1);
        header.rxID = data.getUint8(2) | (data.getUint8(3) << 8);
        header.txID = data.getUint8(4) | (data.getUint8(5) << 8);
        header.cmdSize = data.getUint8(6) | (data.getUint8(7) << 8);
        // In persist mode responses, rxID/txID are reused as tickCount (ms timestamp)
        header.tickCount = (header.rxID << 16) | header.txID;
        return header;
    }

    isValid(): boolean {
        return this.hdID === BLE_HEADER_ID;
    }

    static size_partial(): number {
        return 2;
    }
}

interface GPSData {
    latitude: number;
    longitude: number;
    speed: number | null; // m/s
    heading: number | null; // degrees
    accuracy: number; // meters
    altitude: number | null; // meters
}

interface AccelerometerData {
    x: number; // G-force lateral (+ = right)
    y: number; // G-force longitudinal (+ = forward/accel, - = braking)
    z: number; // G-force vertical
}

interface CalculatedData {
    acceleration?: number; // m/s²
    force?: number; // N
    wheelTorque?: number; // Nm
    power?: number; // kW (calculated from wheel)
    airmass?: number; // mg/stk
    boost?: number; // bar
    boostError?: number; // bar (MAP SP - MAP)
    knockAvg?: number; // deg
    enginePower?: number; // kW (from ECU torque)
    calculatedTorque?: number; // Nm (engine torque from wheel torque / gear ratio)
    torqueDiff?: number; // Nm (ECU torque - calculated torque = drivetrain loss)
}

interface LogFrame {
    time: number;
    data: Record<string, number>;
    gps?: GPSData;
    accelerometer?: AccelerometerData;
    calculated?: CalculatedData;
    queryTime?: number; // ms to query all PIDs
}

const IS_LOCALHOST = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Mock BLE Service for localhost testing
class MockBLEService {
    logging = false;
    onFrame?: (frame: LogFrame) => void;
    onLog?: (message: string) => void;
    startTime = 0;
    loggingRate: number = DEFAULT_LOGGING_RATE;
    vehicleSettings: VehicleSettings | null = null;
    private loopTimeout: ReturnType<typeof setTimeout> | null = null;
    private mockRPM = 800;
    private mockSpeed = 0;
    private mockThrottle = 0;
    private mockGear = 1;
    private mockBoost = 0;

    log(message: string) {
        console.log(`[MockBLE] ${message}`);
        this.onLog?.(message);
    }

    async setup() {
        this.log('Connecting to mock device...');
        await new Promise(r => setTimeout(r, 100));
        this.log('Mock GATT connected');
        this.log('Mock BLE setup complete');
    }

    async getInfo(): Promise<Record<string, string>> {
        this.log('Querying ECU info...');
        await new Promise(r => setTimeout(r, 50));
        const info = {
            VIN: 'WVWZZZ3CZWE123456',
            ODX_IDENTIFIER: 'EV_ECM20TFS0',
            ODX_VERSION: '001003',
            CAL_NUMBER: 'SC8F830',
            PART_NUMBER: '8V0906259H',
            ASW_VERSION: '0003',
            HW_NUMBER: '8V0906259',
            HW_VERSION: 'H13',
            ENGINE_CODE: 'DKZA',
        };
        for (const [key, value] of Object.entries(info)) {
            this.log(`  ${key}: ${value}`);
            await new Promise(r => setTimeout(r, 20));
        }
        this.log('ECU info query complete');
        return info;
    }

    async startLogging(_withGPS = false, _withAccel = false, vehicleSettings?: VehicleSettings, persistMode = true, chunkSize = 0) {
        this.vehicleSettings = vehicleSettings || null;
        this.loggingRate = vehicleSettings?.loggingRate || DEFAULT_LOGGING_RATE;

        this.log(`Starting logging: persistMode=${persistMode}, rate=${this.loggingRate}Hz, chunkSize=${chunkSize}`);

        // Simulate persist mode setup
        if (persistMode) {
            this.log('Clearing persist queue...');
            await new Promise(r => setTimeout(r, 10));
            this.log('Persist queue cleared');

            this.log(`Setting persist delay to ${Math.round(1000 / this.loggingRate)}ms...`);
            await new Promise(r => setTimeout(r, 10));
            this.log(`Persist delay set to ${Math.round(1000 / this.loggingRate)}ms`);

            const numPids = PIDs.size;
            const effectiveChunkSize = chunkSize > 0 ? chunkSize : numPids;
            const numChunks = Math.ceil(numPids / effectiveChunkSize);
            this.log(`Adding ${numPids} PIDs in ${numChunks} chunk(s)...`);

            for (let i = 0; i < numChunks; i++) {
                const start = i * effectiveChunkSize;
                const end = Math.min(start + effectiveChunkSize, numPids);
                const size = (end - start) * 2 + 1; // 2 bytes per PID + 1 for service ID
                this.log(`Adding persist command (${size} bytes, rxID=7e8, txID=7e0)...`);
                await new Promise(r => setTimeout(r, 10));
                this.log('Persist command added');
            }

            this.log('Enabling persist mode...');
            await new Promise(r => setTimeout(r, 10));
            this.log('Persist mode enabled');
            this.log('Persist mode setup complete, waiting for packets...');
        }

        this.logging = true;
        this.startTime = performance.now();

        let frameCount = 0;
        const log = () => {
            if (!this.logging) return;
            frameCount++;

            // Log every 10th frame to avoid spam
            if (frameCount % 10 === 1) {
                this.log(`Received packet (mock frame #${frameCount})`);
            }

            // Simulate driving - random acceleration/deceleration
            const throttleChange = (Math.random() - 0.4) * 10;
            this.mockThrottle = Math.max(0, Math.min(100, this.mockThrottle + throttleChange));

            // RPM follows throttle with some lag
            const targetRPM = 800 + this.mockThrottle * 60;
            this.mockRPM += (targetRPM - this.mockRPM) * 0.1;
            this.mockRPM = Math.max(800, Math.min(7000, this.mockRPM + (Math.random() - 0.5) * 100));

            // Speed based on RPM and gear
            const gearRatios = [0, 3.5, 2.1, 1.4, 1.0, 0.8, 0.65, 0.55];
            this.mockSpeed = Math.max(0, (this.mockRPM / gearRatios[this.mockGear]) * 0.006);

            // Auto shift
            if (this.mockRPM > 6500 && this.mockGear < 7) this.mockGear++;
            if (this.mockRPM < 1500 && this.mockGear > 1) this.mockGear--;

            // Boost based on throttle and RPM
            this.mockBoost = this.mockThrottle > 50 && this.mockRPM > 2000
                ? Math.min(1.8, (this.mockThrottle - 50) / 50 * 1.5 + (Math.random() - 0.5) * 0.1)
                : 0;

            const frame: LogFrame = {
                time: (performance.now() - this.startTime) / 1000,
                queryTime: Math.floor(Math.random() * 20) + 30,
                data: {
                    'Engine Speed': Math.round(this.mockRPM),
                    'Vehicle Speed': Math.round(this.mockSpeed * 10) / 10,
                    'Gear': this.mockGear,
                    'Airflow': Math.round(this.mockRPM * this.mockThrottle / 100 * 0.5),
                    'Ambient Pressure': 1.01,
                    'Ambient Temp': 22,
                    'MAP': Math.round((1.0 + this.mockBoost) * 1000) / 1000,
                    'MAP SP': Math.round((1.0 + this.mockBoost + 0.05) * 1000) / 1000,
                    'PUT': Math.round((1.0 + this.mockBoost * 0.9) * 1000) / 1000,
                    'PUT SP': Math.round((1.0 + this.mockBoost) * 1000) / 1000,
                    'Coolant Temp': 90,
                    'Torque': Math.round(this.mockThrottle * 3 + (Math.random() - 0.5) * 10),
                    'Torque Req': Math.round(this.mockThrottle * 3.2),
                    'Misfires': 0,
                    'Lambda': 1.0 + (Math.random() - 0.5) * 0.02,
                    'Lambda SP': 1.0,
                    'IAT': 35 + Math.random() * 5,
                    'Knock Cyl 1': (Math.random() - 0.8) * 2,
                    'Knock Cyl 2': (Math.random() - 0.8) * 2,
                    'Knock Cyl 3': (Math.random() - 0.8) * 2,
                    'Knock Cyl 4': (Math.random() - 0.8) * 2,
                }
            };

            this.onFrame?.(frame);

            if (this.logging) {
                this.loopTimeout = setTimeout(log, 1000 / this.loggingRate);
            }
        };

        log();
    }

    async stopLogging() {
        this.log('Stopping logging...');
        this.logging = false;
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }
        this.log('Logging stopped');
    }

    disconnect() {
        this.stopLogging();
        this.log('Disconnected');
    }
}

class BLEService {
    device: BluetoothDevice;
    service: BluetoothRemoteGATTService | null = null;
    reader: BluetoothRemoteGATTCharacteristic | null = null;
    writer: BluetoothRemoteGATTCharacteristic | null = null;
    writeQueue: ArrayBuffer[] = [];
    interval: ReturnType<typeof setInterval> | null = null;
    logging = false;
    onFrame?: (frame: LogFrame) => void;
    onLog?: (message: string) => void;
    onPacketListeners: ((packet: DataView) => void)[] = [];
    startTime = 0;
    mtuSize: number;
    loggingRate: number = DEFAULT_LOGGING_RATE;
    gpsEnabled = false;
    gpsWatchId: number | null = null;
    currentGPS: GPSData | null = null;
    accelerometerEnabled = false;
    currentAccelerometer: AccelerometerData | null = null;
    accelerometerSensor: DeviceMotionEvent | null = null;
    previousGPS: { speed: number; time: number } | null = null;
    vehicleSettings: VehicleSettings | null = null;
    lastQueryTime: number = 0;
    persistModeEnabled = true;
    chunkSize = 0; // 0 = all at once
    // For continuous stream processing (SimosTools-style)
    pendingPidData: Map<string, number> = new Map(); // accumulate PID values
    expectedChunks = 1;
    receivedChunks = 0;
    lastTickCount = 0;

    constructor(device: BluetoothDevice, mtuSize: number = DEFAULT_MTU_SIZE) {
        this.device = device;
        this.mtuSize = mtuSize;
    }

    log(message: string) {
        console.log(`[BLE] ${message}`);
        this.onLog?.(message);
    }

    async setup() {
        if (!this.device.gatt) throw new Error("No GATT");
        this.log('Connecting to GATT server...');
        await this.device.gatt.connect();

        this.log('Getting BLE service...');
        this.service = await this.device.gatt.getPrimaryService(BLE_SERVICE_UUID);
        this.reader = await this.service.getCharacteristic(BLE_DATA_RX_UUID);
        await this.reader.startNotifications();
        this.reader.addEventListener("characteristicvaluechanged", () => {
            if (this.reader?.value) this.onReadValue(this.reader.value);
        });

        this.writer = await this.service.getCharacteristic(BLE_DATA_TX_UUID);
        this.interval = setInterval(this.run.bind(this), 1000 / (this.loggingRate * 2));
        this.log('BLE setup complete');
    }

    async run() {
        if (this.writeQueue.length > 0 && this.writer) {
            const writeValue = this.writeQueue.shift();
            if (writeValue) await this.writer.writeValueWithoutResponse(writeValue);
        }
    }

    onReadValue(data: DataView) {
        // SimosTools-style: handle multiple packets in single notification
        // The bridge may send multiple complete packets in one BLE notification
        let offset = 0;
        while (offset < data.byteLength) {
            // Check if we have enough bytes for a header
            if (data.byteLength - offset < 8) break;

            const hdID = data.getUint8(offset);
            if (hdID !== BLE_HEADER_ID && hdID !== BLE_HEADER_PT) {
                // Not a valid header, skip this byte and try again
                offset++;
                continue;
            }

            // Parse header to get packet size
            const cmdSize = data.getUint8(offset + 6) | (data.getUint8(offset + 7) << 8);
            const totalPacketSize = 8 + cmdSize; // header + payload

            // Check if we have the complete packet
            if (offset + totalPacketSize > data.byteLength) {
                // Incomplete packet, likely split across notifications - just process what we have
                break;
            }

            // Extract this packet and notify listeners
            const packetData = new DataView(data.buffer, data.byteOffset + offset, totalPacketSize);
            for (const listener of this.onPacketListeners) {
                try { listener(packetData); } catch (e) { console.error(e); }
            }

            offset += totalPacketSize;
        }
    }

    onPacket(fn: (packet: DataView) => void) {
        this.onPacketListeners.push(fn);
    }

    offPacket(fn: (packet: DataView) => void) {
        const index = this.onPacketListeners.indexOf(fn);
        if (index > -1) this.onPacketListeners.splice(index, 1);
    }

    async writePacket(data: ArrayBuffer) {
        if (data.byteLength < 8) return;

        const packetSize = this.mtuSize - 3;

        if (data.byteLength <= packetSize) {
            this.writeQueue.push(data);
        } else {
            const dataView = new DataView(data);
            const flagByte = dataView.getUint8(1);
            dataView.setUint8(1, (flagByte | BLECommandFlags.SPLIT_PK) & 0xFF);

            this.writeQueue.push(data.slice(0, packetSize));

            let buffer = data.slice(packetSize);
            const partialSize = packetSize - BLEHeader.size_partial();
            let packetCount = 1;

            while (buffer.byteLength > 0) {
                const dataSize = Math.min(buffer.byteLength, partialSize);
                const headerPart = new Uint8Array([BLE_HEADER_PT, packetCount & 0xFF]);
                const packet = ConcatArrayBuffer(headerPart.buffer, buffer.slice(0, dataSize));
                this.writeQueue.push(packet);
                buffer = buffer.slice(dataSize);
                packetCount++;
            }
        }
    }

    async setBridgePersistDelay(delay: number) {
        this.log(`Setting persist delay to ${delay}ms...`);
        const header = new BLEHeader();
        header.cmdSize = 2;
        header.cmdFlags = BLECommandFlags.SETTINGS | BLESettings.PERSIST_DELAY;
        const packet = ConcatArrayBuffer(header.toArrayBuffer(), delay & 0xFF, (delay & 0xFF00) >> 8);
        await this.writePacket(packet);
        this.log(`Persist delay set to ${delay}ms`);
    }

    async sendUDSCommand(...command: ArrayBuffer[]) {
        const header = new BLEHeader();
        header.cmdSize = command.reduce((total, ab) => total + ab.byteLength, 0);
        header.cmdFlags = BLECommandFlags.PER_CLEAR;
        await this.writePacket(ConcatArrayBuffer(header.toArrayBuffer(), ...command));
    }

    async clearPersist() {
        this.log('Clearing persist queue...');
        const header = new BLEHeader();
        header.cmdSize = 0;
        header.cmdFlags = BLECommandFlags.PER_CLEAR;
        await this.writePacket(header.toArrayBuffer());
        this.log('Persist queue cleared');
    }

    /**
     * Add persist command with SimosTools-style combined flags:
     * - isFirst: includes PER_CLEAR to clear queue before adding
     * - isLast: includes PER_ENABLE to start persist mode after adding
     */
    async addPersistCommand(command: ArrayBuffer[], isFirst: boolean, isLast: boolean) {
        const totalSize = command.reduce((total, ab) => total + ab.byteLength, 0);

        // Build flags like SimosTools:
        // First frame: PER_ADD | PER_CLEAR
        // Middle frames: PER_ADD
        // Last frame: PER_ADD | PER_ENABLE
        let flags = BLECommandFlags.PER_ADD;
        if (isFirst) {
            flags |= BLECommandFlags.PER_CLEAR;
        }
        if (isLast) {
            flags |= BLECommandFlags.PER_ENABLE;
        }

        const flagDesc = [];
        if (isFirst) flagDesc.push('CLEAR');
        flagDesc.push('ADD');
        if (isLast) flagDesc.push('ENABLE');
        this.log(`Adding persist command (${totalSize} bytes, flags=${flagDesc.join('|')})...`);

        const header = new BLEHeader();
        header.cmdSize = totalSize;
        header.cmdFlags = flags;
        await this.writePacket(ConcatArrayBuffer(header.toArrayBuffer(), ...command));
    }

    async waitForPacket(matchFn?: (data: DataView) => boolean, timeoutMs = 500): Promise<DataView> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.offPacket(listener);
                this.log(`Timeout waiting for packet (${timeoutMs}ms)`);
                reject(new Error("Timeout"));
            }, timeoutMs);

            const listener = (packet: DataView) => {
                const matches = matchFn?.(packet) ?? true;
                if (!matches) return;

                clearTimeout(timeout);
                this.offPacket(listener);
                this.log(`Received packet (${packet.byteLength} bytes)`);
                resolve(packet);
            };

            this.onPacket(listener);
        });
    }

    async getInfo(): Promise<Record<string, string>> {
        this.log('Querying ECU info...');
        const info: Record<string, string> = {};

        for (const [key, address] of Object.entries(ECU_INFO_FIELDS)) {
            const header = new BLEHeader();
            header.cmdSize = 1 + address.length;
            header.cmdFlags = BLECommandFlags.PER_CLEAR;

            await this.writePacket(ConcatArrayBuffer(header.toArrayBuffer(), NumberToArrayBuffer(0x22), ...address));

            try {
                const response = await this.waitForPacket((data) => data.getUint8(8) === UDS_RESPONSE.READ_IDENTIFIER_ACCEPTED);
                const buffer = response.buffer.slice(11, response.byteLength);
                info[key] = new TextDecoder().decode(buffer);
                this.log(`  ${key}: ${info[key]}`);
            } catch {
                info[key] = "N/A";
                this.log(`  ${key}: N/A (timeout)`);
            }
        }

        this.log('ECU info query complete');
        return info;
    }

    startGPS() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            return;
        }

        this.gpsEnabled = true;
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                this.currentGPS = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    speed: position.coords.speed,
                    heading: position.coords.heading,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude
                };
            },
            (error) => {
                console.error('GPS error:', error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 100,
                timeout: 5000
            }
        );
    }

    stopGPS() {
        this.gpsEnabled = false;
        if (this.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        this.currentGPS = null;
    }

    startAccelerometer() {
        if (!window.DeviceMotionEvent) {
            console.warn('DeviceMotion not supported');
            return;
        }

        this.accelerometerEnabled = true;
        const handler = (event: DeviceMotionEvent) => {
            if (event.accelerationIncludingGravity) {
                // Convert to G-force (divide by 9.81)
                // Note: orientation depends on device position
                this.currentAccelerometer = {
                    x: (event.accelerationIncludingGravity.x || 0) / 9.81,
                    y: (event.accelerationIncludingGravity.y || 0) / 9.81,
                    z: (event.accelerationIncludingGravity.z || 0) / 9.81
                };
            }
        };
        window.addEventListener('devicemotion', handler);
        (this as any)._accelHandler = handler;
    }

    stopAccelerometer() {
        this.accelerometerEnabled = false;
        if ((this as any)._accelHandler) {
            window.removeEventListener('devicemotion', (this as any)._accelHandler);
            (this as any)._accelHandler = null;
        }
        this.currentAccelerometer = null;
    }

    async startLogging(withGPS = false, withAccelerometer = false, vehicleSettings?: VehicleSettings, persistMode = true, chunkSize = 0) {
        this.vehicleSettings = vehicleSettings || null;
        this.loggingRate = vehicleSettings?.loggingRate || DEFAULT_LOGGING_RATE;
        this.persistModeEnabled = persistMode;
        this.chunkSize = chunkSize;

        this.log(`Starting logging: persistMode=${persistMode}, rate=${this.loggingRate}Hz, chunkSize=${chunkSize}`);

        // Clear any existing persist commands
        await this.clearPersist();

        if (persistMode) {
            // Set up persist mode with all PIDs using SimosTools-style combined flags
            await this.setBridgePersistDelay(1000 / this.loggingRate);

            const pids = [...PIDs.values()];
            const effectiveChunkSize = chunkSize > 0 ? chunkSize : pids.length;
            const numChunks = Math.ceil(pids.length / effectiveChunkSize);

            this.log(`Adding ${pids.length} PIDs in ${numChunks} chunk(s)...`);

            // Add PIDs in chunks with combined flags like SimosTools:
            // First frame: PER_ADD | PER_CLEAR
            // Middle frames: PER_ADD
            // Last frame: PER_ADD | PER_ENABLE
            for (let i = 0; i < numChunks; i++) {
                const startIdx = i * effectiveChunkSize;
                const chunk = pids.slice(startIdx, startIdx + effectiveChunkSize);
                const addresses = chunk.map(({ address }) => NumberToArrayBuffer2(address));
                const isFirst = i === 0;
                const isLast = i === numChunks - 1;
                await this.addPersistCommand([NumberToArrayBuffer(0x22), ...addresses], isFirst, isLast);
            }

            this.log('Persist mode setup complete, waiting for packets...');
        }

        this.logging = true;
        this.startTime = performance.now();
        this.previousGPS = null;

        if (withGPS) {
            this.startGPS();
        }

        if (withAccelerometer) {
            this.startAccelerometer();
        }

        const log = async () => {
            if (!this.logging) return;

            try {
                const queryStart = performance.now();
                const frame = await this.getLoggingFrame();
                frame.queryTime = Math.round(performance.now() - queryStart);
                this.lastQueryTime = frame.queryTime;

                // Add GPS data if enabled (for position tracking)
                if (this.gpsEnabled && this.currentGPS) {
                    frame.gps = { ...this.currentGPS };
                }

                // Add accelerometer data if enabled
                if (this.accelerometerEnabled && this.currentAccelerometer) {
                    frame.accelerometer = { ...this.currentAccelerometer };
                }

                // Initialize calculated data
                const calc: CalculatedData = {};

                // Airmass: Airflow / RPM * 8333.33 (mg/stk)
                const airflow = frame.data["Airflow"];
                const rpm = frame.data["Engine Speed"];
                if (airflow !== undefined && rpm !== undefined && rpm > 0) {
                    calc.airmass = Math.round(airflow / rpm * 8333.33333333 * 10) / 10;
                }

                // Boost: MAP - Ambient Pressure (bar)
                const map = frame.data["MAP"];
                const ambientPressure = frame.data["Ambient Pressure"];
                if (map !== undefined && ambientPressure !== undefined) {
                    calc.boost = Math.round((map - ambientPressure) * 100) / 100;
                }

                // Knock Avg: Average of Knock Cyl 1-4 (deg)
                const knock1 = frame.data["Knock Cyl 1"];
                const knock2 = frame.data["Knock Cyl 2"];
                const knock3 = frame.data["Knock Cyl 3"];
                const knock4 = frame.data["Knock Cyl 4"];
                if (knock1 !== undefined && knock2 !== undefined && knock3 !== undefined && knock4 !== undefined) {
                    calc.knockAvg = Math.round((knock1 + knock2 + knock3 + knock4) / 4 * 100) / 100;
                }

                // Boost Error: MAP SP - MAP (bar)
                const mapSP = frame.data["MAP SP"];
                if (map !== undefined && mapSP !== undefined) {
                    calc.boostError = Math.round((mapSP - map) * 1000) / 1000;
                }

                // Engine Power from ECU Torque: P = Torque × RPM / 9549 (kW)
                const torque = frame.data["Torque"];
                if (torque !== undefined && rpm !== undefined && rpm > 0) {
                    calc.enginePower = Math.round(torque * rpm / 9549 * 10) / 10;
                }

                // Calculate torque/power from ECU Vehicle Speed
                const vehicleSpeedKmh = frame.data["Vehicle Speed"];
                if (this.vehicleSettings && vehicleSpeedKmh !== undefined) {
                    const currentTime = performance.now();
                    const currentSpeed = vehicleSpeedKmh / 3.6; // Convert km/h to m/s

                    if (this.previousGPS) {
                        const dt = (currentTime - this.previousGPS.time) / 1000; // seconds
                        if (dt > 0.01) { // Avoid division by zero
                            const dv = currentSpeed - this.previousGPS.speed; // m/s
                            const acceleration = dv / dt; // m/s²

                            // F = m * a
                            const force = this.vehicleSettings.weight * acceleration; // N

                            // Wheel radius from circumference: r = C / (2 * π)
                            const wheelRadius = this.vehicleSettings.wheelCircumference / (2 * Math.PI) / 1000; // meters

                            // τ = F * r
                            const wheelTorque = force * wheelRadius; // Nm

                            // P = F * v (convert to kW)
                            const power = (force * currentSpeed) / 1000; // kW

                            calc.acceleration = Math.round(acceleration * 100) / 100;
                            calc.force = Math.round(force);
                            calc.wheelTorque = Math.round(wheelTorque * 10) / 10;
                            calc.power = Math.round(power * 10) / 10;

                            // Calculate engine torque from wheel torque using gear ratio
                            const gear = frame.data["Gear"];
                            if (gear !== undefined && gear >= 1 && gear <= 7) {
                                const gearRatio = this.vehicleSettings!.gearRatios[gear] || 0;
                                const finalDrive = this.vehicleSettings!.finalDrive || 1;
                                if (gearRatio > 0 && finalDrive > 0) {
                                    // Total Ratio = Gear Ratio × Final Drive
                                    const totalRatio = gearRatio * finalDrive;
                                    const calculatedTorque = wheelTorque / totalRatio;
                                    calc.calculatedTorque = Math.round(calculatedTorque * 10) / 10;

                                    // Compare with ECU torque (difference = drivetrain loss)
                                    if (torque !== undefined) {
                                        calc.torqueDiff = Math.round((torque - calculatedTorque) * 10) / 10;
                                    }
                                }
                            }
                        }
                    }

                    this.previousGPS = { speed: currentSpeed, time: currentTime };
                }

                // Only set calculated if we have any values
                if (Object.keys(calc).length > 0) {
                    frame.calculated = calc;
                }

                this.onFrame?.(frame);
            } catch (e) {
                console.error(e);
            }

            if (this.logging) {
                setTimeout(log, 1000 / this.loggingRate);
            }
        };

        log();
    }

    async stopLogging() {
        this.logging = false;
        this.stopGPS();
        this.stopAccelerometer();
        // Clear persist queue
        await this.clearPersist();
    }

    async getLoggingFrame(): Promise<LogFrame> {
        const frame: LogFrame = {
            time: (performance.now() - this.startTime) / 1000,
            data: {}
        };

        const pids = [...PIDs.values()];

        if (this.persistModeEnabled) {
            // Persist mode: bridge sends data automatically
            // Use event-driven approach: wait for all chunks of a complete cycle
            const effectiveChunkSize = this.chunkSize > 0 ? this.chunkSize : pids.length;
            const numChunks = Math.ceil(pids.length / effectiveChunkSize);

            return new Promise((resolve, reject) => {
                let packetsReceived = 0;
                let currentTickCount = 0;
                const frameData: Record<string, number> = {};

                const timeout = setTimeout(() => {
                    this.offPacket(listener);
                    this.log(`Timeout waiting for persist packets (received ${packetsReceived}/${numChunks})`);
                    reject(new Error("Timeout"));
                }, 2000);

                const listener = (packet: DataView) => {
                    // Check if this is a valid UDS response
                    if (packet.byteLength < 9) return;
                    if (packet.getUint8(8) !== UDS_RESPONSE.READ_IDENTIFIER_ACCEPTED) return;

                    // Parse header for tickCount (timing info in persist mode)
                    const header = BLEHeader.fromDataView(packet);
                    const tickCount = header.tickCount;

                    // If this is a new cycle (different tickCount), reset accumulator
                    // SimosTools uses tick to track frames, but tickCount is a timestamp
                    // We use it to detect if we're getting stale data
                    if (packetsReceived === 0) {
                        currentTickCount = tickCount;
                    } else if (numChunks === 1) {
                        // Single chunk mode: each packet is a complete frame
                        // Just parse and return immediately
                    } else if (tickCount !== currentTickCount && packetsReceived > 0) {
                        // Different tickCount - could be from a different cycle
                        // Reset and start fresh with this packet
                        packetsReceived = 0;
                        currentTickCount = tickCount;
                        Object.keys(frameData).forEach(k => delete frameData[k]);
                    }

                    // Parse PID data from this packet
                    let index = 9;
                    while (index < packet.byteLength) {
                        if (index + 2 > packet.byteLength) break;
                        const address = packet.getUint16(index);
                        index += 2;

                        const pid = PIDs.get(address);
                        if (!pid) {
                            // Unknown PID, skip - but we don't know length, so break
                            break;
                        }

                        if (index + pid.length > packet.byteLength) break;

                        let value = 0;
                        if (pid.length === 1) {
                            value = pid.signed ? packet.getInt8(index) : packet.getUint8(index);
                        } else if (pid.length === 2) {
                            value = pid.signed ? packet.getInt16(index) : packet.getUint16(index);
                        }

                        value = eval(pid.equation.replaceAll("x", String(value)));
                        const roundingFactor = Math.pow(10, pid.fractional + 1);
                        value = Math.round(value * roundingFactor) / roundingFactor;
                        frameData[pid.name] = value;

                        index += pid.length;
                    }

                    packetsReceived++;

                    // Check if we have all chunks for this cycle
                    if (packetsReceived >= numChunks) {
                        clearTimeout(timeout);
                        this.offPacket(listener);
                        this.lastTickCount = currentTickCount;

                        frame.data = frameData;
                        resolve(frame);
                    }
                };

                this.onPacket(listener);
            });
        } else {
            // Non-persist mode: send commands manually
            const effectiveChunkSize = this.chunkSize > 0 ? this.chunkSize : pids.length;

            for (let i = 0; i < pids.length; i += effectiveChunkSize) {
                const chunk = pids.slice(i, i + effectiveChunkSize);
                const addresses = chunk.map(({ address }) => NumberToArrayBuffer2(address));
                await this.sendUDSCommand(NumberToArrayBuffer(0x22), ...addresses);

                const packet = await this.waitForPacket(
                    (data) => data.getUint8(8) === UDS_RESPONSE.READ_IDENTIFIER_ACCEPTED,
                    2000
                );
                this.parsePacketData(packet, frame);
            }
        }

        return frame;
    }

    parsePacketData(packet: DataView, frame: LogFrame) {
        let index = 9;
        while (index < packet.byteLength) {
            const address = packet.getUint16(index);
            index += 2;

            const pid = PIDs.get(address);
            if (!pid) continue;

            let value = 0;
            if (pid.length === 1) {
                value = pid.signed ? packet.getInt8(index) : packet.getUint8(index);
            } else if (pid.length === 2) {
                value = pid.signed ? packet.getInt16(index) : packet.getUint16(index);
            }

            value = eval(pid.equation.replaceAll("x", String(value)));
            const roundingFactor = Math.pow(10, pid.fractional + 1);
            value = Math.round(value * roundingFactor) / roundingFactor;
            frame.data[pid.name] = value;

            index += pid.length;
        }
    }

    disconnect() {
        this.logging = false;
        if (this.interval) clearInterval(this.interval);
        this.device.gatt?.disconnect();
    }
}

interface BLEConnectorProps {
    onLogData?: (csv: string) => void;
    onClose: () => void;
    vehicleSettings?: VehicleSettings;
}

export function BLEConnector({ onLogData, onClose, vehicleSettings }: BLEConnectorProps) {
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [info, setInfo] = useState<Record<string, string> | null>(null);
    const [logging, setLogging] = useState(false);
    const [frames, setFrames] = useState<LogFrame[]>([]);
    const [mtu, setMtu] = useState(512); // Expected MTU after firmware fix
    const [currentFrame, setCurrentFrame] = useState<LogFrame | null>(null);
    const [gpsEnabled, setGpsEnabled] = useState(false);
    const [accelEnabled, setAccelEnabled] = useState(false);
    const [logStopped, setLogStopped] = useState(false);
    const [chunkSize, setChunkSize] = useState(0); // 0 = all at once
    const [persistMode, setPersistMode] = useState(true);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebugLogs, setShowDebugLogs] = useState(false);
    const gpsAvailable = !!navigator.geolocation;
    const accelAvailable = !!window.DeviceMotionEvent;
    const serviceRef = useRef<BLEService | MockBLEService | null>(null);
    const debugLogRef = useRef<HTMLDivElement | null>(null);

    async function connect() {
        try {
            setStatus('connecting');
            setDebugLogs([]);
            setShowDebugLogs(true);

            if (IS_LOCALHOST) {
                // Use mock service on localhost for testing
                const service = new MockBLEService();
                service.onLog = (message) => {
                    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
                    setDebugLogs(prev => [...prev.slice(-99), `${timestamp} ${message}`]);
                };
                await service.setup();
                serviceRef.current = service;

                setStatus('connected');
                const ecuInfo = await service.getInfo();
                setInfo(ecuInfo);
                return;
            }

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BLE_SERVICE_UUID] }]
            });

            const service = new BLEService(device, mtu);
            service.onLog = (message) => {
                const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
                setDebugLogs(prev => [...prev.slice(-99), `${timestamp} ${message}`]);
            };
            await service.setup();
            serviceRef.current = service;

            setStatus('connected');

            // Get ECU info
            const ecuInfo = await service.getInfo();
            setInfo(ecuInfo);
        } catch (e) {
            console.error(e);
            setStatus('disconnected');
        }
    }

    function disconnect() {
        serviceRef.current?.disconnect();
        serviceRef.current = null;
        setStatus('disconnected');
        setInfo(null);
        setLogging(false);
    }

    async function toggleLogging() {
        if (!serviceRef.current) return;

        if (logging) {
            await serviceRef.current.stopLogging();
            setLogging(false);
            setLogStopped(true);
        } else {
            setFrames([]);
            setLogStopped(false);
            setCurrentFrame(null);
            serviceRef.current.onFrame = (frame) => {
                setCurrentFrame(frame);
                setFrames(prev => [...prev, frame]);
            };
            await serviceRef.current.startLogging(gpsEnabled, accelEnabled, vehicleSettings, persistMode, chunkSize);
            setLogging(true);
        }
    }

    function buildCSV(): string {
        if (frames.length === 0) return '';

        const hasGPS = frames.some(f => f.gps);
        const hasAccel = frames.some(f => f.accelerometer);
        const hasCalculated = frames.some(f => f.calculated);
        const gpsFields = hasGPS ? ['GPS_lat', 'GPS_lon', 'GPS_speed_ms', 'GPS_speed_kmh', 'GPS_heading', 'GPS_altitude', 'GPS_accuracy'] : [];
        const accelFields = hasAccel ? ['G_lateral', 'G_longitudinal', 'G_vertical'] : [];
        const calcFields = hasCalculated ? ['Airmass_mg', 'Boost_bar', 'BoostError_bar', 'KnockAvg_deg', 'EnginePower_kW', 'Accel_ms2', 'Force_N', 'WheelTorque_Nm', 'CalcTorque_Nm', 'TorqueDiff_Nm', 'WheelPower_kW'] : [];
        const fields = ['time', 'queryTime_ms', ...Object.keys(frames[0].data), ...gpsFields, ...accelFields, ...calcFields];
        const header = fields.join(',');

        const rows = frames.map(f => {
            const baseData: string[] = [f.time.toFixed(3), String(f.queryTime ?? ''), ...Object.values(f.data).map(v => String(v))];
            if (hasGPS) {
                if (f.gps) {
                    const speedKmh = f.gps.speed !== null ? (f.gps.speed * 3.6).toFixed(2) : '';
                    baseData.push(
                        f.gps.latitude.toFixed(7),
                        f.gps.longitude.toFixed(7),
                        f.gps.speed?.toFixed(2) ?? '',
                        speedKmh,
                        f.gps.heading?.toFixed(1) ?? '',
                        f.gps.altitude?.toFixed(1) ?? '',
                        f.gps.accuracy.toFixed(1)
                    );
                } else {
                    baseData.push('', '', '', '', '', '', '');
                }
            }
            if (hasAccel) {
                if (f.accelerometer) {
                    baseData.push(
                        f.accelerometer.x.toFixed(3),
                        f.accelerometer.y.toFixed(3),
                        f.accelerometer.z.toFixed(3)
                    );
                } else {
                    baseData.push('', '', '');
                }
            }
            if (hasCalculated) {
                if (f.calculated) {
                    baseData.push(
                        f.calculated.airmass?.toFixed(1) ?? '',
                        f.calculated.boost?.toFixed(2) ?? '',
                        f.calculated.boostError?.toFixed(3) ?? '',
                        f.calculated.knockAvg?.toFixed(2) ?? '',
                        f.calculated.enginePower?.toFixed(1) ?? '',
                        f.calculated.acceleration?.toFixed(2) ?? '',
                        f.calculated.force?.toFixed(0) ?? '',
                        f.calculated.wheelTorque?.toFixed(1) ?? '',
                        f.calculated.calculatedTorque?.toFixed(1) ?? '',
                        f.calculated.torqueDiff?.toFixed(1) ?? '',
                        f.calculated.power?.toFixed(1) ?? ''
                    );
                } else {
                    baseData.push('', '', '', '', '', '', '', '', '', '', '');
                }
            }
            return baseData.join(',');
        });

        return [header, ...rows].join('\n');
    }

    function exportCSV() {
        const csv = buildCSV();
        if (csv) onLogData?.(csv);
    }

    async function shareCSV() {
        const csv = buildCSV();
        if (!csv) return;

        const filename = `log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const file = new File([blob], filename, { type: 'text/csv' });

        try {
            await navigator.share({
                files: [file],
                title: 'Log Data',
            });
        } catch (e) {
            // User cancelled or share failed
            if ((e as Error).name !== 'AbortError') {
                console.error('Share failed:', e);
            }
        }
    }

    function downloadCSV() {
        const csv = buildCSV();
        if (!csv) return;

        const filename = `log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // Delay cleanup for mobile browsers
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 500);
    }

    const canShare = (() => {
        try {
            return typeof navigator !== 'undefined' &&
                !!navigator.share &&
                !!navigator.canShare &&
                navigator.canShare({ files: [new File([''], 'test.csv', { type: 'text/csv' })] });
        } catch {
            return false;
        }
    })();

    async function copyCSV() {
        const csv = buildCSV();
        if (!csv) return;
        try {
            await navigator.clipboard.writeText(csv);
            alert('CSV copied to clipboard!');
        } catch {
            // Fallback: show in prompt for manual copy
            prompt('Copy this CSV data:', csv.slice(0, 1000) + '...');
        }
    }

    useEffect(() => {
        return () => {
            serviceRef.current?.disconnect();
        };
    }, []);

    // Auto-scroll debug logs
    useEffect(() => {
        if (debugLogRef.current) {
            debugLogRef.current.scrollTop = debugLogRef.current.scrollHeight;
        }
    }, [debugLogs]);

    return (
        <Modal title="BLE ISO-TP Bridge" onClose={onClose} width="lg">
            {/* Connection status */}
                    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                        <div class="flex items-center gap-3">
                            <div class={`w-3 h-3 rounded-full shrink-0 ${
                                status === 'connected' ? 'bg-green-500' :
                                status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                                'bg-zinc-500'
                            }`} />
                            <span class="text-sm">
                                {status === 'connected' ? (IS_LOCALHOST ? 'Connected (Mock)' : `Connected (MTU: ${mtu})`) :
                                 status === 'connecting' ? 'Connecting...' :
                                 'Disconnected'}
                            </span>
                        </div>

                        {status === 'disconnected' && (
                            <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
                                {!IS_LOCALHOST && (
                                    <>
                                        <label class="text-xs text-zinc-400">MTU:</label>
                                        <input
                                            type="number"
                                            value={mtu}
                                            onChange={(e) => setMtu(Number((e.target as HTMLInputElement).value))}
                                            class="w-20 px-2 py-2 sm:py-1 text-sm bg-zinc-700 border border-zinc-600 rounded"
                                            min={23}
                                            max={517}
                                        />
                                    </>
                                )}
                                <button
                                    onClick={connect}
                                    class="flex-1 sm:flex-none px-4 py-2.5 sm:py-1.5 text-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded font-medium"
                                >
                                    {IS_LOCALHOST ? 'Connect (Mock)' : 'Connect'}
                                </button>
                            </div>
                        )}
                        {status === 'connected' && (
                            <button
                                onClick={disconnect}
                                class="sm:ml-auto px-4 py-2.5 sm:py-1.5 text-sm bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 rounded"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>

                    {/* ECU Info */}
                    {info && (
                        <div class="mb-4 p-3 bg-zinc-900 rounded border border-zinc-700">
                            <div class="text-xs text-zinc-400 mb-2">ECU Info</div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                                {Object.entries(info).map(([key, value]) => (
                                    <div key={key} class="flex">
                                        <span class="text-zinc-500 w-24 sm:w-28 shrink-0">{key}:</span>
                                        <span class="text-zinc-300 truncate">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Connection Parameters */}
                    {status === 'connected' && !logging && (
                        <div class="mb-4 p-3 bg-zinc-900 rounded border border-zinc-700">
                            <div class="text-xs text-zinc-400 mb-2">Connection Parameters</div>
                            <div class="flex flex-wrap items-center gap-4">
                                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={persistMode}
                                        onChange={(e) => setPersistMode((e.target as HTMLInputElement).checked)}
                                        class="w-5 h-5 sm:w-4 sm:h-4 rounded bg-zinc-700 border-zinc-600"
                                    />
                                    <span>Persist Mode</span>
                                    <span class="text-xs text-zinc-500">(bridge auto-queries)</span>
                                </label>
                                <div class="flex items-center gap-2">
                                    <label class="text-xs text-zinc-400">Chunk Size:</label>
                                    <input
                                        type="number"
                                        value={chunkSize}
                                        onChange={(e) => setChunkSize(Number((e.target as HTMLInputElement).value))}
                                        class="w-16 px-2 py-2 sm:py-1 text-sm bg-zinc-700 border border-zinc-600 rounded"
                                        min={0}
                                        max={PIDs.size}
                                        placeholder="0"
                                    />
                                    <span class="text-xs text-zinc-500">
                                        {chunkSize === 0 ? `(all ${PIDs.size})` : `(${Math.ceil(PIDs.size / chunkSize)} chunks)`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Logging controls */}
                    {status === 'connected' && (
                        <div class="mb-4">
                            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div class="flex items-center gap-3">
                                    <button
                                        onClick={toggleLogging}
                                        class={`flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm rounded font-medium ${
                                            logging
                                                ? 'bg-red-600 hover:bg-red-500 active:bg-red-700'
                                                : 'bg-green-600 hover:bg-green-500 active:bg-green-700'
                                        }`}
                                    >
                                        {logging ? 'Stop Logging' : 'Start Logging'}
                                    </button>

                                    {!logging && gpsAvailable && (
                                        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={gpsEnabled}
                                                onChange={(e) => setGpsEnabled((e.target as HTMLInputElement).checked)}
                                                class="w-5 h-5 sm:w-4 sm:h-4 rounded bg-zinc-700 border-zinc-600"
                                            />
                                            <span>GPS</span>
                                        </label>
                                    )}

                                    {!logging && accelAvailable && (
                                        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={accelEnabled}
                                                onChange={(e) => setAccelEnabled((e.target as HTMLInputElement).checked)}
                                                class="w-5 h-5 sm:w-4 sm:h-4 rounded bg-zinc-700 border-zinc-600"
                                            />
                                            <span>G-Force</span>
                                        </label>
                                    )}

                                    {!logging && vehicleSettings && (
                                        <span class="text-xs text-zinc-500">
                                            {vehicleSettings.loggingRate}Hz
                                        </span>
                                    )}

                                    {logging && currentFrame?.queryTime !== undefined && (
                                        <span class={`text-xs font-mono ${
                                            currentFrame.queryTime > (1000 / (vehicleSettings?.loggingRate || 20))
                                                ? 'text-red-400'
                                                : 'text-green-400'
                                        }`}>
                                            {currentFrame.queryTime}ms
                                            {currentFrame.queryTime > (1000 / (vehicleSettings?.loggingRate || 20)) && (
                                                <span class="text-zinc-500 ml-1">
                                                    (max {Math.floor(1000 / currentFrame.queryTime)}Hz)
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </div>

                                {logging && gpsEnabled && currentFrame?.gps && (
                                    <span class="text-xs text-zinc-400 font-mono">
                                        GPS: {(currentFrame.gps.speed !== null ? (currentFrame.gps.speed * 3.6).toFixed(1) : '?')} km/h
                                        {currentFrame.gps.accuracy > 10 && (
                                            <span class="text-yellow-500 ml-1">
                                                (±{currentFrame.gps.accuracy.toFixed(0)}m)
                                            </span>
                                        )}
                                    </span>
                                )}

                                {logging && frames.length > 0 && (
                                    <span class="text-sm text-zinc-400 text-center sm:text-left">
                                        {frames.length} frames ({(frames.length / (vehicleSettings?.loggingRate || 20)).toFixed(1)}s)
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Log captured summary (shown when stopped) */}
                    {!logging && logStopped && (
                        <div class={`mb-4 p-4 rounded border ${frames.length > 0 ? 'bg-green-900/30 border-green-700' : 'bg-yellow-900/30 border-yellow-700'}`}>
                            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div class="flex-1">
                                    {frames.length > 0 ? (
                                        <>
                                            <div class="text-green-300 font-medium">
                                                Log captured: {frames.length} frames
                                            </div>
                                            <div class="text-sm text-green-400/70">
                                                Duration: {(frames[frames.length - 1]?.time ?? 0).toFixed(1)}s
                                                {frames[0]?.gps && ' • GPS recorded'}
                                                {frames[0]?.accelerometer && ' • G-force recorded'}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div class="text-yellow-300 font-medium">
                                                No data captured
                                            </div>
                                            <div class="text-sm text-yellow-400/70">
                                                Check ECU connection and try again
                                            </div>
                                        </>
                                    )}
                                </div>
                                {frames.length > 0 && (
                                    <div class="flex gap-2">
                                        {canShare && (
                                            <button
                                                onClick={shareCSV}
                                                class="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 text-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded font-medium"
                                            >
                                                Share
                                            </button>
                                        )}
                                        <button
                                            onClick={downloadCSV}
                                            class="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 text-sm bg-green-600 hover:bg-green-500 active:bg-green-700 rounded font-medium"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={copyCSV}
                                            class="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 text-sm bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 rounded"
                                        >
                                            Copy
                                        </button>
                                        <button
                                            onClick={exportCSV}
                                            class="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 text-sm bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 rounded"
                                        >
                                            View
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Live data */}
                    {currentFrame && logging && (
                        <div class="p-2 sm:p-3 bg-zinc-900 rounded border border-zinc-700">
                            <div class="text-xs text-zinc-400 mb-2">Live Data</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 text-xs font-mono">
                                {Object.entries(currentFrame.data).map(([name, value]) => {
                                    const pid = [...PIDs.values()].find(p => p.name === name);
                                    return (
                                        <div key={name} class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400 truncate mr-1">{name}</span>
                                            <span class="text-zinc-100 shrink-0">
                                                {value.toFixed(pid?.fractional ?? 1)}
                                                {pid?.unit && <span class="text-zinc-500 ml-1">{pid.unit}</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* GPS Data */}
                            {gpsEnabled && currentFrame.gps && (
                                <>
                                    <div class="text-xs text-zinc-400 mb-2 mt-3 sm:mt-4">GPS Data</div>
                                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 text-xs font-mono">
                                        <div class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Speed</span>
                                            <span class="text-zinc-100">
                                                {currentFrame.gps.speed !== null ? (currentFrame.gps.speed * 3.6).toFixed(1) : '-'}
                                                <span class="text-zinc-500 ml-1">km/h</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Heading</span>
                                            <span class="text-zinc-100">
                                                {currentFrame.gps.heading !== null ? currentFrame.gps.heading.toFixed(0) : '-'}
                                                <span class="text-zinc-500 ml-1">°</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Altitude</span>
                                            <span class="text-zinc-100">
                                                {currentFrame.gps.altitude !== null ? currentFrame.gps.altitude.toFixed(0) : '-'}
                                                <span class="text-zinc-500 ml-1">m</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Accuracy</span>
                                            <span class={`text-zinc-100 ${currentFrame.gps.accuracy > 10 ? 'text-yellow-400' : ''}`}>
                                                {currentFrame.gps.accuracy.toFixed(0)}
                                                <span class="text-zinc-500 ml-1">m</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-zinc-800 px-2 py-1.5 sm:py-1 rounded col-span-2">
                                            <span class="text-zinc-400">Position</span>
                                            <span class="text-zinc-100 text-[10px] sm:text-xs">
                                                {currentFrame.gps.latitude.toFixed(5)}, {currentFrame.gps.longitude.toFixed(5)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Accelerometer Data */}
                            {accelEnabled && currentFrame.accelerometer && (
                                <>
                                    <div class="text-xs text-zinc-400 mb-2 mt-3 sm:mt-4">G-Force</div>
                                    <div class="grid grid-cols-3 gap-1.5 sm:gap-2 text-xs font-mono">
                                        <div class="flex justify-between bg-amber-900/30 border border-amber-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Lateral</span>
                                            <span class="text-amber-300">
                                                {currentFrame.accelerometer.x >= 0 ? '+' : ''}{currentFrame.accelerometer.x.toFixed(2)}
                                                <span class="text-zinc-500 ml-1">G</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-amber-900/30 border border-amber-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Accel</span>
                                            <span class="text-amber-300">
                                                {currentFrame.accelerometer.y >= 0 ? '+' : ''}{currentFrame.accelerometer.y.toFixed(2)}
                                                <span class="text-zinc-500 ml-1">G</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-amber-900/30 border border-amber-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Vertical</span>
                                            <span class="text-amber-300">
                                                {currentFrame.accelerometer.z >= 0 ? '+' : ''}{currentFrame.accelerometer.z.toFixed(2)}
                                                <span class="text-zinc-500 ml-1">G</span>
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Calculated Data */}
                            {currentFrame.calculated && (
                                <>
                                    <div class="text-xs text-zinc-400 mb-2 mt-3 sm:mt-4">Calculated</div>
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-xs font-mono">
                                        {currentFrame.calculated.airmass !== undefined && (
                                            <div class="flex justify-between bg-purple-900/30 border border-purple-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Airmass</span>
                                                <span class="text-purple-300">
                                                    {currentFrame.calculated.airmass.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">mg</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.boost !== undefined && (
                                            <div class="flex justify-between bg-purple-900/30 border border-purple-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Boost</span>
                                                <span class="text-purple-300">
                                                    {currentFrame.calculated.boost.toFixed(2)}
                                                    <span class="text-zinc-500 ml-1">bar</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.boostError !== undefined && (
                                            <div class={`flex justify-between px-2 py-1.5 sm:py-1 rounded ${
                                                Math.abs(currentFrame.calculated.boostError) > 0.1
                                                    ? 'bg-yellow-900/30 border border-yellow-800/50'
                                                    : 'bg-purple-900/30 border border-purple-800/50'
                                            }`}>
                                                <span class="text-zinc-400">Boost Err</span>
                                                <span class={Math.abs(currentFrame.calculated.boostError) > 0.1 ? 'text-yellow-300' : 'text-purple-300'}>
                                                    {currentFrame.calculated.boostError >= 0 ? '+' : ''}{currentFrame.calculated.boostError.toFixed(3)}
                                                    <span class="text-zinc-500 ml-1">bar</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.knockAvg !== undefined && (
                                            <div class={`flex justify-between px-2 py-1.5 sm:py-1 rounded ${
                                                currentFrame.calculated.knockAvg < -1
                                                    ? 'bg-red-900/30 border border-red-800/50'
                                                    : 'bg-purple-900/30 border border-purple-800/50'
                                            }`}>
                                                <span class="text-zinc-400">Knock</span>
                                                <span class={currentFrame.calculated.knockAvg < -1 ? 'text-red-300' : 'text-purple-300'}>
                                                    {currentFrame.calculated.knockAvg.toFixed(2)}
                                                    <span class="text-zinc-500 ml-1">°</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.acceleration !== undefined && (
                                            <div class="flex justify-between bg-blue-900/30 border border-blue-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Accel</span>
                                                <span class="text-blue-300">
                                                    {currentFrame.calculated.acceleration.toFixed(2)}
                                                    <span class="text-zinc-500 ml-1">m/s²</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.force !== undefined && (
                                            <div class="flex justify-between bg-blue-900/30 border border-blue-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Force</span>
                                                <span class="text-blue-300">
                                                    {currentFrame.calculated.force.toFixed(0)}
                                                    <span class="text-zinc-500 ml-1">N</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.wheelTorque !== undefined && (
                                            <div class="flex justify-between bg-green-900/30 border border-green-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Wheel Tq</span>
                                                <span class="text-green-300">
                                                    {currentFrame.calculated.wheelTorque.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">Nm</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.calculatedTorque !== undefined && (
                                            <div class="flex justify-between bg-cyan-900/30 border border-cyan-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Calc Tq</span>
                                                <span class="text-cyan-300">
                                                    {currentFrame.calculated.calculatedTorque.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">Nm</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.torqueDiff !== undefined && (
                                            <div class={`flex justify-between px-2 py-1.5 sm:py-1 rounded ${
                                                Math.abs(currentFrame.calculated.torqueDiff) > 30
                                                    ? 'bg-yellow-900/30 border border-yellow-800/50'
                                                    : 'bg-cyan-900/30 border border-cyan-800/50'
                                            }`}>
                                                <span class="text-zinc-400">Tq Diff</span>
                                                <span class={Math.abs(currentFrame.calculated.torqueDiff) > 30 ? 'text-yellow-300' : 'text-cyan-300'}>
                                                    {currentFrame.calculated.torqueDiff >= 0 ? '+' : ''}{currentFrame.calculated.torqueDiff.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">Nm</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.enginePower !== undefined && (
                                            <div class="flex justify-between bg-orange-900/30 border border-orange-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">ECU Power</span>
                                                <span class="text-orange-300">
                                                    {currentFrame.calculated.enginePower.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">kW</span>
                                                </span>
                                            </div>
                                        )}
                                        {currentFrame.calculated.power !== undefined && (
                                            <div class="flex justify-between bg-green-900/30 border border-green-800/50 px-2 py-1.5 sm:py-1 rounded">
                                                <span class="text-zinc-400">Wheel Power</span>
                                                <span class="text-green-300">
                                                    {currentFrame.calculated.power.toFixed(1)}
                                                    <span class="text-zinc-500 ml-1">kW</span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* No BLE support warning */}
            {!navigator.bluetooth && (
                <div class="p-4 bg-red-900/30 border border-red-700 rounded text-sm text-red-300 text-center">
                    Web Bluetooth is not supported in this browser.
                    <br />
                    <span class="text-xs text-red-400">Use Chrome or Edge on Desktop/Android</span>
                </div>
            )}

            {/* Debug Log Panel */}
            {status !== 'disconnected' && (
                <div class="mt-4 border-t border-zinc-700 pt-4">
                    <div class="flex items-center justify-between mb-2">
                        <button
                            onClick={() => setShowDebugLogs(!showDebugLogs)}
                            class="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                        >
                            <span>{showDebugLogs ? '▼' : '▶'}</span>
                            <span>Debug Log ({debugLogs.length})</span>
                        </button>
                        {showDebugLogs && debugLogs.length > 0 && (
                            <button
                                onClick={() => setDebugLogs([])}
                                class="text-xs text-zinc-500 hover:text-zinc-400"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    {showDebugLogs && (
                        <div
                            ref={debugLogRef}
                            class="h-32 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded p-2 font-mono text-xs"
                        >
                            {debugLogs.length === 0 ? (
                                <div class="text-zinc-500 italic">No log entries yet...</div>
                            ) : (
                                debugLogs.map((log, i) => (
                                    <div key={i} class="text-zinc-400 whitespace-pre-wrap">
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
