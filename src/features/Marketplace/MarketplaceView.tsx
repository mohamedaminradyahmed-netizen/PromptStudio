import { useState, useEffect } from 'react';
import {
  Store,
  Search,
  Star,
  Download,
  Eye,
  Filter,
  TrendingUp,
  Award,
  Clock,
  User,
  ChevronDown,
  X,
  Copy,
  ExternalLink,
  Heart,
  MessageSquare,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useEditorStore } from '../../stores/editorStore';
import { supabase } from '../../lib/supabase';
import type { MarketplacePrompt, MarketplaceReview } from '../../types';
import clsx from 'clsx';

type SortOption = 'popular' | 'recent' | 'rating' | 'trending';
type CategoryFilter = 'all' | 'coding' | 'writing' | 'analysis' | 'creative' | 'data' | 'business';

const SAMPLE_PROMPTS: MarketplacePrompt[] = [
  {
    id: '1',
    author_session_id: null,
    author_name: 'PromptMaster',
    title: 'Advanced Code Review Assistant',
    description: 'A comprehensive code review prompt that analyzes code for bugs, security vulnerabilities, performance issues, and best practices.',
    content: `You are an expert code reviewer with deep knowledge of software engineering best practices.

## Task
Review the following code and provide detailed feedback.

## Analysis Areas
1. **Bugs & Logic Errors** - Identify potential bugs and logical issues
2. **Security Vulnerabilities** - Check for security concerns (SQL injection, XSS, etc.)
3. **Performance** - Suggest performance optimizations
4. **Best Practices** - Ensure adherence to coding standards
5. **Maintainability** - Evaluate code readability and structure

## Code to Review
{{code}}

## Output Format
Provide your review in a structured format with severity levels (Critical, Warning, Info) for each finding.`,
    category: 'coding',
    tags: ['code-review', 'security', 'best-practices', 'debugging'],
    model_recommendation: 'gpt-4',
    variables: [{ name: 'code', description: 'The code to review', default: '', type: 'text' }],
    avg_rating: 4.8,
    review_count: 127,
    clone_count: 856,
    view_count: 3421,
    is_featured: true,
    is_staff_pick: true,
    status: 'approved',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-02-20T15:30:00Z',
  },
  {
    id: '2',
    author_session_id: null,
    author_name: 'ContentCraft',
    title: 'SEO Blog Post Generator',
    description: 'Generate SEO-optimized blog posts with proper structure, keywords, and engaging content.',
    content: `You are an expert content writer specializing in SEO-optimized blog posts.

## Task
Write a comprehensive blog post about: {{topic}}

## Requirements
- Target keyword: {{keyword}}
- Word count: {{word_count}} words
- Tone: {{tone}}

## Structure
1. Engaging headline with keyword
2. Hook paragraph
3. Table of contents
4. Main sections with H2/H3 headings
5. Relevant examples and data
6. Conclusion with CTA
7. Meta description (150-160 chars)

## SEO Guidelines
- Include keyword in title, first paragraph, and throughout naturally
- Use related keywords and LSI terms
- Include internal/external link suggestions
- Optimize for featured snippets`,
    category: 'writing',
    tags: ['seo', 'blogging', 'content-marketing', 'copywriting'],
    model_recommendation: 'gpt-4',
    variables: [
      { name: 'topic', description: 'Blog post topic', default: '', type: 'text' },
      { name: 'keyword', description: 'Target SEO keyword', default: '', type: 'text' },
      { name: 'word_count', description: 'Target word count', default: '1500', type: 'number' },
      { name: 'tone', description: 'Writing tone', default: 'professional', type: 'select', options: ['professional', 'casual', 'academic', 'conversational'] },
    ],
    avg_rating: 4.6,
    review_count: 89,
    clone_count: 634,
    view_count: 2156,
    is_featured: true,
    is_staff_pick: false,
    status: 'approved',
    created_at: '2024-01-20T08:00:00Z',
    updated_at: '2024-02-18T12:00:00Z',
  },
  {
    id: '3',
    author_session_id: null,
    author_name: 'DataWizard',
    title: 'Data Analysis & Visualization Guide',
    description: 'Analyze datasets and provide insights with visualization recommendations.',
    content: `You are a senior data analyst with expertise in statistical analysis and data visualization.

## Task
Analyze the provided data and generate comprehensive insights.

## Data
{{data}}

## Analysis Requirements
1. **Summary Statistics** - Key metrics and distributions
2. **Trend Analysis** - Identify patterns and trends over time
3. **Correlations** - Find relationships between variables
4. **Anomalies** - Detect outliers and unusual patterns
5. **Recommendations** - Actionable insights based on findings

## Visualization Suggestions
For each finding, recommend appropriate chart types:
- Line charts for trends
- Bar/Column for comparisons
- Scatter plots for correlations
- Heatmaps for matrices
- Box plots for distributions

## Output
Provide analysis in a clear, executive-summary style with supporting details.`,
    category: 'data',
    tags: ['data-analysis', 'visualization', 'statistics', 'insights'],
    model_recommendation: 'gpt-4-turbo',
    variables: [{ name: 'data', description: 'Data to analyze (CSV, JSON, or description)', default: '', type: 'text' }],
    avg_rating: 4.7,
    review_count: 56,
    clone_count: 423,
    view_count: 1789,
    is_featured: false,
    is_staff_pick: true,
    status: 'approved',
    created_at: '2024-02-01T14:00:00Z',
    updated_at: '2024-02-25T09:00:00Z',
  },
  {
    id: '4',
    author_session_id: null,
    author_name: 'CreativeAI',
    title: 'Story Plot Generator',
    description: 'Generate creative story plots with rich characters and compelling narratives.',
    content: `You are a creative writing expert and storytelling master.

## Task
Create an original story plot based on the following parameters.

## Parameters
- Genre: {{genre}}
- Setting: {{setting}}
- Theme: {{theme}}
- Target audience: {{audience}}

## Output Structure

### 1. Premise (2-3 sentences)
A compelling hook that captures the essence of the story.

### 2. Main Characters
- Protagonist: Background, motivation, flaw
- Antagonist: Goals, methods, backstory
- Supporting characters: Role in the story

### 3. Plot Outline
- Act 1: Setup and inciting incident
- Act 2: Rising action and complications
- Act 3: Climax and resolution

### 4. Key Scenes
5 pivotal scenes that drive the narrative

### 5. Themes & Motifs
Underlying messages and recurring elements

### 6. Unique Selling Points
What makes this story stand out`,
    category: 'creative',
    tags: ['storytelling', 'creative-writing', 'plot', 'fiction'],
    model_recommendation: 'claude-3-opus',
    variables: [
      { name: 'genre', description: 'Story genre', default: 'sci-fi', type: 'select', options: ['sci-fi', 'fantasy', 'thriller', 'romance', 'mystery', 'horror'] },
      { name: 'setting', description: 'Story setting', default: '', type: 'text' },
      { name: 'theme', description: 'Central theme', default: '', type: 'text' },
      { name: 'audience', description: 'Target audience', default: 'adult', type: 'select', options: ['children', 'young-adult', 'adult', 'all-ages'] },
    ],
    avg_rating: 4.9,
    review_count: 203,
    clone_count: 1245,
    view_count: 5678,
    is_featured: true,
    is_staff_pick: true,
    status: 'approved',
    created_at: '2024-01-10T16:00:00Z',
    updated_at: '2024-02-28T11:00:00Z',
  },
  {
    id: '5',
    author_session_id: null,
    author_name: 'BizAnalyst',
    title: 'Business Strategy Analyzer',
    description: 'Analyze business strategies using frameworks like SWOT, Porter\'s Five Forces, and more.',
    content: `You are a senior business strategy consultant with expertise in strategic analysis frameworks.

## Task
Perform a comprehensive strategic analysis for the following business/situation.

## Context
{{business_context}}

## Analysis Frameworks to Apply

### 1. SWOT Analysis
- Strengths (internal positives)
- Weaknesses (internal negatives)
- Opportunities (external positives)
- Threats (external negatives)

### 2. Porter's Five Forces
- Competitive rivalry
- Supplier power
- Buyer power
- Threat of substitution
- Threat of new entry

### 3. PESTLE Analysis
- Political factors
- Economic factors
- Social factors
- Technological factors
- Legal factors
- Environmental factors

## Deliverables
1. Executive summary (3-5 key findings)
2. Detailed analysis for each framework
3. Strategic recommendations (prioritized)
4. Implementation roadmap
5. Risk assessment`,
    category: 'business',
    tags: ['strategy', 'swot', 'consulting', 'analysis'],
    model_recommendation: 'gpt-4',
    variables: [{ name: 'business_context', description: 'Business situation to analyze', default: '', type: 'text' }],
    avg_rating: 4.5,
    review_count: 34,
    clone_count: 267,
    view_count: 1234,
    is_featured: false,
    is_staff_pick: false,
    status: 'approved',
    created_at: '2024-02-05T10:00:00Z',
    updated_at: '2024-02-22T14:00:00Z',
  },
  {
    id: '6',
    author_session_id: null,
    author_name: 'APIBuilder',
    title: 'REST API Documentation Generator',
    description: 'Generate comprehensive API documentation from endpoint descriptions.',
    content: `You are a technical writer specializing in API documentation.

## Task
Create comprehensive REST API documentation for the following endpoints.

## API Information
{{api_info}}

## Documentation Structure

### Overview
- API description
- Base URL
- Authentication method
- Rate limiting

### Endpoints
For each endpoint, provide:

#### [METHOD] /path
**Description:** What this endpoint does

**Authentication:** Required/Optional

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|

**Request Body:**
\`\`\`json
{
  "example": "value"
}
\`\`\`

**Response:**
\`\`\`json
{
  "example": "response"
}
\`\`\`

**Error Codes:**
| Code | Description |
|------|-------------|

**Example cURL:**
\`\`\`bash
curl -X METHOD 'url' -H 'headers' -d 'data'
\`\`\`

### Error Handling
Common error responses and troubleshooting`,
    category: 'coding',
    tags: ['api', 'documentation', 'rest', 'technical-writing'],
    model_recommendation: 'gpt-4',
    variables: [{ name: 'api_info', description: 'API endpoints and descriptions', default: '', type: 'text' }],
    avg_rating: 4.4,
    review_count: 45,
    clone_count: 312,
    view_count: 1567,
    is_featured: false,
    is_staff_pick: false,
    status: 'approved',
    created_at: '2024-02-10T09:00:00Z',
    updated_at: '2024-02-24T16:00:00Z',
  },
];

