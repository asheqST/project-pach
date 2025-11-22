/**
 * Comprehensive Coverage Tests for MCP Flow
 * Tests all patterns, validators, and edge cases to achieve 80% coverage
 */

import { InteractiveServer, InteractiveTool } from '../src/server';
import { InteractiveClient, Transport } from '../src/client';
import { PromptType, InteractionState } from '../src/protocol/types';
import { JsonRpcRequest, JsonRpcResponse } from '../src/protocol/types';
import { WizardBuilder } from '../src/patterns/wizard';
import {
  Clarification,
  Disambiguate,
  HierarchicalClarification,
  SmartClarification,
} from '../src/patterns/clarification';
import { ValidatedInput, Validators } from '../src/patterns/validation';
import { StatelessSessionHandler } from '../src/session/stateless';

class InMemoryTransport implements Transport {
  constructor(private server: InteractiveServer) {}

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return this.server.handleRequest(request);
  }
}

describe('Coverage Tests - Wizard Pattern', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;

  beforeEach(() => {
    server = new InteractiveServer();
    client = new InteractiveClient(new InMemoryTransport(server));
  });

  afterEach(() => {
    server.destroy();
  });

  it('should handle wizard with all prompt types', async () => {
    const wizard = new WizardBuilder()
      .addText('name', 'Name:', { required: true, pattern: '^[A-Za-z ]+$' })
      .addNumber('age', 'Age:', { min: 18, max: 120, required: true })
      .addChoice('tier', 'Select tier:', [
        { value: 'basic', label: 'Basic' },
        { value: 'premium', label: 'Premium' },
      ])
      .addConfirm('newsletter', 'Subscribe to newsletter?', { defaultValue: false })
      .onComplete((context) => ({
        success: true,
        data: context,
      }))
      .build();

    const tool: InteractiveTool = {
      name: 'wizard_all_types',
      description: 'Tests all wizard prompt types',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    const inputs = ['John Doe', 25, 'premium', true];
    let index = 0;

    const result = await client.runInteractive('wizard_all_types', async () => {
      return inputs[index++];
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        name: 'John Doe',
        age: 25,
        tier: 'premium',
        newsletter: true,
      },
    });
  });

  it('should handle conditional wizard steps when condition is true', async () => {
    const wizard = new WizardBuilder()
      .addChoice('hasAccount', 'Do you have an account?', [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ])
      .addConditional(
        {
          id: 'email',
          prompt: {
            type: PromptType.TEXT,
            message: 'Enter your email:',
            validation: { required: true, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
          },
        },
        (context) => context.hasAccount === 'no'
      )
      .onComplete((context) => ({ registered: context.hasAccount === 'no', email: context.email }))
      .build();

    const tool: InteractiveTool = {
      name: 'conditional_wizard',
      description: 'Tests conditional steps',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    const inputs = ['no', 'test@example.com'];
    let index = 0;

    const result = await client.runInteractive('conditional_wizard', async () => {
      return inputs[index++];
    });

    expect(result).toEqual({ registered: true, email: 'test@example.com' });
  });

  it('should skip conditional wizard steps when condition is false', async () => {
    const wizard = new WizardBuilder()
      .addChoice('hasAccount', 'Do you have an account?', [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ])
      .addConditional(
        {
          id: 'email',
          prompt: {
            type: PromptType.TEXT,
            message: 'Enter your email:',
            validation: { required: true },
          },
        },
        (context) => context.hasAccount === 'no'
      )
      .onComplete((context) => ({ skipped: context.email === undefined }))
      .build();

    const tool: InteractiveTool = {
      name: 'skip_conditional',
      description: 'Tests skipping conditional steps',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('skip_conditional', async () => {
      return 'yes'; // Email step should be skipped
    });

    expect(result).toEqual({ skipped: true });
  });

  it('should handle wizard with custom validation', async () => {
    const wizard = new WizardBuilder()
      .addText('username', 'Username:', {
        required: true,
        validate: (value: unknown) => {
          const username = String(value);
          if (username.length < 3) {
            return 'Username must be at least 3 characters';
          }
          if (!/^[a-z0-9_]+$/.test(username)) {
            return 'Username can only contain lowercase letters, numbers, and underscores';
          }
          return true;
        },
      })
      .onComplete((context) => ({ username: context.username }))
      .build();

    const tool: InteractiveTool = {
      name: 'custom_validation_wizard',
      description: 'Tests custom validation',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('custom_validation_wizard', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'ab'; // Too short
      if (attemptCount === 2) return 'AB'; // Uppercase not allowed
      return 'valid_user'; // Valid
    });

    expect(result).toEqual({ username: 'valid_user' });
    expect(attemptCount).toBeGreaterThanOrEqual(3);
  });

  it('should handle wizard with value transformation', async () => {
    const tool: InteractiveTool = {
      name: 'transform_wizard',
      description: 'Tests value transformation',
      async execute(context) {
        const response = await context.prompt({
          type: PromptType.TEXT,
          message: 'Enter comma-separated values:',
          validation: { required: true },
        });

        const transformed = String(response.value)
          .split(',')
          .map((v) => v.trim());
        return { values: transformed };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('transform_wizard', async () => {
      return 'apple, banana, orange';
    });

    expect(result).toEqual({
      values: ['apple', 'banana', 'orange'],
    });
  });

  it('should handle wizard with placeholder and defaultValue', async () => {
    const wizard = new WizardBuilder()
      .addText('name', 'Enter name:', {
        placeholder: 'John Doe',
        defaultValue: 'Anonymous',
      })
      .addNumber('count', 'Enter count:', {
        defaultValue: 10,
        min: 1,
        max: 100,
      })
      .onComplete((context) => context)
      .build();

    const tool: InteractiveTool = {
      name: 'wizard_defaults',
      description: 'Tests wizard with defaults',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    const inputs = ['Alice', 42];
    let index = 0;

    const result = await client.runInteractive('wizard_defaults', async () => {
      return inputs[index++];
    });

    expect(result).toMatchObject({
      name: 'Alice',
      count: 42,
    });
  });
});

describe('Coverage Tests - Validation Pattern', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;

  beforeEach(() => {
    server = new InteractiveServer();
    client = new InteractiveClient(new InMemoryTransport(server));
  });

  afterEach(() => {
    server.destroy();
  });

  it('should validate email with Validators.email', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter your email:',
      },
      validate: Validators.email(),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'email_validation',
      description: 'Tests email validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { email: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('email_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'invalid-email'; // No @
      if (attemptCount === 2) return 'invalid@'; // No domain
      return 'valid@example.com'; // Valid
    });

    expect(result).toEqual({ email: 'valid@example.com' });
  });

  it('should validate URL with Validators.url', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter URL:',
      },
      validate: Validators.url(),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'url_validation',
      description: 'Tests URL validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { url: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('url_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'not-a-url'; // Invalid
      return 'https://example.com'; // Valid
    });

    expect(result).toEqual({ url: 'https://example.com' });
  });

  it('should validate range with Validators.range', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.NUMBER,
        message: 'Enter age (18-65):',
      },
      validate: Validators.range(18, 65),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'range_validation',
      description: 'Tests range validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { age: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('range_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 10; // Too low
      if (attemptCount === 2) return 100; // Too high
      return 30; // Valid
    });

    expect(result).toEqual({ age: 30 });
  });

  it('should validate length with Validators.length', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter password (8-20 chars):',
      },
      validate: Validators.length(8, 20),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'length_validation',
      description: 'Tests length validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { password: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('length_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'short'; // Too short
      if (attemptCount === 2) return 'a'.repeat(25); // Too long
      return 'validpassword'; // Valid
    });

    expect(result).toEqual({ password: 'validpassword' });
  });

  it('should validate pattern with Validators.pattern', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter hex color (#RRGGBB):',
      },
      validate: Validators.pattern(/^#[0-9A-Fa-f]{6}$/, 'Must be hex color format'),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'pattern_validation',
      description: 'Tests pattern validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { color: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('pattern_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'red'; // Invalid format
      if (attemptCount === 2) return '#ZZZ'; // Invalid hex
      return '#FF5733'; // Valid
    });

    expect(result).toEqual({ color: '#FF5733' });
  });

  it('should validate with custom async validator', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter username:',
      },
      validate: Validators.custom(
        async (value) => {
          const username = String(value);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return username !== 'taken';
        },
        'Username is already taken'
      ),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'custom_async_validation',
      description: 'Tests custom async validation',
      async execute(context) {
        const result = await validated.execute(context);
        return { username: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('custom_async_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'taken'; // Already taken
      return 'available'; // Available
    });

    expect(result).toEqual({ username: 'available' });
  });

  it('should combine multiple validators', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter email:',
      },
      validate: Validators.combine(Validators.length(5, 50), Validators.email()),
      maxAttempts: 3,
    });

    const tool: InteractiveTool = {
      name: 'combined_validation',
      description: 'Tests combined validators',
      async execute(context) {
        const result = await validated.execute(context);
        return { email: result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('combined_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'a@b'; // Too short
      if (attemptCount === 2) return 'notanemail'; // No @
      return 'valid@example.com'; // Valid
    });

    expect(result).toEqual({ email: 'valid@example.com' });
  });

  it('should handle validation failure after max attempts', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter email:',
      },
      validate: Validators.email(),
      maxAttempts: 2,
    });

    const tool: InteractiveTool = {
      name: 'validation_max_attempts',
      description: 'Tests max attempts',
      async execute(context) {
        try {
          await validated.execute(context);
          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('validation_max_attempts', async () => {
      return 'invalid-email'; // Always invalid
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Validation failed after 2 attempts'),
    });
  });

  it('should call onSuccess handler', async () => {
    let successCalled = false;

    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter value:',
      },
      validate: () => ({ valid: true }),
      onSuccess: (value) => {
        successCalled = true;
        return `transformed_${value}`;
      },
    });

    const tool: InteractiveTool = {
      name: 'validation_on_success',
      description: 'Tests onSuccess handler',
      async execute(context) {
        const result = await validated.execute(context);
        return { result, successCalled };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('validation_on_success', async () => {
      return 'test';
    });

    expect(result).toEqual({
      result: 'transformed_test',
      successCalled: true,
    });
  });

  it('should call onFailure handler', async () => {
    let failureErrors: string[] = [];

    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter value:',
      },
      validate: () => ({ valid: false, error: 'Always fails' }),
      maxAttempts: 2,
      onFailure: (errors) => {
        failureErrors = errors;
      },
    });

    const tool: InteractiveTool = {
      name: 'validation_on_failure',
      description: 'Tests onFailure handler',
      async execute(context) {
        try {
          await validated.execute(context);
          return { failureCalled: false };
        } catch {
          return { failureCalled: true, errorCount: failureErrors.length };
        }
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('validation_on_failure', async () => {
      return 'test';
    });

    expect(result).toEqual({
      failureCalled: true,
      errorCount: 2,
    });
  });

  it('should handle validation with transformed value', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter number:',
      },
      validate: (value) => {
        const num = Number(value);
        if (isNaN(num)) {
          return { valid: false, error: 'Not a number' };
        }
        return { valid: true, transformed: num };
      },
    });

    const tool: InteractiveTool = {
      name: 'validation_transform',
      description: 'Tests validation with transformation',
      async execute(context) {
        const result = await validated.execute(context);
        return { value: result, type: typeof result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('validation_transform', async () => {
      return '42';
    });

    expect(result).toEqual({
      value: 42,
      type: 'number',
    });
  });

  it('should handle validation with suggestion', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter value:',
      },
      validate: (value) => {
        if (String(value) !== 'correct') {
          return {
            valid: false,
            error: 'Wrong value',
            suggestion: 'Try "correct"',
          };
        }
        return { valid: true };
      },
      maxAttempts: 2,
    });

    const tool: InteractiveTool = {
      name: 'validation_suggestion',
      description: 'Tests validation with suggestion',
      async execute(context) {
        const result = await validated.execute(context);
        return { result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('validation_suggestion', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'wrong';
      return 'correct';
    });

    expect(result).toEqual({ result: 'correct' });
  });
});

