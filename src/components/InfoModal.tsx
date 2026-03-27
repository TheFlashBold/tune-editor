import {useState, useEffect} from 'preact/hooks';
import {Modal} from './Modal';
import {track} from '../lib/track';

const APP_VERSION = __APP_VERSION__;
const STORAGE_KEY = 'tune-editor-seen-version';

interface ChangelogEntry {
    version: string;
    date: string;
    changes: string[];
}


const tips: string[] = [
    'Drag & drop .bin, .ols, .xdf, .json or .csv files anywhere to open them',
    'Use load original to diff two bins',
    'Use the cross-compare feature to diff two bins with different definitions, matched by name',
    'XDF files are automatically converted — no need to convert to JSON first',
];

const changelog: ChangelogEntry[] = [
    {
        version: '1.13.0',
        date: '27.03.2026',
        changes: [
            'Fixed 5G0906259 boxcode detection',
            'Added SC8 F83 5G0906259 to the upgrade matrix (upgrades to SC8 F90)',
            'Added new version update banner'
        ]
    },
    {
        version: '1.12.0',
        date: '26.03.2026',
        changes: [
            'Fixed SCGA10 detection & updated definition',
            'Added SC8LB6 definition'
        ]
    },
    {
        version: '1.11.0',
        date: '25.03.2026',
        changes: [
            'Added DQ381 detection',
            'Added DQ381 14XX, 16XX (Experimental), 23XX and 24XX definitions'
        ]
    },
    {
        version: '1.10.0',
        date: '24.03.2026',
        changes: [
            'Fixed DQ250 F52M definition detection',
            'Fixed EPK detection & added box code parsing for unknown bins',
            'Added upgrade suggestion message to unknown bin modal',
        ]
    },
    {
        version: '1.9.0',
        date: '20.03.2026',
        changes: [
            'Fixed off-by-one category assignments in all DSG definitions',
            'Axis labels support for FIX_AXIS (e.g. gear shift labels "1->2", "2->3")',
            'Regenerated all DSG definitions (F40M–F52M) from XDF sources with corrected categories, decoded umlauts, and removed invalid bigEndian flag',
            'Fixed XDF parser category mapping in both Python and browser parsers',
        ]
    },
    {
        version: '1.8.0',
        date: '18.03.2026',
        changes: [
            'GPS map in Log Viewer with speed-colored path and hover PID display',
            'Splash screen on startup',
            'About dialog with version and tech stack',
        ]
    },
    {
        version: '1.7.0',
        date: '17.03.2026',
        changes: [
            'Fixed DQ250 DSG definition detection',
            'Allow upload of unknown bins when no definition is found'
        ]
    },
    {
        version: '1.6.0',
        date: '16.03.2026',
        changes: [
            'WebGL 3D surface graph with proper depth buffering (fixes rendering artifacts)',
            'Compare graphs now use their own axis values for correct visual comparison',
            'Changes list updates live after reverting a parameter',
        ]
    },
    {
        version: '1.5.0',
        date: '15.03.2026',
        changes: [
            'Experimental .ols project file parsing (parameters, folders, binary extraction)',
        ]
    },
    {
        version: '1.4.0',
        date: '14.03.2026',
        changes: [
            'Mobile-friendly UI with hamburger menu and full-screen parameter view',
            'Touch-enabled 3D surface graph rotation',
            'Unsaved changes warning before closing the browser',
            'Improved search — substring matching instead of fuzzy, multi-word support',
            'New DQ250 MQB immo patch',
        ]
    },
    {
        version: '1.3.0',
        date: '12.03.2026',
        changes: [
            'Non-linear formula support for XDF rational functions ((a*X+b)/(c+d*X))',
            'Fixed conversion factors for switch patch definitions (PID D weight, Slip params)',
            'Added Open Graph and mobile web app meta tags',
        ]
    },
    {
        version: '1.2.0',
        date: '15.02.2026',
        changes: [
            'BTP patch file support with automatic patch detection',
            'Switch patch definitions for O30, A05, LB6, V30, S50',
            'Cross-compare mode for diffing two binary files',
            'Improved category tree with search filtering',
        ],
    },
    {
        version: '1.1.0',
        date: '20.01.2026',
        changes: [
            'DSG/TCU binary support (DQ200, DQ250, DQ381, DQ500)',
            'S19 and Intel HEX file format support',
            'BLE datalogger integration for real-time ECU monitoring',
            'Column-direction (COLUMN_DIR) table layout support',
        ],
    },
    {
        version: '1.0.0',
        date: '01.12.2025',
        changes: [
            'Initial release',
            'Simos 12/18 ECU support',
            'A2L and XDF definition import',
            'Binary calibration editing with diff view',
            'Auto-detection of ECU type via EPK verification',
        ],
    },
];

export function InfoModal() {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (seen !== APP_VERSION) {
            setVisible(true);
        }
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, APP_VERSION);
        setVisible(false);

        track("Info Dismiss", {
            version: APP_VERSION,
        });
    };

    if (!visible) return null;

    const latest = changelog[0];
    const older = changelog.slice(1);

    return (
        <Modal title={`Tune Editor v${APP_VERSION}`} onClose={dismiss} width="lg"
               footer={
                   <div class="flex justify-end">
                       <button
                           onClick={dismiss}
                           class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                       >
                           Got it
                       </button>
                   </div>
               }
        >
            <div class="space-y-5">
                {/* Latest version highlight */}
                <div>
                    <div class="flex items-baseline gap-2 mb-2">
                        <span class="text-lg font-bold text-blue-500">v{latest.version}</span>
                        <span class="text-xs text-zinc-500">{latest.date}</span>
                    </div>
                    <ul class="space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
                        {latest.changes.map((c, i) => (
                            <li key={i} class="flex gap-2">
                                <span class="text-green-500 shrink-0">+</span>
                                <span>{c}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Tips section */}
                {tips.length > 0 && (
                    <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div class="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">Getting Started
                        </div>
                        <ul class="space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
                            {tips.map((tip, i) => (
                                <li key={i} class="flex gap-2">
                                    <span class="text-blue-400 shrink-0">›</span>
                                    <span>{tip}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Older versions */}
                {older.length > 0 && (
                    <details class="group">
                        <summary class="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                            Previous versions
                        </summary>
                        <div class="mt-3 space-y-4 pl-1 border-l-2 border-zinc-700">
                            {older.map(entry => (
                                <div key={entry.version} class="pl-3">
                                    <div class="flex items-baseline gap-2 mb-1">
                                        <span class="text-sm font-semibold text-zinc-400">v{entry.version}</span>
                                        <span class="text-xs text-zinc-600">{entry.date}</span>
                                    </div>
                                    <ul class="space-y-0.5 text-xs text-zinc-500">
                                        {entry.changes.map((c, i) => (
                                            <li key={i} class="flex gap-2">
                                                <span class="shrink-0">+</span>
                                                <span>{c}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </Modal>
    );
}
