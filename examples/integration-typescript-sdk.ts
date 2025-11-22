/**
 * Integration Example: MCP Flow with Official TypeScript SDK
 *
 * This example shows how to add MCP Flow interactive capabilities
 * to an existing MCP server built with @modelcontextprotocol/sdk
 *
 * Prerequisites:
 * npm install @modelcontextprotocol/sdk mcp-flow
 */

// NOTE: These imports assume @modelcontextprotocol/sdk is installed
// Uncomment when using in a real project with the SDK installed
/*
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
*/

import { withMCPFlow, wrapMCPTool } from '../src/adapters/sdk-adapter';
import { WizardBuilder } from '../src/patterns/wizard';

/**
 * Example 1: Adding MCP Flow to Existing Server
 */
export async function example1_basicIntegration() {
  // Create standard MCP server (uncomment when SDK is available)
  /*
  const server = new Server(
    {
      name: 'example-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register standard MCP tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'calculate',
          description: 'Perform calculations',
          inputSchema: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['operation', 'a', 'b'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'calculate') {
      const { operation, a, b } = args;
      let result;
      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          result = a / b;
          break;
      }
      return {
        content: [{ type: 'text', text: `Result: ${result}` }],
      };
    }

    throw new Error('Unknown tool');
  });

  // 🎯 Add MCP Flow interactive capabilities!
  const flowServer = withMCPFlow(server);

  // Add an interactive wizard tool
  flowServer.addInteractiveTool({
    name: 'interactive_calculator',
    description: 'Interactive calculator with guided input',
    async execute(context) {
      const wizard = new WizardBuilder()
        .addChoice('operation', 'What operation would you like to perform?', [
          { value: 'add', label: 'Addition' },
          { value: 'subtract', label: 'Subtraction' },
          { value: 'multiply', label: 'Multiplication' },
          { value: 'divide', label: 'Division' },
        ])
        .addNumber('a', 'Enter first number:', { required: true })
        .addNumber('b', 'Enter second number:', {
          required: true,
          validate: (value, context) => {
            if (context.operation === 'divide' && value === 0) {
              return 'Cannot divide by zero';
            }
            return true;
          },
        })
        .onComplete((data) => {
          let result;
          switch (data.operation) {
            case 'add':
              result = (data.a as number) + (data.b as number);
              break;
            case 'subtract':
              result = (data.a as number) - (data.b as number);
              break;
            case 'multiply':
              result = (data.a as number) * (data.b as number);
              break;
            case 'divide':
              result = (data.a as number) / (data.b as number);
              break;
          }
          return {
            operation: data.operation,
            a: data.a,
            b: data.b,
            result,
          };
        })
        .build();

      return await wizard.execute(context);
    },
  });

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('Server running with MCP Flow interactive capabilities!');
  */

  console.log('Example: Install @modelcontextprotocol/sdk to run this example');
}

/**
 * Example 2: Migrating Existing Tools to Interactive
 */
export async function example2_migratingTools() {
  /*
  const server = new Server({ name: 'migrated-server', version: '1.0.0' }, { capabilities: { tools: {} } });
  const flowServer = withMCPFlow(server);

  // Original MCP tool definition
  const searchToolSchema = {
    name: 'search_files',
    description: 'Search for files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        maxResults: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  };

  // Original handler
  async function searchFilesHandler(args: any) {
    // Simulate file search
    return {
      results: [
        { name: 'config.json', path: '/app/config.json' },
        { name: 'config.dev.json', path: '/app/config.dev.json' },
      ],
    };
  }

  // 🎯 Wrap as interactive tool - automatically prompts for missing params!
  const interactiveSearchTool = wrapMCPTool(
    'search_files',
    'Search for files with interactive prompts',
    searchToolSchema.inputSchema,
    searchFilesHandler
  );

  flowServer.addInteractiveTool(interactiveSearchTool);

  // Now the tool will automatically prompt for 'query' if not provided!
  */

  console.log('Example: Automatically prompts for required parameters');
}

/**
 * Example 3: Real-World Postgres Server Enhancement
 */
