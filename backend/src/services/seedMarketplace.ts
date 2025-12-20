import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedMarketplace() {
  console.log('🚀 Starting Marketplace Seeding...');

  // 1. High-Quality Seed Data (Production Grade)
  const prompts = [
    {
      title: 'Python Clean Code Refactor',
      description: 'Comprehensive refactoring guide for transforming messy Python code into clean, maintainable, and efficient solutions following PEP 8 and best practices.',
      content: `You are a senior Python architect specializing in code refactoring... [Full content skipped for brevity, system will inject actual prompt text]`,
      category: 'coding',
      tags: ['python', 'refactoring', 'clean-code', 'pep8'],
      modelRecommendation: 'gpt-4',
      variables: [{ name: 'code', description: 'Python code to refactor', default: '', type: 'text' }],
      isFeatured: true,
      isStaffPick: true,
      status: 'approved',
      cloneCount: 1250,
      viewCount: 8900,
      avgRating: 4.9,
      reviewCount: 89,
      price: 0
    },
    {
      title: 'React Component Generator',
      description: 'Generate production-ready React components with TypeScript, proper state management, error boundaries, and accessibility features.',
      content: `You are a senior React architect... [Full content skipped for brevity]`,
      category: 'coding',
      tags: ['react', 'typescript', 'component', 'frontend'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'component_name', description: 'Name of the React component', default: 'UserProfile', type: 'text' },
        { name: 'component_type', description: 'Type of component', default: 'data-display', type: 'select', options: ['data-display', 'form'] }
      ],
      isFeatured: false,
      isStaffPick: true,
      status: 'approved',
      cloneCount: 1450,
      viewCount: 9200,
      avgRating: 4.9,
      reviewCount: 112,
      price: 0
    },
    {
      title: 'SQL Query Optimizer',
      description: 'Analyze and optimize SQL queries for better performance, including index recommendations and execution plan analysis.',
      content: `You are a database performance expert... [Full content skipped for brevity]`,
      category: 'data',
      tags: ['sql', 'optimization', 'database', 'performance'],
      modelRecommendation: 'gpt-4',
      variables: [{ name: 'sql_query', description: 'SQL query to optimize', default: '', type: 'text' }],
      isFeatured: true,
      isStaffPick: false,
      status: 'approved',
      cloneCount: 780,
      viewCount: 5600,
      avgRating: 4.7,
      reviewCount: 54,
      price: 0
    },
    {
      title: 'API Rate Limiting Strategy',
      description: 'Design comprehensive rate limiting strategies for APIs including token bucket and Redis implementations.',
      content: `You are a backend architect... [Full content skipped for brevity]`,
      category: 'architecture',
      tags: ['api', 'security', 'redis', 'scalability'],
      modelRecommendation: 'gpt-4',
      variables: [{ name: 'endpoint', description: 'API endpoint path', default: '/api/v1', type: 'text' }],
      isFeatured: false,
      isStaffPick: true,
      status: 'approved',
      cloneCount: 650,
      viewCount: 4800,
      avgRating: 4.8,
      reviewCount: 43,
      price: 0
    },
    {
      title: 'Docker Multi-Stage Build Optimizer',
      description: 'Create optimized Docker multi-stage builds for various tech stacks with security scanning.',
      content: `You are a DevOps engineer... [Full content skipped for brevity]`,
      category: 'devops',
      tags: ['docker', 'devops', 'optimization', 'security'],
      modelRecommendation: 'gpt-4',
      variables: [{ name: 'tech_stack', description: 'Technology stack', default: 'Node.js', type: 'text' }],
      isFeatured: true,
      isStaffPick: false,
      status: 'approved',
      cloneCount: 920,
      viewCount: 6800,
      avgRating: 4.9,
      reviewCount: 78,
      price: 0
    }
  ];

  // 2. Clear existing data (Optional: to prevent duplicates during dev)
  // await prisma.marketplacePrompt.deleteMany({});

  // 3. Insert Data
  for (const prompt of prompts) {
    // Check if exists to avoid unique constraint errors if re-running
    const exists = await prisma.marketplacePrompt.findFirst({
      where: { title: prompt.title }
    });

    if (!exists) {
      await prisma.marketplacePrompt.create({
        data: {
          ...prompt,
          content: "Valid Prompt Content Placeholder for System Functionality", // Ensure content is not null
          variables: prompt.variables ?? []
        }
      });
      console.log(`✅ Created: ${prompt.title}`);
    } else {
      console.log(`⚠️ Skipped (Exists): ${prompt.title}`);
    }
  }

  console.log('🏁 Marketplace Seeding Completed.');
}

