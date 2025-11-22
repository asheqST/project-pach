/**
 * Standalone Integration Example
 *
 * This example shows MCP Flow working independently
 * without requiring @modelcontextprotocol/sdk
 *
 * Run with: npx ts-node examples/standalone-integration.ts
 */

import { InteractiveServer, InteractiveTool } from '../src/server';
import { InteractiveClient, Transport } from '../src/client';
import { WizardBuilder } from '../src/patterns/wizard';
import { Clarification, Disambiguate } from '../src/patterns/clarification';
import { ValidatedInput, Validators } from '../src/patterns/validation';

/**
 * Example 1: Complete Interactive Flow (Server + Client)
 */
export async function completeFlowExample() {
  console.log('=== Example 1: Complete Interactive Flow ===\n');

  // Create server
  const server = new InteractiveServer();

  // Register interactive wizard tool
  server.registerTool({
    name: 'user_onboarding',
    description: 'Interactive user onboarding wizard',
    async execute(context) {
      const wizard = new WizardBuilder()
        .addText('name', 'What is your name?', {
          required: true,
          validate: (value) => {
            if (String(value).length < 2) {
              return 'Name must be at least 2 characters';
            }
            return true;
          },
        })
        .addText('email', 'What is your email?', {
          required: true,
          pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        })
        .addChoice('role', 'What is your role?', [
          { value: 'developer', label: 'Developer' },
          { value: 'designer', label: 'Designer' },
          { value: 'manager', label: 'Manager' },
          { value: 'other', label: 'Other' },
        ])
        .addChoice('experience', 'Experience level?', [
          { value: 'beginner', label: 'Beginner (< 1 year)' },
          { value: 'intermediate', label: 'Intermediate (1-3 years)' },
          { value: 'advanced', label: 'Advanced (3-5 years)' },
          { value: 'expert', label: 'Expert (5+ years)' },
        ])
        .addConfirm('newsletter', 'Subscribe to newsletter?', {
          defaultValue: false,
        })
        .onComplete((data) => {
          return {
            success: true,
            message: `Welcome ${data.name}! Your account is ready.`,
            user: data,
          };
        })
        .build();

      return await wizard.execute(context);
    },
  });

  // Create in-memory transport
  const transport: Transport = {
    async send(request) {
      return await server.handleRequest(request);
    },
  };

  // Create client
  const client = new InteractiveClient(transport);

  // Simulate user responses
  const userResponses = ['John Doe', 'john@example.com', 'developer', 'advanced', 'yes'];
  let responseIndex = 0;

  // Run interactive session
  const result = await client.runInteractive(
    'user_onboarding',
    async (prompt) => {
      const response = userResponses[responseIndex++];
      console.log(`Q: ${prompt.message}`);
      console.log(`A: ${response}\n`);
      return response;
    }
  );

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n');
}

/**
 * Example 2: File Search with Disambiguation
 */