describe('Coverage Tests - Clarification Pattern', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;

  beforeEach(() => {
    server = new InteractiveServer();
    client = new InteractiveClient(new InMemoryTransport(server));
  });

  afterEach(() => {
    server.destroy();
  });

  it('should handle basic clarification with data', async () => {
    const clarification = new Clarification({
      message: 'Select a color:',
      options: [
        { value: 'red', label: 'Red', data: { hex: '#FF0000' } },
        { value: 'blue', label: 'Blue', data: { hex: '#0000FF' } },
      ],
    });

    const tool: InteractiveTool = {
      name: 'basic_clarification',
      description: 'Tests basic clarification',
      async execute(context) {
        const result = await clarification.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('basic_clarification', async () => {
      return 'red';
    });

    expect(result).toEqual({
      selected: { hex: '#FF0000' },
    });
  });

  it('should handle clarification without data (returns value)', async () => {
    const clarification = new Clarification({
      message: 'Select an option:',
      options: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ],
    });

    const tool: InteractiveTool = {
      name: 'clarification_no_data',
      description: 'Tests clarification without data',
      async execute(context) {
        const result = await clarification.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('clarification_no_data', async () => {
      return 'option1';
    });

    expect(result).toEqual({ selected: 'option1' });
  });

  it('should handle clarification with custom input', async () => {
    const clarification = new Clarification({
      message: 'Select a color:',
      options: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
      ],
      allowCustom: true,
      customPrompt: 'Enter custom color:',
    });

    const tool: InteractiveTool = {
      name: 'clarification_custom',
      description: 'Tests custom clarification',
      async execute(context) {
        const result = await clarification.execute(context);
        return { color: result };
      },
    };

    server.registerTool(tool);

    const inputs = ['__custom__', 'purple'];
    let index = 0;

    const result = await client.runInteractive('clarification_custom', async () => {
      return inputs[index++];
    });

    expect(result).toEqual({ color: 'purple' });
  });

  it('should handle clarification with description', async () => {
    const clarification = new Clarification({
      message: 'Select priority:',
      options: [
        { value: 'low', label: 'Low', description: 'Minor issue' },
        { value: 'high', label: 'High', description: 'Critical issue' },
      ],
    });

    const tool: InteractiveTool = {
      name: 'clarification_description',
      description: 'Tests clarification with description',
      async execute(context) {
        const result = await clarification.execute(context);
        return { priority: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('clarification_description', async () => {
      return 'high';
    });

    expect(result).toEqual({ priority: 'high' });
  });

  it('should handle clarification with context', async () => {
    const clarification = new Clarification({
      message: 'Select option:',
      context: 'Additional context information',
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    });

    const tool: InteractiveTool = {
      name: 'clarification_with_context',
      description: 'Tests clarification with context',
      async execute(context) {
        const result = await clarification.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('clarification_with_context', async () => {
      return 'a';
    });

    expect(result).toEqual({ selected: 'a' });
  });

  it('should use Disambiguate.fromSearchResults', async () => {
    const searchResults = [
      { id: '1', title: 'File A', description: 'First file' },
      { id: '2', title: 'File B', description: 'Second file' },
    ];

    const config = Disambiguate.fromSearchResults(searchResults, 'Select a file:');
    const clarification = new Clarification(config);

    const tool: InteractiveTool = {
      name: 'disambiguate_search',
      description: 'Tests search disambiguation',
      async execute(context) {
        const result = await clarification.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('disambiguate_search', async () => {
      return '1';
    });

    expect(result).toEqual({
      selected: searchResults[0],
    });
  });

  it('should use Disambiguate.fromPaths', async () => {
    const paths = ['/path/to/file1.ts', '/path/to/file2.ts'];
    const config = Disambiguate.fromPaths(paths, 'Select a file:');
    const clarification = new Clarification(config);

    const tool: InteractiveTool = {
      name: 'disambiguate_paths',
      description: 'Tests path disambiguation',
      async execute(context) {
        const result = await clarification.execute(context);
        return { path: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('disambiguate_paths', async () => {
      return paths[0];
    });

    expect(result).toEqual({ path: paths[0] });
  });

  it('should use Disambiguate.yesNoMaybe', async () => {
    const config = Disambiguate.yesNoMaybe('Are you sure?');
    const clarification = new Clarification(config);

    const tool: InteractiveTool = {
      name: 'disambiguate_yes_no_maybe',
      description: 'Tests yes/no/maybe',
      async execute(context) {
        const result = await clarification.execute(context);
        return { answer: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('disambiguate_yes_no_maybe', async () => {
      return 'yes';
    });

    expect(result).toEqual({ answer: true });
  });

  it('should use Disambiguate.severity', async () => {
    const config = Disambiguate.severity('Select issue severity:');
    const clarification = new Clarification(config);

    const tool: InteractiveTool = {
      name: 'disambiguate_severity',
      description: 'Tests severity selection',
      async execute(context) {
        const result = await clarification.execute(context);
        return { severity: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('disambiguate_severity', async () => {
      return 'high';
    });

    expect(result).toEqual({ severity: 'high' });
  });

  it('should handle hierarchical clarification', async () => {
    const hierarchical = new HierarchicalClarification([
      {
        message: 'Select category:',
        options: [
          { value: 'tech', label: 'Technology' },
          { value: 'science', label: 'Science' },
        ],
      },
      {
        message: 'Select subcategory:',
        options: [
          { value: 'ai', label: 'Artificial Intelligence' },
          { value: 'web', label: 'Web Development' },
        ],
      },
    ]);

    const tool: InteractiveTool = {
      name: 'hierarchical_clarification',
      description: 'Tests hierarchical clarification',
      async execute(context) {
        const result = await hierarchical.execute(context);
        return { selections: result };
      },
    };

    server.registerTool(tool);

    const inputs = ['tech', 'ai'];
    let index = 0;

    const result = await client.runInteractive('hierarchical_clarification', async () => {
      return inputs[index++];
    });

    expect(result).toEqual({
      selections: ['tech', 'ai'],
    });
  });

  it('should handle smart clarification with context analyzer', async () => {
    const smart = new SmartClarification(
      {
        message: 'Select an option:',
        options: [
          { value: 'default1', label: 'Default Option 1' },
          { value: 'default2', label: 'Default Option 2' },
        ],
      },
      (context) => {
        if (context.userType === 'admin') {
          return [{ value: 'admin', label: 'Admin Option', data: { admin: true } }];
        }
        return [];
      }
    );

    const tool: InteractiveTool = {
      name: 'smart_clarification',
      description: 'Tests smart clarification',
      async execute(context) {
        context.setData('userType', 'admin');
        const result = await smart.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('smart_clarification', async () => {
      return 'admin';
    });

    expect(result).toEqual({
      selected: { admin: true },
    });
  });

  it('should handle smart clarification without context analyzer', async () => {
    const smart = new SmartClarification({
      message: 'Select an option:',
      options: [
        { value: 'opt1', label: 'Option 1', data: { value: 1 } },
        { value: 'opt2', label: 'Option 2', data: { value: 2 } },
      ],
    });

    const tool: InteractiveTool = {
      name: 'smart_clarification_no_analyzer',
      description: 'Tests smart clarification without analyzer',
      async execute(context) {
        const result = await smart.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('smart_clarification_no_analyzer', async () => {
      return 'opt1';
    });

    expect(result).toEqual({ selected: { value: 1 } });
  });
});

describe('Coverage Tests - Stateless Session', () => {
  it('should create token with stateless handler', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool');

    expect(token.sessionId).toBe('session-123');
    expect(token.state.metadata.toolName).toBe('test-tool');
    expect(token.state.state).toBe(InteractionState.IDLE);
    expect(token.signature).toBeDefined();
  });

  it('should create token with context', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool', { userId: '456' });

    expect(token.state.metadata.context).toEqual({ userId: '456' });
  });

  it('should verify tokens', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool');

    expect(handler.verify(token)).toBe(true);

    // Tamper with signature
    token.signature = 'invalid';
    expect(handler.verify(token)).toBe(false);
  });

  it('should serialize and deserialize tokens', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool', { userId: '456' });

    const serialized = handler.serialize(token);
    expect(typeof serialized).toBe('string');

    const deserialized = handler.deserialize(serialized);
    expect(deserialized.sessionId).toBe('session-123');
    expect(deserialized.state.metadata.context).toEqual({ userId: '456' });
  });

  it('should update tokens', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool');

    const updated = handler.updateToken(token, {
      accumulatedData: { step1: 'complete' },
    });

    expect(updated.state.accumulatedData).toEqual({ step1: 'complete' });
    expect(handler.verify(updated)).toBe(true);
  });

  it('should update token state', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool');

    const updated = handler.updateToken(token, {
      state: InteractionState.WAITING_USER,
    });

    expect(updated.state.state).toBe(InteractionState.WAITING_USER);
  });

  it('should throw error when updating token with invalid signature', () => {
    const handler = new StatelessSessionHandler('secret-key');
    const token = handler.createToken('session-123', 'test-tool');

    token.signature = 'invalid';

    expect(() => {
      handler.updateToken(token, { state: InteractionState.WAITING_USER });
    }).toThrow('Invalid session token signature');
  });

  it('should handle tokens without secret', () => {
    const handler = new StatelessSessionHandler();
    const token = handler.createToken('session-123', 'test-tool');

    expect(token.signature).toBeUndefined();
    expect(handler.verify(token)).toBe(true);
  });

  it('should reject invalid serialized tokens', () => {
    const handler = new StatelessSessionHandler();

    expect(() => {
      handler.deserialize('invalid-base64!!!');
    }).toThrow('Invalid session token format');
  });

  it('should update token metadata timestamp', () => {
    const handler = new StatelessSessionHandler();
    const token = handler.createToken('session-123', 'test-tool');

    const originalTime = token.state.metadata.lastActivityAt;

    // Wait a bit
    const waitPromise = new Promise((resolve) => setTimeout(resolve, 10));
    return waitPromise.then(() => {
      const updated = handler.updateToken(token, {
        accumulatedData: { test: 'data' },
      });

      expect(updated.state.metadata.lastActivityAt).toBeGreaterThan(originalTime);
    });
  });
});

describe('Coverage Tests - Edge Cases', () => {
  let server: InteractiveServer;
  let client: InteractiveClient;

  beforeEach(() => {
    server = new InteractiveServer();
    client = new InteractiveClient(new InMemoryTransport(server));
  });

  afterEach(() => {
    server.destroy();
  });

  it('should handle tool with no prompts', async () => {
    const tool: InteractiveTool = {
      name: 'no_prompt_tool',
      description: 'Tool with no prompts',
      async execute() {
        return { immediate: true };
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('no_prompt_tool');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = await client.getState(sessionId);
    expect(state.state).toBe(InteractionState.COMPLETED);
    expect(state.accumulatedData.result).toEqual({ immediate: true });
  });

  it('should handle metadata in session', async () => {
    const tool: InteractiveTool = {
      name: 'metadata_tool',
      description: 'Tool that uses metadata',
      async execute(context) {
        await context.prompt({
          type: PromptType.TEXT,
          message: 'Test:',
        });
        return { done: true };
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('metadata_tool');
    const state = await client.getState(sessionId);

    expect(state.metadata).toBeDefined();
    expect(state.metadata.createdAt).toBeDefined();
    expect(state.metadata.lastActivityAt).toBeDefined();
  });

  it('should handle respond without active prompt', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'interaction.respond',
      params: {
        sessionId: 'non-existent',
        response: { value: 'test' },
      },
    };

    const response = await server.handleRequest(request);

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32050); // SESSION_NOT_FOUND
  });

  it('should handle progress updates', async () => {
    const tool: InteractiveTool = {
      name: 'progress_tool',
      description: 'Tool with progress',
      async execute(context) {
        context.updateProgress(1, 3);
        await context.prompt({ type: PromptType.TEXT, message: 'Step 1:' });

        context.updateProgress(2, 3);
        await context.prompt({ type: PromptType.TEXT, message: 'Step 2:' });

        context.updateProgress(3, 3);
        return { completed: true };
      },
    };

    server.registerTool(tool);

    const inputs = ['a', 'b'];
    let index = 0;

    const result = await client.runInteractive('progress_tool', async () => {
      return inputs[index++];
    });

    expect(result).toEqual({ completed: true });
  });

  it('should handle capabilities method', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'capabilities',
    };

    const response = await server.handleRequest(request);

    expect(response.result).toBeDefined();
    const result = response.result as any;
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('mcp-flow-server');
    expect(result.capabilities.experimental.interactive).toBeDefined();
  });

  it('should handle session timeout configuration', () => {
    const customServer = new InteractiveServer({
      session: {
        defaultTimeout: 1000,
        maxSessions: 10,
      },
    });

    const capabilities = customServer.getCapabilities();
    expect(capabilities.interactive).toBe(true);

    customServer.destroy();
  });

  it('should handle custom capabilities', () => {
    const customServer = new InteractiveServer({
      capabilities: {
        features: {
          sessionPersistence: true,
          customFeature: true,
        } as any,
      },
    });

    const capabilities = customServer.getCapabilities();
    expect(capabilities.features.sessionPersistence).toBe(true);

    customServer.destroy();
  });

  it('should handle tool execution with getData', async () => {
    const tool: InteractiveTool = {
      name: 'get_data_tool',
      description: 'Tests getData',
      async execute(context) {
        context.setData('key1', 'value1');
        context.setData('key2', 'value2');

        const key1 = context.getData('key1');
        const key2 = context.getData('key2');
        const all = context.getData();

        return { key1, key2, all };
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('get_data_tool');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = await client.getState(sessionId);
    const result = state.accumulatedData.result as any;

    expect(result.key1).toBe('value1');
    expect(result.key2).toBe('value2');
    expect(result.all).toMatchObject({ key1: 'value1', key2: 'value2' });
  });

  it('should handle validator with NaN for range', () => {
    const validator = Validators.range(1, 10);
    const result = validator('not-a-number');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Expected a number');
  });

  it('should handle pattern validator without custom message', () => {
    const validator = Validators.pattern(/^\d+$/);
    const result = validator('abc');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not match required pattern');
  });

  it('should handle initialization errors', async () => {
    const tool: InteractiveTool = {
      name: 'error_during_init',
      description: 'Tool that errors during initialization',
      async execute() {
        throw new Error('Initialization failed');
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('error_during_init');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = await client.getState(sessionId);
    expect(state.state).toBe(InteractionState.ERROR);
  });

  it('should handle response to completed session', async () => {
    const tool: InteractiveTool = {
      name: 'quick_tool',
      description: 'Completes immediately',
      async execute() {
        return { done: true };
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('quick_tool');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to respond to already completed session
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'interaction.respond',
      params: {
        sessionId,
        response: { value: 'test' },
      },
    });

    expect(response.error).toBeDefined();
  });

  it('should handle getState with non-existent session', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'interaction.getState',
      params: { sessionId: 'does-not-exist' },
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32050);
  });

  it('should handle cancel with non-existent session', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'interaction.cancel',
      params: { sessionId: 'does-not-exist', reason: 'test' },
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32050);
  });

  it('should handle initialization request with client info', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0.0' },
        capabilities: {},
      },
    });

    expect(response.result).toBeDefined();
    const result = response.result as any;
    expect(result.protocolVersion).toBe('2024-11-05');
  });

  it('should handle tool with prompt metadata', async () => {
    const tool: InteractiveTool = {
      name: 'metadata_prompt_tool',
      description: 'Tool with prompt metadata',
      async execute(context) {
        const response = await context.prompt({
          type: PromptType.TEXT,
          message: 'Enter value:',
          metadata: { customKey: 'customValue' },
        });
        return { received: response.value };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('metadata_prompt_tool', async () => {
      return 'test-value';
    });

    expect(result).toEqual({ received: 'test-value' });
  });

  it('should handle empty response value', async () => {
    const tool: InteractiveTool = {
      name: 'empty_response_tool',
      description: 'Tests empty response',
      async execute(context) {
        const response = await context.prompt({
          type: PromptType.TEXT,
          message: 'Enter something (optional):',
          validation: { required: false },
        });
        return { value: response.value };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('empty_response_tool', async () => {
      return '';
    });

    expect(result).toEqual({ value: '' });
  });

  it('should handle Validators.range with valid transformed number', () => {
    const validator = Validators.range(1, 10);
    const result = validator('5');

    expect(result.valid).toBe(true);
    expect(result.transformed).toBe(5);
  });

  it('should handle clarification without custom prompt default', async () => {
    const clarification = new Clarification({
      message: 'Select:',
      options: [
        { value: 'opt1', label: 'Option 1' },
        { value: 'opt2', label: 'Option 2' },
      ],
      allowCustom: true,
      // customPrompt not specified - should use default
    });

    const tool: InteractiveTool = {
      name: 'clarification_default_custom_prompt',
      description: 'Tests default custom prompt',
      async execute(context) {
        const result = await clarification.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const inputs = ['__custom__', 'custom-value'];
    let index = 0;

    const result = await client.runInteractive('clarification_default_custom_prompt', async () => {
      return inputs[index++];
    });

    expect(result).toEqual({ selected: 'custom-value' });
  });

  it('should handle wizard validation that returns boolean false', async () => {
    const wizard = new WizardBuilder()
      .addText('code', 'Enter code:', {
        validate: (value: unknown) => {
          if (String(value) !== '1234') {
            return false; // Boolean false, not string
          }
          return true;
        },
      })
      .onComplete((context) => ({ code: context.code }))
      .build();

    const tool: InteractiveTool = {
      name: 'wizard_boolean_validation',
      description: 'Tests boolean validation result',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('wizard_boolean_validation', async () => {
      attemptCount++;
      if (attemptCount === 1) return '9999'; // Will return false
      return '1234'; // Valid
    });

    expect(result).toEqual({ code: '1234' });
  });

  it('should handle validation error without suggestion', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter value:',
      },
      validate: (value) => {
        if (String(value) !== 'valid') {
          return { valid: false, error: 'Invalid value' }; // No suggestion
        }
        return { valid: true };
      },
      maxAttempts: 2,
    });

    const tool: InteractiveTool = {
      name: 'validation_no_suggestion',
      description: 'Tests validation without suggestion',
      async execute(context) {
        const result = await validated.execute(context);
        return { result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('validation_no_suggestion', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'invalid';
      return 'valid';
    });

    expect(result).toEqual({ result: 'valid' });
  });

  it('should handle validation error without error message', async () => {
    const validated = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter value:',
      },
      validate: (value) => {
        if (String(value) !== 'valid') {
          return { valid: false }; // No error message
        }
        return { valid: true };
      },
      maxAttempts: 2,
    });

    const tool: InteractiveTool = {
      name: 'validation_no_error_msg',
      description: 'Tests validation without error message',
      async execute(context) {
        const result = await validated.execute(context);
        return { result };
      },
    };

    server.registerTool(tool);

    let attemptCount = 0;
    const result = await client.runInteractive('validation_no_error_msg', async () => {
      attemptCount++;
      if (attemptCount === 1) return 'invalid';
      return 'valid';
    });

    expect(result).toEqual({ result: 'valid' });
  });

  it('should handle context.getData with undefined key', async () => {
    const tool: InteractiveTool = {
      name: 'get_undefined_key',
      description: 'Tests getData with non-existent key',
      async execute(context) {
        context.setData('existing', 'value');
        const existing = context.getData('existing');
        const nonExistent = context.getData('non-existent');
        return { existing, nonExistent };
      },
    };

    server.registerTool(tool);

    const sessionId = await client.startInteraction('get_undefined_key');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const state = await client.getState(sessionId);
    const result = state.accumulatedData.result as any;

    expect(result.existing).toBe('value');
    expect(result.nonExistent).toBeUndefined();
  });

  it('should handle wizard without onComplete handler', async () => {
    const wizard = new WizardBuilder()
      .addText('input', 'Enter text:', { required: true })
      .build(); // No onComplete handler

    const tool: InteractiveTool = {
      name: 'wizard_no_on_complete',
      description: 'Tests wizard without onComplete',
      async execute(context) {
        return wizard.execute(context);
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('wizard_no_on_complete', async () => {
      return 'test-input';
    });

    expect(result).toEqual({ input: 'test-input' });
  });

  it('should handle smart clarification returning default when no context match', async () => {
    const smart = new SmartClarification(
      {
        message: 'Select:',
        options: [
          { value: 'default', label: 'Default', data: { type: 'default' } },
        ],
      },
      (context) => {
        if (context.special === 'yes') {
          return [{ value: 'special', label: 'Special', data: { type: 'special' } }];
        }
        return []; // No special options
      }
    );

    const tool: InteractiveTool = {
      name: 'smart_no_match',
      description: 'Tests smart clarification with no match',
      async execute(context) {
        // Don't set context.special, so analyzer returns empty array
        const result = await smart.execute(context);
        return { selected: result };
      },
    };

    server.registerTool(tool);

    const result = await client.runInteractive('smart_no_match', async () => {
      return 'default';
    });

    expect(result).toEqual({ selected: { type: 'default' } });
  });

  it('should test all error utility functions', () => {
    // Import protocol utils directly to test error functions
    const { Errors } = require('../src/protocol/utils');

    const sessionExpired = Errors.sessionExpired('session-123');
    expect(sessionExpired.code).toBe(-32051);
    expect(sessionExpired.message).toContain('expired');

    const invalidTransition = Errors.invalidStateTransition('idle', 'completed');
    expect(invalidTransition.code).toBe(-32052);
    expect(invalidTransition.message).toContain('Invalid state transition');

    const validationFailed = Errors.validationFailed('Invalid input');
    expect(validationFailed.code).toBe(-32053);

    const timeout = Errors.timeout('session-456');
    expect(timeout.code).toBe(-32054);

    const alreadyCancelled = Errors.alreadyCancelled('session-789');
    expect(alreadyCancelled.code).toBe(-32055);

    const notInteractive = Errors.notInteractive();
    expect(notInteractive.code).toBe(-32056);

    const invalidParams = Errors.invalidParams('Bad params');
    expect(invalidParams.code).toBe(-32602);

    const internalError = Errors.internalError('Something went wrong');
    expect(internalError.code).toBe(-32603);
  });

  it('should test request builder functions', () => {
    const { RequestBuilders } = require('../src/protocol/utils');

    const startReq = RequestBuilders.start('tool1', { param: 'value' }, { ctx: 'data' }, 5000);
    expect(startReq.method).toBe('interaction.start');
    expect(startReq.params.toolName).toBe('tool1');

    const promptReq = RequestBuilders.prompt('session-1', { type: 'text', message: 'Ask' }, {
      current: 1,
      total: 3,
    });
    expect(promptReq.method).toBe('interaction.prompt');

    const respondReq = RequestBuilders.respond('session-2', { value: 'answer' });
    expect(respondReq.method).toBe('interaction.respond');

    const continueReq = RequestBuilders.continue('session-3', { type: 'text', message: 'Next' }, {
      current: 2,
      total: 3,
    });
    expect(continueReq.method).toBe('interaction.continue');

    const completeReq = RequestBuilders.complete('session-4', { data: 'result' }, 'Summary');
    expect(completeReq.method).toBe('interaction.complete');

    const cancelReq = RequestBuilders.cancel('session-5', 'User cancelled');
    expect(cancelReq.method).toBe('interaction.cancel');

    const getStateReq = RequestBuilders.getState('session-6');
    expect(getStateReq.method).toBe('interaction.getState');
  });

  it('should test TypeGuards', () => {
    const { TypeGuards } = require('../src/protocol/utils');

    // Test isRequest
    expect(TypeGuards.isRequest({ jsonrpc: '2.0', method: 'test', id: 1 })).toBe(true);
    expect(TypeGuards.isRequest({ jsonrpc: '2.0', id: 1 })).toBe(false); // No method
    expect(TypeGuards.isRequest(null)).toBe(false);
    expect(TypeGuards.isRequest('string')).toBe(false);

    // Test isResponse
    expect(
      TypeGuards.isResponse({ jsonrpc: '2.0', id: 1, result: {} })
    ).toBe(true);
    expect(
      TypeGuards.isResponse({ jsonrpc: '2.0', id: 1, error: {} })
    ).toBe(true);
    expect(TypeGuards.isResponse({ jsonrpc: '2.0', id: 1 })).toBe(false); // No result or error
    expect(TypeGuards.isResponse(null)).toBe(false);
    expect(TypeGuards.isResponse({})).toBe(false);
  });
});
