export interface UserSession {
  id: string;
  session_token: string;
  display_name: string;
  preferences: UserPreferences;
  created_at: string;
  last_active_at: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  editor_font_size: number;
  auto_save: boolean;
  show_line_numbers: boolean;
}

export interface Prompt {
  id: string;
  session_id: string;
  title: string;
  content: string;
  description: string;
  tags: string[];
  category: string;
  model_id: string;
  model_config: ModelConfig;
  variables: PromptVariable[];
  is_favorite: boolean;
  is_archived: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  content: string;
  model_config: ModelConfig;
  change_summary: string;
  created_at: string;
}

export interface ModelConfig {
  temperature: number;
  top_p: number;
  top_k: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
  stop_sequences: string[];
  response_format: 'text' | 'json_object' | 'json_schema';
}

export interface PromptVariable {
  name: string;
  description: string;
  default: string;
  type: 'text' | 'number' | 'select' | 'file';
  options?: string[];
}

export interface Template {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  subcategory: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  model_recommendation: string;
  variables: PromptVariable[];
  examples: TemplateExample[];
  is_featured: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateExample {
  name: string;
  prompt: string;
  explanation: string;
}

export interface Technique {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  examples: TechniqueExample[];
  best_for: string[];
  related_techniques: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TechniqueExample {
  name: string;
  prompt: string;
  explanation: string;
}

export interface ToolDefinition {
  id: string;
  session_id: string;
  prompt_id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
  returns: JSONSchema;
  mock_response: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  items?: JSONSchema;
  enum?: string[];
}

export interface SmartVariable {
  id: string;
  session_id: string;
  name: string;
  variable_type: 'file' | 'history' | 'timestamp' | 'env' | 'custom';
  default_value: string;
  description: string;
  is_system: boolean;
  created_at: string;
}

export interface EnvironmentProfile {
  id: string;
  session_id: string;
  name: string;
  description: string;
  default_role: string;
  default_constraints: string[];
  default_output_format: string;
  variables: Record<string, string>;
  model_config: Partial<ModelConfig>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptChain {
  id: string;
  session_id: string;
  title: string;
  description: string;
  canvas_state: CanvasState;
  is_template: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface CanvasState {
  nodes: ChainNode[];
  edges: ChainEdge[];
  viewport: { x: number; y: number; zoom: number };
}

export interface ChainNode {
  id: string;
  type: 'prompt' | 'condition' | 'loop' | 'input' | 'output' | 'transform';
  position: { x: number; y: number };
  data: ChainNodeData;
}

export interface ChainNodeData {
  label: string;
  prompt_id?: string;
  prompt_content?: string;
  condition?: string;
  transform?: string;
  result?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export interface ChainEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface GoldenDataset {
  id: string;
  session_id: string;
  name: string;
  description: string;
  prompt_id: string | null;
  test_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestCase {
  id: string;
  dataset_id: string;
  input_data: Record<string, unknown>;
  expected_output: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

export interface EvaluationRun {
  id: string;
  session_id: string;
  dataset_id: string;
  prompt_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_cases: number;
  completed_cases: number;
  passed_cases: number;
  failed_cases: number;
  avg_latency_ms: number;
  avg_tokens: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvaluationResult {
  id: string;
  run_id: string;
  test_case_id: string;
  actual_output: string;
  is_passed: boolean;
  latency_ms: number;
  tokens_used: number;
  evaluation_scores: EvaluationScores;
  error_message: string | null;
  created_at: string;
}

export interface EvaluationScores {
  accuracy: number;
  relevance: number;
  coherence: number;
  instruction_following: number;
  cosine_similarity?: number;
  exact_match?: boolean;
  regex_match?: boolean;
}

export interface ABTest {
  id: string;
  session_id: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'completed';
  winner_variant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ABTestVariant {
  id: string;
  test_id: string;
  name: string;
  prompt_content: string;
  model_config: ModelConfig;
  display_order: number;
  created_at: string;
}

export interface ABTestResult {
  id: string;
  test_id: string;
  variant_id: string;
  input_data: string;
  output_data: string;
  latency_ms: number;
  tokens_used: number;
  quality_score: number;
  created_at: string;
}

export interface MarketplacePrompt {
  id: string;
  author_session_id: string | null;
  author_name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  model_recommendation: string;
  variables: PromptVariable[];
  avg_rating: number;
  review_count: number;
  clone_count: number;
  view_count: number;
  is_featured: boolean;
  is_staff_pick: boolean;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface MarketplaceReview {
  id: string;
  marketplace_prompt_id: string;
  reviewer_session_id: string | null;
  reviewer_name: string;
  rating: number;
  review_text: string;
  is_verified: boolean;
  created_at: string;
}

export interface Translation {
  id: string;
  prompt_id: string;
  source_language: string;
  target_language: string;
  original_content: string;
  translated_content: string;
  quality_score: number;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollaborationSession {
  id: string;
  prompt_id: string;
  created_by_session_id: string | null;
  share_code: string;
  is_active: boolean;
  max_participants: number;
  permissions: 'view' | 'edit';
  created_at: string;
  expires_at: string;
}

export interface CollaborationCursor {
  id: string;
  collaboration_session_id: string;
  user_session_id: string;
  cursor_position: number;
  selection_start: number | null;
  selection_end: number | null;
  color: string;
  last_updated_at: string;
}

export interface CacheEntry {
  id: string;
  session_id: string;
  prompt_hash: string;
  prompt_embedding: string | null;
  input_text: string;
  output_text: string;
  model_id: string;
  model_config: ModelConfig;
  tokens_saved: number;
  hit_count: number;
  created_at: string;
  expires_at: string;
}

export interface Deployment {
  id: string;
  session_id: string;
  prompt_id: string;
  platform: 'vercel' | 'cloudflare' | 'aws' | 'google';
  deployment_url: string | null;
  api_key_hint: string | null;
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AnalysisResult {
  clarity_score: number;
  specificity_score: number;
  structure_score: number;
  overall_score: number;
  components: PromptComponent[];
  suggestions: AnalysisSuggestion[];
  warnings: AnalysisWarning[];
  token_estimate: TokenEstimate;
}

export interface PromptComponent {
  type: 'role' | 'context' | 'instruction' | 'constraint' | 'example' | 'output_format';
  content: string;
  start: number;
  end: number;
}

export interface AnalysisSuggestion {
  type: 'improvement' | 'addition' | 'removal';
  message: string;
  impact: 'high' | 'medium' | 'low';
  suggestion?: string;
}

export interface AnalysisWarning {
  type: 'security' | 'quality' | 'cost' | 'sensitive_data';
  message: string;
  severity: 'critical' | 'warning' | 'info';
  location?: { start: number; end: number };
}

export interface TokenEstimate {
  gpt4: number;
  gpt35: number;
  claude: number;
  llama: number;
  estimated_cost: { [model: string]: number };
}

export interface TokenVisualization {
  tokens: Token[];
  total: number;
  model: string;
}

export interface Token {
  text: string;
  id: number;
  start: number;
  end: number;
}

export type AIModel = {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'meta' | 'mistral';
  context_window: number;
  supports_functions: boolean;
  supports_json_mode: boolean;
  pricing: { input: number; output: number };
};

export const AI_MODELS: AIModel[] = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai', context_window: 8192, supports_functions: true, supports_json_mode: true, pricing: { input: 0.03, output: 0.06 } },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', context_window: 128000, supports_functions: true, supports_json_mode: true, pricing: { input: 0.01, output: 0.03 } },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', context_window: 128000, supports_functions: true, supports_json_mode: true, pricing: { input: 0.005, output: 0.015 } },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', context_window: 16385, supports_functions: true, supports_json_mode: true, pricing: { input: 0.0005, output: 0.0015 } },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', context_window: 200000, supports_functions: true, supports_json_mode: false, pricing: { input: 0.015, output: 0.075 } },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', context_window: 200000, supports_functions: true, supports_json_mode: false, pricing: { input: 0.003, output: 0.015 } },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic', context_window: 200000, supports_functions: true, supports_json_mode: false, pricing: { input: 0.00025, output: 0.00125 } },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', context_window: 32000, supports_functions: true, supports_json_mode: true, pricing: { input: 0.00025, output: 0.0005 } },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', context_window: 1000000, supports_functions: true, supports_json_mode: true, pricing: { input: 0.0035, output: 0.0105 } },
  { id: 'llama-3-70b', name: 'Llama 3 70B', provider: 'meta', context_window: 8192, supports_functions: false, supports_json_mode: false, pricing: { input: 0.0009, output: 0.0009 } },
  { id: 'mistral-large', name: 'Mistral Large', provider: 'mistral', context_window: 32000, supports_functions: true, supports_json_mode: true, pricing: { input: 0.004, output: 0.012 } },
];

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  temperature: 0.7,
  top_p: 1.0,
  top_k: 40,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  max_tokens: 2048,
  stop_sequences: [],
  response_format: 'text',
};

export const TEMPLATE_CATEGORIES = [
  { id: 'coding', name: 'Coding', icon: 'Code' },
  { id: 'writing', name: 'Writing', icon: 'PenTool' },
  { id: 'analysis', name: 'Analysis', icon: 'BarChart' },
  { id: 'creative', name: 'Creative', icon: 'Sparkles' },
  { id: 'data', name: 'Data', icon: 'Database' },
  { id: 'business', name: 'Business', icon: 'Briefcase' },
  { id: 'customer-service', name: 'Customer Service', icon: 'MessageCircle' },
  { id: 'education', name: 'Education', icon: 'GraduationCap' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
];