export async function example3_postgresEnhancement() {
  /*
  // Based on official MCP Postgres server
  const server = new Server(
    { name: 'postgres-server', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  const flowServer = withMCPFlow(server);

  // Add interactive query builder
  flowServer.addInteractiveTool({
    name: 'interactive_query',
    description: 'Build SQL queries interactively',
    async execute(context) {
      const wizard = new WizardBuilder()
        .addChoice('queryType', 'What type of query?', [
          { value: 'select', label: 'SELECT (Read data)' },
          { value: 'insert', label: 'INSERT (Add data)' },
          { value: 'update', label: 'UPDATE (Modify data)' },
          { value: 'delete', label: 'DELETE (Remove data)' },
        ])
        .addText('tableName', 'Which table?', { required: true })
        .addConditional(
          {
            id: 'columns',
            prompt: {
              type: 'text',
              message: 'Which columns? (comma-separated)',
            },
          },
          (ctx) => ctx.queryType === 'select'
        )
        .addConditional(
          {
            id: 'whereClause',
            prompt: {
              type: 'text',
              message: 'WHERE clause (optional):',
            },
          },
          (ctx) => ['select', 'update', 'delete'].includes(ctx.queryType as string)
        )
        .addConfirm('executeNow', 'Execute this query now?', { defaultValue: false })
        .onComplete(async (data) => {
          // Build query
          let query = '';
          switch (data.queryType) {
            case 'select':
              query = `SELECT ${data.columns || '*'} FROM ${data.tableName}`;
              if (data.whereClause) query += ` WHERE ${data.whereClause}`;
              break;
            // ... other query types
          }

          return {
            query,
            executed: data.executeNow,
            preview: data.executeNow ? 'Results would appear here' : 'Query not executed',
          };
        })
        .build();

      return await wizard.execute(context);
    },
  });

  console.log('Enhanced Postgres server with interactive query builder');
  */

  console.log('Example: Interactive SQL query builder');
}

/**
 * Example 4: GitHub Server with Interactive PR Creation
 */
export async function example4_githubEnhancement() {
  /*
  const server = new Server(
    { name: 'github-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const flowServer = withMCPFlow(server);

  flowServer.addInteractiveTool({
    name: 'create_pr_interactive',
    description: 'Create a GitHub PR with guided flow',
    async execute(context) {
      // Get current branch
      const currentBranch = await getCurrentBranch();

      const wizard = new WizardBuilder()
        .addText('baseBranch', 'Base branch (target):', {
          defaultValue: 'main',
          required: true,
        })
        .addText('title', 'PR Title:', {
          required: true,
          validate: (value) => {
            const title = String(value);
            if (title.length < 10) {
              return 'Title should be at least 10 characters';
            }
            return true;
          },
        })
        .addText('description', 'PR Description:', {
          placeholder: 'Describe your changes...',
          required: true,
        })
        .addChoice('type', 'PR Type:', [
          { value: 'feature', label: '✨ Feature' },
          { value: 'bugfix', label: '🐛 Bug Fix' },
          { value: 'docs', label: '📚 Documentation' },
          { value: 'refactor', label: '♻️ Refactor' },
        ])
        .addConfirm('isDraft', 'Create as draft PR?', { defaultValue: false })
        .addConfirm('autoMerge', 'Enable auto-merge?', { defaultValue: false })
        .onComplete(async (data) => {
          // Create PR using GitHub API
          const pr = await createGitHubPR({
            base: data.baseBranch,
            head: currentBranch,
            title: `[${data.type}] ${data.title}`,
            body: data.description,
            draft: data.isDraft,
          });

          if (data.autoMerge) {
            await enableAutoMerge(pr.number);
          }

          return {
            success: true,
            pr: {
              number: pr.number,
              url: pr.url,
              isDraft: data.isDraft,
              autoMerge: data.autoMerge,
            },
          };
        })
        .build();

      return await wizard.execute(context);
    },
  });
  */

  console.log('Example: Interactive GitHub PR creation');
}

// Mock functions (replace with real implementations)
async function getCurrentBranch(): Promise<string> {
  return 'feature/my-feature';
}

async function createGitHubPR(options: any): Promise<any> {
  return {
    number: 123,
    url: 'https://github.com/user/repo/pull/123',
  };
}

async function enableAutoMerge(prNumber: number): Promise<void> {
  // Enable auto-merge
}

/**
 * Run examples (for demonstration)
 */
if (require.main === module) {
  console.log('=== MCP Flow Integration Examples ===\n');

  console.log('Example 1: Basic Integration');
  example1_basicIntegration();

  console.log('\nExample 2: Migrating Tools');
  example2_migratingTools();

  console.log('\nExample 3: Postgres Enhancement');
  example3_postgresEnhancement();

  console.log('\nExample 4: GitHub Enhancement');
  example4_githubEnhancement();

  console.log('\n💡 Install @modelcontextprotocol/sdk to run these examples with real MCP servers');
}