export async function fileSearchExample() {
  console.log('=== Example 2: File Search with Disambiguation ===\n');

  const server = new InteractiveServer();

  server.registerTool({
    name: 'smart_search',
    description: 'Search files with disambiguation',
    async execute(context) {
      // Get search query
      const queryResponse = await context.prompt({
        type: 'text',
        message: 'What are you looking for?',
        validation: { required: true },
      });

      // Simulate search results
      const results = [
        {
          id: '1',
          title: 'config.json',
          description: 'Main configuration (1.2 KB)',
        },
        {
          id: '2',
          title: 'config.dev.json',
          description: 'Development config (800 B)',
        },
        {
          id: '3',
          title: 'config.prod.json',
          description: 'Production config (950 B)',
        },
      ];

      if (results.length > 1) {
        const clarification = new Clarification(
          Disambiguate.fromSearchResults(
            results,
            `Found ${results.length} files matching "${queryResponse.value}"`
          )
        );

        const selected = await clarification.execute(context);
        return {
          success: true,
          selected: selected,
          query: queryResponse.value,
        };
      }

      return { success: true, results };
    },
  });

  const transport: Transport = {
    async send(request) {
      return await server.handleRequest(request);
    },
  };

  const client = new InteractiveClient(transport);

  const userResponses = ['config', '2']; // Search for "config", select option 2
  let responseIndex = 0;

  const result = await client.runInteractive('smart_search', async (prompt) => {
    const response = userResponses[responseIndex++];
    console.log(`Q: ${prompt.message}`);
    if (prompt.choices) {
      prompt.choices.forEach((choice, i) => {
        console.log(`  ${i + 1}. ${choice.label}`);
      });
    }
    console.log(`A: ${response}\n`);
    return prompt.type === 'choice' ? prompt.choices![Number(response) - 1].value : response;
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n');
}

/**
 * Example 3: Form Validation with Retry
 */
export async function formValidationExample() {
  console.log('=== Example 3: Form Validation with Retry ===\n');

  const server = new InteractiveServer();

  server.registerTool({
    name: 'user_registration',
    description: 'User registration with validation',
    async execute(context) {
      // Email validation with retry
      const emailInput = new ValidatedInput({
        prompt: {
          type: 'text',
          message: 'Enter your email address:',
        },
        validate: Validators.combine(
          Validators.email(),
          Validators.custom(async (value) => {
            // Simulate checking if email exists
            const existingEmails = ['admin@example.com', 'test@example.com'];
            return !existingEmails.includes(String(value).toLowerCase());
          }, 'Email already registered')
        ),
        maxAttempts: 3,
      });

      const email = await emailInput.execute(context);

      // Password validation
      const passwordInput = new ValidatedInput({
        prompt: {
          type: 'text',
          message: 'Create a password (min 8 chars):',
        },
        validate: (value) => {
          const password = String(value);
          if (password.length < 8) {
            return {
              valid: false,
              error: 'Password must be at least 8 characters',
            };
          }
          if (!/[A-Z]/.test(password)) {
            return {
              valid: false,
              error: 'Password must contain at least one uppercase letter',
            };
          }
          return { valid: true };
        },
        maxAttempts: 3,
      });

      const password = await passwordInput.execute(context);

      return {
        success: true,
        message: 'Registration successful!',
        email,
      };
    },
  });

  const transport: Transport = {
    async send(request) {
      return await server.handleRequest(request);
    },
  };

  const client = new InteractiveClient(transport);

  const userResponses = ['admin@example.com', 'newuser@example.com', 'short', 'Password123'];
  let responseIndex = 0;

  try {
    const result = await client.runInteractive('user_registration', async (prompt) => {
      const response = userResponses[responseIndex++];
      console.log(`Q: ${prompt.message}`);
      console.log(`A: ${response}`);

      // Wait for validation
      await new Promise((resolve) => setTimeout(resolve, 100));

      return response;
    });

    console.log('\nResult:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('\nValidation handled errors gracefully');
  }

  console.log('\n');
}

/**
 * Example 4: Multi-step Configuration
 */
export async function configurationExample() {
  console.log('=== Example 4: Multi-step Configuration ===\n');

  const server = new InteractiveServer();

  server.registerTool({
    name: 'database_config',
    description: 'Configure database connection',
    async execute(context) {
      const wizard = new WizardBuilder()
        .addChoice('dbType', 'Database type:', [
          { value: 'postgres', label: 'PostgreSQL' },
          { value: 'mysql', label: 'MySQL' },
          { value: 'mongodb', label: 'MongoDB' },
          { value: 'redis', label: 'Redis' },
        ])
        .addText('host', 'Database host:', {
          defaultValue: 'localhost',
          required: true,
        })
        .addNumber('port', 'Port:', {
          defaultValue: 5432,
          min: 1,
          max: 65535,
          required: true,
        })
        .addText('database', 'Database name:', { required: true })
        .addText('username', 'Username:', { required: true })
        .addConfirm('useSSL', 'Use SSL connection?', { defaultValue: true })
        .addConditional(
          {
            id: 'sslCert',
            prompt: {
              type: 'text',
              message: 'Path to SSL certificate:',
            },
          },
          (ctx) => ctx.useSSL === true
        )
        .addConfirm('testConnection', 'Test connection now?', {
          defaultValue: true,
        })
        .onComplete(async (data) => {
          let connectionString = '';
          switch (data.dbType) {
            case 'postgres':
              connectionString = `postgresql://${data.username}@${data.host}:${data.port}/${data.database}`;
              break;
            case 'mysql':
              connectionString = `mysql://${data.username}@${data.host}:${data.port}/${data.database}`;
              break;
            case 'mongodb':
              connectionString = `mongodb://${data.username}@${data.host}:${data.port}/${data.database}`;
              break;
          }

          if (data.useSSL) {
            connectionString += '?ssl=true';
          }

          return {
            success: true,
            config: {
              type: data.dbType,
              connectionString,
              ssl: data.useSSL,
              tested: data.testConnection,
            },
          };
        })
        .build();

      return await wizard.execute(context);
    },
  });

  const transport: Transport = {
    async send(request) {
      return await server.handleRequest(request);
    },
  };

  const client = new InteractiveClient(transport);

  const userResponses = [
    'postgres',
    'db.example.com',
    '5432',
    'myapp',
    'admin',
    'yes',
    '/path/to/cert.pem',
    'yes',
  ];
  let responseIndex = 0;

  const result = await client.runInteractive('database_config', async (prompt) => {
    const response = userResponses[responseIndex++];
    console.log(`Q: ${prompt.message}`);
    if (prompt.choices) {
      prompt.choices.forEach((choice, i) => {
        console.log(`  ${i + 1}. ${choice.label}`);
      });
    }
    console.log(`A: ${response}\n`);

    // Convert choice index to value if needed
    if (prompt.type === 'choice' && !isNaN(Number(response))) {
      return prompt.choices![Number(response) - 1].value;
    }

    return response;
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n');
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   MCP Flow - Standalone Integration Demo  ║');
  console.log('╚════════════════════════════════════════════╝\n');

  try {
    await completeFlowExample();
    await fileSearchExample();
    await formValidationExample();
    await configurationExample();

    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export { runExamples };
