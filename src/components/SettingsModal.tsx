import {Modal} from './Modal';
import type {VehicleSettings} from '../lib/vehicleSettings';
import {calculateWheelCircumference} from '../lib/vehicleSettings';

interface SettingsModalProps {
    settings: VehicleSettings;
    onUpdate: (updates: Partial<VehicleSettings>) => void;
    onClose: () => void;
}

export function SettingsModal({settings, onUpdate, onClose}: SettingsModalProps) {
    return (
        <Modal title="Settings" onClose={onClose} width="lg">
            <div className="space-y-5 sm:space-y-6">
                {/* Logging Section */}
                <div className="border-b border-zinc-300 dark:border-zinc-700 pb-1">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Logging</h3>
                </div>

                {/* Logging Rate */}
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Logging Rate
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={settings.loggingRate}
                            onChange={(e) => onUpdate({loggingRate: Number((e.target as HTMLInputElement).value)})}
                            className="w-20 px-3 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm"
                            min={1}
                            max={100}
                            step={1}
                        />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">Hz</span>
                        <span className="text-xs text-zinc-500 ml-2">
                            ({(1000 / settings.loggingRate).toFixed(0)}ms per frame)
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                        Higher rates need faster ECU response. Check query time in datalogger.
                    </p>
                </div>

                {/* Vehicle Section */}
                <div className="border-b border-zinc-700 pb-1 mt-2">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Vehicle</h3>
                </div>

                {/* Vehicle Weight */}
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Weight
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={settings.weight}
                            onChange={(e) => onUpdate({weight: Number((e.target as HTMLInputElement).value)})}
                            className="flex-1 px-3 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm"
                            min={500}
                            max={5000}
                            step={10}
                        />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 w-8">kg</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                        Including driver, fuel, and typical load
                    </p>
                </div>

                {/* Tire Size */}
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Tire Size
                    </label>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <input
                            type="number"
                            value={settings.tireWidth}
                            onChange={(e) => onUpdate({tireWidth: Number((e.target as HTMLInputElement).value)})}
                            className="w-16 sm:w-20 px-2 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm text-center"
                            min={135}
                            max={355}
                            step={5}
                        />
                        <span className="text-zinc-500 dark:text-zinc-500">/</span>
                        <input
                            type="number"
                            value={settings.tireAspect}
                            onChange={(e) => onUpdate({tireAspect: Number((e.target as HTMLInputElement).value)})}
                            className="w-14 sm:w-16 px-2 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm text-center"
                            min={20}
                            max={80}
                            step={5}
                        />
                        <span className="text-zinc-600 dark:text-zinc-400 text-sm">R</span>
                        <input
                            type="number"
                            value={settings.rimDiameter}
                            onChange={(e) => onUpdate({rimDiameter: Number((e.target as HTMLInputElement).value)})}
                            className="w-14 sm:w-16 px-2 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm text-center"
                            min={13}
                            max={24}
                            step={1}
                        />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                        Example: 225/45 R17
                    </p>
                </div>

                {/* Wheel Circumference */}
                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Wheel Circumference
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={settings.useManualCircumference}
                                onChange={(e) => {
                                    const useManual = (e.target as HTMLInputElement).checked;
                                    if (!useManual) {
                                        onUpdate({
                                            useManualCircumference: false,
                                            wheelCircumference: calculateWheelCircumference(
                                                settings.tireWidth,
                                                settings.tireAspect,
                                                settings.rimDiameter
                                            )
                                        });
                                    } else {
                                        onUpdate({useManualCircumference: true});
                                    }
                                }}
                                className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded bg-zinc-200 dark:bg-zinc-700 border-zinc-400 dark:border-zinc-600"
                            />
                            <span className="text-zinc-600 dark:text-zinc-400">Manual override</span>
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={settings.wheelCircumference}
                            onChange={(e) => onUpdate({wheelCircumference: Number((e.target as HTMLInputElement).value)})}
                            disabled={!settings.useManualCircumference}
                            className={`flex-1 px-3 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm ${
                                !settings.useManualCircumference ? 'opacity-60' : ''
                            }`}
                            min={1000}
                            max={3000}
                            step={1}
                        />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400 w-8">mm</span>
                    </div>
                    {!settings.useManualCircumference && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                            Calculated from tire size
                        </p>
                    )}
                </div>

                {/* Drivetrain Section */}
                <div className="border-b border-zinc-700 pb-1 mt-2">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Drivetrain</h3>
                </div>

                {/* Gear Ratios */}
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Gear Ratios (Total)
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((gear) => (
                            <div key={gear} className="flex flex-col items-center">
                                <span className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">Gear {gear}</span>
                                <input
                                    type="number"
                                    value={settings.gearRatios[gear] || 0}
                                    onChange={(e) => {
                                        const newRatios = [...settings.gearRatios];
                                        newRatios[gear] = Number((e.target as HTMLInputElement).value);
                                        onUpdate({gearRatios: newRatios});
                                    }}
                                    className="w-full px-2 py-2 sm:py-1.5 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm text-center"
                                    min={0}
                                    max={10}
                                    step={0.01}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Final Drive */}
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        Final Drive Ratio
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={settings.finalDrive}
                            onChange={(e) => onUpdate({finalDrive: Number((e.target as HTMLInputElement).value)})}
                            className="w-24 px-3 py-2.5 sm:py-2 bg-zinc-200 dark:bg-zinc-700 border border-zinc-400 dark:border-zinc-600 rounded text-sm"
                            min={1}
                            max={6}
                            step={0.01}
                        />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">:1</span>
                    </div>
                </div>

                {/* Info Box */}
                <div className="p-3 bg-zinc-200 dark:bg-zinc-900 rounded border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400">
                    <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Dyno Light Calculation</p>
                    <p>These values are used for torque comparison:</p>
                    <ul className="mt-2 space-y-1 ml-3">
                        <li>• Total Ratio = Gear Ratio × Final Drive</li>
                        <li>• Calculated Engine Torque = Wheel Torque / Total Ratio</li>
                        <li>• Difference shows drivetrain losses</li>
                    </ul>
                    <p className="mt-2 text-zinc-500 dark:text-zinc-500">
                        Tip: Enter total ratios directly and set Final Drive to 1
                    </p>
                </div>
            </div>
        </Modal>
    );
}