export function MarketplaceView() {
  const { theme, setActiveView } = useAppStore();
  const { setContent, setTitle } = useEditorStore();
  const [prompts, setPrompts] = useState<MarketplacePrompt[]>(SAMPLE_PROMPTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedPrompt, setSelectedPrompt] = useState<MarketplacePrompt | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadMarketplacePrompts();
  }, []);

  const loadMarketplacePrompts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_prompts')
        .select('*')
        .eq('status', 'approved')
        .order('clone_count', { ascending: false });

      if (data && data.length > 0) {
        setPrompts(data);
      }
    } catch (err) {
    }
    setIsLoading(false);
  };

  const filteredPrompts = prompts
    .filter((p) => {
      const matchesSearch =
        searchQuery === '' ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.clone_count - a.clone_count;
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'rating':
          return b.avg_rating - a.avg_rating;
        case 'trending':
          return b.view_count - a.view_count;
        default:
          return 0;
      }
    });

  const usePrompt = (prompt: MarketplacePrompt) => {
    setContent(prompt.content);
    setTitle(prompt.title);
    setActiveView('editor');
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={clsx(
          'w-4 h-4',
          i < Math.round(rating)
            ? 'text-amber-400 fill-amber-400'
            : theme === 'dark'
            ? 'text-gray-600'
            : 'text-gray-300'
        )}
      />
    ));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      coding: 'emerald',
      writing: 'blue',
      analysis: 'cyan',
      creative: 'rose',
      data: 'amber',
      business: 'violet',
    };
    return colors[category] || 'gray';
  };

  return (
    <div className="h-full flex flex-col">
      <div
        className={clsx(
          'px-6 py-4 border-b flex items-center justify-between',
          theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
        )}
      >
        <div className="flex items-center gap-4">
          <Store className={clsx('w-6 h-6', theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')} />
          <h1 className={clsx('text-xl font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            Prompt Marketplace
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className={clsx(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
                theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
              )}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className={clsx(
                'w-80 pl-10 pr-4 py-2 rounded-lg border text-sm transition-colors',
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
              )}
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'p-2 rounded-lg border transition-colors',
              showFilters
                ? theme === 'dark'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-600'
                : theme === 'dark'
                ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                : 'bg-white border-gray-300 text-gray-600 hover:text-gray-900'
            )}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div
          className={clsx(
            'px-6 py-3 border-b flex items-center gap-4',
            theme === 'dark' ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50 border-gray-200'
          )}
        >
          <div className="flex items-center gap-2">
            <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={clsx(
                'px-3 py-1.5 rounded-lg border text-sm',
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="popular">Most Popular</option>
              <option value="recent">Most Recent</option>
              <option value="rating">Highest Rated</option>
              <option value="trending">Trending</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className={clsx(
                'px-3 py-1.5 rounded-lg border text-sm',
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            >
              <option value="all">All Categories</option>
              <option value="coding">Coding</option>
              <option value="writing">Writing</option>
              <option value="analysis">Analysis</option>
              <option value="creative">Creative</option>
              <option value="data">Data</option>
              <option value="business">Business</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrompts.map((prompt) => {
            const color = getCategoryColor(prompt.category);

            return (
              <div
                key={prompt.id}
                onClick={() => setSelectedPrompt(prompt)}
                className={clsx(
                  'rounded-xl border p-5 cursor-pointer transition-all duration-200',
                  theme === 'dark'
                    ? 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {prompt.is_featured && (
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                        )}
                      >
                        Featured
                      </span>
                    )}
                    {prompt.is_staff_pick && (
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                        )}
                      >
                        Staff Pick
                      </span>
                    )}
                  </div>
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                      theme === 'dark' ? `bg-${color}-500/20 text-${color}-400` : `bg-${color}-100 text-${color}-700`
                    )}
                  >
                    {prompt.category}
                  </span>
                </div>

                <h3
                  className={clsx(
                    'text-lg font-semibold mb-2 line-clamp-1',
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  )}
                >
                  {prompt.title}
                </h3>

                <p
                  className={clsx('text-sm mb-4 line-clamp-2', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}
                >
                  {prompt.description}
                </p>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1">{renderStars(prompt.avg_rating)}</div>
                  <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                    ({prompt.review_count})
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {prompt.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-xs',
                        theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                  {prompt.tags.length > 3 && (
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-full text-xs',
                        theme === 'dark' ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-500'
                      )}
                    >
                      +{prompt.tags.length - 3}
                    </span>
                  )}
                </div>

                <div
                  className={clsx(
                    'flex items-center justify-between pt-4 border-t',
                    theme === 'dark' ? 'border-gray-800' : 'border-gray-100'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <User className={clsx('w-4 h-4', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                    <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                      {prompt.author_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Eye className={clsx('w-4 h-4', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                      <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                        {prompt.view_count.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className={clsx('w-4 h-4', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                      <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                        {prompt.clone_count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPrompts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Store className={clsx('w-16 h-16 mb-4', theme === 'dark' ? 'text-gray-700' : 'text-gray-300')} />
            <h3 className={clsx('text-lg font-medium mb-2', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
              No prompts found
            </h3>
            <p className={clsx('text-sm', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>

      {selectedPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className={clsx(
              'w-full max-w-3xl max-h-[90vh] rounded-xl overflow-hidden',
              theme === 'dark' ? 'bg-gray-900' : 'bg-white'
            )}
          >
            <div
              className={clsx(
                'px-6 py-4 border-b flex items-center justify-between',
                theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
              )}
            >
              <h2 className={clsx('text-xl font-semibold', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                {selectedPrompt.title}
              </h2>
              <button
                onClick={() => setSelectedPrompt(null)}
                className={clsx(
                  'p-2 rounded-lg transition-colors',
                  theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <User className={clsx('w-5 h-5', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                    <span className={clsx('font-medium', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                      {selectedPrompt.author_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">{renderStars(selectedPrompt.avg_rating)}</div>
                  <span className={clsx('text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                    {selectedPrompt.avg_rating.toFixed(1)} ({selectedPrompt.review_count} reviews)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'px-3 py-1 rounded-full text-sm capitalize',
                      theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {selectedPrompt.category}
                  </span>
                </div>
              </div>

              <p className={clsx('text-base', theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}>
                {selectedPrompt.description}
              </p>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Eye className={clsx('w-5 h-5', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                  <span className={clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                    {selectedPrompt.view_count.toLocaleString()} views
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className={clsx('w-5 h-5', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                  <span className={clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                    {selectedPrompt.clone_count.toLocaleString()} clones
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={clsx('w-5 h-5', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')} />
                  <span className={clsx(theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                    Updated {new Date(selectedPrompt.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedPrompt.tags.map((tag) => (
                  <span
                    key={tag}
                    className={clsx(
                      'px-3 py-1 rounded-full text-sm',
                      theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div>
                <h3 className={clsx('font-medium mb-3', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                  Prompt Content
                </h3>
                <div
                  className={clsx(
                    'rounded-lg p-4 overflow-x-auto',
                    theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
                  )}
                >
                  <pre
                    className={clsx(
                      'text-sm whitespace-pre-wrap font-mono',
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    {selectedPrompt.content}
                  </pre>
                </div>
              </div>

              {selectedPrompt.variables.length > 0 && (
                <div>
                  <h3 className={clsx('font-medium mb-3', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                    Variables
                  </h3>
                  <div className="space-y-2">
                    {selectedPrompt.variables.map((v) => (
                      <div
                        key={v.name}
                        className={clsx(
                          'flex items-center justify-between px-4 py-2 rounded-lg',
                          theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
                        )}
                      >
                        <div>
                          <span className={clsx('font-mono text-sm', theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')}>
                            {`{{${v.name}}}`}
                          </span>
                          <span className={clsx('ml-2 text-sm', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                            {v.description}
                          </span>
                        </div>
                        <span className={clsx('text-xs uppercase', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                          {v.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className={clsx('font-medium mb-2', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                  Recommended Model
                </h3>
                <span
                  className={clsx(
                    'inline-block px-3 py-1 rounded-full text-sm',
                    theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'
                  )}
                >
                  {selectedPrompt.model_recommendation}
                </span>
              </div>
            </div>

            <div
              className={clsx(
                'px-6 py-4 border-t flex items-center justify-end gap-3',
                theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
              )}
            >
              <button
                onClick={() => setSelectedPrompt(null)}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  theme === 'dark'
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedPrompt.content);
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                  theme === 'dark'
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={() => {
                  usePrompt(selectedPrompt);
                  setSelectedPrompt(null);
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                  theme === 'dark'
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                )}
              >
                <ExternalLink className="w-4 h-4" />
                Use in Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
