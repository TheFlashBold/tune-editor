import { useState, useRef, useEffect } from 'preact/hooks';
import type { VehicleSettings } from '../app';
import { Modal } from './Modal';

const BLE_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
const BLE_DATA_TX_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
const BLE_DATA_RX_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";

const LOGGING_RATE = 20; // hz

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

function chunkArray<T>(input: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(input.length / size) }, (_, i) =>
        input.slice(i * size, i * size + size)
    );
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

interface CalculatedData {
    acceleration: number; // m/s²
    force: number; // N
    wheelTorque: number; // Nm
    power: number; // kW
}

interface LogFrame {
    time: number;
    data: Record<string, number>;
    gps?: GPSData;
    calculated?: CalculatedData;
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
    onPacketListeners: ((packet: DataView) => void)[] = [];
    startTime = 0;
    mtuSize: number;
    gpsEnabled = false;
    gpsWatchId: number | null = null;
    currentGPS: GPSData | null = null;
    previousGPS: { speed: number; time: number } | null = null;
    vehicleSettings: VehicleSettings | null = null;

    constructor(device: BluetoothDevice, mtuSize: number = DEFAULT_MTU_SIZE) {
        this.device = device;
        this.mtuSize = mtuSize;
    }

    async setup() {
        if (!this.device.gatt) throw new Error("No GATT");
        await this.device.gatt.connect();

        this.service = await this.device.gatt.getPrimaryService(BLE_SERVICE_UUID);
        this.reader = await this.service.getCharacteristic(BLE_DATA_RX_UUID);
        await this.reader.startNotifications();
        this.reader.addEventListener("characteristicvaluechanged", () => {
            if (this.reader?.value) this.onReadValue(this.reader.value);
        });

        this.writer = await this.service.getCharacteristic(BLE_DATA_TX_UUID);
        this.interval = setInterval(this.run.bind(this), 1000 / (LOGGING_RATE * 2));
    }

    async run() {
        if (this.writeQueue.length > 0 && this.writer) {
            const writeValue = this.writeQueue.shift();
            if (writeValue) await this.writer.writeValueWithoutResponse(writeValue);
        }
    }

