import { useState } from 'react';
import { AlertCircle, Brain, Shield, DollarSign, Zap, GitBranch, Wrench } from 'lucide-react';
import { ToolPlanViewer } from './ToolPlanViewer';

interface HierarchicalPrompt {
  systemPrompt: string;
  processPrompt: string;
  taskPrompt: string;
  outputPrompt: string;
}

interface AdvancedSettings {
  persona?: string;
  domain?: string;
  reasoningMode: 'default' | 'tree-of-thought' | 'graph-of-thought';
  ragEnabled: boolean;
  toolPlanning: boolean;
  selfRefinement: boolean;
  safetyChecks: boolean;
}

interface PreSendAnalysis {
  estimatedTokens: number;
  estimatedCost: number;
  successProbability: number;
  safetyScore: number;
  recommendations: string[];
}

interface ToolPlan {
  toolName: string;
  reason: string;
  parameters: Record<string, any>;
  order: number;
  confidence: number;
  estimatedDuration?: string;
  dependencies?: string[];
}

interface ToolPlanningResult {
  plan: ToolPlan[];
  reasoning: string;
  alternativePlans?: ToolPlan[][];
  warnings?: string[];
  totalEstimatedDuration?: string;
  planEnabled: boolean;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
  category?: string;
}

export function AdvancedPromptEditor() {
  const [hierarchical, setHierarchical] = useState<HierarchicalPrompt>({
    systemPrompt: '',
    processPrompt: '',
    taskPrompt: '',
    outputPrompt: '',
  });

  const [settings, setSettings] = useState<AdvancedSettings>({
    reasoningMode: 'default',
    ragEnabled: false,
    toolPlanning: false,
    selfRefinement: false,
    safetyChecks: true,
  });

  const [analysis, setAnalysis] = useState<PreSendAnalysis | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toolPlanResult, setToolPlanResult] = useState<ToolPlanningResult | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  // Sample available tools - in production, these would come from an API
  const availableTools: ToolDefinition[] = [
    {
      name: 'web_search',
      description: 'Search the web for information and retrieve results',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        limit: { type: 'number', description: 'Max results' },
      },
      category: 'search',
    },
    {
      name: 'code_analyzer',
      description: 'Analyze and review code for issues and improvements',
      parameters: {
        code: { type: 'string', description: 'Code to analyze', required: true },
        language: { type: 'string', description: 'Programming language' },
      },
      category: 'development',
    },
    {
      name: 'data_fetcher',
      description: 'Fetch and retrieve data from APIs and databases',
      parameters: {
        url: { type: 'string', description: 'API URL', required: true },
        method: { type: 'string', description: 'HTTP method' },
      },
      category: 'api',
    },
    {
      name: 'text_translator',
      description: 'Translate text between different languages',
      parameters: {
        text: { type: 'string', description: 'Text to translate', required: true },
        targetLang: { type: 'string', description: 'Target language', required: true },
      },
      category: 'translation',
    },
    {
      name: 'file_processor',
      description: 'Process and transform files including documents and images',
      parameters: {
        filePath: { type: 'string', description: 'Path to file', required: true },
        operation: { type: 'string', description: 'Operation to perform' },
      },
      category: 'file',
    },
    {
      name: 'calculator',
      description: 'Calculate mathematical expressions and formulas',
      parameters: {
        expression: { type: 'string', description: 'Math expression', required: true },
      },
      category: 'math',
    },
  ];

  const handleAnalyze = async () => {
    // Simulate analysis
    const fullPrompt = buildFullPrompt();
    const tokens = Math.ceil(fullPrompt.length / 4);

    setAnalysis({
      estimatedTokens: tokens,
      estimatedCost: tokens * 0.00003,
      successProbability: 0.85,
      safetyScore: 0.92,
      recommendations: [
        'Consider adding more specific examples',
        'Output format could be more structured',
      ],
    });

    // If tool planning is enabled, generate a plan
    if (settings.toolPlanning) {
      await handleGenerateToolPlan();
    }
  };

  const handleGenerateToolPlan = async () => {
    setIsPlanning(true);
    const fullPrompt = buildFullPrompt();

    try {
      const response = await fetch('/api/prompts/plan-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          availableTools,
          maxTools: 5,
          requireApproval: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setToolPlanResult(result);
      }
    } catch (error) {
      console.error('Failed to generate tool plan:', error);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApprovePlan = async (plan: ToolPlan[]) => {
    try {
      const response = await fetch('/api/prompts/execute-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          approved: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Execution result:', result);
        // Handle execution result
      }
    } catch (error) {
      console.error('Failed to execute plan:', error);
    }
  };

  const handleRejectPlan = () => {
    setToolPlanResult(null);
  };

  const handleSelectAlternative = (plan: ToolPlan[]) => {
    if (toolPlanResult) {
      setToolPlanResult({
        ...toolPlanResult,
        plan,
      });
    }
  };

  const handleDisableToolPlanning = () => {
    setSettings({ ...settings, toolPlanning: false });
    setToolPlanResult(null);
  };

  const buildFullPrompt = () => {
    const parts: string[] = [];
    if (hierarchical.systemPrompt) parts.push(`# System\n${hierarchical.systemPrompt}`);
    if (hierarchical.processPrompt) parts.push(`# Process\n${hierarchical.processPrompt}`);
    if (hierarchical.taskPrompt) parts.push(`# Task\n${hierarchical.taskPrompt}`);
    if (hierarchical.outputPrompt) parts.push(`# Output\n${hierarchical.outputPrompt}`);
    return parts.join('\n\n');
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
      {/* Hierarchical Prompt Sections */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Hierarchical Prompt Structure
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              System Instructions
            </label>
            <textarea
              value={hierarchical.systemPrompt}
              onChange={(e) =>
                setHierarchical({ ...hierarchical, systemPrompt: e.target.value })
              }
              className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Define the role and context..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Process Guidelines
            </label>
            <textarea
              value={hierarchical.processPrompt}
              onChange={(e) =>
                setHierarchical({ ...hierarchical, processPrompt: e.target.value })
              }
              className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="How should the task be approached..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Task Description
            </label>
            <textarea
              value={hierarchical.taskPrompt}
              onChange={(e) =>
                setHierarchical({ ...hierarchical, taskPrompt: e.target.value })
              }
              className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="What needs to be done..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Output Format
            </label>
            <textarea
              value={hierarchical.outputPrompt}
              onChange={(e) =>
                setHierarchical({ ...hierarchical, outputPrompt: e.target.value })
              }
              className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="How should the output be structured..."
            />
          </div>
        </div>
      </div>

      {/* Meta-Prompting */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Meta-Prompting
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Persona
            </label>
            <input
              type="text"
              value={settings.persona || ''}
              onChange={(e) => setSettings({ ...settings, persona: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="e.g., Expert Data Scientist"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Domain
            </label>
            <input
              type="text"
              value={settings.domain || ''}
              onChange={(e) => setSettings({ ...settings, domain: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="e.g., Machine Learning"
            />
          </div>
        </div>
      </div>

      {/* Advanced Features */}
      <div className="space-y-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
        >
          <Brain className="w-5 h-5" />
          Advanced Features
          <span className="text-sm font-normal text-gray-500">
            {showAdvanced ? '(Hide)' : '(Show)'}
          </span>
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.ragEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, ragEnabled: e.target.checked })
                }
                className="w-4 h-4"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable RAG (Retrieval-Augmented Generation)
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.toolPlanning}
                onChange={(e) =>
                  setSettings({ ...settings, toolPlanning: e.target.checked })
                }
                className="w-4 h-4"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Tool Planning
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.selfRefinement}
                onChange={(e) =>
                  setSettings({ ...settings, selfRefinement: e.target.checked })
                }
                className="w-4 h-4"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Self-Refinement
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.safetyChecks}
                onChange={(e) =>
                  setSettings({ ...settings, safetyChecks: e.target.checked })
                }
                className="w-4 h-4"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Safety Checks
              </label>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reasoning Mode
              </label>
              <select
                value={settings.reasoningMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    reasoningMode: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="default">Default</option>
                <option value="tree-of-thought">Tree of Thought</option>
                <option value="graph-of-thought">Graph of Thought</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Pre-Send Analysis */}
      <div className="space-y-4">
        <button
          onClick={handleAnalyze}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Analyze Before Sending
        </button>

        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-medium">Tokens</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {analysis.estimatedTokens.toLocaleString()}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">Cost</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                ${analysis.estimatedCost.toFixed(4)}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Brain className="w-4 h-4" />
                <span className="text-sm font-medium">Success Probability</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {(analysis.successProbability * 100).toFixed(0)}%
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium">Safety Score</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {(analysis.safetyScore * 100).toFixed(0)}%
              </div>
            </div>

            {analysis.recommendations.length > 0 && (
              <div className="col-span-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">
                      Recommendations
                    </h4>
                    <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                      {analysis.recommendations.map((rec, idx) => (
                        <li key={idx}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tool Plan Section */}
      {settings.toolPlanning && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              Tool Planning
            </h3>
            {!toolPlanResult && !isPlanning && (
              <button
                onClick={handleGenerateToolPlan}
                className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg flex items-center gap-2"
              >
                <Wrench className="w-4 h-4" />
                Generate Tool Plan
              </button>
            )}
          </div>

          <ToolPlanViewer
            planResult={toolPlanResult}
            isLoading={isPlanning}
            onApprove={handleApprovePlan}
            onReject={handleRejectPlan}
            onSelectAlternative={handleSelectAlternative}
            onDisable={handleDisableToolPlanning}
          />
        </div>
      )}

      {/* Preview */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Full Prompt Preview
        </h3>
        <pre className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
          {buildFullPrompt() || 'No prompt content yet...'}
        </pre>
      </div>
    </div>
  );
}
