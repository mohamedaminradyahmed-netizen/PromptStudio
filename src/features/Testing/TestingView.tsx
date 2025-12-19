import { useState } from 'react';
import {
  FlaskConical,
  Plus,
  Play,
  Upload,
  Download,
  Trash2,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  Coins,
  FileText,
  Trophy,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { useAppStore } from '../../stores/appStore';
import { useEditorStore } from '../../stores/editorStore';
import clsx from 'clsx';

type TestingTab = 'ab-testing' | 'golden-datasets' | 'evaluation';

interface ABTestVariant {
  id: string;
  name: string;
  promptContent: string;
  results: {
    avgLatency: number;
    avgTokens: number;
    qualityScore: number;
    runs: number;
  };
}

interface TestCase {
  id: string;
  input: Record<string, string>;
  expectedOutput: string;
  tags: string[];
}

interface GoldenDataset {
  id: string;
  name: string;
  testCases: TestCase[];
  lastRunAt: string | null;
}

export function TestingView() {
  const { theme } = useAppStore();
  const { content } = useEditorStore();
  const [activeTab, setActiveTab] = useState<TestingTab>('ab-testing');

  return (
    <div className="h-full flex flex-col">
      <div className={clsx(
        'px-6 py-4 border-b flex items-center gap-6',
        theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
      )}>
        <div className="flex items-center gap-2">
          <FlaskConical className={clsx('w-6 h-6', theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')} />
          <h1 className={clsx('text-xl font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            Testing & Evaluation
          </h1>
        </div>

        <div className="flex gap-1">
          {[
            { id: 'ab-testing', label: 'A/B Testing' },
            { id: 'golden-datasets', label: 'Golden Datasets' },
            { id: 'evaluation', label: 'LLM Evaluation' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TestingTab)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? theme === 'dark'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-emerald-100 text-emerald-700'
                  : theme === 'dark'
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'ab-testing' && <ABTestingPanel theme={theme} currentPrompt={content} />}
        {activeTab === 'golden-datasets' && <GoldenDatasetsPanel theme={theme} />}
        {activeTab === 'evaluation' && <EvaluationPanel theme={theme} />}
      </div>
    </div>
  );
}

function ABTestingPanel({ theme, currentPrompt }: { theme: 'light' | 'dark'; currentPrompt: string }) {
  const [variants, setVariants] = useState<ABTestVariant[]>([
    {
      id: '1',
      name: 'Variant A (Control)',
      promptContent: currentPrompt || 'Enter your control prompt here...',
      results: { avgLatency: 0, avgTokens: 0, qualityScore: 0, runs: 0 },
    },
    {
      id: '2',
      name: 'Variant B',
      promptContent: '',
      results: { avgLatency: 0, avgTokens: 0, qualityScore: 0, runs: 0 },
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [testInput, setTestInput] = useState('');

  const addVariant = () => {
    const newVariant: ABTestVariant = {
      id: crypto.randomUUID(),
      name: `Variant ${String.fromCharCode(65 + variants.length)}`,
      promptContent: '',
      results: { avgLatency: 0, avgTokens: 0, qualityScore: 0, runs: 0 },
    };
    setVariants([...variants, newVariant]);
  };

  const removeVariant = (id: string) => {
    if (variants.length > 2) {
      setVariants(variants.filter((v) => v.id !== id));
    }
  };

  const runTest = async () => {
    setIsRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setVariants(variants.map((v) => ({
      ...v,
      results: {
        avgLatency: Math.random() * 1000 + 200,
        avgTokens: Math.floor(Math.random() * 500 + 100),
        qualityScore: Math.random() * 40 + 60,
        runs: v.results.runs + 1,
      },
    })));
    setIsRunning(false);
  };

  const winner = variants.reduce((best, v) =>
    v.results.qualityScore > best.results.qualityScore ? v : best
  );

  const chartData = variants.map((v) => ({
    name: v.name,
    latency: v.results.avgLatency.toFixed(0),
    tokens: v.results.avgTokens,
    quality: v.results.qualityScore.toFixed(1),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={clsx('text-lg font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          A/B Test Configuration
        </h2>
        <div className="flex gap-2">
          <button
            onClick={addVariant}
            disabled={variants.length >= 5}
            className={clsx(
              'px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors',
              theme === 'dark'
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
            )}
          >
            <Plus className="w-4 h-4" />
            Add Variant
          </button>
          <button
            onClick={runTest}
            disabled={isRunning || !testInput}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors',
              theme === 'dark'
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50'
            )}
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run Test
          </button>
        </div>
      </div>

      <div className={clsx(
        'p-4 rounded-lg border',
        theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      )}>
        <label className={clsx(
          'block text-sm font-medium mb-2',
          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
        )}>
          Test Input
        </label>
        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Enter the input to test all variants with..."
          rows={3}
          className={clsx(
            'w-full px-3 py-2 rounded-lg border resize-none',
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {variants.map((variant) => (
          <div
            key={variant.id}
            className={clsx(
              'rounded-lg border overflow-hidden',
              variant.id === winner.id && variant.results.runs > 0
                ? theme === 'dark' ? 'border-emerald-500' : 'border-emerald-400'
                : theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
            )}
          >
            <div className={clsx(
              'px-4 py-3 flex items-center justify-between',
              theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'
            )}>
              <div className="flex items-center gap-2">
                <span className={clsx('font-medium', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                  {variant.name}
                </span>
                {variant.id === winner.id && variant.results.runs > 0 && (
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs flex items-center gap-1',
                    theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  )}>
                    <Trophy className="w-3 h-3" />
                    Winner
                  </span>
                )}
              </div>
              {variants.length > 2 && (
                <button
                  onClick={() => removeVariant(variant.id)}
                  className={clsx(
                    'p-1 rounded transition-colors',
                    theme === 'dark' ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="p-4">
              <textarea
                value={variant.promptContent}
                onChange={(e) => setVariants(variants.map((v) =>
                  v.id === variant.id ? { ...v, promptContent: e.target.value } : v
                ))}
                placeholder="Enter prompt variant..."
                rows={4}
                className={clsx(
                  'w-full px-3 py-2 rounded-lg border resize-none text-sm font-mono',
                  theme === 'dark'
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                )}
              />
              {variant.results.runs > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className={clsx('p-2 rounded text-center', theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50')}>
                    <Clock className={clsx('w-4 h-4 mx-auto mb-1', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                    <p className={clsx('text-sm font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                      {variant.results.avgLatency.toFixed(0)}ms
                    </p>
                    <p className={clsx('text-xs', theme === 'dark' ? 'text-gray-500' : 'text-gray-500')}>Latency</p>
                  </div>
                  <div className={clsx('p-2 rounded text-center', theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50')}>
                    <Coins className={clsx('w-4 h-4 mx-auto mb-1', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                    <p className={clsx('text-sm font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                      {variant.results.avgTokens}
                    </p>
                    <p className={clsx('text-xs', theme === 'dark' ? 'text-gray-500' : 'text-gray-500')}>Tokens</p>
                  </div>
                  <div className={clsx('p-2 rounded text-center', theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50')}>
                    <BarChart3 className={clsx('w-4 h-4 mx-auto mb-1', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                    <p className={clsx('text-sm font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                      {variant.results.qualityScore.toFixed(1)}
                    </p>
                    <p className={clsx('text-xs', theme === 'dark' ? 'text-gray-500' : 'text-gray-500')}>Quality</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {variants.some((v) => v.results.runs > 0) && (
        <div className={clsx(
          'rounded-lg border p-4',
          theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx('font-medium mb-4', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            Results Comparison
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                <XAxis dataKey="name" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                  }}
                />
                <Legend />
                <Bar dataKey="quality" fill="#10b981" name="Quality Score" />
                <Bar dataKey="tokens" fill="#3b82f6" name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function GoldenDatasetsPanel({ theme }: { theme: 'light' | 'dark' }) {
  const [datasets, setDatasets] = useState<GoldenDataset[]>([
    {
      id: '1',
      name: 'Code Review Test Cases',
      testCases: [
        { id: '1', input: { code: 'function add(a, b) { return a + b }' }, expectedOutput: 'Clean function, no issues found', tags: ['simple'] },
        { id: '2', input: { code: 'var x = 1; var x = 2;' }, expectedOutput: 'Duplicate variable declaration', tags: ['error'] },
      ],
      lastRunAt: null,
    },
  ]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        const newDataset: GoldenDataset = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.(json|csv)$/, ''),
          testCases: Array.isArray(data) ? data.map((item: { input?: Record<string, string>; expected?: string; expectedOutput?: string }, i: number) => ({
            id: String(i),
            input: item.input || {},
            expectedOutput: item.expected || item.expectedOutput || '',
            tags: [],
          })) : [],
          lastRunAt: null,
        };
        setDatasets([...datasets, newDataset]);
      } catch {
        console.error('Failed to parse file');
      }
    };
    reader.readAsText(file);
  };

  const runDataset = async (datasetId: string) => {
    setIsRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setDatasets(datasets.map((d) =>
      d.id === datasetId ? { ...d, lastRunAt: new Date().toISOString() } : d
    ));
    setIsRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={clsx('text-lg font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          Golden Datasets
        </h2>
        <label className={clsx(
          'px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium cursor-pointer transition-colors',
          theme === 'dark'
            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        )}>
          <Upload className="w-4 h-4" />
          Upload Dataset
          <input type="file" accept=".json,.csv" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {datasets.map((dataset) => (
          <div
            key={dataset.id}
            className={clsx(
              'rounded-lg border p-4 cursor-pointer transition-all',
              selectedDataset === dataset.id
                ? theme === 'dark' ? 'border-emerald-500 bg-emerald-500/10' : 'border-emerald-400 bg-emerald-50'
                : theme === 'dark' ? 'border-gray-800 bg-gray-900 hover:border-gray-700' : 'border-gray-200 bg-white hover:border-gray-300'
            )}
            onClick={() => setSelectedDataset(selectedDataset === dataset.id ? null : dataset.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={clsx(
                'p-2 rounded-lg',
                theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
              )}>
                <FileText className={clsx('w-5 h-5', theme === 'dark' ? 'text-blue-400' : 'text-blue-600')} />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runDataset(dataset.id);
                }}
                disabled={isRunning}
                className={clsx(
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  theme === 'dark'
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                )}
              >
                {isRunning ? 'Running...' : 'Run'}
              </button>
            </div>

            <h3 className={clsx('font-medium mb-1', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
              {dataset.name}
            </h3>
            <p className={clsx('text-sm mb-2', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
              {dataset.testCases.length} test cases
            </p>

            {dataset.lastRunAt && (
              <p className={clsx('text-xs', theme === 'dark' ? 'text-gray-500' : 'text-gray-500')}>
                Last run: {new Date(dataset.lastRunAt).toLocaleString()}
              </p>
            )}
          </div>
        ))}

        <div
          className={clsx(
            'rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[150px] cursor-pointer transition-colors',
            theme === 'dark'
              ? 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
              : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
          )}
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="text-sm font-medium">Create Dataset</span>
        </div>
      </div>

      {selectedDataset && (
        <div className={clsx(
          'rounded-lg border p-4',
          theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
        )}>
          <h3 className={clsx('font-medium mb-4', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            Test Cases
          </h3>
          <div className="space-y-2">
            {datasets.find((d) => d.id === selectedDataset)?.testCases.map((tc) => (
              <div
                key={tc.id}
                className={clsx(
                  'p-3 rounded-lg',
                  theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className={clsx('text-sm font-medium mb-1', theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}>
                      Input:
                    </p>
                    <pre className={clsx('text-xs font-mono', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                      {JSON.stringify(tc.input, null, 2)}
                    </pre>
                  </div>
                  <div className="flex-1">
                    <p className={clsx('text-sm font-medium mb-1', theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}>
                      Expected:
                    </p>
                    <p className={clsx('text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                      {tc.expectedOutput}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvaluationPanel({ theme }: { theme: 'light' | 'dark' }) {
  const [evaluationMetrics] = useState({
    accuracy: 87,
    relevance: 92,
    coherence: 89,
    instructionFollowing: 94,
  });

  const chartData = [
    { name: 'Run 1', accuracy: 82, relevance: 88, coherence: 85 },
    { name: 'Run 2', accuracy: 85, relevance: 90, coherence: 87 },
    { name: 'Run 3', accuracy: 87, relevance: 92, coherence: 89 },
    { name: 'Run 4', accuracy: 86, relevance: 91, coherence: 88 },
    { name: 'Run 5', accuracy: 87, relevance: 92, coherence: 89 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={clsx('text-lg font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          LLM-as-a-Judge Evaluation
        </h2>
        <button
          className={clsx(
            'px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors',
            theme === 'dark'
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          )}
        >
          <Play className="w-4 h-4" />
          Run Evaluation
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(evaluationMetrics).map(([key, value]) => (
          <div
            key={key}
            className={clsx(
              'rounded-lg border p-4 text-center',
              theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
            )}
          >
            <p className={clsx(
              'text-3xl font-bold mb-1',
              value >= 90
                ? theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                : value >= 75
                  ? theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
                  : theme === 'dark' ? 'text-red-400' : 'text-red-600'
            )}>
              {value}%
            </p>
            <p className={clsx('text-sm capitalize', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </p>
          </div>
        ))}
      </div>

      <div className={clsx(
        'rounded-lg border p-4',
        theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx('font-medium mb-4', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          Evaluation History
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="name" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
              <YAxis domain={[70, 100]} stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
                  border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} name="Accuracy" />
              <Line type="monotone" dataKey="relevance" stroke="#3b82f6" strokeWidth={2} name="Relevance" />
              <Line type="monotone" dataKey="coherence" stroke="#f59e0b" strokeWidth={2} name="Coherence" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={clsx(
        'rounded-lg border p-4',
        theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      )}>
        <h3 className={clsx('font-medium mb-4', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
          Regression Alerts
        </h3>
        <div className={clsx(
          'p-4 rounded-lg flex items-center gap-3',
          theme === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-50'
        )}>
          <CheckCircle className={clsx('w-6 h-6', theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')} />
          <div>
            <p className={clsx('font-medium', theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700')}>
              No Regressions Detected
            </p>
            <p className={clsx('text-sm', theme === 'dark' ? 'text-emerald-400/70' : 'text-emerald-600')}>
              All metrics are stable or improving
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