    onReadValue(data: DataView) {
        for (const listener of this.onPacketListeners) {
            try { listener(data); } catch (e) { console.error(e); }
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
        const header = new BLEHeader();
        header.cmdSize = 2;
        header.cmdFlags = BLECommandFlags.SETTINGS | BLESettings.PERSIST_DELAY;
        const packet = ConcatArrayBuffer(header.toArrayBuffer(), delay & 0xFF, (delay & 0xFF00) >> 8);
        await this.writePacket(packet);
    }

    async sendUDSCommand(...command: ArrayBuffer[]) {
        const header = new BLEHeader();
        header.cmdSize = command.reduce((total, ab) => total + ab.byteLength, 0);
        header.cmdFlags = BLECommandFlags.PER_CLEAR;
        await this.writePacket(ConcatArrayBuffer(header.toArrayBuffer(), ...command));
    }

    async waitForPacket(matchFn?: (data: DataView) => boolean, timeoutMs = 500): Promise<DataView> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.offPacket(listener);
                reject(new Error("Timeout"));
            }, timeoutMs);

            const listener = (packet: DataView) => {
                const matches = matchFn?.(packet) ?? true;
                if (!matches) return;

                clearTimeout(timeout);
                this.offPacket(listener);
                resolve(packet);
            };

            this.onPacket(listener);
        });
    }

    async getInfo(): Promise<Record<string, string>> {
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
            } catch {
                info[key] = "N/A";
            }
        }

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

    async startLogging(withGPS = false, vehicleSettings?: VehicleSettings) {
        await this.setBridgePersistDelay(1000 / LOGGING_RATE);
        this.logging = true;
        this.startTime = performance.now();
        this.vehicleSettings = vehicleSettings || null;
        this.previousGPS = null;

        if (withGPS) {
            this.startGPS();
        }

        const log = async () => {
            if (!this.logging) return;

            try {
                const frame = await this.getLoggingFrame();
                if (this.gpsEnabled && this.currentGPS) {
                    frame.gps = { ...this.currentGPS };

                    // Calculate derived values if we have vehicle settings and valid GPS speed
                    if (this.vehicleSettings && this.currentGPS.speed !== null) {
                        const currentTime = performance.now();
                        const currentSpeed = this.currentGPS.speed; // m/s

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

                                frame.calculated = {
                                    acceleration: Math.round(acceleration * 100) / 100,
                                    force: Math.round(force),
                                    wheelTorque: Math.round(wheelTorque * 10) / 10,
                                    power: Math.round(power * 10) / 10
                                };
                            }
                        }

                        this.previousGPS = { speed: currentSpeed, time: currentTime };
                    }
                }
                this.onFrame?.(frame);
            } catch (e) {
                console.error(e);
            }

            if (this.logging) {
                setTimeout(log, 1000 / LOGGING_RATE);
            }
        };

        log();
    }

    stopLogging() {
        this.logging = false;
        this.stopGPS();
    }

    async getLoggingFrame(): Promise<LogFrame> {
        const frame: LogFrame = {
            time: (performance.now() - this.startTime) / 1000,
            data: {}
        };

        const chunkedPids = chunkArray([...PIDs.values()], 5);

        for (const pids of chunkedPids) {
            const addresses = pids.map(({ address }) => NumberToArrayBuffer2(address));
            await this.sendUDSCommand(NumberToArrayBuffer(0x22), ...addresses);

            const packet = await this.waitForPacket();
            if (packet.getUint8(8) !== UDS_RESPONSE.READ_IDENTIFIER_ACCEPTED) {
                throw new Error("Invalid response");
            }

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

        return frame;
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
    const gpsAvailable = !!navigator.geolocation;
    const serviceRef = useRef<BLEService | null>(null);

    async function connect() {
        try {
            setStatus('connecting');

            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BLE_SERVICE_UUID] }]
            });

            const service = new BLEService(device, mtu);
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
            serviceRef.current.stopLogging();
            setLogging(false);
        } else {
            setFrames([]);
            serviceRef.current.onFrame = (frame) => {
                setCurrentFrame(frame);
                setFrames(prev => [...prev, frame]);
            };
            await serviceRef.current.startLogging(gpsEnabled, vehicleSettings);
            setLogging(true);
        }
    }

    function buildCSV(): string {
        if (frames.length === 0) return '';

        const hasGPS = frames.some(f => f.gps);
        const hasCalculated = frames.some(f => f.calculated);
        const gpsFields = hasGPS ? ['GPS_lat', 'GPS_lon', 'GPS_speed_ms', 'GPS_speed_kmh', 'GPS_heading', 'GPS_altitude', 'GPS_accuracy'] : [];
        const calcFields = hasCalculated ? ['Calc_acceleration_ms2', 'Calc_force_N', 'Calc_wheelTorque_Nm', 'Calc_power_kW'] : [];
        const fields = ['time', ...Object.keys(frames[0].data), ...gpsFields, ...calcFields];
        const header = fields.join(',');

        const rows = frames.map(f => {
            const baseData: string[] = [f.time.toFixed(3), ...Object.values(f.data).map(v => String(v))];
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
            if (hasCalculated) {
                if (f.calculated) {
                    baseData.push(
                        f.calculated.acceleration.toFixed(2),
                        f.calculated.force.toFixed(0),
                        f.calculated.wheelTorque.toFixed(1),
                        f.calculated.power.toFixed(1)
                    );
                } else {
                    baseData.push('', '', '', '');
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

    function downloadCSV() {
        const csv = buildCSV();
        if (!csv) return;

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `log_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    useEffect(() => {
        return () => {
            serviceRef.current?.disconnect();
        };
    }, []);

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
                                {status === 'connected' ? `Connected (MTU: ${mtu})` :
                                 status === 'connecting' ? 'Connecting...' :
                                 'Disconnected'}
                            </span>
                        </div>

                        {status === 'disconnected' && (
                            <div class="flex items-center gap-2 sm:ml-auto">
                                <label class="text-xs text-zinc-400">MTU:</label>
                                <input
                                    type="number"
                                    value={mtu}
                                    onChange={(e) => setMtu(Number((e.target as HTMLInputElement).value))}
                                    class="w-20 px-2 py-2 sm:py-1 text-sm bg-zinc-700 border border-zinc-600 rounded"
                                    min={23}
                                    max={517}
                                />
                                <button
                                    onClick={connect}
                                    class="flex-1 sm:flex-none px-4 py-2.5 sm:py-1.5 text-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded font-medium"
                                >
                                    Connect
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
                                        <label class="flex items-center gap-2 text-sm cursor-pointer select-none" title={vehicleSettings ? `Weight: ${vehicleSettings.weight}kg, Wheel: ${vehicleSettings.wheelCircumference}mm` : 'Configure in Settings'}>
                                            <input
                                                type="checkbox"
                                                checked={gpsEnabled}
                                                onChange={(e) => setGpsEnabled((e.target as HTMLInputElement).checked)}
                                                class="w-5 h-5 sm:w-4 sm:h-4 rounded bg-zinc-700 border-zinc-600"
                                            />
                                            <span>GPS + Torque</span>
                                            {vehicleSettings && (
                                                <span class="text-xs text-zinc-500">({vehicleSettings.weight}kg)</span>
                                            )}
                                        </label>
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

                                {frames.length > 0 && (
                                    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                                        <span class="text-sm text-zinc-400 text-center sm:text-left">
                                            {frames.length} frames ({(frames.length / LOGGING_RATE).toFixed(1)}s)
                                        </span>
                                        <div class="flex gap-2">
                                            <button
                                                onClick={downloadCSV}
                                                class="flex-1 px-3 py-2.5 sm:py-1.5 text-sm bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 rounded"
                                            >
                                                Download CSV
                                            </button>
                                            <button
                                                onClick={exportCSV}
                                                class="flex-1 px-3 py-2.5 sm:py-1.5 text-sm bg-zinc-600 hover:bg-zinc-500 active:bg-zinc-700 rounded"
                                            >
                                                Log Viewer
                                            </button>
                                        </div>
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

                            {/* Calculated Data */}
                            {gpsEnabled && currentFrame.calculated && (
                                <>
                                    <div class="text-xs text-zinc-400 mb-2 mt-3 sm:mt-4">Calculated (from GPS)</div>
                                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-xs font-mono">
                                        <div class="flex justify-between bg-blue-900/30 border border-blue-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Accel</span>
                                            <span class="text-blue-300">
                                                {currentFrame.calculated.acceleration.toFixed(2)}
                                                <span class="text-zinc-500 ml-1">m/s²</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-blue-900/30 border border-blue-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Force</span>
                                            <span class="text-blue-300">
                                                {currentFrame.calculated.force.toFixed(0)}
                                                <span class="text-zinc-500 ml-1">N</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-green-900/30 border border-green-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Torque</span>
                                            <span class="text-green-300">
                                                {currentFrame.calculated.wheelTorque.toFixed(1)}
                                                <span class="text-zinc-500 ml-1">Nm</span>
                                            </span>
                                        </div>
                                        <div class="flex justify-between bg-green-900/30 border border-green-800/50 px-2 py-1.5 sm:py-1 rounded">
                                            <span class="text-zinc-400">Power</span>
                                            <span class="text-green-300">
                                                {currentFrame.calculated.power.toFixed(1)}
                                                <span class="text-zinc-500 ml-1">kW</span>
                                            </span>
                                        </div>
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
        </Modal>
    );
}