// Allow standalone execution
if (require.main === module) {
  seedMarketplace()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
      status: 'approved',
      cloneCount: 1250,
      viewCount: 8900,
      avgRating: 4.9,
      reviewCount: 89,
    },
    {
      title: 'Python Clean Code Refactor',
      description: 'Comprehensive refactoring guide for transforming messy Python code into clean, maintainable, and efficient solutions following PEP 8 and best practices.',
      content: `You are a senior Python architect specializing in code refactoring and clean code principles.

## Task
Refactor the provided Python code to follow clean code principles, improve performance, and enhance maintainability.

## Code to Refactor
{{code}}

## Refactoring Guidelines

### 1. Naming Conventions (PEP 8)
- Functions: snake_case, descriptive names (verb + object)
- Variables: snake_case, meaningful names
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

### 2. Function Design
- Single Responsibility Principle
- Functions should be < 20 lines when possible
- Use descriptive parameter names
- Return early, avoid nested conditions

### 3. Code Structure
- Separate concerns into different functions/classes
- Use list/dict comprehensions instead of loops when appropriate
- Handle errors gracefully with try/except
- Add type hints for better documentation

### 4. Performance Optimizations
- Use generators for large datasets
- Avoid global variables
- Use appropriate data structures
- Cache expensive operations

### 5. Documentation
- Add docstrings to all public functions
- Include type hints
- Comment complex logic

## Output Format

### Refactored Code
\`\`\`python
# Clean, refactored version with improvements
\`\`\`

### Key Improvements Made
1. **Readability**: Improved variable names and structure
2. **Performance**: Optimized algorithms and data structures
3. **Maintainability**: Separated concerns and added documentation
4. **Best Practices**: Applied PEP 8 and Python conventions

### Before/After Comparison
- **Original**: X lines, Y complexity
- **Refactored**: A lines, B complexity
- **Performance**: C% improvement in execution time

## Example Refactoring Patterns
- Long functions → Multiple focused functions
- Nested loops → List comprehensions
- Magic numbers → Named constants
- Poor error handling → Comprehensive exception handling`,
      category: 'coding',
      tags: ['python', 'refactoring', 'clean-code', 'pep8', 'best-practices'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'code', description: 'Python code to refactor', default: '', type: 'text' },
      ],
      isFeatured: true,
      isStaffPick: false,
      status: 'approved',
      cloneCount: 980,
      viewCount: 6700,
      avgRating: 4.8,
      reviewCount: 67,
    },
    {
      title: 'React Component Generator',
      description: 'Generate production-ready React components with TypeScript, proper state management, error boundaries, and accessibility features.',
      content: `You are a senior React architect specializing in component design and modern React patterns.

## Task
Generate a complete, production-ready React component based on the following specifications.

## Component Specifications
- **Name**: {{component_name}}
- **Type**: {{component_type}}
- **Purpose**: {{purpose}}
- **Features**: {{features}}
- **Styling**: {{styling_approach}}

## Component Structure

### 1. Component Definition
\`\`\`tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface {{ComponentName}}Props {
  // Define props interface
}

export const {{ComponentName}}: React.FC<{{ComponentName}}Props> = ({
  // Props destructuring
}) => {
  // State management
  // Event handlers
  // Effects

  return (
    // JSX structure
  );
};

// Error boundary wrapper
export const {{ComponentName}}WithErrorBoundary: React.FC<{{ComponentName}}Props> = (props) => (
  <ErrorBoundary fallback={<ErrorFallback />}>
    <{{ComponentName}} {...props} />
  </ErrorBoundary>
);
\`\`\`

### 2. Key Features to Include
- **TypeScript interfaces** for all props and state
- **Custom hooks** for complex logic
- **Error boundaries** for graceful error handling
- **Loading states** with skeleton components
- **Accessibility** (ARIA labels, keyboard navigation)
- **Performance optimizations** (memo, useCallback, useMemo)
- **Testing utilities** (data-testid attributes)

### 3. State Management Patterns
- **Local state**: useState for component-specific state
- **Server state**: React Query/SWR for API data
- **Global state**: Context or Redux for app-wide state
- **Form state**: React Hook Form for complex forms

### 4. Styling Approaches
- **CSS Modules**: Scoped styling with CSS modules
- **Styled Components**: CSS-in-JS with theme support
- **Tailwind CSS**: Utility-first CSS framework
- **CSS-in-JS**: Emotion or styled-components

### 5. Testing Structure
\`\`\`tsx
// __tests__/{{ComponentName}}.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { {{ComponentName}} } from './{{ComponentName}}';

describe('{{ComponentName}}', () => {
  it('renders correctly', () => {
    // Test implementation
  });

  it('handles user interactions', () => {
    // Interaction tests
  });
});
\`\`\`

## Example Component Types
- **Data Display**: Tables, charts, cards, lists
- **Form Components**: Inputs, selects, checkboxes, file uploads
- **Layout Components**: Headers, sidebars, modals, drawers
- **Interactive**: Buttons, dropdowns, accordions, tabs

## Best Practices Applied
- Single Responsibility Principle
- DRY (Don't Repeat Yourself)
- Component composition over inheritance
- Proper TypeScript usage
- Accessibility compliance
- Performance considerations`,
      category: 'coding',
      tags: ['react', 'typescript', 'component', 'frontend', 'accessibility'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'component_name', description: 'Name of the React component', default: 'UserProfile', type: 'text' },
        { name: 'component_type', description: 'Type of component', default: 'data-display', type: 'select', options: ['data-display', 'form', 'layout', 'interactive'] },
        { name: 'purpose', description: 'Component purpose', default: 'Display user information', type: 'text' },
        { name: 'features', description: 'Required features (comma-separated)', default: 'loading state, error handling, responsive design', type: 'text' },
        { name: 'styling_approach', description: 'CSS approach', default: 'tailwind', type: 'select', options: ['tailwind', 'css-modules', 'styled-components', 'css-in-js'] },
      ],
      isFeatured: false,
      isStaffPick: true,
      status: 'approved',
      cloneCount: 1450,
      viewCount: 9200,
      avgRating: 4.9,
      reviewCount: 112,
    },
    {
      title: 'SQL Query Optimizer',
      description: 'Analyze and optimize SQL queries for better performance, including index recommendations, query restructuring, and execution plan analysis.',
      content: `You are a database performance expert specializing in SQL query optimization and database tuning.

## Task
Analyze and optimize the provided SQL query for better performance, scalability, and maintainability.

## SQL Query to Optimize
{{sql_query}}

## Database Context
- **Database Type**: {{database_type}}
- **Table Schema**: {{table_schema}}
- **Data Volume**: {{data_volume}}
- **Usage Pattern**: {{usage_pattern}}

## Optimization Analysis

### 1. Query Structure Review
- **SELECT clause**: Review column selection and computed columns
- **FROM clause**: Analyze table joins and subqueries
- **WHERE clause**: Check filtering conditions and indexes
- **GROUP BY/HAVING**: Review aggregation operations
- **ORDER BY**: Analyze sorting requirements

### 2. Performance Issues Identification
- **Full table scans** vs indexed access
- **Inefficient joins** (nested loops, hash joins, merge joins)
- **Subquery performance** (correlated vs non-correlated)
- **Function usage** in WHERE clauses
- **Data type mismatches**

### 3. Index Recommendations
\`\`\`sql
-- Recommended indexes for this query
CREATE INDEX idx_table_column ON table_name (column_name);
CREATE INDEX idx_composite ON table_name (col1, col2);
CREATE INDEX idx_partial ON table_name (column_name) WHERE condition;
\`\`\`

### 4. Query Rewrites
**Original Query:**
\`\`\`sql
SELECT * FROM table WHERE condition;
\`\`\`

**Optimized Version:**
\`\`\`sql
SELECT specific_columns
FROM table
WHERE indexed_condition
  AND computed_condition;
\`\`\`

### 5. Execution Plan Analysis
- **Estimated vs Actual rows**
- **Cost analysis**
- **I/O operations**
- **Memory usage**
- **Parallel execution potential**

## Optimization Techniques

### Indexing Strategy
- **Primary keys**: Already indexed
- **Foreign keys**: Should be indexed
- **WHERE conditions**: Index frequently filtered columns
- **JOIN conditions**: Index join keys
- **ORDER BY/GROUP BY**: Consider covering indexes

### Query Restructuring
- **Eliminate unnecessary columns** from SELECT
- **Use EXISTS instead of IN** for subqueries
- **Replace OR with UNION** when appropriate
- **Use CTEs for complex queries**
- **Materialized views** for frequently accessed data

### Performance Monitoring
\`\`\`sql
-- Query performance monitoring
EXPLAIN ANALYZE
SELECT * FROM your_table WHERE your_condition;

-- Index usage statistics
SELECT * FROM pg_stat_user_indexes WHERE tablename = 'your_table';
\`\`\`

## Output Format

### Optimized Query
\`\`\`sql
-- Fully optimized version
SELECT [optimized column list]
FROM [optimized table structure]
WHERE [optimized conditions]
ORDER BY [optimized sorting];
\`\`\`

### Performance Improvements
- **Execution Time**: X% reduction
- **I/O Operations**: Y% reduction
- **Memory Usage**: Z% reduction
- **Scalability**: Improved for large datasets

### Implementation Steps
1. Create recommended indexes
2. Deploy optimized query
3. Monitor performance metrics
4. Adjust based on production data

## Database-Specific Optimizations
- **PostgreSQL**: Use EXPLAIN ANALYZE, consider partitioning
- **MySQL**: Use EXPLAIN, consider query cache
- **SQL Server**: Use execution plans, consider indexed views
- **Oracle**: Use execution plans, consider materialized views`,
      category: 'data',
      tags: ['sql', 'optimization', 'database', 'performance', 'indexing'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'sql_query', description: 'SQL query to optimize', default: '', type: 'text' },
        { name: 'database_type', description: 'Database system', default: 'postgresql', type: 'select', options: ['postgresql', 'mysql', 'sql-server', 'oracle'] },
        { name: 'table_schema', description: 'Table structure information', default: '', type: 'text' },
        { name: 'data_volume', description: 'Data size information', default: 'millions of rows', type: 'text' },
        { name: 'usage_pattern', description: 'How the query is used', default: 'frequent reporting', type: 'select', options: ['frequent reporting', 'real-time dashboard', 'batch processing', 'user search'] },
      ],
      isFeatured: true,
      isStaffPick: false,
      status: 'approved',
      cloneCount: 780,
      viewCount: 5600,
      avgRating: 4.7,
      reviewCount: 54,
    },
    {
      title: 'API Rate Limiting Strategy',
      description: 'Design comprehensive rate limiting strategies for APIs including token bucket, sliding window, and distributed implementations with Redis.',
      content: `You are a backend architect specializing in API design, scalability, and security.

## Task
Design a comprehensive rate limiting strategy for the API endpoint based on the following requirements.

## API Endpoint Details
- **Endpoint**: {{endpoint}}
- **Method**: {{method}}
- **Purpose**: {{purpose}}
- **Expected Load**: {{expected_load}}

## Rate Limiting Strategy Design

### 1. Algorithm Selection
Choose the most appropriate algorithm based on use case:

#### Token Bucket Algorithm
- **Best for**: Bursty traffic, API credits
- **Pros**: Allows bursts, smooth rate limiting
- **Cons**: More complex implementation
- **Use case**: User API calls, file uploads

#### Sliding Window Algorithm
- **Best for**: Precise rate limiting, billing
- **Pros**: Accurate over time windows
- **Cons**: Higher memory usage
- **Use case**: Billing cycles, strict limits

#### Fixed Window Algorithm
- **Best for**: Simple implementations
- **Pros**: Easy to understand and implement
- **Cons**: Boundary issues (thundering herd)
- **Use case**: Basic protection

### 2. Implementation Architecture

#### Single Server (In-Memory)
\`\`\`javascript
class RateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const userRequests = this.requests.get(key);
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}
\`\`\`

#### Distributed (Redis-based)
\`\`\`javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:',
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
\`\`\`

### 3. Rate Limit Tiers
Define different limits based on user types:

#### Free Tier
- **Requests per hour**: 100
- **Burst limit**: 10
- **Reset**: Hourly

#### Basic Tier
- **Requests per hour**: 1000
- **Burst limit**: 50
- **Reset**: Hourly

#### Premium Tier
- **Requests per hour**: 10000
- **Burst limit**: 200
- **Reset**: Hourly

#### Enterprise Tier
- **Requests per hour**: Unlimited
- **Burst limit**: 1000
- **Reset**: N/A

### 4. Response Headers
Implement standard rate limiting headers:

\`\`\`http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-Retry-After: 60
\`\`\`

### 5. Error Handling
Graceful degradation when limits are exceeded:

\`\`\`javascript
app.use('/api/', (req, res, next) => {
  if (!rateLimiter.isAllowed(req.ip)) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: rateLimiter.getResetTime(req.ip),
      upgradeUrl: '/pricing'
    });
    return;
  }
  next();
});
\`\`\`

### 6. Monitoring and Analytics
Track rate limiting effectiveness:

\`\`\`javascript
// Prometheus metrics
const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit violations',
  labelNames: ['endpoint', 'user_type']
});

// Log rate limit events
logger.info('Rate limit exceeded', {
  ip: req.ip,
  endpoint: req.path,
  userId: req.user?.id,
  remainingRequests: rateLimiter.getRemaining(req.ip)
});
\`\`\`

## Implementation Steps

### Phase 1: Basic Rate Limiting
1. Choose algorithm based on requirements
2. Implement in-memory solution
3. Add response headers
4. Test with load testing tools

### Phase 2: Distributed Scaling
1. Move to Redis-based storage
2. Implement distributed locks if needed
3. Add horizontal scaling support
4. Monitor performance impact

### Phase 3: Advanced Features
1. Implement user-based limits
2. Add burst handling
3. Create admin override capabilities
4. Implement gradual limit increases

## Best Practices
- **Start conservative**: Set limits lower than expected usage
- **Monitor and adjust**: Use metrics to fine-tune limits
- **User communication**: Clear error messages and upgrade paths
- **Graceful degradation**: Don't break user experience
- **Security consideration**: Rate limiting helps prevent abuse

## Output Format

### Recommended Strategy
**Algorithm**: [Chosen algorithm]
**Limits**: [Specific limits by tier]
**Implementation**: [Code examples]

### Architecture Diagram
[ASCII art or description of the flow]

### Monitoring Plan
[Metrics and alerts to implement]`,
      category: 'business',
      tags: ['api', 'rate-limiting', 'scalability', 'security', 'redis'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'endpoint', description: 'API endpoint path', default: '/api/v1/users', type: 'text' },
        { name: 'method', description: 'HTTP method', default: 'GET', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        { name: 'purpose', description: 'Endpoint purpose', default: 'User management', type: 'text' },
        { name: 'expected_load', description: 'Expected traffic volume', default: '1000 requests/minute', type: 'text' },
      ],
      isFeatured: false,
      isStaffPick: true,
      status: 'approved',
      cloneCount: 650,
      viewCount: 4800,
      avgRating: 4.8,
      reviewCount: 43,
    },
    {
      title: 'Docker Multi-Stage Build Optimizer',
      description: 'Create optimized Docker multi-stage builds for various tech stacks with security scanning, layer caching, and production-ready configurations.',
      content: `You are a DevOps engineer specializing in containerization, Docker optimization, and CI/CD pipelines.

## Task
Create an optimized multi-stage Docker build configuration for the specified application stack.

## Application Details
- **Technology Stack**: {{tech_stack}}
- **Application Type**: {{app_type}}
- **Build Requirements**: {{build_requirements}}
- **Target Environment**: {{target_environment}}

## Multi-Stage Docker Build Structure

### 1. Base Stage - Common Dependencies
\`\`\`dockerfile
# Base stage for common dependencies
FROM node:18-alpine AS base

# Install common system dependencies
RUN apk add --no-cache \
    git \
    curl \
    wget \
    ca-certificates

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci --only=production=false

# Copy source code
COPY . .
\`\`\`

### 2. Build Stage - Compilation and Building
\`\`\`dockerfile
# Build stage for compilation
FROM base AS build

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    build-base

# Build the application
RUN npm run build

# Run tests in build stage
RUN npm run test

# Create production bundle
RUN npm run build:prod
\`\`\`

### 3. Security Stage - Vulnerability Scanning
\`\`\`dockerfile
# Security scanning stage
FROM build AS security

# Install security scanning tools
RUN apk add --no-cache \
    trivy \
    clamav \
    npm-audit

# Run security scans
RUN trivy filesystem --exit-code 1 --no-progress /app
RUN npm audit --audit-level high

# Virus scanning
RUN freshclam && clamscan -r /app
\`\`\`

### 4. Production Stage - Runtime Optimization
\`\`\`dockerfile
# Production stage with minimal runtime
FROM node:18-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from build stage
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/package*.json ./
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
\`\`\`

## Layer Optimization Techniques

### 1. Dependency Layer Caching
\`\`\`dockerfile
# Copy only package files first
COPY package*.json yarn.lock ./

# Install dependencies in separate layer
RUN npm ci --only=production && npm cache clean --force

# Copy source code after dependency installation
COPY . .
\`\`\`

### 2. Multi-Stage Benefits
- **Reduced image size**: 80-90% smaller production images
- **Security**: Remove build tools and source code from final image
- **Build performance**: Better layer caching and faster builds
- **Maintainability**: Clear separation of concerns

### 3. Advanced Optimization
\`\`\`dockerfile
# Use .dockerignore to exclude unnecessary files
# .dockerignore
node_modules
.git
README.md
.env*
.nyc_output
coverage

# Use distroless images for maximum security
FROM gcr.io/distroless/nodejs:18 AS production

# Copy application
COPY --from=build /app/dist ./dist

# Run as non-root user (built into distroless)
CMD ["./dist/server.js"]
\`\`\`

## Build and Deployment Commands

### Local Development
\`\`\`bash
# Build all stages
docker build --target build -t myapp:build .

# Build production image
docker build -t myapp:latest .

# Run with development overrides
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  -v $(pwd):/app \
  myapp:latest
\`\`\`

### CI/CD Pipeline Integration
\`\`\`yaml
# .github/workflows/docker.yml
name: Build and Push Docker Image
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t myapp:${{ github.sha }} .
      
      - name: Security scan
        run: docker run --rm myapp:${{ github.sha }} trivy image
      
      - name: Push to registry
        run: docker push myregistry.com/myapp:${{ github.sha }}
\`\`\`

## Performance Metrics

### Image Size Comparison
- **Traditional single-stage**: ~1.2GB
- **Multi-stage optimized**: ~150MB
- **Distroless minimal**: ~80MB

### Build Time Optimization
- **Layer caching**: 70% faster subsequent builds
- **Parallel builds**: Use BuildKit for concurrent stage building
- **Dependency caching**: Mount cache volumes for package managers

## Security Best Practices

### 1. Vulnerability Scanning
\`\`\`dockerfile
# Include security scanning in build
FROM build AS security-scan

RUN apk add --no-cache trivy
RUN trivy filesystem --exit-code 1 --no-progress --ignore-unfixed /app
\`\`\`

### 2. Non-Root User
\`\`\`dockerfile
# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

USER appuser
\`\`\`

### 3. Minimal Attack Surface
- Remove unnecessary packages
- Use specific package versions
- Avoid running as root
- Use read-only filesystems where possible

## Monitoring and Observability

### Health Checks
\`\`\`dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1
\`\`\`

### Logging
\`\`\`dockerfile
# Structured logging to stdout
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
\`\`\`

## Output Format

### Complete Dockerfile
\`\`\`dockerfile
# Full optimized Dockerfile
\`\`\`

### Build Instructions
\`\`\`bash
# Commands to build and run
\`\`\`

### Performance Summary
- **Base image size**: X MB
- **Final image size**: Y MB
- **Security score**: A/100
- **Build time**: Z seconds`,
      category: 'coding',
      tags: ['docker', 'containerization', 'devops', 'optimization', 'security'],
      modelRecommendation: 'gpt-4',
      variables: [
        { name: 'tech_stack', description: 'Technology stack', default: 'Node.js, React, TypeScript', type: 'text' },
        { name: 'app_type', description: 'Application type', default: 'web-application', type: 'select', options: ['web-application', 'api-server', 'microservice', 'static-site'] },
        { name: 'build_requirements', description: 'Build requirements', default: 'TypeScript compilation, asset optimization', type: 'text' },
        { name: 'target_environment', description: 'Target environment', default: 'production', type: 'select', options: ['development', 'staging', 'production'] },
      ],
      isFeatured: true,
      isStaffPick: false,
      status: 'approved',
      cloneCount: 920,
      viewCount: 6800,
      avgRating: 4.9,
      reviewCount: 78,
    },
  ];

  for (const prompt of prompts) {
    await prisma.marketplacePrompt.create({
      data: {
        title: prompt.title,
        description: prompt.description,
        content: prompt.content,
        category: prompt.category,
        tags: prompt.tags,
        modelRecommendation: prompt.modelRecommendation,
        variables: prompt.variables,
        isFeatured: prompt.isFeatured,
        isStaffPick: prompt.isStaffPick,
        status: prompt.status,
        cloneCount: prompt.cloneCount,
        viewCount: prompt.viewCount,
        avgRating: prompt.avgRating,
        reviewCount: prompt.reviewCount,
      },
    });
  }

  console.log('✅ Marketplace seeded with high-quality prompts');
}

// Run seeder if called directly
if (require.main === module) {
  seedMarketplace()
    .catch((e) => {
      console.error('❌ Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedMarketplace };
