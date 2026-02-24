export interface VehicleSettings {
    weight: number;
    tireWidth: number;
    tireAspect: number;
    rimDiameter: number;
    wheelCircumference: number;
    useManualCircumference: boolean;
    gearRatios: number[];
    finalDrive: number;
    loggingRate: number;
}

export const DEFAULT_VEHICLE_SETTINGS: VehicleSettings = {
    weight: 1500,
    tireWidth: 225,
    tireAspect: 45,
    rimDiameter: 17,
    wheelCircumference: 1987,
    useManualCircumference: false,
    gearRatios: [0, 13.24, 8.23, 5.79, 4.33, 3.40, 2.87, 0],
    finalDrive: 1,
    loggingRate: 20,
};

const STORAGE_KEY = 'vehicleSettings';

export function loadSettings(): VehicleSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return {...DEFAULT_VEHICLE_SETTINGS, ...JSON.parse(stored)};
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return DEFAULT_VEHICLE_SETTINGS;
}

export function saveSettings(settings: VehicleSettings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

export function calculateWheelCircumference(width: number, aspect: number, rimDiameter: number): number {
    const sidewallHeight = width * (aspect / 100);
    const rimDiameterMm = rimDiameter * 25.4;
    const totalDiameter = rimDiameterMm + 2 * sidewallHeight;
    return Math.round(Math.PI * totalDiameter);
}
