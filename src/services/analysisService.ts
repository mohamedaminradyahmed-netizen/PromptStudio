import type { AnalysisResult, PromptComponent, AnalysisSuggestion, AnalysisWarning, TokenEstimate, TokenVisualization, Token } from '../types';

const SENSITIVE_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, type: 'phone' },
  { pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, type: 'ssn' },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, type: 'credit_card' },
  { pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)[=:]\s*['"]?[\w-]+['"]?/gi, type: 'api_key' },
  { pattern: /(?:password|passwd|pwd)[=:]\s*['"]?[^\s'"]+['"]?/gi, type: 'password' },
];

const SECURITY_PATTERNS = [
  { pattern: /(?:rm\s+-rf|del\s+\/|format\s+c:)/gi, message: 'Potentially dangerous system command detected' },
  { pattern: /(?:eval|exec|system)\s*\(/gi, message: 'Code execution function detected' },
  { pattern: /(?:ignore previous|disregard|forget all)/gi, message: 'Potential prompt injection pattern' },
  { pattern: /(?:you are now|act as if|pretend you)/gi, message: 'Role manipulation attempt detected' },
];

const ROLE_PATTERNS = [
  /you are(?: a| an)?\s+([^.]+)/i,
  /act(?:ing)? as(?: a| an)?\s+([^.]+)/i,
  /role:\s*([^.\n]+)/i,
  /persona:\s*([^.\n]+)/i,
];

const CONSTRAINT_PATTERNS = [
  /(?:do not|don't|never|must not|should not)\s+([^.]+)/gi,
  /(?:always|must|should|need to)\s+([^.]+)/gi,
  /constraint[s]?:\s*([^.\n]+)/gi,
  /rule[s]?:\s*([^.\n]+)/gi,
];

const OUTPUT_FORMAT_PATTERNS = [
  /(?:format|output|respond|return)(?:\s+(?:as|in|using))?\s*:\s*([^.\n]+)/gi,
  /(?:json|xml|markdown|table|list|bullet)/gi,
  /```[\w]*\n/g,
];

export function analyzePrompt(content: string): AnalysisResult {
  const components = detectComponents(content);
  const suggestions = generateSuggestions(content, components);
  const warnings = detectWarnings(content);
  const tokenEstimate = estimateTokens(content);

  const clarityScore = calculateClarityScore(content, components);
  const specificityScore = calculateSpecificityScore(content, components);
  const structureScore = calculateStructureScore(content, components);
  const overallScore = Math.round((clarityScore + specificityScore + structureScore) / 3);

  return {
    clarity_score: clarityScore,
    specificity_score: specificityScore,
    structure_score: structureScore,
    overall_score: overallScore,
    components,
    suggestions,
    warnings,
    token_estimate: tokenEstimate,
  };
}

function detectComponents(content: string): PromptComponent[] {
  const components: PromptComponent[] = [];

  ROLE_PATTERNS.forEach((pattern) => {
    const match = content.match(pattern);
    if (match) {
      components.push({
        type: 'role',
        content: match[0],
        start: content.indexOf(match[0]),
        end: content.indexOf(match[0]) + match[0].length,
      });
    }
  });

  let constraintMatch;
  CONSTRAINT_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0;
    while ((constraintMatch = pattern.exec(content)) !== null) {
      components.push({
        type: 'constraint',
        content: constraintMatch[0],
        start: constraintMatch.index,
        end: constraintMatch.index + constraintMatch[0].length,
      });
    }
  });

  const examplePatterns = [
    /example[s]?:\s*([\s\S]*?)(?=\n\n|$)/gi,
    /for example[,:]?\s*([^.\n]+)/gi,
    /e\.g\.[,:]?\s*([^.\n]+)/gi,
  ];

  examplePatterns.forEach((pattern) => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      components.push({
        type: 'example',
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });

  OUTPUT_FORMAT_PATTERNS.forEach((pattern) => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      components.push({
        type: 'output_format',
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });

  return components;
}

function generateSuggestions(content: string, components: PromptComponent[]): AnalysisSuggestion[] {
  const suggestions: AnalysisSuggestion[] = [];

  const hasRole = components.some((c) => c.type === 'role');
  if (!hasRole && content.length > 50) {
    suggestions.push({
      type: 'addition',
      message: 'Consider adding a role assignment to improve response quality',
      impact: 'high',
      suggestion: 'Add "You are a [expert type]..." at the beginning',
    });
  }

  const hasExamples = components.some((c) => c.type === 'example');
  if (!hasExamples && content.length > 100) {
    suggestions.push({
      type: 'addition',
      message: 'Adding examples can improve accuracy by up to 40%',
      impact: 'high',
      suggestion: 'Include 2-3 examples of expected input/output',
    });
  }

  const hasOutputFormat = components.some((c) => c.type === 'output_format');
  if (!hasOutputFormat && content.length > 50) {
    suggestions.push({
      type: 'addition',
      message: 'Specify output format for more consistent results',
      impact: 'medium',
      suggestion: 'Add "Output format: [JSON/Markdown/List/etc.]"',
    });
  }

  const hasConstraints = components.some((c) => c.type === 'constraint');
  if (!hasConstraints && content.length > 100) {
    suggestions.push({
      type: 'addition',
      message: 'Adding constraints helps prevent unwanted outputs',
      impact: 'medium',
      suggestion: 'Add specific rules about what to include or avoid',
    });
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 20) {
    suggestions.push({
      type: 'improvement',
      message: 'Prompt may be too brief for complex tasks',
      impact: 'medium',
      suggestion: 'Add more context and specific instructions',
    });
  }

  const vagueWords = ['good', 'nice', 'better', 'best', 'great', 'interesting', 'stuff', 'things'];
  const hasVagueLanguage = vagueWords.some((word) =>
    content.toLowerCase().includes(word)
  );
  if (hasVagueLanguage) {
    suggestions.push({
      type: 'improvement',
      message: 'Contains vague language that may lead to inconsistent results',
      impact: 'low',
      suggestion: 'Replace vague words with specific, measurable criteria',
    });
  }

  return suggestions;
}

function detectWarnings(content: string): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  SENSITIVE_PATTERNS.forEach(({ pattern, type }) => {
    const match = content.match(pattern);
    if (match) {
      warnings.push({
        type: 'sensitive_data',
        message: `Contains potential ${type.replace('_', ' ')} - consider removing`,
        severity: 'critical',
        location: {
          start: content.indexOf(match[0]),
          end: content.indexOf(match[0]) + match[0].length,
        },
      });
    }
  });

  SECURITY_PATTERNS.forEach(({ pattern, message }) => {
    if (pattern.test(content)) {
      warnings.push({
        type: 'security',
        message,
        severity: 'warning',
      });
    }
  });

  const wordCount = content.split(/\s+/).length;
  if (wordCount > 2000) {
    warnings.push({
      type: 'cost',
      message: 'Very long prompt may result in high token costs',
      severity: 'info',
    });
  }

  return warnings;
}

function calculateClarityScore(content: string, components: PromptComponent[]): number {
  let score = 50;

  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = sentences.reduce((acc, s) => acc + s.split(/\s+/).length, 0) / sentences.length;

  if (avgSentenceLength < 25) score += 15;
  else if (avgSentenceLength < 35) score += 10;
  else score -= 10;

  const hasStructure = /(?:##|###|\d\.|[-*])/g.test(content);
  if (hasStructure) score += 15;

  if (components.some((c) => c.type === 'role')) score += 10;
  if (components.some((c) => c.type === 'output_format')) score += 10;

  return Math.min(100, Math.max(0, score));
}

function calculateSpecificityScore(content: string, components: PromptComponent[]): number {
  let score = 50;

  const wordCount = content.split(/\s+/).length;
  if (wordCount > 50) score += 10;
  if (wordCount > 100) score += 10;
  if (wordCount > 200) score += 5;

  if (components.some((c) => c.type === 'example')) score += 20;
  if (components.some((c) => c.type === 'constraint')) score += 15;

  const hasNumbers = /\d+/.test(content);
  if (hasNumbers) score += 5;

  const vagueWords = ['good', 'nice', 'better', 'best', 'great', 'interesting'];
  const vagueCount = vagueWords.filter((word) => content.toLowerCase().includes(word)).length;
  score -= vagueCount * 5;

  return Math.min(100, Math.max(0, score));
}

function calculateStructureScore(content: string, components: PromptComponent[]): number {
  let score = 50;

  const hasHeadings = /(?:##|###)/g.test(content);
  if (hasHeadings) score += 15;

  const hasBullets = /(?:[-*]\s)/g.test(content);
  if (hasBullets) score += 10;

  const hasNumberedList = /\d\.\s/g.test(content);
  if (hasNumberedList) score += 10;

  const hasSections = content.split(/\n\n+/).length > 2;
  if (hasSections) score += 10;

  const componentTypes = new Set(components.map((c) => c.type));
  score += componentTypes.size * 5;

  return Math.min(100, Math.max(0, score));
}

function estimateTokens(content: string): TokenEstimate {
  const charCount = content.length;
  const wordCount = content.split(/\s+/).length;

  const gpt4Tokens = Math.ceil(charCount / 4);
  const gpt35Tokens = Math.ceil(charCount / 4);
  const claudeTokens = Math.ceil(charCount / 3.5);
  const llamaTokens = Math.ceil(wordCount * 1.3);

  return {
    gpt4: gpt4Tokens,
    gpt35: gpt35Tokens,
    claude: claudeTokens,
    llama: llamaTokens,
    estimated_cost: {
      'gpt-4': (gpt4Tokens / 1000) * 0.03,
      'gpt-4-turbo': (gpt4Tokens / 1000) * 0.01,
      'gpt-3.5-turbo': (gpt35Tokens / 1000) * 0.0005,
      'claude-3-opus': (claudeTokens / 1000) * 0.015,
      'claude-3-sonnet': (claudeTokens / 1000) * 0.003,
    },
  };
}

export function tokenizeText(content: string, model: string): TokenVisualization {
  const tokens: Token[] = [];
  let currentPos = 0;
  let tokenId = 0;

  const avgCharsPerToken = model.includes('claude') ? 3.5 : 4;

  const words = content.split(/(\s+)/);

  for (const word of words) {
    if (word.length === 0) continue;

    if (word.length <= avgCharsPerToken) {
      tokens.push({
        text: word,
        id: tokenId++,
        start: currentPos,
        end: currentPos + word.length,
      });
    } else {
      let wordPos = 0;
      while (wordPos < word.length) {
        const chunkSize = Math.min(Math.ceil(avgCharsPerToken), word.length - wordPos);
        tokens.push({
          text: word.slice(wordPos, wordPos + chunkSize),
          id: tokenId++,
          start: currentPos + wordPos,
          end: currentPos + wordPos + chunkSize,
        });
        wordPos += chunkSize;
      }
    }
    currentPos += word.length;
  }

  return {
    tokens,
    total: tokens.length,
    model,
  };
}

export function detectVariables(content: string): { name: string; start: number; end: number }[] {
  const variables: { name: string; start: number; end: number }[] = [];

  const patterns = [
    /\{\{(\w+)\}\}/g,
    /@(\w+(?::\w+)?)/g,
    /\$\{(\w+)\}/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      variables.push({
        name: match[1],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });

  return variables;
}

export function replaceVariables(content: string, values: Record<string, string>): string {
  let result = content;

  Object.entries(values).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    result = result.replace(new RegExp(`@${key}`, 'g'), value);
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
  });

  return result;
}
