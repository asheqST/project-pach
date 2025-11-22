# MCP Flow Examples

Complete examples demonstrating MCP Flow patterns and usage.

## Table of Contents

1. [Basic Interactive Tool](#basic-interactive-tool)
2. [Wizard Pattern](#wizard-pattern)
3. [Validation Pattern](#validation-pattern)
4. [Clarification Pattern](#clarification-pattern)
5. [Complete Server & Client](#complete-server--client)

## Basic Interactive Tool

A simple tool that prompts for two inputs and combines them.

```typescript
import { InteractiveTool, ToolExecutionContext } from 'mcp-flow';

export const greetingTool: InteractiveTool = {
  name: 'greeting',
  description: 'Creates a personalized greeting',

  async execute(context: ToolExecutionContext) {
    // Prompt for name
    const nameResponse = await context.prompt({
      type: 'text',
      message: 'What is your name?',
      placeholder: 'Enter your name',
      validation: {
        required: true,
        min: 2,
        max: 50
      }
    });

    const name = nameResponse.value;

    // Prompt for time of day
    const timeResponse = await context.prompt({
      type: 'choice',
      message: 'What time of day is it?',
      choices: [
        { value: 'morning', label: 'Morning' },
        { value: 'afternoon', label: 'Afternoon' },
        { value: 'evening', label: 'Evening' }
      ],
      validation: { required: true }
    });

    const timeOfDay = timeResponse.value;

    // Generate greeting
    const greetings = {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening'
    };

    const greeting = `${greetings[timeOfDay]}, ${name}! 👋`;

    // Store in context
    context.setData('greeting', greeting);

    return {
      success: true,
      greeting,
      timestamp: new Date().toISOString()
    };
  }
};
```

## Wizard Pattern

A complete user registration wizard with validation and conditional fields.

```typescript
import { InteractiveTool, ToolExecutionContext } from 'mcp-flow';
import { WizardBuilder } from 'mcp-flow/patterns';

export const registrationWizard: InteractiveTool = {
  name: 'user_registration',
  description: 'Complete user registration wizard',

  async execute(context: ToolExecutionContext) {
    const wizard = new WizardBuilder()
      // Step 1: Username
      .addText('username', 'Choose a username:', {
        placeholder: 'username',
        required: true,
        pattern: '^[a-zA-Z0-9_]{3,20}$',
        validate: async (value) => {
          // Simulate checking if username exists
          const exists = await checkUsernameExists(String(value));
          if (exists) {
            return 'Username already taken';
          }
          return true;
        }
      })

      // Step 2: Email
      .addText('email', 'Enter your email address:', {
        placeholder: 'user@example.com',
        required: true,
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        validate: async (value) => {
          const email = String(value);
          const domain = email.split('@')[1];

          // Block disposable email domains
          const blockedDomains = ['tempmail.com', 'throwaway.email'];
          if (blockedDomains.includes(domain)) {
            return 'Disposable email addresses are not allowed';
          }

          return true;
        }
      })

      // Step 3: Password
      .addText('password', 'Create a password:', {
        placeholder: 'Min 8 characters',
        required: true,
        validate: (value) => {
          const password = String(value);

          if (password.length < 8) {
            return 'Password must be at least 8 characters';
          }

          if (!/[A-Z]/.test(password)) {
            return 'Password must contain at least one uppercase letter';
          }

          if (!/[a-z]/.test(password)) {
            return 'Password must contain at least one lowercase letter';
          }

          if (!/[0-9]/.test(password)) {
            return 'Password must contain at least one number';
          }

          return true;
        }
      })

      // Step 4: Account Type
      .addChoice('accountType', 'Select account type:', [
        { value: 'personal', label: 'Personal' },
        { value: 'business', label: 'Business' }
      ], { required: true })

      // Step 5: Company (conditional - only for business)
      .addConditional(
        {
          id: 'companyName',
          prompt: {
            type: 'text',
            message: 'Enter your company name:',
            validation: {
              required: true,
              min: 2
            }
          }
        },
        (wizardContext) => wizardContext.accountType === 'business'
      )

      // Step 6: Age verification
      .addNumber('age', 'Enter your age:', {
        min: 13,
        max: 120,
        required: true
      })

      // Step 7: Terms acceptance
      .addConfirm(
        'acceptTerms',
        'Do you accept the Terms of Service and Privacy Policy?',
        { defaultValue: false }
      )

      // Completion handler
      .onComplete(async (wizardContext) => {
        // Validate terms acceptance
        if (!wizardContext.acceptTerms) {
          throw new Error('You must accept the terms to continue');
        }

        // Create user account
        const user = await createUserAccount({
          username: wizardContext.username,
          email: wizardContext.email,
          password: wizardContext.password,
          accountType: wizardContext.accountType,
          companyName: wizardContext.companyName,
          age: wizardContext.age
        });

        // Send welcome email
        await sendWelcomeEmail(user.email);

        return {
          success: true,
          userId: user.id,
          username: user.username,
          message: 'Registration complete! Welcome aboard! 🎉'
        };
      })
      .build();

    return await wizard.execute(context);
  }
};

// Helper functions (simulated)
async function checkUsernameExists(username: string): Promise<boolean> {
  // Simulate database check
  const existingUsernames = ['admin', 'user', 'test'];
  return existingUsernames.includes(username.toLowerCase());
}

async function createUserAccount(data: any) {
  // Simulate user creation
  return {
    id: `user_${Date.now()}`,
    username: data.username,
    email: data.email,
    accountType: data.accountType,
    createdAt: new Date().toISOString()
  };
}

async function sendWelcomeEmail(email: string): Promise<void> {
  // Simulate email sending
  console.log(`Welcome email sent to ${email}`);
}
```

## Validation Pattern

Email validation with retry logic and custom async validators.

```typescript
import { InteractiveTool } from 'mcp-flow';
import { ValidatedInput, Validators } from 'mcp-flow/patterns';

export const emailCollectorTool: InteractiveTool = {
  name: 'collect_email',
  description: 'Collects and validates email with retry logic',

  async execute(context) {
    // Primary email validation
    const emailValidator = new ValidatedInput({
      prompt: {
        type: 'text',
        message: 'Enter your email address:',
        placeholder: 'user@example.com'
      },
      validate: Validators.combine(
        Validators.email(),
        Validators.custom(async (value) => {
          // Check MX records
          return await checkMXRecords(String(value));
        }, 'Email domain has no mail servers'),
        Validators.custom(async (value) => {
          // Check if email exists in system
          const exists = await checkEmailInDatabase(String(value));
          return !exists;
        }, 'Email already registered')
      ),
      maxAttempts: 3,
      onSuccess: (email) => {
        console.log(`Valid email collected: ${email}`);
        return email;
      },
      onFailure: (errors) => {
        console.error('Email validation failed:', errors);
      }
    });

    const email = await emailValidator.execute(context);

    // Confirmation email validation
    const confirmValidator = new ValidatedInput({
      prompt: {
        type: 'text',
        message: 'Please confirm your email address:'
      },
      validate: (value) => {
        if (String(value) !== String(email)) {
          return {
            valid: false,
            error: 'Email addresses do not match',
            suggestion: `Expected: ${email}`
          };
        }
        return { valid: true };
      },
      maxAttempts: 3
    });

    await confirmValidator.execute(context);

    return {
      success: true,
      email,
      verified: true,
      timestamp: new Date().toISOString()
    };
  }
};

async function checkMXRecords(email: string): Promise<boolean> {
  // Simulate MX record check
  const domain = email.split('@')[1];
  return !['invalid.com', 'fake.domain'].includes(domain);
}

async function checkEmailInDatabase(email: string): Promise<boolean> {
  // Simulate database check
  const existingEmails = ['admin@example.com', 'test@example.com'];
  return existingEmails.includes(email.toLowerCase());
}
```

## Clarification Pattern

File search with disambiguation and smart suggestions.

```typescript
import { InteractiveTool } from 'mcp-flow';
import { Clarification, Disambiguate, SmartClarification } from 'mcp-flow/patterns';

export const smartFileSearchTool: InteractiveTool = {
  name: 'smart_file_search',
  description: 'Search files with intelligent disambiguation',

  async execute(context) {
    // Get search query
    const queryResponse = await context.prompt({
      type: 'text',
      message: 'What file are you looking for?',
      placeholder: 'config.json, *.ts, etc.',
      validation: { required: true }
    });

    const query = String(queryResponse.value);

    // Perform search
    const results = await searchFiles(query);

    // No results
    if (results.length === 0) {
      // Smart suggestions based on query
      const suggestions = await getSuggestions(query);

      if (suggestions.length > 0) {
        const suggestionClarification = new Clarification({
          message: `No exact matches found. Did you mean:`,
          options: suggestions.map(s => ({
            value: s.query,
            label: s.query,
            description: `${s.count} matches`,
            data: s
          })),
          allowCustom: true,
          customPrompt: 'Or enter a new search:'
        });

        const newQuery = await suggestionClarification.execute(context);
        return await this.execute({ ...context, initialParams: { query: newQuery } });
      }

      return {
        success: false,
        message: 'No files found'
      };
    }

    // Single result
    if (results.length === 1) {
      return {
        success: true,
        file: results[0]
      };
    }

    // Multiple results - use smart clarification
    const smartClarification = new SmartClarification(
      Disambiguate.fromSearchResults(results),
      (ctx) => {
        // Add recently accessed files to top
        const recentFiles = ctx.recentlyAccessed as any[] || [];
        return results
          .filter(r => recentFiles.includes(r.id))
          .map(r => ({
            value: r.id,
            label: `⭐ ${r.title}`,
            description: `${r.description} (Recently accessed)`,
            data: r
          }));
      }
    );

    const selectedFile = await smartClarification.execute(context);

    // Track selection for future suggestions
    context.setData('lastSelectedFile', selectedFile);

    // Ask what to do with file
    const actionClarification = new Clarification({
      message: `What would you like to do with ${selectedFile.title}?`,
      options: getFileActions(selectedFile)
    });

    const action = await actionClarification.execute(context);

    return {
      success: true,
      file: selectedFile,
      action
    };
  }
};

interface FileResult {
  id: string;
  title: string;
  description: string;
  path: string;
  size: number;
  modified: Date;
}

async function searchFiles(query: string): Promise<FileResult[]> {
  // Simulate file search
  const mockFiles: FileResult[] = [
    {
      id: '1',
      title: 'config.json',
      description: 'Main configuration (1.2 KB)',
      path: '/app/config.json',
      size: 1200,
      modified: new Date('2024-01-15')
    },
    {
      id: '2',
      title: 'config.dev.json',
      description: 'Dev configuration (800 B)',
      path: '/app/config.dev.json',
      size: 800,
      modified: new Date('2024-01-10')
    }
  ];

  return mockFiles.filter(f =>
    f.title.toLowerCase().includes(query.toLowerCase())
  );
}

async function getSuggestions(query: string) {
  // Generate smart suggestions
  return [
    { query: query + '.json', count: 3 },
    { query: query + '.ts', count: 5 }
  ];
}

function getFileActions(file: FileResult) {
  const ext = file.title.split('.').pop();

  const actions = [
    { value: 'view', label: 'View', description: 'View file contents' },
    { value: 'edit', label: 'Edit', description: 'Edit in editor' },
    { value: 'copy', label: 'Copy Path', description: 'Copy file path' },
    { value: 'delete', label: 'Delete', description: 'Delete file' }
  ];

  // Add type-specific actions
  if (ext === 'json') {
    actions.unshift({
      value: 'validate',
      label: 'Validate',
      description: 'Validate JSON syntax'
    });
  }

  return actions;
}
```

## Complete Server & Client

Full example showing server setup, tool registration, and client interaction.

### Server

```typescript
import { InteractiveServer } from 'mcp-flow';
import { greetingTool } from './tools/greeting';
import { registrationWizard } from './tools/registration';

// Create server
const server = new InteractiveServer({
  session: {
    defaultTimeout: 300000, // 5 minutes
    maxSessions: 100,
    pruneInterval: 60000 // 1 minute
  },
  capabilities: {
    features: {
      statefulSessions: true,
      progressTracking: true,
      validation: true,
      multiplePromptTypes: true
    }
  }
});

// Register tools
server.registerTool(greetingTool);
server.registerTool(registrationWizard);

// Event handlers
server.on('toolStarted', (sessionId, toolName) => {
  console.log(`[${sessionId}] Tool started: ${toolName}`);
});

server.on('toolCompleted', (sessionId, result) => {
  console.log(`[${sessionId}] Tool completed:`, result);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle incoming requests
export async function handleRequest(request: any) {
  try {
    const response = await server.handleRequest(request);
    return response;
  } catch (error) {
    console.error('Request handling error:', error);
    throw error;
  }
}

// Cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.destroy();
  process.exit(0);
});
```

### Client

```typescript
import { InteractiveClient } from 'mcp-flow';
import * as readline from 'readline';

// Create transport (example with stdio)
const transport = {
  async send(request: any) {
    // Send to server via your transport mechanism
    // This could be stdio, HTTP, WebSocket, etc.
    return await sendToServer(request);
  }
};

// Create client
const client = new InteractiveClient(transport);

// Check capabilities
const capabilities = await client.negotiate();
console.log('Server capabilities:', capabilities);

if (!capabilities.interactive) {
  console.error('Server does not support interactive mode');
  process.exit(1);
}

// Run interactive session
async function runGreeting() {
  const result = await client.runInteractive(
    'greeting',
    async (prompt) => {
      // Handle different prompt types
      if (prompt.type === 'text') {
        return await askQuestion(prompt.message);
      } else if (prompt.type === 'choice') {
        return await askChoice(prompt.message, prompt.choices!);
      }
      throw new Error(`Unsupported prompt type: ${prompt.type}`);
    }
  );

  console.log('Result:', result);
}

// Helper: Ask text question
async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question + ' ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Helper: Ask choice question
async function askChoice(
  question: string,
  choices: Array<{ value: string; label: string }>
): Promise<string> {
  console.log(question);
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}. ${choice.label}`);
  });

  const answer = await askQuestion('Select number:');
  const index = parseInt(answer) - 1;

  if (index >= 0 && index < choices.length) {
    return choices[index].value;
  }

  throw new Error('Invalid choice');
}

// Run
runGreeting().catch(console.error);
```

## Advanced: Custom Pattern

Creating a custom reusable pattern:

```typescript
import { ToolExecutionContext } from 'mcp-flow';
import { InteractionPrompt } from 'mcp-flow/protocol';

/**
 * Multi-step form with review/edit capability
 */
export class ReviewableForm {
  private steps: Array<{
    id: string;
    prompt: InteractionPrompt;
    format?: (value: any) => string;
  }>;

  constructor(steps: ReviewableForm['steps']) {
    this.steps = steps;
  }

  async execute(context: ToolExecutionContext) {
    const data: Record<string, any> = {};

    // Collect all inputs
    for (const step of this.steps) {
      const response = await context.prompt(step.prompt);
      data[step.id] = response.value;
    }

    // Review loop
    while (true) {
      // Show review
      const review = this.steps
        .map((step, i) => {
          const value = data[step.id];
          const formatted = step.format
            ? step.format(value)
            : String(value);
          return `${i + 1}. ${step.prompt.message} ${formatted}`;
        })
        .join('\n');

      // Confirm or edit
      const confirmResponse = await context.prompt({
        type: 'choice',
        message: `Review your information:\n\n${review}\n\nWhat would you like to do?`,
        choices: [
          { value: 'submit', label: 'Submit' },
          { value: 'edit', label: 'Edit' },
          { value: 'cancel', label: 'Cancel' }
        ]
      });

      if (confirmResponse.value === 'submit') {
        return data;
      }

      if (confirmResponse.value === 'cancel') {
        throw new Error('Cancelled by user');
      }

      // Edit specific field
      const editResponse = await context.prompt({
        type: 'choice',
        message: 'Which field would you like to edit?',
        choices: this.steps.map((step, i) => ({
          value: String(i),
          label: step.prompt.message
        }))
      });

      const editIndex = parseInt(String(editResponse.value));
      const stepToEdit = this.steps[editIndex];

      const newValue = await context.prompt(stepToEdit.prompt);
      data[stepToEdit.id] = newValue.value;
    }
  }
}
```

These examples demonstrate the full power and flexibility of MCP Flow for creating rich, interactive tool experiences.
